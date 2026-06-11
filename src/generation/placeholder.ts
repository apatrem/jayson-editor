/**
 * Placeholder grammar — parse, format, and deterministic down-conversion.
 * Spec: docs/PLACEHOLDER_GRAMMAR.md
 */

import type { CalloutBlock } from "../blocks/callout/schema";
import type { ChartBlock } from "../blocks/chart/schema";
import type { DiagramBlock } from "../blocks/diagram/schema";
import type { ImageBlock } from "../blocks/image/schema";
import type { KpiCardsBlock } from "../blocks/kpi-cards/schema";
import type { ProseBlock } from "../blocks/prose/schema";
import type { RiskMatrixBlock } from "../blocks/risk-matrix/schema";
import type { RoadmapBlock } from "../blocks/roadmap/schema";
import type { TableBlock } from "../blocks/table/schema";
import type { TeamBlock } from "../blocks/team/schema";
import type { TimelineBlock } from "../blocks/timeline/schema";
import type { DocBlock } from "../schema/blocks";
import { fragmentToPlainText } from "./prosemirror-text";

const LOCAL_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_INTENT_LENGTH = 500;

const PLACEHOLDER_LINE =
  /^\[\[block:\s*(.*?)\s*\|\s*intent:\s*"((?:\\.|[^"\\])*)"\s*\|\s*id:\s*([a-z][a-z0-9-]{0,31})\s*\]\]$/;

export const CATALOGUE_KIND_HINTS = new Set([
  "bullet-list",
  "callout",
  "chart",
  "diagram",
  "divider",
  "heading",
  "image",
  "kpi-cards",
  "numbered-list",
  "prose",
  "risk-matrix",
  "roadmap",
  "table",
  "team",
  "timeline",
]);

export interface Placeholder {
  kindHint: string;
  intent: string;
  localId: string;
}

export interface PlaceholderParseError {
  message: string;
}

export function parsePlaceholderLine(line: string): Placeholder | null {
  const result = parsePlaceholderLineDetailed(line);
  return "placeholder" in result ? result.placeholder : null;
}

export function parsePlaceholderLineDetailed(
  line: string,
): { placeholder: Placeholder } | PlaceholderParseError {
  const trimmed = line.trim();
  if (!trimmed.includes("[[block:")) {
    return { message: "Line does not contain a placeholder marker." };
  }
  if (trimmed !== line.trim() || !trimmed.startsWith("[[block:")) {
    return {
      message: "Placeholder must occupy its own line without surrounding text.",
    };
  }
  if (!trimmed.endsWith("]]")) {
    return { message: "Placeholder is missing closing ']]'." };
  }
  if (!/\|\s*intent:\s*"/.test(trimmed)) {
    return { message: 'Placeholder is missing required intent: "…" field.' };
  }
  const idFieldMatch = trimmed.match(/\|\s*id:\s*(\S+?)\s*\]\]/);
  if (!idFieldMatch) {
    return { message: "Placeholder is missing required id: field." };
  }
  if (!LOCAL_ID_PATTERN.test(idFieldMatch[1] ?? "")) {
    return {
      message: "Placeholder id must match [a-z][a-z0-9-]{0,31}.",
    };
  }

  const match = PLACEHOLDER_LINE.exec(trimmed);
  if (!match) {
    return { message: "Malformed placeholder syntax." };
  }

  const kindHintRaw = match[1];
  const intentRaw = match[2];
  const localId = match[3];
  if (kindHintRaw === undefined || intentRaw === undefined || localId === undefined) {
    return { message: "Malformed placeholder syntax." };
  }

  const intent = unescapeIntent(intentRaw);
  if (!intent.trim()) {
    return { message: "Placeholder intent must be non-empty." };
  }
  if (intent.length > MAX_INTENT_LENGTH) {
    return { message: "Placeholder intent exceeds 500 characters." };
  }

  return {
    placeholder: {
      kindHint: kindHintRaw.trim(),
      intent,
      localId,
    },
  };
}

export function formatPlaceholder(p: Placeholder): string {
  return `[[block: ${p.kindHint} | intent: "${escapeIntent(p.intent)}" | id: ${p.localId}]]`;
}

export function normalizeIntent(intent: string): string {
  return intent.replace(/\s+/g, " ").trim();
}

export function placeholdersSemanticallyEqual(a: Placeholder, b: Placeholder): boolean {
  return (
    a.localId === b.localId &&
    a.kindHint === b.kindHint &&
    normalizeIntent(a.intent) === normalizeIntent(b.intent)
  );
}

export function toPlaceholder(block: DocBlock): Placeholder | null {
  switch (block.type) {
    case "chart":
      return toPlaceholderChart(block as ChartBlock);
    case "callout":
      return toPlaceholderCallout(block as CalloutBlock);
    case "table":
      return toPlaceholderTable(block as TableBlock);
    case "kpi-cards":
      return toPlaceholderKpiCards(block as KpiCardsBlock);
    case "timeline":
      return toPlaceholderTimeline(block as TimelineBlock);
    case "roadmap":
      return toPlaceholderRoadmap(block as RoadmapBlock);
    case "image":
      return toPlaceholderImage(block as ImageBlock);
    case "diagram":
      return toPlaceholderDiagram(block as DiagramBlock);
    case "team":
      return toPlaceholderTeam(block as TeamBlock);
    case "risk-matrix":
      return toPlaceholderRiskMatrix(block as RiskMatrixBlock);
    case "prose":
    case "bullet-list":
    case "numbered-list":
    case "heading":
    case "divider":
      return null;
    default:
      return null;
  }
}

