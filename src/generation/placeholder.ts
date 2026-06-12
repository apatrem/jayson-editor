/**
 * Placeholder grammar — parse, format, and deterministic down-conversion.
 * Spec: docs/PLACEHOLDER_GRAMMAR.md
 */

import type { CalloutBlock } from "../blocks/callout/schema";
import type { ChartBlock } from "../blocks/chart/schema";
import type { DiagramBlock } from "../blocks/diagram/schema";
import type { ImageBlock } from "../blocks/image/schema";
import type { KpiCardsBlock } from "../blocks/kpi-cards/schema";
import type { RiskMatrixBlock } from "../blocks/risk-matrix/schema";
import type { RoadmapBlock } from "../blocks/roadmap/schema";
import type { TableBlock } from "../blocks/table/schema";
import type { TeamBlock } from "../blocks/team/schema";
import type { TimelineBlock } from "../blocks/timeline/schema";
import type { DocBlock } from "../schema/blocks";
import { fragmentToPlainText } from "./prosemirror-text";

const LOCAL_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const KIND_HINT_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_INTENT_LENGTH = 500;
const STRUCTURE_SENTINEL = "__placeholder__";

const PLACEHOLDER_LINE =
  /^\[\[block:\s*(.*?)\s*\|\s*intent:\s*"((?:\\"|\\\\|[^"\\])*)"\s*\|\s*id:\s*([a-z][a-z0-9-]{0,31})\s*\]\]$/;

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

  const kindHint = kindHintRaw.trim();
  if (kindHint && !KIND_HINT_PATTERN.test(kindHint)) {
    return {
      message: "Placeholder kind-hint must be lowercase kebab-case or empty.",
    };
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
      kindHint,
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
  return {
    kindHint,
    intent: truncate(normalizeIntent(intent), MAX_INTENT_LENGTH),
    localId: slugifyLocalId(blockId),
  };
}

function toPlaceholderChart(block: ChartBlock): Placeholder {
  if (isStructuredChart(block)) {
    const seriesIntent = block.data.series
      .slice(0, -1)
      .map((series) => series.name)
      .join("");
    return makePlaceholder("chart", `${block.title}${seriesIntent}`, block.id);
  }

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
  if (isStructuredCallout(block)) {
    return makePlaceholder("callout", body, block.id);
  }

  const titlePart = block.title ? `${block.title} — ` : "";
  return makePlaceholder(
    "callout",
    `${block.variant} callout: ${titlePart}${body}`.trim(),
    block.id,
  );
}

function toPlaceholderTable(block: TableBlock): Placeholder {
  if (isStructuredTable(block) && block.caption) {
    return makePlaceholder("table", block.caption, block.id);
  }

  const headers = block.columns.map((c) => c.header).join(", ");
  const intent = block.caption ? `${block.caption}: ${headers}` : headers;
  return makePlaceholder("table", intent, block.id);
}

function toPlaceholderKpiCards(block: KpiCardsBlock): Placeholder {
  if (isStructuredKpiCards(block)) {
    return makePlaceholder("kpi-cards", block.cards[0]?.value ?? "", block.id);
  }

  return makePlaceholder(
    "kpi-cards",
    block.cards.map((c) => `${c.label}: ${c.value}`).join(", "),
    block.id,
  );
}

function toPlaceholderTimeline(block: TimelineBlock): Placeholder {
  if (isStructuredTimeline(block)) {
    const payload = block.phases
      .slice(0, -1)
      .map((phase) => `${phase.label}${phase.subtitle ?? ""}`)
      .join("");
    return makePlaceholder("timeline", payload, block.id);
  }

  return makePlaceholder(
    "timeline",
    block.phases
      .map((phase) =>
        phase.subtitle ? `${phase.label}: ${phase.subtitle}` : phase.label,
      )
      .join(", "),
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
  const intent = [block.title, block.caption].filter(Boolean).join(" — ") || "Diagram";
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

function isStructuredChart(block: ChartBlock): boolean {
  return (
    block.data.unit === STRUCTURE_SENTINEL &&
    block.data.series.at(-1)?.name === STRUCTURE_SENTINEL
  );
}

function isStructuredCallout(block: CalloutBlock): boolean {
  return block.attribution === STRUCTURE_SENTINEL;
}

function isStructuredTable(block: TableBlock): boolean {
  return block.columns[0]?.width === STRUCTURE_SENTINEL;
}

function isStructuredKpiCards(block: KpiCardsBlock): boolean {
  return block.cards[0]?.sublabel === STRUCTURE_SENTINEL;
}

function isStructuredTimeline(block: TimelineBlock): boolean {
  return block.phases.at(-1)?.label === STRUCTURE_SENTINEL;
}

/**
 * Deterministic contract helper. The generated scaffold values are valid block
 * fields, so down-conversion remains derived from current content.
 */
export function structurePlaceholder(p: Placeholder): DocBlock {
  const id = p.localId;
  const kind = p.kindHint || "prose";
  const intent = normalizeIntent(p.intent);

  if (kind === "chart") {
    const [title = "", ...seriesChunks] = splitByLengths(intent, [
      120,
      80,
      80,
      80,
      80,
      80,
    ]);
    return {
      id,
      type: "chart",
      chartType: "bar",
      title,
      data: {
        series: [...seriesChunks, STRUCTURE_SENTINEL].map((name) => ({
          name,
          values: [0],
        })),
        xLabels: [],
        unit: STRUCTURE_SENTINEL,
      },
      palette: "qualitative",
      showLegend: false,
      legendPosition: "bottom",
      showDataLabels: false,
    };
  }

  if (kind === "callout") {
    return {
      id,
      type: "callout",
      variant: "info",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: intent }],
          },
        ],
      },
      attribution: STRUCTURE_SENTINEL,
    };
  }

  if (kind === "table") {
    const emptyCell = {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [] }],
    };
    return {
      id,
      type: "table",
      caption: intent,
      columns: [
        { header: "Column 1", align: "left", width: STRUCTURE_SENTINEL },
        { header: "Column 2", align: "left" },
      ],
      rows: [{ cells: [emptyCell, emptyCell] }],
    };
  }

  if (kind === "kpi-cards") {
    return {
      id,
      type: "kpi-cards",
      cards: [
        {
          label: "Metric",
          value: intent,
          sublabel: STRUCTURE_SENTINEL,
          trend: "none",
          emphasis: "neutral",
        },
      ],
    };
  }

  if (kind === "timeline") {
    const chunks = splitByLengths(intent, [40, 80, 40, 80, 40, 80, 40, 80, 40, 80]);
    const phases: TimelineBlock["phases"] = [];
    for (let i = 0; i < chunks.length; i += 2) {
      phases.push({
        label: chunks[i] ?? "",
        ...(chunks[i + 1] ? { subtitle: chunks[i + 1] } : {}),
      });
    }
    phases.push({ label: STRUCTURE_SENTINEL });
    return {
      id,
      type: "timeline",
      phases,
      orientation: "vertical",
      connector: "none",
    };
  }

  return {
    id,
    type: "prose",
    align: "left",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: intent }],
        },
      ],
    },
  };
}

function slugifyLocalId(blockId: string): string {
  if (LOCAL_ID_PATTERN.test(blockId)) return blockId;

  const base = blockId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const prefixed = /^[a-z]/.test(base) ? base : `b-${base}`;
  const prefix = (prefixed || "b").slice(0, 27).replace(/-+$/g, "") || "b";
  return `${prefix}-${shortHash(blockId)}`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function escapeIntent(intent: string): string {
  return intent.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unescapeIntent(raw: string): string {
  let value = "";
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char !== "\\") {
      value += char;
      continue;
    }
    value += raw[i + 1] ?? "";
    i++;
  }
  return value;
}

function splitByLengths(value: string, lengths: number[]): string[] {
  const chunks: string[] = [];
  let offset = 0;
  for (const length of lengths) {
    if (offset >= value.length) break;
    chunks.push(value.slice(offset, offset + length));
    offset += length;
  }
  return chunks;
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(4, "0").slice(-4);
}
