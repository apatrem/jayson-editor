/**
 * Pre-structuring import contract lint for markdown carrying placeholders.
 * Spec: docs/PLACEHOLDER_GRAMMAR.md §5
 */

import {
  CATALOGUE_KIND_HINTS,
  parsePlaceholderLineDetailed,
  type Placeholder,
} from "./placeholder";

export interface LintMessage {
  line: number;
  message: string;
}

export interface ImportLintResult {
  ok: boolean;
  errors: LintMessage[];
  warnings: LintMessage[];
  placeholders: Placeholder[];
}

const PLACEHOLDER_SUBSTRING = /\[\[block:/;
const BACKTICK_ID = /`([a-z][a-z0-9-]{0,31})`/g;

interface Fence {
  marker: "`" | "~";
  length: number;
}

export function lintMarkdownPlaceholders(markdown: string): ImportLintResult {
  const errors: LintMessage[] = [];
  const warnings: LintMessage[] = [];
  const placeholders: Placeholder[] = [];
  const seenIds = new Map<string, number>();
  const lines = markdown.split(/\r?\n/);
  const visibleLines: string[] = [];
  let activeFence: Fence | null = null;
  let inHtmlComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    if (activeFence) {
      visibleLines.push("");
      if (PLACEHOLDER_SUBSTRING.test(line)) {
        errors.push({
          line: lineNo,
          message: "Placeholder must not appear inside a code fence.",
        });
      }
      if (closesFence(line, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    const stripped = stripHtmlComments(line, inHtmlComment);
    inHtmlComment = stripped.inComment;
    const visibleLine = stripped.visible;
    const fence = parseFence(visibleLine);

    if (fence) {
      activeFence = fence;
      visibleLines.push("");
      continue;
    }

    visibleLines.push(visibleLine);
    if (!PLACEHOLDER_SUBSTRING.test(visibleLine)) continue;
    if (/^\s{0,3}>/.test(visibleLine)) {
      errors.push({
        line: lineNo,
        message: "Placeholder must not appear inside a blockquote.",
      });
      continue;
    }

    const parsed = parsePlaceholderLineDetailed(visibleLine);
    if (!("placeholder" in parsed)) {
      errors.push({ line: lineNo, message: parsed.message });
      continue;
    }

    const placeholder = parsed.placeholder;
    if (
      placeholder.kindHint &&
      !CATALOGUE_KIND_HINTS.has(placeholder.kindHint)
    ) {
      warnings.push({
        line: lineNo,
        message: `Unknown kind-hint '${placeholder.kindHint}' — treat as empty hint at structuring.`,
      });
    }

    const prev = seenIds.get(placeholder.localId);
    if (prev !== undefined) {
      errors.push({
        line: lineNo,
        message: `Duplicate placeholder id '${placeholder.localId}' (also on line ${prev}).`,
      });
    } else {
      seenIds.set(placeholder.localId, lineNo);
    }

    placeholders.push(placeholder);
  }

  if (seenIds.size > 0) {
    for (let i = 0; i < visibleLines.length; i++) {
      const line = visibleLines[i] ?? "";
      const lineNo = i + 1;
      if (PLACEHOLDER_SUBSTRING.test(line)) continue;

      for (const match of line.matchAll(BACKTICK_ID)) {
        const refId = match[1];
        if (!refId || seenIds.has(refId)) continue;
        warnings.push({
          line: lineNo,
          message: `Unmatched placeholder reference \`${refId}\` — flag for human relink review.`,
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    placeholders,
  };
}

function parseFence(line: string): Fence | null {
  const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  const marker = match?.[1];
  if (!marker) return null;
  return {
    marker: marker[0] as Fence["marker"],
    length: marker.length,
  };
}

function closesFence(line: string, activeFence: Fence): boolean {
  const fence = parseFence(line);
  return (
    fence?.marker === activeFence.marker &&
    fence.length >= activeFence.length &&
    /^\s{0,3}(`{3,}|~{3,})\s*$/.test(line)
  );
}

function stripHtmlComments(
  line: string,
  initialInComment: boolean,
): { visible: string; inComment: boolean } {
  let visible = "";
  let inComment = initialInComment;
  let offset = 0;

  while (offset < line.length) {
    if (inComment) {
      const end = line.indexOf("-->", offset);
      if (end === -1) return { visible, inComment };
      inComment = false;
      offset = end + 3;
      continue;
    }

    const start = line.indexOf("<!--", offset);
    if (start === -1) {
      visible += line.slice(offset);
      break;
    }
    visible += line.slice(offset, start);
    inComment = true;
    offset = start + 4;
  }

  return { visible, inComment };
}
