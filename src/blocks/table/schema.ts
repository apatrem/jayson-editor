/**
 * src/blocks/table/schema.ts — self-contained schema for the Table block.
 *
 * Pure module: no React, @tiptap/*, or src/renderer/ imports allowed.
 * Enforced by tests/blocks/schema-purity.test.ts.
 */

import { z } from "zod";
import {
  ProseMirrorFragmentSchema,
  type ProseMirrorFragment,
} from "../../schema/prosemirror-fragment";
import { BlockBaseSchema } from "../../schema/blocks/block-base";
import { GenerationDataFieldsSchema } from "../../schema/generation";

export const TableColumnAlignSchema = z.enum(["left", "center", "right"]);
export type TableColumnAlign = z.infer<typeof TableColumnAlignSchema>;

export const TableColumnSchema = z
  .object({
    header: z.string().min(1),
    align: TableColumnAlignSchema.default("left"),
    width: z.string().min(1).optional(),
  })
  .strict();

export type TableColumn = z.infer<typeof TableColumnSchema>;

export const TableRowSchema = z
  .object({
    cells: z.array(ProseMirrorFragmentSchema).min(1),
  })
  .strict();

export type TableRow = z.infer<typeof TableRowSchema>;

export const TableBlockDataSchema = BlockBaseSchema.extend({
  type: z.literal("table"),
  columns: z.array(TableColumnSchema).min(2).max(8),
  rows: z.array(TableRowSchema).min(1).max(30),
  caption: z.string().optional(),
})
  .merge(GenerationDataFieldsSchema)
  .strict();

function validateTableRowCellCounts(
  block: z.infer<typeof TableBlockDataSchema>,
  ctx: z.RefinementCtx,
): void {
  const colCount = block.columns.length;
  block.rows.forEach((row, rowIndex) => {
    if (row.cells.length !== colCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rows", rowIndex, "cells"],
        message: `Row ${rowIndex} has ${row.cells.length} cells; expected ${colCount}.`,
      });
    }
  });
}

export const TableBlockSchema = TableBlockDataSchema.superRefine(
  validateTableRowCellCounts,
);

export type TableBlock = z.infer<typeof TableBlockDataSchema>;

export function emptyTableCell(text = ""): ProseMirrorFragment {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

export function defaultTableBlock(
  blockId: string,
  headers: string[],
): TableBlock {
  const columns = headers.map((header) => ({ header, align: "left" as const }));
  return {
    id: blockId,
    type: "table",
    columns,
    rows: [
      {
        cells: headers.map((header) => emptyTableCell(header)),
      },
    ],
  };
}

/** Schema-registry entry — consumed by src/blocks/schema-registry.ts. */
export const schemaEntry = {
  schemaName: "table",
  schema: TableBlockDataSchema,
  allowedAttrs: ["columns", "rows", "caption", "note"] as const,
  paletteLabel: "Table",
} satisfies {
  schemaName: string;
  schema: z.ZodType<unknown>;
  allowedAttrs: readonly string[];
  paletteLabel: string;
};
