import { useCallback, useEffect, useState } from "react";

/**
 * Page-view display preferences (ADR-0020). These are Local settings —
 * machine-local, app-wide, persisted in localStorage under `docsystem.*` keys,
 * never written to the DocModel/YAML. Each preference is one key, so adding the
 * next local setting is additive (no shared schema or store to migrate).
 *
 * - Page flow:   how pages are arranged on screen (CONTEXT: "Page flow").
 * - Page spread: how many pages sit side-by-side (CONTEXT: "Page spread").
 * - Page zoom:   on-screen scale; "fit" resolves per flow — fit-width in
 *                Continuous, fit-height in Full-page (CONTEXT: "Page zoom").
 */
export type PageFlow = "continuous" | "full-page";
export type PageSpread = "single" | "spread";
export type PageZoom = "fit" | 50 | 75 | 90 | 100;

export interface PageViewPrefs {
  flow: PageFlow;
  spread: PageSpread;
  zoom: PageZoom;
}

export const DEFAULT_PAGE_VIEW_PREFS: PageViewPrefs = {
  flow: "continuous",
  spread: "single",
  zoom: "fit",
};

export const PAGE_ZOOM_OPTIONS: PageZoom[] = ["fit", 50, 75, 90, 100];

const STORAGE_KEYS = {
  flow: "docsystem.pageView.flow",
  spread: "docsystem.pageView.spread",
  zoom: "docsystem.pageView.zoom",
} as const;

export interface PageViewPrefsStore {
  read: () => PageViewPrefs;
  write: (prefs: PageViewPrefs) => void;
}

function isFlow(value: unknown): value is PageFlow {
  return value === "continuous" || value === "full-page";
}
function isSpread(value: unknown): value is PageSpread {
  return value === "single" || value === "spread";
}
function parseZoom(value: string | null): PageZoom | null {
  if (value === "fit") return "fit";
  const n = Number(value);
  return n === 50 || n === 75 || n === 90 || n === 100 ? (n as PageZoom) : null;
}

/**
 * localStorage-backed store. Falls back to defaults for any missing/invalid key
 * (e.g. a wiped profile) — nothing of value is lost when it resets (ADR-0020).
 */
export const browserPageViewPrefsStore: PageViewPrefsStore = {
  read() {
    if (typeof window === "undefined" || window.localStorage === undefined) {
      return DEFAULT_PAGE_VIEW_PREFS;
    }
    const ls = window.localStorage;
    const flow = ls.getItem(STORAGE_KEYS.flow);
    const spread = ls.getItem(STORAGE_KEYS.spread);
    const zoom = parseZoom(ls.getItem(STORAGE_KEYS.zoom));
    return {
      flow: isFlow(flow) ? flow : DEFAULT_PAGE_VIEW_PREFS.flow,
      spread: isSpread(spread) ? spread : DEFAULT_PAGE_VIEW_PREFS.spread,
      zoom: zoom ?? DEFAULT_PAGE_VIEW_PREFS.zoom,
    };
  },
  write(prefs) {
    if (typeof window === "undefined" || window.localStorage === undefined) {
      return;
    }
    const ls = window.localStorage;
    ls.setItem(STORAGE_KEYS.flow, prefs.flow);
    ls.setItem(STORAGE_KEYS.spread, prefs.spread);
    ls.setItem(STORAGE_KEYS.zoom, String(prefs.zoom));
  },
};

export function createMemoryPageViewPrefsStore(
  initial: PageViewPrefs = DEFAULT_PAGE_VIEW_PREFS,
): PageViewPrefsStore {
  let current = initial;
  return {
    read: () => current,
    write: (prefs) => {
      current = prefs;
    },
  };
}

/**
 * Reads persisted prefs once at mount and writes through on every change.
 * Returns the current prefs plus a single-field setter.
 */
export function usePageViewPrefs(
  store: PageViewPrefsStore = browserPageViewPrefsStore,
): readonly [PageViewPrefs, <K extends keyof PageViewPrefs>(key: K, value: PageViewPrefs[K]) => void] {
  const [prefs, setPrefs] = useState<PageViewPrefs>(DEFAULT_PAGE_VIEW_PREFS);

  useEffect(() => {
    setPrefs(store.read());
  }, [store]);

  const setPref = useCallback(
    <K extends keyof PageViewPrefs>(key: K, value: PageViewPrefs[K]) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        store.write(next);
        return next;
      });
    },
    [store],
  );

  return [prefs, setPref] as const;
}
