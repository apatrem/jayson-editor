import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canExport,
  collectReadinessBlockers,
  PERF_ENVELOPE_MAX_BLOCKS,
  readinessSnapshot,
} from "../../src/generation/readiness";
import type { DocModel } from "../../src/schema/docmodel";
import type { Block } from "../../src/schema/blocks";

const testMeta: DocModel["meta"] = {
  client: "Acme",
  project: "Test",
  docKind: "proposal",
  language: "en",
  status: "draft",
  archived: false,
  confidentialityLevel: "medium",
  owner: "test@example.com",
  reviewers: [],
  createdAt: "2026-05-21T00:00:00Z",
  updatedAt: "2026-05-21T00:00:00Z",
  tags: [],
  brandRef: "$brand:default",
};

function minimalDoc(blocks: Block[]): DocModel {
  return {
    kind: "document",
    schemaVersion: "1.0.0",
    meta: testMeta,
    sections: [{ id: "sec-1", title: "Section", blocks }],
    comments: [],
  };
}

describe("readinessSnapshot", () => {
  it("is allClear when no flags present", () => {
    const doc = minimalDoc([
      {
        id: "p1",
        type: "prose",
        align: "left",
        content: { type: "doc", content: [] },
      },
    ]);
    expect(canExport(doc)).toBe(true);
    expect(readinessSnapshot(doc).allClear).toBe(true);
  });

  it("still allows export when chart data is draft-illustrative", () => {
    const doc = minimalDoc([
      {
        id: "c1",
        type: "chart",
        chartType: "bar",
        title: "T",
        data: { series: [{ name: "S", values: [1] }], xLabels: ["A"] },
        dataState: "draft-illustrative",
        palette: "qualitative",
        showLegend: true,
        legendPosition: "bottom",
        showDataLabels: false,
      } as Block,
    ]);
    const snapshot = readinessSnapshot(doc);
    expect(snapshot.allClear).toBe(false);
    expect(canExport(doc)).toBe(true);
    expect(snapshot.blockers.some((b) => b.kind === "data-not-confirmed")).toBe(true);
  });

  it("still allows export when degradedToProse flag set", () => {
    const doc = minimalDoc([
      {
        id: "p1",
        type: "prose",
        align: "left",
        content: { type: "doc", content: [] },
        degradedToProse: true,
      } as Block,
    ]);
    expect(collectReadinessBlockers(doc)).toHaveLength(1);
    expect(canExport(doc)).toBe(true);
  });

  it("flags confirmed data without source", () => {
    const doc = minimalDoc([
      {
        id: "c1",
        type: "chart",
        chartType: "bar",
        title: "T",
        data: { series: [{ name: "S", values: [1] }], xLabels: ["A"] },
        dataState: "confirmed",
        palette: "qualitative",
        showLegend: true,
        legendPosition: "bottom",
        showDataLabels: false,
      } as Block,
    ]);
    const kinds = collectReadinessBlockers(doc).map((b) => b.kind);
    expect(kinds).toContain("missing-source-for-verify");
  });

  it("flags layout overflow and contradiction without blocking export", () => {
    const doc = minimalDoc([
      {
        id: "p1",
        type: "prose",
        align: "left",
        content: { type: "doc", content: [] },
        layoutOverflow: true,
        contradictionFlag: true,
      } as Block,
    ]);
    const kinds = collectReadinessBlockers(doc).map((b) => b.kind);
    expect(kinds).toContain("layout-overflow");
    expect(kinds).toContain("contradiction");
    expect(canExport(doc)).toBe(true);
  });

  it("flags size-exceeds-envelope without blocking export", () => {
    const blocks: Block[] = Array.from({ length: PERF_ENVELOPE_MAX_BLOCKS + 1 }, (_, i) => ({
      id: `p${i}`,
      type: "prose",
      align: "left",
      content: { type: "doc", content: [] },
    }));
    const doc = minimalDoc(blocks);
    const kinds = collectReadinessBlockers(doc).map((b) => b.kind);
    expect(kinds).toContain("size-exceeds-envelope");
    expect(canExport(doc)).toBe(true);
  });
});

describe("docs/UI_READINESS_GATE.md export popup contract", () => {
  it("names both popup actions for flagged export", () => {
    const text = readFileSync("docs/UI_READINESS_GATE.md", "utf8");
    expect(text).toMatch(/Review items/);
    expect(text).toMatch(/Export with flagged content/);
  });
});
