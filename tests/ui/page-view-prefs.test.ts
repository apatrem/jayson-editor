import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_PAGE_VIEW_PREFS,
  browserPageViewPrefsStore,
  createMemoryPageViewPrefsStore,
} from "../../src/ui/page-view-prefs";

// happy-dom doesn't provide localStorage; inject a Map-backed Storage so the
// browser store's serialization (key names, parse/fallback) is exercised.
class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

describe("page-view-prefs store", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: new FakeStorage(),
      configurable: true,
      writable: true,
    });
  });

  it("returns defaults when nothing is stored", () => {
    expect(browserPageViewPrefsStore.read()).toEqual(DEFAULT_PAGE_VIEW_PREFS);
  });

  it("round-trips written prefs through localStorage", () => {
    browserPageViewPrefsStore.write({ flow: "full-page", spread: "spread", zoom: 75 });
    expect(browserPageViewPrefsStore.read()).toEqual({
      flow: "full-page",
      spread: "spread",
      zoom: 75,
    });
  });

  it("persists each preference under its own docsystem.* key", () => {
    browserPageViewPrefsStore.write({ flow: "full-page", spread: "spread", zoom: 100 });
    expect(window.localStorage.getItem("docsystem.pageView.flow")).toBe("full-page");
    expect(window.localStorage.getItem("docsystem.pageView.spread")).toBe("spread");
    expect(window.localStorage.getItem("docsystem.pageView.zoom")).toBe("100");
  });

  it("falls back to defaults for invalid stored values", () => {
    window.localStorage.setItem("docsystem.pageView.flow", "bogus");
    window.localStorage.setItem("docsystem.pageView.spread", "triple");
    window.localStorage.setItem("docsystem.pageView.zoom", "999");
    expect(browserPageViewPrefsStore.read()).toEqual(DEFAULT_PAGE_VIEW_PREFS);
  });

  it("accepts 'fit' as a valid zoom", () => {
    window.localStorage.setItem("docsystem.pageView.zoom", "fit");
    expect(browserPageViewPrefsStore.read().zoom).toBe("fit");
  });

  it("memory store reads back what it wrote", () => {
    const store = createMemoryPageViewPrefsStore();
    store.write({ flow: "full-page", spread: "single", zoom: "fit" });
    expect(store.read()).toEqual({ flow: "full-page", spread: "single", zoom: "fit" });
  });
});
