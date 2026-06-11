import { describe, expect, it } from "vitest";
import type { CalloutBlock } from "../../src/blocks/callout/schema";
import type { ChartBlock } from "../../src/blocks/chart/schema";
import type { DocBlock } from "../../src/schema/blocks";
import { defaultTableBlock } from "../../src/blocks/table/schema";
import {
  formatPlaceholder,
  normalizeIntent,
  parsePlaceholderLine,
  parsePlaceholderLineDetailed,
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

  it("returns actionable errors for malformed placeholders", () => {
    const missingClose = parsePlaceholderLineDetailed(
      '[[block: chart | intent: "missing close" | id: rev',
    );
    expect("message" in missingClose && missingClose.message).toContain("closing ']]'");

    const emptyIntent = parsePlaceholderLineDetailed(
      '[[block: chart | intent: "" | id: rev]]',
    );
    expect("message" in emptyIntent && emptyIntent.message).toContain("non-empty");

    const badId = parsePlaceholderLineDetailed('[[block: chart | intent: "x" | id: Bad]]');
    expect("message" in badId && badId.message).toContain("[a-z][a-z0-9-]");
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

  it("returns null for prose-native block types", () => {
    const proseLike: DocBlock[] = [
      {
        id: "p1",
        type: "prose",
        align: "left",
        content: { type: "doc", content: [] },
      },
      { id: "h1", type: "heading", level: 2, text: "Section", numbered: true },
      { id: "d1", type: "divider" },
      {
        id: "bl1",
        type: "bullet-list",
        items: [{ text: { type: "doc", content: [] } }],
      },
      {
        id: "nl1",
        type: "numbered-list",
        items: [{ text: { type: "doc", content: [] } }],
      },
    ];
    for (const block of proseLike) {
      expect(toPlaceholder(block)).toBeNull();
    }
  });

  it("derives placeholder intent for all non-prose catalogue blocks", () => {
    const table = defaultTableBlock("metrics", ["Revenue", "Cost"]);
    table.caption = "Q3 Results";
    const blocks: DocBlock[] = [
      table,
      {
        id: "kpis",
        type: "kpi-cards",
        cards: [
          { value: "€42M", label: "Revenue", trend: "none", emphasis: "neutral" },
          { value: "12%", label: "Growth", trend: "none", emphasis: "neutral" },
        ],
      },
      {
        id: "plan",
        type: "timeline",
        phases: [{ label: "Discovery" }, { label: "Launch" }],
        orientation: "horizontal",
        connector: "arrow",
      },
      {
        id: "roadmap",
        type: "roadmap",
        timeUnit: "month",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        workstreams: [
          {
            label: "Platform",
            startDate: "2026-01-01",
            endDate: "2026-06-30",
            color: "auto",
          },
        ],
        milestones: [{ label: "Beta", date: "2026-06-01" }],
      },
      {
        id: "hero",
        type: "image",
        src: "assets/hero.png",
        alt: "Leadership team",
        caption: "Figure 1",
        width: "medium",
        align: "center",
      },
      {
        id: "flow",
        type: "diagram",
        source: "graph TD; A-->B;",
        title: "Process flow",
        caption: "Onboarding steps",
        width: "large",
      },
      {
        id: "team",
        type: "team",
        layout: "grid",
        members: [
          { name: "Alice", role: "Lead" },
          { name: "Bob", role: "Analyst" },
        ],
      },
      {
        id: "risks",
        type: "risk-matrix",
        gridSize: "3x3",
        xAxisLabel: "Likelihood",
        yAxisLabel: "Impact",
        risks: [{ label: "Supply", x: 2, y: 3, severity: "high" }],
      },
    ];

    for (const block of blocks) {
      const p = toPlaceholder(block);
      expect(p, block.type).not.toBeNull();
      expect(p!.kindHint).toBe(block.type);
      expect(p!.localId).toBe(block.id);
      expect(p!.intent.length).toBeGreaterThan(0);
    }
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
