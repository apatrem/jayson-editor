/**
 * FROZEN CONTRACT TESTS — placeholder grammar (T-206).
 *
 * These tests define correctness for a re-implementation of
 * src/generation/placeholder.ts. The implementer MUST make them pass WITHOUT
 * editing them. They are calibrated to docs/PLACEHOLDER_GRAMMAR.md and the 15
 * block schemas under src/blocks/<type>/schema.ts.
 *
 * They are deliberately RED against the prior implementation, which passed CI
 * while violating the contract in the ways exercised below (see the bug-area
 * banners). Do not weaken these assertions to make a gate pass.
 */
import { describe, expect, it } from "vitest";

import type { CalloutBlock } from "../../src/blocks/callout/schema";
import type { ChartBlock } from "../../src/blocks/chart/schema";
import type { DiagramBlock } from "../../src/blocks/diagram/schema";
import type { KpiCardsBlock } from "../../src/blocks/kpi-cards/schema";
import type { RiskMatrixBlock } from "../../src/blocks/risk-matrix/schema";
import type { RoadmapBlock } from "../../src/blocks/roadmap/schema";
import type { TableBlock } from "../../src/blocks/table/schema";
import type { TeamBlock } from "../../src/blocks/team/schema";
import type { TimelineBlock } from "../../src/blocks/timeline/schema";
import type { ProseMirrorFragment } from "../../src/schema/prosemirror-fragment";
import type { DocBlock } from "../../src/schema/blocks";
import {
  type Placeholder,
  formatPlaceholder,
  normalizeIntent,
  parsePlaceholderLine,
  parsePlaceholderLineDetailed,
  placeholdersSemanticallyEqual,
  structurePlaceholder,
  toPlaceholder,
} from "../../src/generation/placeholder";

// ── Test helpers ────────────────────────────────────────────────────────────

const LOCAL_ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_INTENT = 500;

function paragraph(text: string) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

/** A ProseMirror doc fragment with one paragraph per provided string. */
function bodyOf(...paragraphs: string[]): ProseMirrorFragment {
  return { type: "doc", content: paragraphs.map(paragraph) };
}

/** "ab".repeat → string of exactly `n` chars (lowercase letters only). */
function lettersOfLength(n: number): string {
  return "ab".repeat(Math.ceil(n / 2)).slice(0, n);
}

