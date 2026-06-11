import { describe, expect, it } from "vitest";
import { lintMarkdownPlaceholders } from "../../src/generation/import-lint";

const VALID_EXTERNAL_REFINEMENT = [
  "---",
  "title: Q3 Review",
  "client: Acme",
  "---",
  "",
  "Revenue improved across all regions.",
  "",
  '[[block: chart | intent: "Quarterly revenue trend 2022–2025" | id: revenue-trend]]',
  "",
  "See `revenue-trend` for the supporting chart.",
  "",
  '[[block: callout | intent: "Key takeaway for leadership" | id: exec-note]]',
].join("\n");

const INVALID_INLINE_PLACEHOLDER = [
  "Revenue grew — [[block: chart | intent: \"Trend\" | id: rev]] — sharply.",
].join("\n");

const INVALID_ORPHANED_REF = [
  "See `missing-chart` in the appendix.",
  "",
  '[[block: table | intent: "Summary metrics" | id: metrics-table]]',
].join("\n");

const INVALID_STRUCTURAL_DAMAGE = [
  '[[block: chart | intent: "Broken marker" | id: broken',
  "",
  "```",
  '[[block: prose | intent: "In fence" | id: fenced]]',
  "```",
].join("\n");

describe("lintMarkdownPlaceholders", () => {
  it("accepts valid externally-refined markdown with intact placeholders", () => {
    const result = lintMarkdownPlaceholders(VALID_EXTERNAL_REFINEMENT);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.placeholders).toHaveLength(2);
    expect(result.placeholders.map((p) => p.localId)).toEqual([
      "revenue-trend",
      "exec-note",
    ]);
  });

  it("errors on inline placeholders (not standalone paragraphs)", () => {
    const result = lintMarkdownPlaceholders(INVALID_INLINE_PLACEHOLDER);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("own line");
  });

  it("errors on orphaned backtick placeholder references", () => {
    const result = lintMarkdownPlaceholders(INVALID_ORPHANED_REF);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Orphaned"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("missing-chart"))).toBe(
      true,
    );
  });

  it("errors on structural damage: unclosed markers and code-fence placeholders", () => {
    const result = lintMarkdownPlaceholders(INVALID_STRUCTURAL_DAMAGE);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("closing ']]'"))).toBe(
      true,
    );
    expect(result.errors.some((e) => e.message.includes("code fence"))).toBe(true);
  });

  it("warns on unknown kind-hints without failing lint", () => {
    const md = '[[block: barchart | intent: "Revenue bars" | id: rev]]';
    const result = lintMarkdownPlaceholders(md);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.message.includes("Unknown kind-hint"))).toBe(
      true,
    );
  });

  it("errors on duplicate placeholder ids", () => {
    const md = [
      '[[block: chart | intent: "A" | id: dup]]',
      '[[block: table | intent: "B" | id: dup]]',
    ].join("\n");
    const result = lintMarkdownPlaceholders(md);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });
});
