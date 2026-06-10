import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ─── FROZEN ACCEPTANCE TESTS · T-202 spec sweep (plan/phase12-coarse) ───────
// Committed red on purpose: they freeze the ADR-0022 documentation sweep
// (absorbs T-187). Dual-review punch-list #6: the sweep recurses all of docs/
// and uses phrasings that actually occur, so it is RED today (AGENTS.md still
// routes authoring through "DocModel YAML") instead of vacuously green.
// Allowlisted files carry historical/superseded context only; docs/adr/ is
// historical by definition. Do not edit these tests to make a gate pass.

function decisionSection(text: string, heading: string): string {
  const start = text.indexOf(heading);
  expect(start, `${heading} not found in docs/DECISIONS.md`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n### /);
  return next === -1 ? rest : rest.slice(0, next);
}

function walkDocs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "adr") continue; // ADRs are historical records
      out.push(...walkDocs(path));
    } else if (entry.name.endsWith(".md")) {
      out.push(path);
    }
  }
  return out;
}

const LIVE_CLAIM = /YAML is the canonical|canonical on-disk format is YAML|persists the YAML|DocModel YAML/i;

const ALLOWLIST = new Set([
  join("docs", "DECISIONS.md"), // D-18 historical text (D-05 has its own case below)
  join("docs", "TASKS.md"), // historical task wording
  join("docs", "TASKS_ARCHIVE.md"), // archived completed-task bodies
  join("docs", "YAML_FORMAT.md"), // superseded banner kept for history (T-201/JSON_FORMAT.md)
  join("docs", "JSON_MIGRATION_INVENTORY.md"),
]);

describe("T-202 · no live spec claims YAML is the canonical DocModel format", () => {
  it("D-05 reflects JSON autosave (ADR-0022 sweep)", () => {
    const decisions = readFileSync("docs/DECISIONS.md", "utf8");
    const d05 = decisionSection(decisions, "### D-05");
    expect(d05).toMatch(/JSON/);
    expect(d05).not.toMatch(/persists the YAML/);
  });

  it("no doc outside historical context carries a live YAML-canonical claim", () => {
    const targets = [
      ...walkDocs("docs").filter((f) => !ALLOWLIST.has(f)),
      "AUTHORING.md",
      "AGENTS.md",
    ];
    const offenders: string[] = [];
    for (const file of targets) {
      if (LIVE_CLAIM.test(readFileSync(file, "utf8"))) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
