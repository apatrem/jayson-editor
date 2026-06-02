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

const CANVAS_PADDING_PX = 24; // must equal .page-view-canvas padding (24px) in page-view.css
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

  // "Fit" zoom: scale a sheet (or spread) to the canvas. Continuous fits the
  // available width; Full-page fits the available viewport HEIGHT so one page
  // is visible at a time and you scroll page-by-page. Full-page deliberately
  // does NOT use a fixed-height scroll container (that overshot the chrome and
  // left a stray scrollbar) — the page just scales to one viewport-height.
  useLayoutEffect(() => {
    if (zoom !== "fit") return undefined;
    const canvas = canvasRef.current;
    if (canvas === null || typeof window === "undefined") return undefined;

    const recompute = (): void => {
      const page = pageSizePx(brand);
      const availW = canvas.clientWidth - CANVAS_PADDING_PX * 2;
      const columns = spread === "spread" ? 2 : 1;
      const contentW = page.width * columns + (columns - 1) * SPREAD_GAP_PX;
      const widthZoom = contentW > 0 ? availW / contentW : 1;
      let next: number;
      if (flow === "full-page") {
        // Viewport height below the chrome (canvas's absolute top is the chrome
        // height; scroll-independent), minus the canvas's own vertical padding.
        const chromeTop = canvas.getBoundingClientRect().top + window.scrollY;
        const availH = window.innerHeight - chromeTop - CANVAS_PADDING_PX * 2;
        const heightZoom = page.height > 0 ? availH / page.height : 1;
        next = clampZoom(Math.min(widthZoom, heightZoom));
      } else {
        next = clampZoom(widthZoom);
      }
      // Only update on a meaningful change. The page zoom feeds back into content
      // size (and thus geometry the ResizeObserver watches); without this guard,
      // sub-pixel float drift could re-render in a loop.
      setFitZoom((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
    };

    recompute();
    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(recompute);
    ro?.observe(canvas);
    window.addEventListener("resize", recompute);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [zoom, flow, spread, brand, status]);

  const effectiveZoom = zoom === "fit" ? fitZoom : zoom / 100;
  // Keep pages at 1× while paged.js is chunking — a CSS `zoom` other than 1
  // scales the boxes paged.js measures and breaks (or stalls) pagination. Apply
  // the real zoom only once the layout is final.
  const appliedZoom = status === "ready" ? effectiveZoom : 1;

  return (
    <div
      ref={canvasRef}
      aria-label="Page view"
      className="page-view-canvas"
      data-flow={flow}
      data-spread={spread}
      style={{ ["--page-zoom" as string]: String(appliedZoom) } as CSSProperties}
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
