import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KEY_ORDERS } from "../../src/docmodel/canonicalize";
import { validateDocModel } from "../../src/schema/validate";

// ─── FROZEN ACCEPTANCE TESTS · T-201 (plan/phase12-coarse) ──────────────────
// Committed red on purpose: they freeze the ADR-0022 persistence contract
// before implementation. Do not edit them to make a gate pass (AGENTS.md hard
// guardrails) — the implementation must turn them green.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = ["sample-proposal.json", "sample-deck.json"];

async function loadSerialize(): Promise<{
  parse: (raw: string) => unknown;
  serialize: (doc: unknown) => string;
}> {
  const mod: Record<string, unknown> = await import("../../src/docmodel/serialize");
  const parse = mod.parseDocModelJson;
  const serialize = mod.serializeDocModel;
  expect(
    parse,
    "src/docmodel/serialize.ts must export parseDocModelJson (T-201)",
  ).toBeTypeOf("function");
  expect(
    serialize,
    "src/docmodel/serialize.ts must export serializeDocModel",
  ).toBeTypeOf("function");
  return {
    parse: parse as (raw: string) => unknown,
    serialize: serialize as (doc: unknown) => string,
  };
}

describe("T-201 · JSON DocModel round-trip is byte-stable and lossless", () => {
  it.each(fixtures)("examples/%s exists (one-time conversion, ADR-0022)", (name) => {
    expect(existsSync(join(repoRoot, "examples", name))).toBe(true);
  });

  it.each(fixtures)("%s round-trips byte-stably on second save", async (name) => {
    const { parse, serialize } = await loadSerialize();
    const original = readFileSync(join(repoRoot, "examples", name), "utf8");
    const validated = validateDocModel(parse(original));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const reemitted = serialize(validated.doc);
    const secondPass = validateDocModel(parse(reemitted));
    expect(secondPass.ok).toBe(true);
    if (!secondPass.ok) return;

    expect(serialize(secondPass.doc)).toBe(reemitted);
  });

  it.each(fixtures)(
    "%s: every closed-shape field is registered in KEY_ORDERS (no insertion-order fallback)",
    (name) => {
      const path = join(repoRoot, "examples", name);
      expect(existsSync(path), `${path} missing — convert the YAML fixture first`).toBe(true);
      const doc = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      const violations: string[] = [];

      const check = (shape: string, value: unknown, where: string): void => {
        if (value === null || typeof value !== "object" || Array.isArray(value)) return;
        const order = KEY_ORDERS[shape];
        if (!order) {
          violations.push(`${where}: no KEY_ORDERS entry for shape "${shape}"`);
          return;
        }
        for (const key of Object.keys(value)) {
          if (!order.includes(key)) {
            violations.push(
              `${where}: field "${key}" missing from KEY_ORDERS["${shape}"] — ` +
                "it would serialize in insertion order and break byte-stability (ADR-0022)",
            );
          }
        }
      };

      check("DocModel", doc, name);
      check("Meta", doc.meta, `${name} meta`);

      const containers: Array<[string, unknown]> = [
        ["Section", doc.sections],
        ["Slide", doc.slides],
      ];
      for (const [shape, list] of containers) {
        if (!Array.isArray(list)) continue;
        for (const container of list as Array<Record<string, unknown>>) {
          const containerId = String(container.id ?? "?");
          check(shape, container, `${name} ${shape} ${containerId}`);
          const blocks = container.blocks;
          if (!Array.isArray(blocks)) continue;
          for (const block of blocks as Array<Record<string, unknown>>) {
            const type = String(block.type ?? "?");
            // Authored blocks carry per-manifest dynamic attrs (ADR-0016) —
            // only closed shapes are required to be fully key-ordered.
            if (type.includes(":")) continue;
            check(type, block, `${name} block ${String(block.id ?? "?")} (${type})`);
          }
        }
      }

      expect(violations).toEqual([]);
    },
  );

  it("docs/JSON_FORMAT.md documents the deterministic serialization contract", () => {
    const path = join(repoRoot, "docs/JSON_FORMAT.md");
    expect(existsSync(path), "docs/JSON_FORMAT.md missing (T-201 output)").toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toMatch(/KEY_ORDERS|key order/i);
    expect(text).toMatch(/byte-stab/i);
  });
});
