/**
 * Generation pipeline schema extensions (ADR-0021).
 * Draft types — wire into block schemas in T-192 implementation pass.
 * Spec: docs/TYPES.md §12, docs/GENERATION_PIPELINE.md §6–§7
 */

import { z } from "zod";

export const DataStateSchema = z.enum(["empty", "draft-illustrative", "confirmed"]);
export type DataState = z.infer<typeof DataStateSchema>;

export const DataSourceSchema = z
  .object({
    name: z.string().min(1).max(200),
    link: z.string().url().optional(),
  })
  .strict();

export type DataSource = z.infer<typeof DataSourceSchema>;

/** Optional generation / verification fields on data-bearing blocks. */
export const GenerationDataFieldsSchema = z
  .object({
    dataState: DataStateSchema.optional(),
    /** Human-authoritative citation. LLM may fill only for grounded (uploaded) data. */
    source: DataSourceSchema.optional(),
    /** LLM advisory "where to look" — never rendered as a citation. */
    sourceHint: z.string().max(300).optional(),
    verifiedBy: z.string().email().optional(),
    verifiedAt: z.string().datetime().optional(),
  })
  .strict();

export type GenerationDataFields = z.infer<typeof GenerationDataFieldsSchema>;

/** Flags surfaced in the readiness gate (GENERATION_PIPELINE §7). */
export const GenerationBlockFlagsSchema = z
  .object({
    /** Original writing-pass intent (write-once traceability). Not used by toPlaceholder. */
    sourceIntent: z.string().max(500).optional(),
    /** Structuring could not realize placeholder as catalogue block. */
    degradedToProse: z.boolean().optional(),
    /** Deck layout overflow — auto-split or needs review. */
    layoutOverflow: z.boolean().optional(),
    /** Coherence pass flagged a contradiction involving this block. */
    contradictionFlag: z.boolean().optional(),
  })
  .strict();

export type GenerationBlockFlags = z.infer<typeof GenerationBlockFlagsSchema>;

export const GENERATION_FLAG_KEYS = [
  "sourceIntent",
  "degradedToProse",
  "layoutOverflow",
  "contradictionFlag",
] as const;

export const DATA_FIELD_KEYS = [
  "dataState",
  "source",
  "sourceHint",
  "verifiedBy",
  "verifiedAt",
] as const;

const DATA_BEARING_BLOCK_TYPES = new Set(["chart", "table", "kpi-cards"]);

export function isDataBearingBlockType(type: string): boolean {
  return DATA_BEARING_BLOCK_TYPES.has(type);
}

export function readDataState(block: Record<string, unknown>): DataState | undefined {
  const raw = block.dataState;
  if (raw === undefined) return undefined;
  const parsed = DataStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
