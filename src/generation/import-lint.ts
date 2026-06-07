/**
 * Pre-structuring import contract lint for markdown carrying placeholders.
 * Spec: docs/PLACEHOLDER_GRAMMAR.md §5
 */

import { parsePlaceholderLine, type Placeholder } from "./placeholder";

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

    const parsed = parsePlaceholderLine(line);
    if (!parsed) {
      errors.push({ line: lineNo, message: "Malformed placeholder syntax." });
      continue;
    }

    if (!parsed.intent.trim()) {
      errors.push({ line: lineNo, message: "Placeholder intent must be non-empty." });
      continue;
    }

    const prev = seenIds.get(parsed.localId);
    if (prev !== undefined) {
      errors.push({
        line: lineNo,
        message: `Duplicate placeholder id '${parsed.localId}' (also on line ${prev}).`,
      });
    } else {
      seenIds.set(parsed.localId, lineNo);
    }

    placeholders.push(parsed);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    placeholders,
  };
}
