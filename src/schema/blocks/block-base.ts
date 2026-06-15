import { z } from "zod";
import { GenerationBlockFlagsSchema } from "../generation";
import { StableIdSchema } from "../stable-id";
import { BlockTypeStringSchema } from "./block-type-string";

/**
 * Common fields on every block. All concrete block schemas extend this.
 *
 * `type` is validated against BlockTypeStringSchema — accepts either a
 * Standard/Brand kebab-case identifier or an Authored `{sender}:{slug}` string.
 * Concrete block schemas override this field with a z.literal() discriminant.
 */
export const BlockBaseSchema = z
  .object({
    id: StableIdSchema,
    type: BlockTypeStringSchema,
    note: z.string().max(500).optional(),
    /**
     * Per-instance layout overrides (ADR-0018). Minimal, enumerable, optional —
     * never free-form styling. Omitted when at their defaults.
     *
     * `breakBefore`: start this block on a new page (Page view / PDF only).
     * `spaceBefore`: the gap above this block as a multiple of
     *   `brand.spacing.unit` (min 0 → blocks touch). Overrides the document
     *   block-spacing for this one gap; absent → inherit the document default.
     */
    breakBefore: z.boolean().optional(),
    spaceBefore: z.number().min(0).max(40).optional(),
  })
  .merge(GenerationBlockFlagsSchema)
  .strict();

export type BlockBase = z.infer<typeof BlockBaseSchema>;
