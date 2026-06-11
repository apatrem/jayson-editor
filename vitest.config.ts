import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Frozen acceptance suites (red by design until their tasks land — ADR-0023).
// Default runs exclude them (the `quality` gate); FROZEN_ACCEPTANCE=only runs
// exactly them (the non-required `frozen-acceptance` CI lane / npm run
// test:frozen). The list may only shrink — see tests/frozen-acceptance.json.
const frozen: { files: string[] } = JSON.parse(
  readFileSync(resolve(__dirname, "./tests/frozen-acceptance.json"), "utf8"),
);
const frozenOnly = process.env.FROZEN_ACCEPTANCE === "only";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@schema": resolve(__dirname, "./src/schema"),
      "@brand": resolve(__dirname, "./src/brand-tokens"),
      "@primitives": resolve(__dirname, "./src/block-primitives"),
      "@renderer": resolve(__dirname, "./src/renderer"),
      "@editor": resolve(__dirname, "./src/editor"),
      "@llm": resolve(__dirname, "./src/llm"),
      "@docmodel": resolve(__dirname, "./src/docmodel"),
      "@setup": resolve(__dirname, "./src/setup"),
      "@ui": resolve(__dirname, "./src/ui"),
      // Keep multi-MB echarts out of the per-file isolation reload cycle. Chart
      // uses dynamic import(); file-level vi.mock does not intercept that
      // reliably. Export tests use the stub's deterministic renderToSVGString().
      echarts: resolve(__dirname, "./tests/stubs/echarts.ts"),
    },
  },

  test: {
    environment: "happy-dom",
    globals: false,                     // explicit imports of describe/it/expect
    // Unmount rendered components after every test so live instances (ECharts
    // charts, ResizeObservers, timers) are disposed and can't keep a worker
    // process spinning at 100% CPU. See tests/setup.ts for the full rationale.
    setupFiles: ["./tests/setup.ts"],
    // Cap fork count so CI's ~7 GB runners aren't running several heavy workers
    // at once. Avoid 8192 MiB heaps — they trigger hours of mark-compact GC
    // (100% CPU, last log line often sample.test.ts) before OOM on 7 GB VMs.
    pool: "forks",
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 2,
        execArgv: ["--max-old-space-size=4096"],
      },
    },
    include: frozenOnly
      ? frozen.files
      : ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: frozenOnly ? [...configDefaults.exclude] : [...configDefaults.exclude, ...frozen.files],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/types.ts"],
    },
  },
});
