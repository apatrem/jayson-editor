/**
 * FROZEN CONTRACT TESTS — import-time placeholder lint (T-206).
 *
 * These tests define correctness for a re-implementation of
 * src/generation/import-lint.ts, calibrated to docs/PLACEHOLDER_GRAMMAR.md §2.3,
 * §3 (re-anchoring; §3-D = WARNING, not error) and §5 (lint severities).
 *
 * Deliberately RED against the prior implementation, which: (a) hard-errored on
 * ordinary code spans and on unmatched backtick refs (should be a §3-D WARNING),
 * and (b) only recognized ``` fences — silently accepting placeholders inside
 * ~~~ fences and HTML comments (violating §2.3). Do not weaken to pass a gate.
 */
import { describe, expect, it } from "vitest";
import { lintMarkdownPlaceholders } from "../../src/generation/import-lint";

// ── helpers ─────────────────────────────────────────────────────────────────

const md = (...lines: string[]): string => lines.join("\n");

/** True if any message across errors+warnings mentions the substring. */
function anyMessage(
  result: { errors: { message: string }[]; warnings: { message: string }[] },
  substring: string,
): boolean {
  return [...result.errors, ...result.warnings].some((m) =>
    m.message.includes(substring),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Happy path — valid externally-refined markdown
// ─────────────────────────────────────────────────────────────────────────────

describe("lintMarkdownPlaceholders — valid markdown", () => {
  it("accepts intact placeholders and a matching backtick reference", () => {
    const result = lintMarkdownPlaceholders(
      md(
        "---",
        "title: Q3 Review",
        "---",
        "",
        "Revenue improved across all regions.",
        "",
        '[[block: chart | intent: "Quarterly revenue trend 2022-2025" | id: revenue-trend]]',
        "",
        "See `revenue-trend` for the supporting chart.",
        "",
        '[[block: callout | intent: "Key takeaway for leadership" | id: exec-note]]',
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.placeholders.map((p) => p.localId)).toEqual([
      "revenue-trend",
      "exec-note",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG AREA 4 — lint must NOT hard-error on valid markdown
// ─────────────────────────────────────────────────────────────────────────────

describe("import-lint does not hard-error on valid markdown (§3-D, §2.3)", () => {
  it("does not error on an ordinary inline code span in prose", () => {
    // `npm-test` is a plain code span, NOT a placeholder reference.
    const result = lintMarkdownPlaceholders(
      md("Run `npm-test` before pushing your changes."),
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("does not error on a backtick id-like span inside a fenced code sample", () => {
    const result = lintMarkdownPlaceholders(
      md(
        "Here is a shell snippet:",
        "",
        "```sh",
        "deploy `revenue-trend`   # an id-shaped token inside a code sample",
        "```",
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("flags an unmatched backtick reference as a WARNING for human review, not an error (§3-D)", () => {
    const result = lintMarkdownPlaceholders(
      md(
        "See `missing-chart` in the appendix.",
        "",
        '[[block: table | intent: "Summary metrics" | id: metrics-table]]',
      ),
    );
    // §3-D: suggest relink, flag for human review — never a hard error.
    expect(result.errors).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(anyMessage(result, "missing-chart")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG AREA 5 — lint catches prohibited contexts (§2.3)
// Placeholders inside ~~~ tilde fences and inside HTML comments are NOT real
// placeholders and must not be silently accepted.
// ─────────────────────────────────────────────────────────────────────────────

describe("import-lint excludes placeholders in prohibited contexts (§2.3)", () => {
  it("does not accept a placeholder inside a ~~~ (tilde) fenced block", () => {
    const result = lintMarkdownPlaceholders(
      md(
        "Example of the syntax:",
        "",
        "~~~",
        '[[block: prose | intent: "Inside a tilde fence" | id: in-tilde-fence]]',
        "~~~",
      ),
    );
    // It must NOT be collected as a real, structurable placeholder.
    expect(result.placeholders.map((p) => p.localId)).not.toContain(
      "in-tilde-fence",
    );
  });

  it("does not accept a placeholder inside a multiline HTML comment", () => {
    const result = lintMarkdownPlaceholders(
      md(
        "Visible prose.",
        "",
        "<!--",
        "TODO discuss this block:",
        '[[block: chart | intent: "Inside an HTML comment" | id: in-html-comment]]',
        "-->",
        "",
        "More visible prose.",
      ),
    );
    // §2.3: placeholders must not appear inside HTML comments — not a real one.
    expect(result.placeholders.map((p) => p.localId)).not.toContain(
      "in-html-comment",
    );
  });

  it("still rejects a placeholder inside a ``` fenced block", () => {
    const result = lintMarkdownPlaceholders(
      md(
        "```",
        '[[block: prose | intent: "In a backtick fence" | id: in-fence]]',
        "```",
      ),
    );
    expect(result.placeholders.map((p) => p.localId)).not.toContain("in-fence");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTML-comment-vs-intent (review #1) — §1 allows `<!--`/`-->`/`<`/`!` inside the
// quoted intent string; only \" and \\ are escapes. Comment stripping must NOT
// run across a placeholder's quoted intent. Contrast with the existing case
// where a WHOLE placeholder line sits inside a real <!-- ... --> block (excluded).
// ─────────────────────────────────────────────────────────────────────────────

describe("import-lint distinguishes intent text from real HTML comments (§1)", () => {
  it("keeps a closed comment span that lives inside a placeholder's intent string", () => {
    const result = lintMarkdownPlaceholders(
      '[[block: chart | intent: "renders <!-- legacy --> markup" | id: legacy]]',
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    const legacy = result.placeholders.find((p) => p.localId === "legacy");
    // The `<!-- legacy -->` span is part of the intent per §1 — it must survive
    // verbatim, NOT be deleted as if it were a markdown HTML comment.
    expect(legacy?.intent).toBe("renders <!-- legacy --> markup");
  });

  it("does not let a bare `<!--` inside an intent swallow a later valid placeholder", () => {
    const result = lintMarkdownPlaceholders(
      md(
        '[[block: callout | intent: "see <!-- note" | id: noted]]',
        "",
        '[[block: table | intent: "Summary metrics" | id: metrics-table]]',
      ),
    );
    // The unclosed `<!--` belongs to the first placeholder's intent, not to a
    // markdown comment that runs to EOF — so the second, well-formed placeholder
    // must still be collected.
    expect(result.placeholders.map((p) => p.localId)).toContain("metrics-table");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Structural / placement errors (§5) — kept strict
// ─────────────────────────────────────────────────────────────────────────────

describe("import-lint structural errors (§5)", () => {
  it("errors on an inline placeholder (not a standalone paragraph)", () => {
    const result = lintMarkdownPlaceholders(
      'Revenue grew — [[block: chart | intent: "Trend" | id: rev]] — sharply.',
    );
    expect(result.ok).toBe(false);
    expect(anyMessage(result, "own line")).toBe(true);
  });

  it("errors on an unclosed placeholder marker", () => {
    const result = lintMarkdownPlaceholders(
      '[[block: chart | intent: "Broken marker" | id: broken',
    );
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("errors on duplicate placeholder ids", () => {
    const result = lintMarkdownPlaceholders(
      md(
        '[[block: chart | intent: "A" | id: dup]]',
        '[[block: table | intent: "B" | id: dup]]',
      ),
    );
    expect(result.ok).toBe(false);
    expect(anyMessage(result, "Duplicate")).toBe(true);
  });

  it("errors on an empty intent", () => {
    const result = lintMarkdownPlaceholders('[[block: chart | intent: "" | id: rev]]');
    expect(result.ok).toBe(false);
    expect(anyMessage(result, "non-empty")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unknown kind-hint is a WARNING, not an error (§5)
// ─────────────────────────────────────────────────────────────────────────────

describe("import-lint kind-hint handling (§5)", () => {
  it("warns (does not error) on an unknown kind-hint", () => {
    const result = lintMarkdownPlaceholders(
      '[[block: barchart | intent: "Revenue bars" | id: rev]]',
    );
    expect(result.ok).toBe(true);
    expect(anyMessage(result, "Unknown kind-hint")).toBe(true);
  });
});
