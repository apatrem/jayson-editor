/**
 * Placeholder grammar — parse, format, and deterministic down-conversion.
 * Spec: docs/PLACEHOLDER_GRAMMAR.md
 */

import type { CalloutBlock } from "../blocks/callout/schema";
import type { ChartBlock } from "../blocks/chart/schema";
import type { ProseBlock } from "../blocks/prose/schema";
import type { DocBlock } from "../schema/blocks";
import { fragmentToPlainText } from "./prosemirror-text";

const LOCAL_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

const PLACEHOLDER_LINE =
  /^\[\[block:\s*(.*?)\s*\|\s*intent:\s*"((?:\\.|[^"\\])*)"\s*\|\s*id:\s*([a-z][a-z0-9-]{0,31})\s*\]\]$/;

export interface Placeholder {
  kindHint: string;
  intent: string;
  localId: string;
}

export function parsePlaceholderLine(line: string): Placeholder | null {
  const trimmed = line.trim();
  const match = PLACEHOLDER_LINE.exec(trimmed);
  if (!match) return null;
  const kindHintRaw = match[1];
  const intentRaw = match[2];
  const localId = match[3];
  if (kindHintRaw === undefined || intentRaw === undefined || localId === undefined) {
    return null;
  }
  if (!LOCAL_ID_PATTERN.test(localId)) return null;
  return {
    kindHint: kindHintRaw.trim(),
    intent: unescapeIntent(intentRaw),
    localId,
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
  if (block.type === "chart") {
    return toPlaceholderChart(block as ChartBlock);
  }
  if (block.type === "callout") {
    return toPlaceholderCallout(block as CalloutBlock);
  }
  return null;
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
  return {
    kindHint: "chart",
    intent: parts.join(" — "),
    localId: slugifyLocalId(block.id),
  };
}

function toPlaceholderCallout(block: CalloutBlock): Placeholder {
  const body = fragmentToPlainText(block.body);
  const titlePart = block.title ? `${block.title} — ` : "";
  return {
    kindHint: "callout",
    intent: `${block.variant} callout: ${titlePart}${body}`.trim(),
    localId: slugifyLocalId(block.id),
  };
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
