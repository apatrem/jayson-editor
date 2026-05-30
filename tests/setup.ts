/**
 * tests/setup.ts — global Vitest setup (wired via vitest.config.ts setupFiles).
 *
 * Why this exists: vitest.config.ts sets `globals: false`, so
 * @testing-library/react's automatic `afterEach(cleanup)` is NOT registered.
 * Without it, every test that calls `render()` leaves its component MOUNTED.
 * A mounted live ECharts chart keeps its requestAnimationFrame animation loop
 * running; in happy-dom that loop is a recursive macrotask, so the worker
 * process pegs a core at ~100% CPU and never exits (foreground/TTY runs get
 * force-killed at the end; backgrounded runs orphan and spin forever).
 *
 * Registering cleanup() here unmounts every rendered tree after each test,
 * which runs the components' own teardown (e.g. Chart's `chart.dispose()` and
 * ResizeObserver.disconnect()), so no animation loop survives the test.
 * cleanup() is idempotent, so files that already call it themselves are
 * unaffected.
 *
 * The DOM polyfills below centralize what the integration harnesses previously
 * duplicated inline (getBBox) and cover APIs ECharts touches that happy-dom may
 * not implement (ResizeObserver).
 */

import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// The comment-selection bubble renders a TipTap BubbleMenu (tippy), which cannot
// mount in happy-dom (`tippy is not a function`) and crashes any test whose real
// editor dispatches a transaction. It carries no logic worth asserting through a
// render, so stub it to a no-op everywhere. The bubble → draft → mark → comment
// authoring flow is exercised by injecting a test double through DocumentView's
// `CommentBubbleComponent` prop (see DocumentView-comment-authoring.test.tsx).
vi.mock("../src/comments/CommentSelectionBubble", () => ({
  CommentSelectionBubble: () => null,
}));

// happy-dom has no layout engine; ECharts / SVG sizing code calls getBBox().
if (
  typeof SVGElement !== "undefined" &&
  !("getBBox" in SVGElement.prototype)
) {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 120, height: 40 }),
  });
}

// ECharts observes its container for resize. Provide a no-op if happy-dom
// doesn't implement ResizeObserver, so init doesn't throw and disconnect()
// (called in Chart's cleanup) is always available.
if (typeof globalThis.ResizeObserver === "undefined") {
  class NoopResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver =
    NoopResizeObserver as unknown as typeof ResizeObserver;
}

// Neutralize requestAnimationFrame in the test environment. ECharts drives its
// animations with a recursive rAF chain; in happy-dom that chain is a tight
// macrotask loop that pegs a CPU core at ~100% and keeps the worker process
// alive AFTER the run finishes (so `vitest run` never exits and has to be
// SIGKILLed). Initial chart frames are drawn synchronously on `setOption`, so
// rendered output assertions still hold — only the perpetual animation loop is
// suppressed. cleanup() (above) still disposes charts; this is belt-and-braces
// so a stray undisposed chart can never spin the process.
globalThis.requestAnimationFrame = ((): number =>
  0) as typeof globalThis.requestAnimationFrame;
globalThis.cancelAnimationFrame =
  (() => {}) as typeof globalThis.cancelAnimationFrame;
