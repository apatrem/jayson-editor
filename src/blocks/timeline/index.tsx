/**
 * src/blocks/timeline/index.tsx — full runtime manifest for the Timeline block.
 *
 * T-150: migrates content from src/editor/nodes/TimelineNode.tsx and
 * src/renderer/blocks/Timeline.tsx into this single file.
 *
 * Named exports: TimelineTipTapNode, timelineBlockToProseMirror,
 *   proseMirrorToTimelineBlock, Timeline, TimelineProps
 *
 * Default export: BlockRegistryRecord consumed by src/blocks/runtime-registry.ts.
 */

// ── Schema ───────────────────────────────────────────────────────────────────
import type {
  TimelineBlock,
  TimelineConnector,
  TimelineOrientation,
  TimelinePhase,
} from "./schema";
import { TimelineBlockSchema, defaultTimelinePhase } from "./schema";

// ── TipTap / editor dependencies ─────────────────────────────────────────────
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import type { ZodType } from "zod";
import type { CSSProperties, FC } from "react";

// ── Brand-token / renderer dependencies ──────────────────────────────────────
import { useBrandTokens } from "../../brand-tokens/useBrandTokens";
import { resolveBrandToken } from "../../brand-tokens/resolve";

// ── Registry factory ─────────────────────────────────────────────────────────
import { defineBlock } from "../defineBlock";
import { TimelinePanel } from "./TimelinePanel";
import type { ProseMirrorNode } from "../../editor/mapping";

// ─────────────────────────────────────────────────────────────────────────────
// TipTap node
// ─────────────────────────────────────────────────────────────────────────────

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentTimeline: {
      insertTimeline: (attrs?: {
        phases?: TimelinePhase[];
        orientation?: TimelineOrientation;
        connector?: TimelineConnector;
      }) => ReturnType;
    };
  }
}

export const TimelineTipTapNode = Node.create({
  name: "docTimeline",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-block-id"),
        renderHTML: (attrs: { blockId: string | null }) => ({
          "data-block-id": attrs.blockId,
        }),
      },
      phases: {
        default: [
          defaultTimelinePhase("Phase 1"),
          defaultTimelinePhase("Phase 2"),
        ],
        parseHTML: (el) => {
          const raw = el.getAttribute("data-phases");
          if (!raw) {
            return [
              defaultTimelinePhase("Phase 1"),
              defaultTimelinePhase("Phase 2"),
            ];
          }
          return JSON.parse(raw) as TimelinePhase[];
        },
        renderHTML: (attrs: { phases: TimelinePhase[] }) => ({
          "data-phases": JSON.stringify(attrs.phases),
        }),
      },
      orientation: {
        default: "horizontal",
        parseHTML: (el) =>
          (el.getAttribute("data-orientation") as TimelineOrientation) ??
          "horizontal",
        renderHTML: (attrs: { orientation: TimelineOrientation }) => ({
          "data-orientation": attrs.orientation,
        }),
      },
      connector: {
        default: "arrow",
        parseHTML: (el) =>
          (el.getAttribute("data-connector") as TimelineConnector) ?? "arrow",
        renderHTML: (attrs: { connector: TimelineConnector }) => ({
          "data-connector": attrs.connector,
        }),
      },
      note: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-note") ?? "",
        renderHTML: (attrs: { note: string }) => ({ "data-note": attrs.note }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="timeline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-block-type": "timeline" }),
    ];
  },

  addCommands() {
    return {
      insertTimeline:
        (
          attrs: {
            phases?: TimelinePhase[];
            orientation?: TimelineOrientation;
            connector?: TimelineConnector;
          } = {},
        ) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              blockId: crypto.randomUUID(),
              phases: attrs.phases ?? [
                defaultTimelinePhase("Phase 1"),
                defaultTimelinePhase("Phase 2"),
              ],
              orientation: attrs.orientation ?? "horizontal",
              connector: attrs.connector ?? "arrow",
              note: "",
            },
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TimelineNodeView);
  },
});

const TimelineNodeView: FC<NodeViewProps> = ({ node, selected }) => {
  const blockId = String(node.attrs.blockId);
  const connector = node.attrs.connector as TimelineConnector | undefined;
  const block: TimelineBlock = {
    id: blockId,
    type: "timeline",
    phases: node.attrs.phases as TimelinePhase[],
    orientation: node.attrs.orientation as TimelineOrientation,
    connector: connector ?? "arrow",
  };

  return (
    <NodeViewWrapper
      className="timeline-node-view"
      data-block-id={blockId}
      contentEditable={false}
      style={editorBlockStyle(selected)}
    >
      <Timeline block={block} />
    </NodeViewWrapper>
  );
};

