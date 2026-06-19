import type { CSSProperties, DragEvent, FC, ReactNode } from "react";
import type { Block } from "../schema/blocks";
import type { Slide, SlideLayout } from "../schema/containers";

export interface SlideLayoutSlot {
  id: string;
  label: string;
  gridArea: string;
}

export interface SlideLayoutEditorProps {
  slide: Slide;
  renderBlock: (block: Block, slot: SlideLayoutSlot) => ReactNode;
  onChange: (slide: Slide) => void;
}

const LAYOUT_SLOTS: Record<SlideLayout, SlideLayoutSlot[]> = {
  "cover": [slot("hero", "Cover", "hero")],
  "section-divider": [slot("title", "Section title", "title")],
  "agenda": [slot("agenda", "Agenda", "agenda")],
  "title-body": [slot("title", "Title", "title"), slot("body", "Body", "body")],
  "two-column": [slot("left", "Left", "left"), slot("right", "Right", "right")],
  "three-column": [
    slot("left", "Left", "left"),
    slot("middle", "Middle", "middle"),
    slot("right", "Right", "right"),
  ],
  "chart-full": [slot("chart", "Chart", "chart")],
  "chart-commentary": [
    slot("chart", "Chart", "chart"),
    slot("commentary", "Commentary", "commentary"),
  ],
  "table": [slot("table", "Table", "table")],
  "quote": [slot("quote", "Quote", "quote")],
  "process-timeline": [slot("timeline", "Timeline", "timeline")],
  "team": [slot("team", "Team", "team")],
  "kpis": [slot("kpis", "KPIs", "kpis")],
  "image-caption": [slot("image", "Image", "image"), slot("caption", "Caption", "caption")],
  "closing": [slot("closing", "Closing", "closing")],
};

const LAYOUT_TEMPLATES: Record<SlideLayout, string> = {
  "cover": '"hero"',
  "section-divider": '"title"',
  "agenda": '"agenda"',
  "title-body": '"title" "body"',
  "two-column": '"left right"',
  "three-column": '"left middle right"',
  "chart-full": '"chart"',
  "chart-commentary": '"chart commentary"',
  "table": '"table"',
  "quote": '"quote"',
  "process-timeline": '"timeline"',
  "team": '"team"',
  "kpis": '"kpis"',
  "image-caption": '"image caption"',
  "closing": '"closing"',
};

export const SlideLayoutEditor: FC<SlideLayoutEditorProps> = ({
  slide,
  renderBlock,
  onChange,
}) => {
  const slots = LAYOUT_SLOTS[slide.layout];

  return (
    <section
      style={{
        ...styles.canvas,
        gridTemplateAreas: LAYOUT_TEMPLATES[slide.layout],
        gridTemplateColumns: `repeat(${columnCount(slide.layout)}, minmax(0, 1fr))`,
      }}
      aria-label={`${slide.layout} slide layout editor`}
    >
      {slots.map((layoutSlot, slotIndex) => {
        const block = slide.blocks[slotIndex];
        return (
          <div
            key={layoutSlot.id}
            style={{ ...styles.slot, gridArea: layoutSlot.gridArea }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              const sourceIndex = sourceIndexFromDrag(event);
              if (sourceIndex === null) {
                return;
              }
              onChange(moveSlideBlockToSlot(slide, sourceIndex, slotIndex));
            }}
          >
            <div style={styles.slotLabel}>{layoutSlot.label}</div>
            {block === undefined ? (
              <div style={styles.empty}>Drop a block into this defined slot.</div>
            ) : (
              <div draggable style={styles.block} onDragStart={dragBlock(slotIndex)}>
                {renderBlock(block, layoutSlot)}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
};

export function moveSlideBlockToSlot(
  slide: Slide,
  sourceIndex: number,
  targetSlotIndex: number,
): Slide {
  const slots = LAYOUT_SLOTS[slide.layout];
  if (
    sourceIndex === targetSlotIndex ||
    sourceIndex < 0 ||
    sourceIndex >= slide.blocks.length ||
    targetSlotIndex < 0 ||
    targetSlotIndex >= slots.length
  ) {
    return slide;
  }
  const blocks = [...slide.blocks];
  const [moved] = blocks.splice(sourceIndex, 1);
  if (moved === undefined) {
    return slide;
  }
  blocks.splice(targetSlotIndex, 0, moved);
  return {
    ...slide,
    blocks: blocks.slice(0, slots.length),
  };
}

export function slotsForSlideLayout(layout: SlideLayout): SlideLayoutSlot[] {
  return LAYOUT_SLOTS[layout];
}

function slot(id: string, label: string, gridArea: string): SlideLayoutSlot {
  return { id, label, gridArea };
}

function columnCount(layout: SlideLayout): number {
  return Math.max(1, LAYOUT_SLOTS[layout].length);
}

function dragBlock(index: number) {
  return (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData("application/x-docsystem-slide-block-index", String(index));
  };
}

function sourceIndexFromDrag(event: DragEvent<HTMLElement>): number | null {
  const raw = event.dataTransfer.getData("application/x-docsystem-slide-block-index");
  if (raw.length === 0) {
    return null;
  }
  const index = Number(raw);
  return Number.isInteger(index) ? index : null;
}

const styles: Record<string, CSSProperties> = {
  canvas: {
    aspectRatio: "16 / 9",
    border: "1px solid ButtonBorder",
    borderRadius: "0.5rem",
    display: "grid",
    gap: "0.75rem",
    padding: "1rem",
  },
  slot: {
    border: "1px dashed ButtonBorder",
    borderRadius: "0.375rem",
    display: "grid",
    gap: "0.5rem",
    minHeight: "8rem",
    padding: "0.75rem",
  },
  slotLabel: {
    color: "GrayText",
    fontSize: "0.75rem",
    textTransform: "uppercase",
  },
  empty: {
    color: "GrayText",
  },
  block: {
    cursor: "grab",
  },
};

export default SlideLayoutEditor;
