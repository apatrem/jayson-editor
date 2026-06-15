/**
 * src/blocks/chart/schema.ts — self-contained schema for the Chart block.
 *
 * Pure module: no React, @tiptap/*, or src/renderer/ imports allowed.
 * Enforced by tests/blocks/schema-purity.test.ts.
 */

import { z } from "zod";
import { BlockBaseSchema } from "../../schema/blocks/block-base";
import { GenerationDataFieldsSchema } from "../../schema/generation";

// ── Chart types ──────────────────────────────────────────────────────────────

export const ChartTypeSchema = z.enum([
  "bar", "stacked-bar", "line", "area",
  "pie", "donut", "scatter",
  "waterfall", "mekko",
]);

export type ChartType = z.infer<typeof ChartTypeSchema>;

// ── Series ───────────────────────────────────────────────────────────────────

/**
 * One data series within a chart. Multi-series charts (bar groups, line
 * with multiple lines, stacked bars) have multiple of these. Single-series
 * charts (pie, donut) have exactly one.
 */
export const ChartSeriesSchema = z.object({
  name: z.string().min(1).max(80),
  values: z.array(z.number()).min(1),
  /** Optional override for this series's color (must be a chart-palette index). */
  paletteIndex: z.number().int().min(0).max(15).optional(),
}).strict();

export type ChartSeries = z.infer<typeof ChartSeriesSchema>;

// ── Data ─────────────────────────────────────────────────────────────────────

export const ChartDataSchema = z.object({
  series: z.array(ChartSeriesSchema).min(1).max(8),
  xLabels: z.array(z.string()).optional(),
  /** Unit suffix (e.g. "€M", "%", "FTE") shown on axis ticks and tooltips. */
  unit: z.string().max(20).optional(),
}).strict();

export type ChartData = z.infer<typeof ChartDataSchema>;

// ── Axes ─────────────────────────────────────────────────────────────────────

export const ChartAxesSchema = z.object({
  xTitle: z.string().max(80).optional(),
  yTitle: z.string().max(80).optional(),
  /** Suffix appended to y-axis tick labels (e.g. "%", "€M"). */
  ySuffix: z.string().max(10).optional(),
  /** If true, y-axis starts at zero. Default depends on chart type. */
  yZeroBased: z.boolean().optional(),
}).strict();

export type ChartAxes = z.infer<typeof ChartAxesSchema>;

// ── The block ────────────────────────────────────────────────────────────────

export const ChartBlockDataSchema = BlockBaseSchema.extend({
  type: z.literal("chart"),
  chartType: ChartTypeSchema,
  title: z.string().min(1).max(120),
  /** The "so what" — required by convention, optional in schema for flexibility. */
  takeaway: z.string().max(200).optional(),
  data: ChartDataSchema,
  axes: ChartAxesSchema.optional(),
  /** Which palette from brand tokens to use. */
  palette: z.enum(["qualitative", "sequential"]).default("qualitative"),
  showLegend: z.boolean().default(true),
  legendPosition: z.enum(["bottom", "right", "top"]).default("bottom"),
  showDataLabels: z.boolean().default(false),
})
  .merge(GenerationDataFieldsSchema)
  .strict();

function validateChartCrossFields(
  block: z.infer<typeof ChartBlockDataSchema>,
  ctx: z.RefinementCtx,
): void {
  if ((block.chartType === "pie" || block.chartType === "donut") && block.data.series.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data", "series"],
      message: `${block.chartType} charts must have exactly one series.`,
    });
  }
  if (block.chartType === "scatter") {
    for (let i = 0; i < block.data.series.length; i++) {
      if ((block.data.series[i]?.values.length ?? 0) % 2 !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["data", "series", i, "values"],
          message: "Scatter series.values must have even length (flat [x, y] pairs).",
        });
      }
    }
  }
  if (
    block.chartType !== "pie" &&
    block.chartType !== "donut" &&
    block.chartType !== "scatter" &&
    !block.data.xLabels
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["data", "xLabels"],
      message: `${block.chartType} charts require xLabels.`,
    });
  }
}

export const ChartBlockSchema = ChartBlockDataSchema.superRefine(
  validateChartCrossFields,
);

export type ChartBlock = z.infer<typeof ChartBlockDataSchema>;

// ── Helpers used by the renderer + node view ─────────────────────────────────

/**
 * Does this chart type use a category x-axis? (vs. polar/no-axis for pie/donut)
 */
export function hasCategoryAxis(type: ChartType): boolean {
  return type !== "pie" && type !== "donut";
}

/**
 * Default y-axis "zero-based" behavior per chart type.
 */
export function defaultYZeroBased(type: ChartType): boolean {
  switch (type) {
    case "bar":
    case "stacked-bar":
    case "area":
    case "waterfall":
    case "mekko":
      return true;
    case "line":
    case "scatter":
      return false;
    case "pie":
    case "donut":
      return false;
  }
}

/** Schema-registry entry — consumed by src/blocks/schema-registry.ts. */
export const schemaEntry = {
  schemaName: "chart",
  schema: ChartBlockSchema,
  allowedAttrs: ["chartType", "title", "takeaway", "data", "axes", "palette", "showLegend", "showDataLabels", "note"] as const,
  paletteLabel: "Chart",
} satisfies {
  schemaName: string;
  schema: z.ZodType<unknown>;
  allowedAttrs: readonly string[];
  paletteLabel: string;
};