/** A grammatically-valid placeholder produced via the format → parse path. */
function parseOrThrow(line: string): Placeholder {
  const p = parsePlaceholderLine(line);
  if (!p) throw new Error(`Expected a valid placeholder, got null for: ${line}`);
  return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG AREA 8 — Parser strictness (§1)
// ─────────────────────────────────────────────────────────────────────────────

describe("parsePlaceholderLine — accepts valid forms (§1)", () => {
  it("accepts an empty kind-hint", () => {
    const p = parsePlaceholderLine(
      '[[block: | intent: "Quarterly revenue trend 2022-2025" | id: revenue-trend]]',
    );
    expect(p).toEqual({
      kindHint: "",
      intent: "Quarterly revenue trend 2022-2025",
      localId: "revenue-trend",
    });
  });

  it('accepts the \\" escape inside the quoted intent', () => {
    const p = parsePlaceholderLine(
      String.raw`[[block: chart | intent: "FY25 \"acceleration\"" | id: rev]]`,
    );
    expect(p?.intent).toBe('FY25 "acceleration"');
  });

  it("accepts the backslash escape inside the quoted intent", () => {
    const p = parsePlaceholderLine(
      String.raw`[[block: chart | intent: "path C:\\data" | id: rev]]`,
    );
    expect(p?.intent).toBe(String.raw`path C:\data`);
  });

  it("accepts a kind-hint that is valid lowercase kebab-case", () => {
    const p = parsePlaceholderLine(
      '[[block: kpi-cards | intent: "Three headline metrics" | id: kpis]]',
    );
    expect(p?.kindHint).toBe("kpi-cards");
  });
});

describe("parsePlaceholderLine — rejects invalid forms (§1)", () => {
  it("rejects an invalid escape sequence (only \\\" and \\\\ are allowed)", () => {
    // \q is not a permitted escape inside the quoted intent.
    expect(
      parsePlaceholderLine(String.raw`[[block: chart | intent: "bad \q escape" | id: rev]]`),
    ).toBeNull();
  });

  it("rejects a kind-hint that is not lowercase kebab-case", () => {
    expect(
      parsePlaceholderLine('[[block: Not A Kind | intent: "x" | id: rev]]'),
    ).toBeNull();
  });

  it("rejects an uppercase kind-hint", () => {
    expect(
      parsePlaceholderLine('[[block: Chart | intent: "x" | id: rev]]'),
    ).toBeNull();
  });

  it("rejects a missing closing ']]'", () => {
    const r = parsePlaceholderLineDetailed(
      '[[block: chart | intent: "missing close" | id: rev',
    );
    expect("message" in r && r.message).toContain("closing ']]'");
  });

  it("rejects an empty intent", () => {
    const r = parsePlaceholderLineDetailed('[[block: chart | intent: "" | id: rev]]');
    expect("message" in r && r.message).toContain("non-empty");
  });

  it("rejects an invalid local-id (uppercase)", () => {
    const r = parsePlaceholderLineDetailed('[[block: chart | intent: "x" | id: Bad]]');
    expect("placeholder" in r).toBe(false);
  });

  it("rejects a local-id longer than 32 chars", () => {
    const tooLong = `a${lettersOfLength(32)}`; // 33 chars
    expect(
      parsePlaceholderLine(`[[block: chart | intent: "x" | id: ${tooLong}]]`),
    ).toBeNull();
  });

  it("rejects an inline (non-standalone) placeholder", () => {
    expect(
      parsePlaceholderLine('Text [[block: chart | intent: "x" | id: x]] more'),
    ).toBeNull();
  });

  it("rejects intent longer than 500 chars", () => {
    const long = lettersOfLength(MAX_INTENT + 1);
    expect(
      parsePlaceholderLine(`[[block: chart | intent: "${long}" | id: rev]]`),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6.1 — parse / format round-trip on normalized strings
// ─────────────────────────────────────────────────────────────────────────────

describe("format/parse round-trip (§6.1)", () => {
  it("parse(format(p)) is semantically equal to p", () => {
    const original: Placeholder = {
      kindHint: "chart",
      intent: 'Revenue trend with a "quoted" term and a back\\slash',
      localId: "rev",
    };
    const parsed = parseOrThrow(formatPlaceholder(original));
    expect(placeholdersSemanticallyEqual(original, parsed)).toBe(true);
    // The exact intent (including escaped chars) must survive verbatim.
    expect(parsed.intent).toBe(original.intent);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG AREA 6 — Per-block derivation matches the CORRECTED grammar §4
// ─────────────────────────────────────────────────────────────────────────────

describe("toPlaceholder derivation — corrected §4 fields", () => {
  it("chart: derives title + chartType + series + axes + takeaway", () => {
    const block: ChartBlock = {
      id: "revenue-trend",
      type: "chart",
      chartType: "bar",
      title: "Revenue trend",
      takeaway: "Growth accelerated in FY25",
      data: {
        series: [
          { name: "Revenue", values: [10, 12, 15] },
          { name: "Cost", values: [4, 5, 6] },
        ],
        xLabels: ["FY23", "FY24", "FY25"],
      },
      axes: { xTitle: "Year", yTitle: "EUR M" },
      palette: "qualitative",
      showLegend: true,
      legendPosition: "bottom",
      showDataLabels: false,
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    expect(intent).toContain("Revenue trend");
    expect(intent).toContain("Revenue");
    expect(intent).toContain("Cost");
    expect(intent).toContain("Growth accelerated in FY25");
  });

  it("table: derives caption + column headers", () => {
    const block: TableBlock = {
      id: "metrics",
      type: "table",
      caption: "Q3 Results",
      columns: [
        { header: "Revenue", align: "left" },
        { header: "Cost", align: "left" },
      ],
      rows: [
        {
          cells: [
            bodyOf("10"),
            bodyOf("4"),
          ],
        },
      ],
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    expect(intent).toContain("Q3 Results");
    expect(intent).toContain("Revenue");
    expect(intent).toContain("Cost");
  });

  it("kpi-cards: derives each card label: value", () => {
    const block: KpiCardsBlock = {
      id: "kpis",
      type: "kpi-cards",
      cards: [
        { value: "EUR 42M", label: "Revenue", trend: "none", emphasis: "neutral" },
        { value: "12%", label: "Growth", trend: "up", emphasis: "positive" },
      ],
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    expect(intent).toContain("Revenue");
    expect(intent).toContain("EUR 42M");
    expect(intent).toContain("Growth");
    expect(intent).toContain("12%");
  });

  it("timeline: derives from phase labels, never a fabricated title (no title field)", () => {
    const block: TimelineBlock = {
      id: "plan",
      type: "timeline",
      phases: [
        { label: "Discovery", subtitle: "Weeks 1-2" },
        { label: "Build" },
        { label: "Launch" },
      ],
      orientation: "horizontal",
      connector: "arrow",
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    expect(intent).toContain("Discovery");
    expect(intent).toContain("Build");
    expect(intent).toContain("Launch");
    // The timeline schema has NO title field — nothing may be fabricated from one.
    expect(intent).not.toContain("undefined");
    expect(intent).not.toMatch(/null/i);
  });

  it("roadmap: derives from lane labels + item/phase (milestone) labels, no title", () => {
    const block: RoadmapBlock = {
      id: "delivery",
      type: "roadmap",
      timeUnit: "month",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      workstreams: [
        { label: "Platform", startDate: "2026-01-01", endDate: "2026-06-30", color: "auto" },
        { label: "Mobile", startDate: "2026-03-01", endDate: "2026-12-31", color: "auto" },
      ],
      milestones: [
        { label: "Beta", date: "2026-06-01" },
        { label: "GA", date: "2026-12-01" },
      ],
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    // Lane (workstream) labels.
    expect(intent).toContain("Platform");
    expect(intent).toContain("Mobile");
    // Item/phase (milestone) labels.
    expect(intent).toContain("Beta");
    expect(intent).toContain("GA");
    expect(intent).not.toContain("undefined");
  });

  it("team: derives from member names, never a fabricated title (no title field)", () => {
    const block: TeamBlock = {
      id: "squad",
      type: "team",
      layout: "grid",
      members: [
        { name: "Alice Martin", role: "Lead" },
        { name: "Bob Chen", role: "Analyst" },
      ],
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    expect(intent).toContain("Alice Martin");
    expect(intent).toContain("Bob Chen");
    expect(intent).not.toContain("undefined");
  });

  it("risk-matrix: derives from axis labels, never a fabricated title (no title field)", () => {
    const block: RiskMatrixBlock = {
      id: "risks",
      type: "risk-matrix",
      gridSize: "3x3",
      xAxisLabel: "Likelihood",
      yAxisLabel: "Impact",
      risks: [{ label: "Supply", x: 2, y: 3, severity: "high" }],
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    expect(intent).toContain("Likelihood");
    expect(intent).toContain("Impact");
    expect(intent).not.toContain("undefined");
  });

  it("diagram: derives from title + caption", () => {
    const block: DiagramBlock = {
      id: "flow",
      type: "diagram",
      source: "graph TD; A-->B;",
      title: "Process flow",
      caption: "Onboarding steps",
      width: "large",
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    expect(intent).toContain("Process flow");
    expect(intent).toContain("Onboarding steps");
  });

  it("returns null for prose-native block types", () => {
    const proseNative: DocBlock[] = [
      { id: "p1", type: "prose", align: "left", content: { type: "doc", content: [] } },
      { id: "h1", type: "heading", level: 2, text: "Section", numbered: true },
      { id: "d1", type: "divider" },
      { id: "bl1", type: "bullet-list", items: [{ text: { type: "doc", content: [] } }] },
      { id: "nl1", type: "numbered-list", items: [{ text: { type: "doc", content: [] } }] },
    ];
    for (const block of proseNative) {
      expect(toPlaceholder(block), block.type).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG AREA 7 — Callout plain-text is lossless across block boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe("callout plain-text extraction (paragraph boundaries)", () => {
  it("preserves whitespace between two body paragraphs", () => {
    const block: CalloutBlock = {
      id: "two-para",
      type: "callout",
      variant: "info",
      body: bodyOf("First", "Second"),
    };
    const intent = toPlaceholder(block)!.intent;
    // The boundary between paragraphs must NOT be collapsed to "FirstSecond".
    expect(intent).not.toContain("FirstSecond");
    // "First" and "Second" must both be present, separated by whitespace.
    expect(intent).toMatch(/First\s+Second/);
  });

  it("derives callout intent from variant + optional title + body", () => {
    const block: CalloutBlock = {
      id: "q3-risk",
      type: "callout",
      variant: "warning",
      title: "Risk",
      body: bodyOf("Supply chain exposure in Q3"),
    };
    const intent = normalizeIntent(toPlaceholder(block)!.intent);
    expect(intent).toContain("warning");
    expect(intent).toContain("Risk");
    expect(intent).toContain("Supply chain exposure in Q3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG AREA 1 — §6.2 structure-stub round-trip is REAL, not stubbed
// (placeholdersSemanticallyEqual must hold; NOT an .includes() check)
// ─────────────────────────────────────────────────────────────────────────────

describe("§6.2 round-trip: toPlaceholder(structure(p)) ≈ p", () => {
  const cases: ReadonlyArray<{ name: string; line: string }> = [
    {
      name: "callout",
      line: '[[block: callout | intent: "Key takeaway for the exec summary" | id: exec-note]]',
    },
    {
      name: "chart",
      line: '[[block: chart | intent: "Quarterly revenue trend FY22 to FY25" | id: revenue-trend]]',
    },
    {
      name: "table",
      line: '[[block: table | intent: "Summary metrics by region" | id: metrics-table]]',
    },
    {
      name: "kpi-cards",
      line: '[[block: kpi-cards | intent: "Three headline metrics for the quarter" | id: kpi-row]]',
    },
    {
      name: "timeline",
      line: '[[block: timeline | intent: "Discovery, build, and launch phases" | id: plan-phases]]',
    },
  ];

  for (const { name, line } of cases) {
    it(`holds with full semantic equality for ${name}`, () => {
      const original = parseOrThrow(line);
      const block = structurePlaceholder(original);
      const roundTripped = toPlaceholder(block);
      expect(roundTripped, `${name}: structure(p) must down-convert back to a placeholder`).not.toBeNull();
      // STRICT: same id, same kind, normalized-whitespace-equal intent.
      // A no-op / lossy structure stub fails here. Substring checks are forbidden.
      expect(
        placeholdersSemanticallyEqual(roundTripped!, original),
        `${name}: expected ${JSON.stringify(roundTripped)} ≈ ${JSON.stringify(original)}`,
      ).toBe(true);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG AREA 2 — toPlaceholder output is always grammar-valid (intent ≤ 500)
// Build MAXIMUM-size valid blocks; derived placeholder must still parse + round-trip.
// ─────────────────────────────────────────────────────────────────────────────

describe("toPlaceholder output stays within the grammar (intent ≤ 500)", () => {
  /** Assert the derived placeholder is parseable and survives format→parse. */
  function expectGrammarValid(block: DocBlock, label: string): void {
    const p = toPlaceholder(block);
    expect(p, `${label}: toPlaceholder must not return null`).not.toBeNull();
    expect(
      p!.intent.length,
      `${label}: derived intent must be ≤ ${MAX_INTENT} chars (was ${p!.intent.length})`,
    ).toBeLessThanOrEqual(MAX_INTENT);
    expect(p!.localId, `${label}: localId`).toMatch(LOCAL_ID_RE);
    const formatted = formatPlaceholder(p!);
    const reparsed = parsePlaceholderLine(formatted);
    expect(reparsed, `${label}: formatPlaceholder output must re-parse`).not.toBeNull();
    expect(
      placeholdersSemanticallyEqual(reparsed!, p!),
      `${label}: derived placeholder must round-trip through format/parse`,
    ).toBe(true);
  }

  it("max-size chart (long title, 8 long series, both axes, takeaway)", () => {
    const block: ChartBlock = {
      id: "max-chart",
      type: "chart",
      chartType: "bar",
      title: lettersOfLength(120),
      takeaway: lettersOfLength(200),
      data: {
        series: Array.from({ length: 8 }, (_, i) => ({
          name: `${lettersOfLength(76)}-s${i}`, // 80 chars (max)
          values: [1, 2, 3],
        })),
        xLabels: ["A", "B", "C"],
      },
      axes: { xTitle: lettersOfLength(80), yTitle: lettersOfLength(80) },
      palette: "qualitative",
      showLegend: true,
      legendPosition: "bottom",
      showDataLabels: false,
    };
    expectGrammarValid(block, "max chart");
  });

  it("max-size table (long caption, 8 columns)", () => {
    const block: TableBlock = {
      id: "max-table",
      type: "table",
      caption: lettersOfLength(300),
      columns: Array.from({ length: 8 }, (_, i) => ({
        header: `${lettersOfLength(60)}-c${i}`,
        align: "left" as const,
      })),
      rows: [
        { cells: Array.from({ length: 8 }, () => bodyOf("x")) },
      ],
    };
    expectGrammarValid(block, "max table");
  });

  it("max-size kpi-cards (4 cards, long labels + values)", () => {
    const block: KpiCardsBlock = {
      id: "max-kpi",
      type: "kpi-cards",
      cards: Array.from({ length: 4 }, (_, i) => ({
        value: `${lettersOfLength(90)}-v${i}`,
        label: `${lettersOfLength(56)}-l${i}`, // 60 chars (max)
        trend: "none" as const,
        emphasis: "neutral" as const,
      })),
    };
    expectGrammarValid(block, "max kpi-cards");
  });

  it("max-size timeline (7 phases, long labels + subtitles)", () => {
    const block: TimelineBlock = {
      id: "max-timeline",
      type: "timeline",
      phases: Array.from({ length: 7 }, (_, i) => ({
        label: `${lettersOfLength(36)}-p${i}`, // 40 chars (max)
        subtitle: lettersOfLength(80),
      })),
      orientation: "horizontal",
      connector: "arrow",
    };
    expectGrammarValid(block, "max timeline");
  });

  it("max-size roadmap (8 lanes + 12 milestones, long labels)", () => {
    const block: RoadmapBlock = {
      id: "max-roadmap",
      type: "roadmap",
      timeUnit: "month",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      workstreams: Array.from({ length: 8 }, (_, i) => ({
        label: `${lettersOfLength(76)}-w${i}`, // 80 chars (max)
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        color: "auto" as const,
      })),
      milestones: Array.from({ length: 12 }, (_, i) => ({
        label: `${lettersOfLength(76)}-m${i}`,
        date: "2026-06-15",
      })),
    };
    expectGrammarValid(block, "max roadmap");
  });

  it("max-size diagram (long title + long caption)", () => {
    const block: DiagramBlock = {
      id: "max-diagram",
      type: "diagram",
      source: "graph TD; A-->B;",
      title: lettersOfLength(120),
      caption: lettersOfLength(500),
      width: "large",
    };
    expectGrammarValid(block, "max diagram");
  });

  it("max-size team (12 members, long names)", () => {
    const block: TeamBlock = {
      id: "max-team",
      type: "team",
      layout: "grid",
      members: Array.from({ length: 12 }, (_, i) => ({
        name: `${lettersOfLength(60)}-name${i}`,
        role: "Member",
      })),
    };
    expectGrammarValid(block, "max team");
  });

  it("max-size callout (long title + very long body)", () => {
    const block: CalloutBlock = {
      id: "max-callout",
      type: "callout",
      variant: "warning",
      title: lettersOfLength(100),
      body: bodyOf(lettersOfLength(600), lettersOfLength(600)),
    };
    expectGrammarValid(block, "max callout");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG AREA 3 — local-id collision resistance
// Two StableIds identical for the first 40+ chars but differing later must yield
// DIFFERENT localIds, each matching ^[a-z][a-z0-9-]{0,31}$.
// ─────────────────────────────────────────────────────────────────────────────

describe("local-id derivation — collision resistance", () => {
  it("distinguishes ids that share a 40+ char prefix but differ later", () => {
    const sharedPrefix = "executive-summary-revenue-growth-by-region"; // 43 chars
    const blockA: ChartBlock = makeMinimalChart(`${sharedPrefix}-north-america`);
    const blockB: ChartBlock = makeMinimalChart(`${sharedPrefix}-europe-emea`);

    const idA = toPlaceholder(blockA)!.localId;
    const idB = toPlaceholder(blockB)!.localId;

    expect(idA).toMatch(LOCAL_ID_RE);
    expect(idB).toMatch(LOCAL_ID_RE);
    // Bare truncation to 31 chars (no disambiguating hash) collides → must NOT happen.
    expect(idA).not.toBe(idB);
  });

  it("produces a 32-char-max id even from a 120-char StableId", () => {
    const longId = `${lettersOfLength(60)}-suffix-${lettersOfLength(50)}`; // ~117 chars
    const block = makeMinimalChart(longId);
    const localId = toPlaceholder(block)!.localId;
    expect(localId).toMatch(LOCAL_ID_RE);
    expect(localId.length).toBeLessThanOrEqual(32);
  });
});

function makeMinimalChart(id: string): ChartBlock {
  return {
    id,
    type: "chart",
    chartType: "bar",
    title: "Chart",
    data: { series: [{ name: "S", values: [1] }], xLabels: ["A"] },
    palette: "qualitative",
    showLegend: true,
    legendPosition: "bottom",
    showDataLabels: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Down-conversion must NEVER read `sourceIntent` (CONTEXT.md "Source intent")
// ─────────────────────────────────────────────────────────────────────────────

describe("toPlaceholder never reads sourceIntent", () => {
  const MARKER = "DISTINCTIVE-SOURCE-INTENT-MARKER-zzz";

  it("does not surface a block's sourceIntent in the derived intent (chart)", () => {
    const block = {
      ...makeMinimalChart("rev"),
      title: "Revenue trend",
      // sourceIntent is a generation flag (src/schema/generation.ts), not a
      // field toPlaceholder is permitted to read. Attached via cast because the
      // strict block schema does not (yet) declare it.
      sourceIntent: MARKER,
    } as unknown as DocBlock;
    const intent = toPlaceholder(block)!.intent;
    expect(intent).toContain("Revenue trend");
    expect(intent).not.toContain(MARKER);
  });

  it("does not surface a block's sourceIntent in the derived intent (callout)", () => {
    const block = {
      id: "note",
      type: "callout",
      variant: "info",
      title: "Heads up",
      body: bodyOf("Real body text"),
      sourceIntent: MARKER,
    } as unknown as DocBlock;
    const intent = toPlaceholder(block)!.intent;
    expect(intent).toContain("Real body text");
    expect(intent).not.toContain(MARKER);
  });
});
