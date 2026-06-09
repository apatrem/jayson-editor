import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─── FROZEN ACCEPTANCE TESTS · T-202 spec sweep (plan/phase12-coarse) ───────
// Committed red on purpose: they freeze the ADR-0022 documentation sweep
// (absorbs T-187). Allowlisted files carry historical/superseded context only.
// Do not edit them to make a gate pass.

function decisionSection(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect(start, `${heading} not found in docs/DECISIONS.md`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n### /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("T-202 · no live spec claims YAML is the canonical DocModel format", () => {
  it("D-05 reflects JSON autosave (ADR-0022 sweep)", () => {
    const decisions = readFileSync("docs/DECISIONS.md", "utf8");
    const d05 = decisionSection(decisions, "### D-05");
    expect(d05).toMatch(/JSON/);
    expect(d05).not.toMatch(/persists the YAML/);
  });

  it("no doc outside historical context claims a canonical YAML format", () => {
    const allowlist = new Set([
      "DECISIONS.md", // D-18 historical text, amended in place
      "TASKS.md", // historical task wording
      "YAML_FORMAT.md", // superseded banner kept for history (T-201/JSON_FORMAT.md)
      "JSON_MIGRATION_INVENTORY.md",
    ]);
    const docFiles = readdirSync("docs")
      .filter((f) => f.endsWith(".md") && !allowlist.has(f))
      .map((f) => join("docs", f));
    const offenders: string[] = [];
    for (const file of [...docFiles, "AUTHORING.md", "AGENTS.md"]) {
      const text = readFileSync(file, "utf8");
      if (/YAML is the canonical|canonical on-disk format is YAML/i.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
