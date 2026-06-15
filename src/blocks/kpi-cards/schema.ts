/**
 * src/blocks/kpi-cards/schema.ts — self-contained schema for the KPI Cards block.
 *
 * Pure module: no React, @tiptap/*, or src/renderer/ imports allowed.
 * Enforced by tests/blocks/schema-purity.test.ts.
 */

import { z } from "zod";
import { BlockBaseSchema } from "../../schema/blocks/block-base";
import { GenerationDataFieldsSchema } from "../../schema/generation";

export const KpiTrendSchema = z.enum(["up", "down", "flat", "none"]);
export type KpiTrend = z.infer<typeof KpiTrendSchema>;

export const KpiEmphasisSchema = z.enum([
  "neutral",
  "positive",
  "negative",
  "brand",
]);
export type KpiEmphasis = z.infer<typeof KpiEmphasisSchema>;

export const KpiCardSchema = z
  .object({
    value: z.string().min(1),
    label: z.string().min(1).max(60),
    sublabel: z.string().max(80).optional(),
    trend: KpiTrendSchema.default("none"),
    emphasis: KpiEmphasisSchema.default("neutral"),
  })
  .strict();

export type KpiCard = z.infer<typeof KpiCardSchema>;

export const KpiCardsBlockSchema = BlockBaseSchema.extend({
  type: z.literal("kpi-cards"),
  cards: z.array(KpiCardSchema).min(1).max(4),
})
  .merge(GenerationDataFieldsSchema)
  .strict();

export type KpiCardsBlock = z.infer<typeof KpiCardsBlockSchema>;

export function defaultKpiCard(): KpiCard {
  return {
    value: "0",
    label: "Metric",
    trend: "none",
    emphasis: "neutral",
  };
}

export function kpiEmphasisColorRef(emphasis: KpiEmphasis): string {
  switch (emphasis) {
    case "neutral":
      return "colors.semantic.textPrimary";
    case "positive":
      return "colors.status.success";
    case "negative":
      return "colors.status.error";
    case "brand":
      return "colors.brand.primary";
  }
}

export function kpiTrendColorRef(trend: KpiTrend): string {
  switch (trend) {
    case "up":
      return "colors.status.success";
    case "down":
      return "colors.status.error";
    case "flat":
      return "colors.semantic.textSecondary";
    case "none":
      return "colors.semantic.textSecondary";
  }
}

/** Schema-registry entry — consumed by src/blocks/schema-registry.ts. */
export const schemaEntry = {
  schemaName: "kpi-cards",
  schema: KpiCardsBlockSchema,
  allowedAttrs: ["cards", "note"] as const,
  paletteLabel: "KPI Cards",
} satisfies {
  schemaName: string;
  schema: z.ZodType<unknown>;
  allowedAttrs: readonly string[];
  paletteLabel: string;
};