function editorBlockStyle(selected: boolean): CSSProperties {
  return {
    outline: selected ? "2px solid var(--brand-primary, #0B3D91)" : "none",
    outlineOffset: 4,
    cursor: "pointer",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ProseMirror mapping helpers
// ─────────────────────────────────────────────────────────────────────────────

type TimelinePmNode = {
  attrs: {
    blockId: string;
    phases: TimelinePhase[];
    orientation: TimelineOrientation;
    connector: TimelineConnector;
    note: string;
  };
};

export function timelineBlockToProseMirror(block: TimelineBlock): {
  type: string;
  attrs: TimelinePmNode["attrs"];
} {
  return {
    type: "docTimeline",
    attrs: {
      blockId: block.id,
      phases: block.phases,
      orientation: block.orientation,
      connector: block.connector,
      note: block.note ?? "",
    },
  };
}

export function proseMirrorToTimelineBlock(node: TimelinePmNode): TimelineBlock {
  return {
    id: node.attrs.blockId,
    type: "timeline",
    phases: node.attrs.phases,
    orientation: node.attrs.orientation,
    connector: node.attrs.connector,
    note: node.attrs.note || undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelineProps {
  block: TimelineBlock;
}

function connectorGlyph(connector: TimelineConnector): string {
  switch (connector) {
    case "arrow":
      return "→";
    case "line":
      return "—";
    case "none":
      return "";
  }
}

export const Timeline: FC<TimelineProps> = ({ block }) => {
  const brand = useBrandTokens();
  const isHorizontal = block.orientation === "horizontal";
  const accent = resolveBrandToken(brand, "colors.brand.primary");
  const textPrimary = resolveBrandToken(brand, "colors.semantic.textPrimary");
  const textSecondary = resolveBrandToken(brand, "colors.semantic.textSecondary");
  const borderColor = resolveBrandToken(brand, "colors.semantic.border");

  const containerStyle: CSSProperties = {
    display: "flex",
    flexDirection: isHorizontal ? "row" : "column",
    // Fit-to-width then wrap (issue #1): a horizontal timeline must never exceed
    // the page column (print can't scroll). Phases shrink to share the width;
    // when too many to stay legible, they wrap onto another row instead of
    // bleeding off the right edge.
    flexWrap: isHorizontal ? "wrap" : undefined,
    alignItems: isHorizontal ? "flex-start" : "stretch",
    gap: brand.spacing.unit * 2,
    fontFamily: brand.typography.fonts.body.family,
    marginBottom: brand.spacing.unit * 3,
  };

  const phaseStyle: CSSProperties = {
    flex: isHorizontal ? "1 1 0" : undefined,
    // Legibility floor, not a hard width: low enough that a typical 4–5 phase
    // timeline fits one A4 row, high enough that wrapped phases stay readable.
    minWidth: isHorizontal ? 100 : undefined,
    padding: brand.spacing.unit * 2,
    borderLeft: isHorizontal ? undefined : `3px solid ${accent}`,
    borderTop: isHorizontal ? `3px solid ${accent}` : undefined,
  };

  const labelStyle: CSSProperties = {
    fontFamily: brand.typography.fonts.heading.family,
    fontSize: brand.typography.scale.bodyLg ?? brand.typography.scale.h4,
    fontWeight: 600,
    color: accent,
    margin: 0,
    marginBottom: brand.spacing.unit,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: brand.typography.scale.caption,
    color: textSecondary,
    margin: 0,
    marginBottom: brand.spacing.unit / 2,
  };

  const bodyStyle: CSSProperties = {
    fontSize: brand.typography.scale.body,
    lineHeight: brand.typography.lineHeight.normal,
    color: textPrimary,
    margin: 0,
  };

  const connectorStyle: CSSProperties = {
    alignSelf: "center",
    color: borderColor,
    fontSize: brand.typography.scale.bodyLg ?? brand.typography.scale.body,
    padding: isHorizontal ? `0 ${brand.spacing.unit}px` : `${brand.spacing.unit}px 0`,
  };

  const glyph = connectorGlyph(block.connector);

  return (
    <div
      className="doc-keep-together"
      data-block-id={block.id}
      data-block-type="timeline"
      data-orientation={block.orientation}
      data-connector={block.connector}
      style={containerStyle}
      role="list"
    >
      {block.phases.map((phase, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            flexDirection: isHorizontal ? "row" : "column",
            flex: isHorizontal ? "1 1 0" : undefined,
            alignItems: isHorizontal ? "flex-start" : "stretch",
          }}
        >
          {index > 0 && glyph ? (
            <div style={connectorStyle} aria-hidden="true">
              {glyph}
            </div>
          ) : null}
          <article style={phaseStyle} role="listitem">
            <h4 style={labelStyle}>{phase.label}</h4>
            {phase.subtitle ? <p style={subtitleStyle}>{phase.subtitle}</p> : null}
            {phase.body ? <p style={bodyStyle}>{phase.body}</p> : null}
            {phase.duration ? (
              <p style={{ ...subtitleStyle, fontStyle: "italic" }}>{phase.duration}</p>
            ) : null}
          </article>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry manifest (default export)
// ─────────────────────────────────────────────────────────────────────────────

const timelineBlock = defineBlock<TimelineBlock>({
  schemaName: "timeline",
  schema: TimelineBlockSchema as ZodType<TimelineBlock>,
  allowedAttrs: ["phases", "orientation", "connector", "note"] as const,
  paletteLabel: "Timeline",
  tiptapNode: TimelineTipTapNode,
  renderer: Timeline,
  toPm: (block) => timelineBlockToProseMirror(block) as ProseMirrorNode,
  fromPm: (node) =>
    proseMirrorToTimelineBlock(node as unknown as TimelinePmNode),
  panel: TimelinePanel,
});

export default timelineBlock;
