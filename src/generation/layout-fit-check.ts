/**
 * Pass 2.5 deterministic layout authority (GENERATION_PIPELINE §5, D-236).
 * Overflow ladder vocabulary: layoutOverflow flag on fit failure; caller applies
 * retry higher-capacity layout → auto-split → halt — no silent truncation.
 */

import { slotsForSlideLayout } from "../editor/SlideLayoutEditor";
import type { SlideLayout } from "../schema/containers";

interface CatalogueLayout {
  capacity?: Record<string, number>;
}

interface SlideInput {
  layout?: string;
  blocks?: unknown[];
}

function blockWeight(block: unknown): number {
  if (block === null || typeof block !== "object") {
    return 1;
  }
  const record = block as Record<string, unknown>;
  if (record.type === "prose" && record.body !== undefined) {
    const body = record.body as { content?: unknown[] };
    const nodes = body?.content;
    return Array.isArray(nodes) && nodes.length > 0 ? nodes.length : 1;
  }
  if (
    (record.type === "bullet-list" || record.type === "numbered-list") &&
    Array.isArray(record.items)
  ) {
    return record.items.length;
  }
  return 1;
}

export function fitCheckSlide(
  slide: unknown,
  catalogue: unknown,
): { fits: boolean; flags: string[] } {
  const input = slide as SlideInput;
  const layout = input.layout as SlideLayout | undefined;
  const blocks = input.blocks ?? [];
  const layouts = catalogue as Record<string, CatalogueLayout>;

  if (!layout) {
    return { fits: false, flags: ["layoutOverflow"] };
  }

  const entry = layouts[layout];
  const capacity = entry?.capacity;
  if (!capacity) {
    return { fits: false, flags: ["layoutOverflow"] };
  }

  const slots = slotsForSlideLayout(layout);

  if (blocks.length > slots.length) {
    return { fits: false, flags: ["layoutOverflow"] };
  }

  for (let i = 0; i < blocks.length; i += 1) {
    const slot = slots[i];
    if (slot === undefined) {
      return { fits: false, flags: ["layoutOverflow"] };
    }
    const cap = capacity[slot.id];
    if (cap === undefined || blockWeight(blocks[i]) > cap) {
      return { fits: false, flags: ["layoutOverflow"] };
    }
  }

  return { fits: true, flags: [] };
}
