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

export function lintMarkdownPlaceholders(markdown: string): ImportLintResult {
  const errors: LintMessage[] = [];
  const warnings: LintMessage[] = [];
  const placeholders: Placeholder[] = [];
  const seenIds = new Map<string, number>();
  const lines = markdown.split(/\r?\n/);
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;

    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }

    if (!PLACEHOLDER_SUBSTRING.test(line)) continue;

    if (inCodeFence) {
      errors.push({ line: lineNo, message: "Placeholder must not appear inside a code fence." });
      continue;
    }

    const parsed = parsePlaceholderLineDetailed(line);
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    if (PLACEHOLDER_SUBSTRING.test(line)) continue;

    for (const match of line.matchAll(BACKTICK_ID)) {
      const refId = match[1];
      if (!refId || seenIds.has(refId)) continue;
      errors.push({
        line: lineNo,
        message: `Orphaned placeholder reference \`${refId}\` — no matching placeholder id.`,
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNo = i + 1;
    if (!line.includes("[[block:")) continue;
    if (PLACEHOLDER_SUBSTRING.test(line) && !line.includes("]]")) {
      errors.push({
        line: lineNo,
        message: "Unclosed placeholder marker — line contains '[[block:' without closing ']]'.",
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    placeholders,
  };
}
