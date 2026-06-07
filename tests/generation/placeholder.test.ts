import { describe, expect, it } from "vitest";
import type { CalloutBlock } from "../../src/blocks/callout/schema";
import type { ChartBlock } from "../../src/blocks/chart/schema";
import { lintMarkdownPlaceholders } from "../../src/generation/import-lint";
import {
  formatPlaceholder,
  normalizeIntent,
  parsePlaceholderLine,
  placeholdersSemanticallyEqual,
  structurePlaceholder,
  toPlaceholder,
} from "../../src/generation/placeholder";

describe("parsePlaceholderLine", () => {
  it("parses a writer placeholder with empty kind hint", () => {
    const p = parsePlaceholderLine(
      '[[block: | intent: "Quarterly revenue trend 2022–2025" | id: revenue-trend]]',
    );
    expect(p).toEqual({
      kindHint: "",
      intent: "Quarterly revenue trend 2022–2025",
      localId: "revenue-trend",
    });
  });

  it("parses escaped quotes in intent", () => {
    const p = parsePlaceholderLine(
      String.raw`[[block: chart | intent: "FY25 \"acceleration\"" | id: rev]]`,
    );
    expect(p?.intent).toBe('FY25 "acceleration"');
  });

  it("rejects inline placeholders", () => {
    expect(
      parsePlaceholderLine('Text [[block: chart | intent: "x" | id: x]] more'),
    ).toBeNull();
  });
});

describe("formatPlaceholder round-trip", () => {
  it("normalizes parse(format(p))", () => {
    const original = {
      kindHint: "chart",
      intent: "Revenue trend",
      localId: "rev",
    };
    const line = formatPlaceholder(original);
    const parsed = parsePlaceholderLine(line);
    expect(parsed).not.toBeNull();
    expect(placeholdersSemanticallyEqual(original, parsed!)).toBe(true);
  });
});

describe("toPlaceholder", () => {
  it("derives chart intent from block fields", () => {
    const block: ChartBlock = {
      id: "revenue-trend",
      type: "chart",
      chartType: "bar",
      title: "Revenue trend",
      takeaway: "Growth accelerated in FY25",
      data: {
        series: [{ name: "Revenue", values: [10, 12, 15] }],
        xLabels: ["FY23", "FY24", "FY25"],
      },
      axes: { xTitle: "Year", yTitle: "€M" },
      palette: "qualitative",
      showLegend: true,
      legendPosition: "bottom",
      showDataLabels: false,
    };
    const p = toPlaceholder(block);
    expect(p?.kindHint).toBe("chart");
    expect(p?.localId).toBe("revenue-trend");
    expect(normalizeIntent(p!.intent)).toContain("Revenue trend");
    expect(normalizeIntent(p!.intent)).toContain("takeaway: Growth accelerated in FY25");
  });

  it("derives callout intent from variant, title, and body", () => {
    const block: CalloutBlock = {
      id: "q3-risk",
      type: "callout",
      variant: "warning",
      title: "Risk",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Supply chain exposure in Q3" }],
          },
        ],
      },
    };
    const p = toPlaceholder(block);
    expect(p).toEqual({
      kindHint: "callout",
      intent: "warning callout: Risk — Supply chain exposure in Q3",
      localId: "q3-risk",
    });
  });
});

describe("toPlaceholder(structure(p)) ≈ p", () => {
  it("holds for chart placeholders with explicit kind", () => {
    const original = parsePlaceholderLine(
      '[[block: chart | intent: "Revenue trend FY22–FY25" | id: revenue-trend]]',
    )!;
    const block = structurePlaceholder(original);
    const roundTripped = toPlaceholder(block)!;
    expect(roundTripped.kindHint).toBe("chart");
    expect(roundTripped.localId).toBe(original.localId);
    expect(normalizeIntent(roundTripped.intent)).toContain("Revenue trend FY22–FY25");
  });

  it("holds for callout placeholders", () => {
    const original = parsePlaceholderLine(
      '[[block: callout | intent: "Key takeaway for exec summary" | id: exec-note]]',
    )!;
    const block = structurePlaceholder(original);
    const roundTripped = toPlaceholder(block)!;
    expect(roundTripped.kindHint).toBe("callout");
    expect(roundTripped.localId).toBe("exec-note");
    expect(normalizeIntent(roundTripped.intent)).toContain("Key takeaway for exec summary");
  });
});

describe("lintMarkdownPlaceholders", () => {
  it("accepts valid standalone placeholders", () => {
    const md = [
      "Intro prose.",
      "",
      '[[block: chart | intent: "Revenue" | id: rev]]',
      "",
      "More prose.",
    ].join("\n");
    const result = lintMarkdownPlaceholders(md);
    expect(result.ok).toBe(true);
    expect(result.placeholders).toHaveLength(1);
  });

  it("errors on duplicate ids", () => {
    const md = [
      '[[block: chart | intent: "A" | id: dup]]',
      '[[block: table | intent: "B" | id: dup]]',
    ].join("\n");
    const result = lintMarkdownPlaceholders(md);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });
});
