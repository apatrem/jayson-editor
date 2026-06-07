import { describe, expect, it } from "vitest";
import { canExport, collectReadinessBlockers, readinessSnapshot } from "../../src/generation/readiness";
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
  it("is shippable when no flags present", () => {
    const doc = minimalDoc([
      {
        id: "p1",
        type: "prose",
        align: "left",
        content: { type: "doc", content: [] },
      },
    ]);
    expect(canExport(doc)).toBe(true);
  });

  it("blocks export when chart data is draft-illustrative", () => {
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
    expect(snapshot.shippable).toBe(false);
    expect(snapshot.blockers.some((b) => b.kind === "data-not-confirmed")).toBe(true);
  });

  it("blocks export when degradedToProse flag set", () => {
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
    expect(canExport(doc)).toBe(false);
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
});
