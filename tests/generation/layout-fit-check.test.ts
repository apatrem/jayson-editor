import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { SlideLayoutSchema } from "../../src/schema/containers";

// ─── FROZEN ACCEPTANCE TESTS · T-204 (plan/phase12-coarse) ──────────────────
// Committed red on purpose: they freeze the GENERATION_PIPELINE §5 fit-check
// contract before implementation. Capacity-number fidelity stays a HUMAN check
// (risk: high in tasks/T-204) — these tests freeze the machine-checkable part.
// Do not edit them to make a gate pass.

const CATALOGUE_PATH = "slide-layouts.catalogue.yaml";

interface CatalogueLayout {
  capacity?: Record<string, number>;
}

type FitCheck = (slide: unknown, catalogue: unknown) => { fits: boolean; flags: string[] };

function loadCatalogue(): Record<string, CatalogueLayout> {
  expect(
    existsSync(CATALOGUE_PATH),
    `${CATALOGUE_PATH} missing (T-204 output; developer spec stays YAML per ADR-0022)`,
  ).toBe(true);
  const doc = parse(readFileSync(CATALOGUE_PATH, "utf8")) as {
    layouts?: Record<string, CatalogueLayout>;
  };
  expect(doc?.layouts, "catalogue must define a top-level `layouts` map").toBeTruthy();
  return doc.layouts ?? {};
}

async function loadFitCheck(): Promise<FitCheck> {
  const moduleName = "layout-fit-check";
  let mod: Record<string, unknown> | null = null;
  try {
    mod = (await import(`../../src/generation/${moduleName}.ts`)) as Record<string, unknown>;
  } catch {
    mod = null;
  }
  const fn = mod?.fitCheckSlide;
  expect(
    fn,
    "src/generation/layout-fit-check.ts must export fitCheckSlide(slide, catalogue) (T-204)",
  ).toBeTypeOf("function");
  return fn as FitCheck;
}

describe("T-204 · slide-layouts catalogue is the single capacity source", () => {
  it("covers every editor slide layout with numeric capacity metadata", () => {
    const layouts = loadCatalogue();
    for (const layout of SlideLayoutSchema.options) {
      const entry = layouts[layout];
      expect(
        entry,
        `catalogue missing layout "${layout}" (must cover every SlideLayoutSchema option)`,
      ).toBeTruthy();
      const capacity = entry?.capacity ?? {};
      expect(
        Object.keys(capacity).length,
        `layout "${layout}" needs capacity metadata`,
      ).toBeGreaterThan(0);
      for (const [key, value] of Object.entries(capacity)) {
        expect(typeof value, `capacity "${key}" of "${layout}" must be numeric`).toBe("number");
      }
    }
  });

  it("catalogue layout ids stay consistent with the editor's LAYOUT_SLOTS", () => {
    const layouts = loadCatalogue();
    const editorSrc = readFileSync("src/editor/SlideLayoutEditor.tsx", "utf8");
    for (const id of Object.keys(layouts)) {
      expect(
        editorSrc.includes(`"${id}"`),
        `catalogue layout "${id}" has no editor LAYOUT_SLOTS entry`,
      ).toBe(true);
    }
  });
});

describe("T-204 · fit-check is the deterministic layout authority", () => {
  const overCapacitySlide = {
    id: "slide-overflow",
    layout: "title-body",
    blocks: Array.from({ length: 24 }, (_, i) => ({ id: `b${i}`, type: "prose" })),
  };

  it("flags layoutOverflow on an over-capacity slide (never silent truncation)", async () => {
    const fitCheck = await loadFitCheck();
    const result = fitCheck(overCapacitySlide, loadCatalogue());
    expect(result.fits).toBe(false);
    expect(result.flags).toContain("layoutOverflow");
  });

  it("is deterministic — identical inputs, deep-equal verdicts", async () => {
    const fitCheck = await loadFitCheck();
    const catalogue = loadCatalogue();
    expect(fitCheck(overCapacitySlide, catalogue)).toEqual(
      fitCheck(overCapacitySlide, catalogue),
    );
  });
});
