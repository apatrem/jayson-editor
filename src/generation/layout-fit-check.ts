export interface LayoutFitVerdict {
  fits: boolean;
  flags: string[];
}

const LAYOUT_OVERFLOW_FLAG = "layoutOverflow";

export function fitCheckSlide(
  slide: unknown,
  catalogue: unknown,
): LayoutFitVerdict {
  const slideRecord = requireRecord(slide, "slide");
  const layout = readLayoutId(slideRecord);
  const blockKinds = readBlockKinds(slideRecord);
  const slots = readLayoutSlots(layout, catalogue);
  const capacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const fits =
    blockKinds.length <= capacity && canAssignBlocksToSlots(blockKinds, slots);

  return fits
    ? { fits: true, flags: [] }
    : { fits: false, flags: [LAYOUT_OVERFLOW_FLAG] };
}

interface LayoutSlot {
  accepts: Set<string>;
  capacity: number;
}

function readLayoutId(slide: Record<string, unknown>): string {
  const layout = slide.layout;
  if (typeof layout !== "string" || layout.length === 0) {
    throw new Error("fitCheckSlide: slide.layout must be a non-empty string");
  }
  return layout;
}

function readBlockKinds(slide: Record<string, unknown>): string[] {
  const blocks = slide.blocks;
  if (!Array.isArray(blocks)) {
    throw new Error("fitCheckSlide: slide.blocks must be an array");
  }

  return blocks.map((block, index) => {
    const blockRecord = asRecord(block);
    const type = blockRecord?.type;
    if (typeof type !== "string" || type.length === 0) {
      throw new Error(
        `fitCheckSlide: slide.blocks[${index}].type must be a non-empty string`,
      );
    }
    return type;
  });
}

function readLayoutSlots(layoutId: string, catalogue: unknown): LayoutSlot[] {
  const layouts = readLayouts(catalogue);
  const layout = asRecord(layouts[layoutId]);
  if (layout === null) {
    throw new Error(`fitCheckSlide: unknown slide layout "${layoutId}"`);
  }

  const slots = asRecord(layout.slots);
  if (slots === null || Object.keys(slots).length === 0) {
    throw new Error(`fitCheckSlide: layout "${layoutId}" is missing slots`);
  }

  return Object.entries(slots).map(([name, slot]) => {
    const slotRecord = asRecord(slot);
    if (slotRecord === null) {
      throw new Error(
        `fitCheckSlide: slot "${name}" in layout "${layoutId}" must be an object`,
      );
    }

    const accepts = readAccepts(layoutId, name, slotRecord.accepts);
    const capacity = asRecord(slotRecord.capacity);
    const blockCapacity = readNonNegativeNumber(capacity?.blocks);
    if (blockCapacity === null) {
      throw new Error(
        `fitCheckSlide: slot "${name}" in layout "${layoutId}" is missing numeric block capacity`,
      );
    }

    return { accepts, capacity: blockCapacity };
  });
}

function readLayouts(catalogue: unknown): Record<string, unknown> {
  const record = requireRecord(catalogue, "catalogue");
  return asRecord(record.layouts) ?? record;
}

function readAccepts(layoutId: string, slotName: string, value: unknown): Set<string> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `fitCheckSlide: slot "${slotName}" in layout "${layoutId}" must define accepts`,
    );
  }

  const accepts = value.map((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(
        `fitCheckSlide: slot "${slotName}" in layout "${layoutId}" has invalid accepts[${index}]`,
      );
    }
    return entry;
  });

  return new Set(accepts);
}

function canAssignBlocksToSlots(blockKinds: string[], slots: LayoutSlot[]): boolean {
  const remainingCapacity = slots.map((slot) => slot.capacity);

  function assign(blockIndex: number): boolean {
    if (blockIndex === blockKinds.length) return true;

    const blockKind = blockKinds[blockIndex];
    if (blockKind === undefined) return true;

    for (const [slotIndex, slot] of slots.entries()) {
      const remaining = remainingCapacity[slotIndex] ?? 0;
      if (remaining <= 0 || !slot.accepts.has(blockKind)) {
        continue;
      }

      remainingCapacity[slotIndex] = remaining - 1;
      if (assign(blockIndex + 1)) return true;
      remainingCapacity[slotIndex] = remaining;
    }

    return false;
  }

  return assign(0);
}

function readNonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  const record = asRecord(value);
  if (record === null) {
    throw new Error(`fitCheckSlide: ${name} must be an object`);
  }
  return record;
}
