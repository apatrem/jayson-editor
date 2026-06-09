import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateDocModel } from "../../src/schema/validate";

// ─── FROZEN ACCEPTANCE TESTS · T-202 (plan/phase12-coarse) ──────────────────
// Committed red on purpose: they freeze the ADR-0022 app-surface contract
// (editor, menu, templates, library) before implementation. Do not edit them
// to make a gate pass.

describe("T-202 · editor document path runs on JSON", () => {
  it("file-open parses JSON and no longer discovers .yaml documents", () => {
    const src = readFileSync("src/editor/file-open.ts", "utf8");
    expect(src).toContain("parseDocModelJson");
    expect(src).not.toContain("parseDocModelYaml");
    expect(src).not.toMatch(/\.ya?ml/);
  });

  it("file-save and autosave write the JSON projection", () => {
    for (const file of ["src/editor/file-save.ts", "src/editor/autosave.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must reference the JSON document projection`).toMatch(/\.json|Json/);
    }
  });

  it("file menu dialogs filter .json documents", () => {
    const src = readFileSync("src/ui/menu/FileMenu.tsx", "utf8");
    expect(src).toMatch(/json/);
    expect(src).not.toMatch(/["']ya?ml["']/);
  });
});

describe("T-202 · templates + library run on JSON", () => {
  const templates = [
    "commercial-proposal",
    "commercial-proposal-deck",
    "standard-report",
    "standard-report-deck",
  ];

  it.each(templates)("templates/%s.json exists and validates as a DocModel", (name) => {
    const path = `templates/${name}.json`;
    expect(existsSync(path), `${path} missing (one-time conversion, ADR-0022)`).toBe(true);
    const validated = validateDocModel(JSON.parse(readFileSync(path, "utf8")));
    expect(validated.ok).toBe(true);
  });

  it("library scan indexes *.json documents", () => {
    const src = readFileSync("src/library/index-builder.ts", "utf8");
    expect(src).toMatch(/\.json/);
  });

  it("M7/M8 integration harnesses load JSON fixtures", () => {
    for (const file of [
      "tests/integration/m7-spike-harness.ts",
      "tests/integration/m8-harness.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} must not load .yaml fixtures`).not.toMatch(/\.ya?ml/);
    }
  });
});
