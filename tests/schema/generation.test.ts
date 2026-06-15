import { describe, expect, it } from "vitest";
import {
  DataSourceSchema,
  GenerationDataFieldsSchema,
  GenerationBlockFlagsSchema,
} from "../../src/schema/generation";
import { ChartBlockDataSchema } from "../../src/blocks/chart/schema";

describe("GenerationDataFieldsSchema", () => {
  it("accepts human-authoritative source separately from advisory sourceHint", () => {
    const parsed = GenerationDataFieldsSchema.parse({
      dataState: "draft-illustrative",
      source: { name: "Client roster Q1 2026", link: "https://example.com/roster" },
      sourceHint: "Check INSEE / Euromonitor for market size",
    });
    expect(parsed.source?.name).toBe("Client roster Q1 2026");
    expect(parsed.sourceHint).toMatch(/INSEE/);
  });

  it("rejects source as a plain string (must be DataSource, not sourceHint)", () => {
    expect(
      GenerationDataFieldsSchema.safeParse({
        source: "INSEE",
      }).success,
    ).toBe(false);
  });

  it("rejects sourceHint as an object (citation shape belongs on source only)", () => {
    expect(
      GenerationDataFieldsSchema.safeParse({
        sourceHint: { name: "INSEE" },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys on DataSource", () => {
    expect(
      DataSourceSchema.safeParse({ name: "Report", citation: "bad" }).success,
    ).toBe(false);
  });
});

describe("GenerationBlockFlagsSchema", () => {
  it("accepts readiness flag fields", () => {
    expect(
      GenerationBlockFlagsSchema.parse({
        sourceIntent: "Show revenue trend",
        degradedToProse: true,
        layoutOverflow: true,
        contradictionFlag: true,
      }),
    ).toMatchObject({ degradedToProse: true });
  });
});

describe("ChartBlockDataSchema generation fields", () => {
  it("validates merged data + flag fields on chart blocks", () => {
    const block = ChartBlockDataSchema.parse({
      id: "c1",
      type: "chart",
      chartType: "bar",
      title: "Revenue",
      data: { series: [{ name: "Rev", values: [1, 2] }], xLabels: ["A", "B"] },
      dataState: "draft-illustrative",
      sourceHint: "Verify against audited accounts",
      palette: "qualitative",
      showLegend: true,
      legendPosition: "bottom",
      showDataLabels: false,
    });
    expect(block.dataState).toBe("draft-illustrative");
  });
});