function makePlaceholder(kindHint: string, intent: string, blockId: string): Placeholder {
  return { kindHint, intent, localId: slugifyLocalId(blockId) };
}

function toPlaceholderChart(block: ChartBlock): Placeholder {
  const seriesPart = block.data.series.map((s) => s.name).join(", ");
  const axisPart = [block.axes?.xTitle, block.axes?.yTitle].filter(Boolean).join(" / ");
  const parts = [
    block.title,
    `(${block.chartType})`,
    seriesPart && `series ${seriesPart}`,
    axisPart && `axes ${axisPart}`,
    block.takeaway && `takeaway: ${block.takeaway}`,
  ].filter(Boolean);
  return makePlaceholder("chart", parts.join(" — "), block.id);
}

function toPlaceholderCallout(block: CalloutBlock): Placeholder {
  const body = fragmentToPlainText(block.body);
  const titlePart = block.title ? `${block.title} — ` : "";
  return makePlaceholder(
    "callout",
    `${block.variant} callout: ${titlePart}${body}`.trim(),
    block.id,
  );
}

function toPlaceholderTable(block: TableBlock): Placeholder {
  const headers = block.columns.map((c) => c.header).join(", ");
  const intent = block.caption ? `${block.caption}: ${headers}` : headers;
  return makePlaceholder("table", intent, block.id);
}

function toPlaceholderKpiCards(block: KpiCardsBlock): Placeholder {
  return makePlaceholder(
    "kpi-cards",
    block.cards.map((c) => `${c.label}: ${c.value}`).join(", "),
    block.id,
  );
}

function toPlaceholderTimeline(block: TimelineBlock): Placeholder {
  return makePlaceholder(
    "timeline",
    block.phases.map((p) => p.label).join(", "),
    block.id,
  );
}

function toPlaceholderRoadmap(block: RoadmapBlock): Placeholder {
  const lanes = block.workstreams.map((w) => w.label).join(", ");
  const milestones = (block.milestones ?? []).map((m) => m.label).join(", ");
  const intent = milestones ? `${lanes} — milestones: ${milestones}` : lanes;
  return makePlaceholder("roadmap", intent, block.id);
}

function toPlaceholderImage(block: ImageBlock): Placeholder {
  const intent = block.caption ? `${block.alt} — ${block.caption}` : block.alt;
  return makePlaceholder("image", intent, block.id);
}

function toPlaceholderDiagram(block: DiagramBlock): Placeholder {
  const description = block.caption ?? truncate(block.source, 120);
  const intent = block.title ? `${block.title} — ${description}` : description;
  return makePlaceholder("diagram", intent, block.id);
}

function toPlaceholderTeam(block: TeamBlock): Placeholder {
  return makePlaceholder("team", block.members.map((m) => m.name).join(", "), block.id);
}

function toPlaceholderRiskMatrix(block: RiskMatrixBlock): Placeholder {
  return makePlaceholder(
    "risk-matrix",
    `${block.xAxisLabel} / ${block.yAxisLabel}`,
    block.id,
  );
}

/**
 * Minimal deterministic structuring stub for tests and early integration.
 * Full Pass 2 replaces kind resolution + promotion with catalogue-aware LLM scope.
 */
export function structurePlaceholder(p: Placeholder): DocBlock {
  const id = p.localId;
  const kind = p.kindHint || "prose";

  if (kind === "chart") {
    const block: ChartBlock = {
      id,
      type: "chart",
      chartType: "bar",
      title: truncate(p.intent, 120),
      data: {
        series: [{ name: "Series 1", values: [1, 2, 3] }],
        xLabels: ["A", "B", "C"],
      },
      palette: "qualitative",
      showLegend: true,
      legendPosition: "bottom",
      showDataLabels: false,
    };
    return block;
  }

  if (kind === "callout") {
    const block: CalloutBlock = {
      id,
      type: "callout",
      variant: "info",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: p.intent }],
          },
        ],
      },
    };
    return block;
  }

  const proseBlock: ProseBlock = {
    id,
    type: "prose",
    align: "left",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: p.intent }],
        },
      ],
    },
  };
  return proseBlock;
}

function slugifyLocalId(blockId: string): string {
  const base = blockId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (LOCAL_ID_PATTERN.test(base)) return base;
  const trimmed = base.slice(0, 31).replace(/-$/, "");
  return LOCAL_ID_PATTERN.test(trimmed) ? trimmed : `b-${trimmed.slice(0, 28)}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function escapeIntent(intent: string): string {
  return intent.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescapeIntent(raw: string): string {
  return raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}
