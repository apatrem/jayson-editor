import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDocModel } from "../../src/schema/validate";

// ─── FROZEN ACCEPTANCE TESTS · T-202 (plan/phase12-coarse) ──────────────────
// Committed red on purpose: they freeze the ADR-0022 app-surface contract
// (editor, menu, views, templates, library) before implementation. Do not edit
// them to make a gate pass.
// Dual-review punch-list #4: document flows outside src/editor/* also invoke
// YAML document IO today (DocumentView, Routes, main, library views) — the
// suite pins ALL of them plus a repo-wide parseDocModelYaml ban (ADR-0022 is a
// hard cut: the YAML document parser is deleted, not dual-supported).
// Non-document YAML (config/brand/catalogue, authored-block manifests) is NOT
// covered by these assertions and stays YAML.

const DOCUMENT_FLOW_FILES = [
  "src/editor/file-open.ts",
  "src/editor/file-save.ts",
  "src/editor/autosave.ts",
  "src/ui/views/DocumentView.tsx",
  "src/ui/router/Routes.tsx",
  "src/main.tsx",
  "src/ui/library/LibraryView.tsx",
  "src/ui/library/CreateFromTemplateModal.tsx",
];

function walkSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSources(path));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(path);
  }
  return out;
}

describe("T-202 · editor document path runs on JSON", () => {
  it("file-open parses JSON and no longer discovers .yaml documents", () => {
    const src = readFileSync("src/editor/file-open.ts", "utf8");
    expect(src).toContain("parseDocModelJson");
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

  it("no document flow invokes YAML document IO", () => {
    const offenders: string[] = [];
    for (const file of DOCUMENT_FLOW_FILES) {
      const src = readFileSync(file, "utf8");
      if (/parseDocModelYaml|read_yaml_file|write_yaml_file/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("parseDocModelYaml is deleted repo-wide (hard cut, ADR-0022)", () => {
    const offenders = walkSources("src").filter((file) =>
      readFileSync(file, "utf8").includes("parseDocModelYaml"),
    );
    expect(offenders).toEqual([]);
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
