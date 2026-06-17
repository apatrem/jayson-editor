import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { fitCheckSlide } from "../../src/generation/layout-fit-check";

const CATALOGUE_PATH = "slide-layouts.catalogue.yaml";

function loadCatalogue(): unknown {
  return parse(readFileSync(CATALOGUE_PATH, "utf8"));
}

function block(id: string, type: string): { id: string; type: string } {
  return { id, type };
}

describe("T-204 · fit-check enforces layout slot block kinds", () => {
  it("rejects prose in chart-full even though block count fits", () => {
    const result = fitCheckSlide(
      {
        id: "slide-chart-kind-mismatch",
        layout: "chart-full",
        blocks: [block("b0", "prose")],
      },
      loadCatalogue(),
    );

    expect(result).toEqual({ fits: false, flags: ["layoutOverflow"] });
  });

  it("accepts chart in chart-full", () => {
    const result = fitCheckSlide(
      {
        id: "slide-chart-fit",
        layout: "chart-full",
        blocks: [block("b0", "chart")],
      },
      loadCatalogue(),
    );

    expect(result).toEqual({ fits: true, flags: [] });
  });

  it("rejects chart in table layout", () => {
    const result = fitCheckSlide(
      {
        id: "slide-table-kind-mismatch",
        layout: "table",
        blocks: [block("b0", "chart")],
      },
      loadCatalogue(),
    );

    expect(result).toEqual({ fits: false, flags: ["layoutOverflow"] });
  });

  it("accepts a within-capacity slide when every block fits a slot kind", () => {
    const result = fitCheckSlide(
      {
        id: "slide-title-body-fit",
        layout: "title-body",
        blocks: [block("b0", "heading"), block("b1", "prose")],
      },
      loadCatalogue(),
    );

    expect(result).toEqual({ fits: true, flags: [] });
  });

  it("is deterministic for identical inputs", () => {
    const catalogue = loadCatalogue();
    const slide = {
      id: "slide-deterministic",
      layout: "chart-commentary",
      blocks: [block("b0", "chart"), block("b1", "prose")],
    };

    expect(fitCheckSlide(slide, catalogue)).toEqual(fitCheckSlide(slide, catalogue));
  });
});
