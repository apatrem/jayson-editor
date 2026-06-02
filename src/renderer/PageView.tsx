import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FC,
} from "react";
import { Previewer } from "pagedjs";
import { renderExportBody } from "../export/render-static-html";
import type { DocumentModel } from "./DocumentRenderer";
import { buildPageCss } from "./page-css";
import type { BrandTokens } from "../schema/brand";
import {
  DEFAULT_PAGE_VIEW_PREFS,
  type PageFlow,
  type PageSpread,
  type PageZoom,
} from "../ui/page-view-prefs";
import "./page-view.css";

export interface PageViewProps {
  doc: DocumentModel;
  brand: BrandTokens;
  docFolderPath?: string;
  flow?: PageFlow;
  spread?: PageSpread;
  zoom?: PageZoom;
}

/** CSS px per millimetre at 96dpi (1in = 25.4mm = 96px). */
const PX_PER_MM = 96 / 25.4;
const A4_MM = { width: 210, height: 297 } as const;

function pageSizePx(brand: BrandTokens): { width: number; height: number } {
  const landscape = brand.page.orientation === "landscape";
  const w = (landscape ? A4_MM.height : A4_MM.width) * PX_PER_MM;
  const h = (landscape ? A4_MM.width : A4_MM.height) * PX_PER_MM;
  return { width: w, height: h };
}

const CANVAS_PADDING_PX = 24; // keep in sync with .page-view-canvas padding
const SPREAD_GAP_PX = 24;

/**
 * On-demand, read-only A4 Page view. Renders the DocumentRenderer output and
 * paginates it into real A4 sheets with paged.js (ADR-0017), framed as realistic
 * pages on a gray canvas (issue #5). Flow / spread / zoom are Local settings
 * (ADR-0020) passed in from DocumentView; "fit" zoom is measured against the
 * canvas. Pagination runs once per doc/brand change; the editor stays continuous.
 */
export const PageView: FC<PageViewProps> = ({
  doc,
  brand,
  docFolderPath = "/docs",
  flow = DEFAULT_PAGE_VIEW_PREFS.flow,
  spread = DEFAULT_PAGE_VIEW_PREFS.spread,
  zoom = DEFAULT_PAGE_VIEW_PREFS.zoom,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"rendering" | "ready" | "failed">("rendering");
  const [fitZoom, setFitZoom] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;

    let cancelled = false;
    setStatus("rendering");
    container.innerHTML = "";

    const css = buildPageCss(brand, { title: doc.meta.project });

    // Reuse the export body renderer so charts/diagrams/images are pre-rendered
    // (no live ECharts/Mermaid during SSR, which would throw), then paginate
    // with paged.js. Bail if torn down mid-flight (doc switch / unmount).
    void renderExportBody(doc, brand, docFolderPath)
      .then((body) => {
        if (cancelled) return undefined;
        // paged.js treats a bare string in the stylesheets array as a URL to
        // fetch; inline CSS must be passed as an object value ({ _: cssText }).
        return new Previewer().preview(body, [{ _: css }], container);
      })
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      container.innerHTML = "";
    };
  }, [doc, brand, docFolderPath]);

  // "Fit" zoom: scale a sheet (or spread) to the canvas. Continuous fits width;
  // Full-page fits the whole page (min of width/height) so one page is visible.
  useLayoutEffect(() => {
    if (zoom !== "fit") return undefined;
    const canvas = canvasRef.current;
    if (canvas === null || typeof ResizeObserver === "undefined") return undefined;

    const recompute = (): void => {
      const page = pageSizePx(brand);
      const availW = canvas.clientWidth - CANVAS_PADDING_PX * 2;
      const columns = spread === "spread" ? 2 : 1;
      const contentW = page.width * columns + (columns - 1) * SPREAD_GAP_PX;
      const widthZoom = contentW > 0 ? availW / contentW : 1;
      if (flow === "full-page") {
        const availH = canvas.clientHeight - CANVAS_PADDING_PX * 2;
        const heightZoom = page.height > 0 ? availH / page.height : 1;
        setFitZoom(clampZoom(Math.min(widthZoom, heightZoom)));
      } else {
        setFitZoom(clampZoom(widthZoom));
      }
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [zoom, flow, spread, brand, status]);

  const effectiveZoom = zoom === "fit" ? fitZoom : zoom / 100;

  return (
    <div
      ref={canvasRef}
      aria-label="Page view"
      className="page-view-canvas"
      data-flow={flow}
      data-spread={spread}
      style={{ ["--page-zoom" as string]: String(effectiveZoom) } as CSSProperties}
    >
      {status === "rendering" ? <p style={styles.note}>Paginating…</p> : null}
      {status === "failed" ? (
        <p role="alert" style={styles.note}>
          Could not paginate this document.
        </p>
      ) : null}
      <div ref={containerRef} />
    </div>
  );
};

function clampZoom(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  // Don't upscale past 100% on "fit" — a tiny doc shouldn't balloon.
  return Math.min(value, 1);
}

const styles: Record<string, CSSProperties> = {
  note: {
    margin: "0 0 1rem",
    fontSize: "0.8125rem",
    color: "#475569",
    textAlign: "center",
  },
};

export default PageView;
