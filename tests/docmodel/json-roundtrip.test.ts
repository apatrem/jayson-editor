import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  KEY_ORDERS,
  resolveArrayItemShape,
  resolveChildShape,
} from "../../src/docmodel/canonicalize";
import { loadAllSchemas } from "../../src/blocks/schema-registry";
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

function zodObjectKeys(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodEffects) {
    return zodObjectKeys(schema._def.schema as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape as Record<string, unknown>);
  }
  return [];
}

function assertKeyOrderCoverage(
  shape: string,
  value: unknown,
  where: string,
  violations: string[],
): void {
  if (value === null || value === undefined || typeof value !== "object") return;
  if (Array.isArray(value)) return;

  const order = KEY_ORDERS[shape];
  if (!order) {
    violations.push(`${where}: no KEY_ORDERS entry for shape "${shape}"`);
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!order.includes(key)) {
      violations.push(
        `${where}: field "${key}" missing from KEY_ORDERS["${shape}"] — ` +
          "it would serialize in insertion order and break byte-stability (ADR-0022)",
      );
    }
    const child = obj[key];
    const childShape = resolveChildShape(shape, key, child);
    if (childShape.startsWith("_arrayOf") && Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        const itemShape = resolveArrayItemShape(childShape, child[i]);
        if (itemShape !== "_unknown") {
          assertKeyOrderCoverage(
            itemShape,
            child[i],
            `${where}.${key}[${i}]`,
            violations,
          );
        }
      }
    } else if (childShape !== "_unknown" && !childShape.startsWith("_arrayOf")) {
      assertKeyOrderCoverage(childShape, child, `${where}.${key}`, violations);
    }
  }
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

      assertKeyOrderCoverage("DocModel", doc, name, violations);
      if (doc.meta !== undefined) {
        assertKeyOrderCoverage("Meta", doc.meta, `${name} meta`, violations);
      }

      const containers: Array<[string, unknown]> = [
        ["Section", doc.sections],
        ["Slide", doc.slides],
      ];
      for (const [shape, list] of containers) {
        if (!Array.isArray(list)) continue;
        for (const container of list as Array<Record<string, unknown>>) {
          const containerId = String(container.id ?? "?");
          assertKeyOrderCoverage(shape, container, `${name} ${shape} ${containerId}`, violations);
          const blocks = container.blocks;
          if (!Array.isArray(blocks)) continue;
          for (const block of blocks as Array<Record<string, unknown>>) {
            const type = String(block.type ?? "?");
            if (type.includes(":")) continue;
            assertKeyOrderCoverage(
              type,
              block,
              `${name} block ${String(block.id ?? "?")} (${type})`,
              violations,
            );
          }
        }
      }

      if (Array.isArray(doc.comments)) {
        for (const comment of doc.comments as Array<Record<string, unknown>>) {
          assertKeyOrderCoverage(
            "Comment",
            comment,
            `${name} comment ${String(comment.id ?? "?")}`,
            violations,
          );
        }
      }

      expect(violations).toEqual([]);
    },
  );

  it("every Standard block schema key is registered in KEY_ORDERS", () => {
    const violations: string[] = [];
    for (const entry of loadAllSchemas()) {
      const keys = zodObjectKeys(entry.schema);
      const order = KEY_ORDERS[entry.schemaName];
      for (const key of keys) {
        if (!order?.includes(key)) {
          violations.push(
            `${entry.schemaName}: schema field "${key}" missing from KEY_ORDERS`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("docs/JSON_FORMAT.md documents the deterministic serialization contract", () => {
    const path = join(repoRoot, "docs/JSON_FORMAT.md");
    expect(existsSync(path), "docs/JSON_FORMAT.md missing (T-201 output)").toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toMatch(/KEY_ORDERS|key order/i);
    expect(text).toMatch(/byte-stab/i);
  });
});
