export interface LayoutFitVerdict {
  fits: boolean;
  flags: string[];
}

const LAYOUT_OVERFLOW_FLAG = "layoutOverflow";
const BLOCK_CAPACITY_KEYS = ["blocks", "totalBlocks", "maxBlocks"] as const;

export function fitCheckSlide(
  slide: unknown,
  catalogue: unknown,
): LayoutFitVerdict {
  const layout = readLayoutId(slide);
  const blockCount = readBlockCount(slide);
  const capacity = layout === null ? null : readBlockCapacity(layout, catalogue);
  const fits = capacity !== null && blockCount <= capacity;

  return fits
    ? { fits: true, flags: [] }
    : { fits: false, flags: [LAYOUT_OVERFLOW_FLAG] };
}

function readLayoutId(slide: unknown): string | null {
  const record = asRecord(slide);
  const layout = record?.layout;
  return typeof layout === "string" ? layout : null;
}

function readBlockCount(slide: unknown): number {
  const record = asRecord(slide);
  const blocks = record?.blocks;
  return Array.isArray(blocks) ? blocks.length : 0;
}

function readBlockCapacity(layoutId: string, catalogue: unknown): number | null {
  const layouts = readLayouts(catalogue);
  const layout = asRecord(layouts[layoutId]);
  const capacity = asRecord(layout?.capacity);
  if (capacity === null) return readSlotBlockCapacity(layout);

  for (const key of BLOCK_CAPACITY_KEYS) {
    const value = readNonNegativeNumber(capacity[key]);
    if (value !== null) return value;
  }

  return readSlotBlockCapacity(layout);
}

function readLayouts(catalogue: unknown): Record<string, unknown> {
  const record = asRecord(catalogue);
  if (record === null) return {};
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
