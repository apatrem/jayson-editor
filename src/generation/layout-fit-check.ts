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
  const blockCount = readBlockCount(slideRecord);
  const capacity = readBlockCapacity(layout, catalogue);
  const fits = blockCount <= capacity;

  return fits
    ? { fits: true, flags: [] }
    : { fits: false, flags: [LAYOUT_OVERFLOW_FLAG] };
}

function readLayoutId(slide: Record<string, unknown>): string {
  const layout = slide.layout;
  if (typeof layout !== "string" || layout.length === 0) {
    throw new Error("fitCheckSlide: slide.layout must be a non-empty string");
  }
  return layout;
}

function readBlockCount(slide: Record<string, unknown>): number {
  const blocks = slide.blocks;
  if (!Array.isArray(blocks)) {
    throw new Error("fitCheckSlide: slide.blocks must be an array");
  }
  return blocks.length;
}

function readBlockCapacity(layoutId: string, catalogue: unknown): number {
  const layouts = readLayouts(catalogue);
  const layout = asRecord(layouts[layoutId]);
  if (layout === null) {
    throw new Error(`fitCheckSlide: unknown slide layout "${layoutId}"`);
  }

  const capacity = asRecord(layout?.capacity);
  const directCapacity = readNonNegativeNumber(capacity?.blocks);
  if (directCapacity !== null) return directCapacity;

  const slotCapacity = readSlotBlockCapacity(layout);
  if (slotCapacity !== null) return slotCapacity;

  throw new Error(`fitCheckSlide: layout "${layoutId}" is missing numeric block capacity`);
}

function readLayouts(catalogue: unknown): Record<string, unknown> {
  const record = requireRecord(catalogue, "catalogue");
  return asRecord(record.layouts) ?? record;
}

function readSlotBlockCapacity(layout: Record<string, unknown> | null): number | null {
  const slots = asRecord(layout?.slots);
  if (slots === null) return null;

  let total = 0;
  let sawCapacity = false;
  for (const slot of Object.values(slots)) {
    const slotRecord = asRecord(slot);
    const capacity = asRecord(slotRecord?.capacity);
    const value = readNonNegativeNumber(capacity?.blocks);
    if (value === null) continue;
    total += value;
    sawCapacity = true;
  }

  return sawCapacity ? total : null;
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
