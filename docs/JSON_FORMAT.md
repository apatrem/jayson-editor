# JSON Serialization Format — Byte-Stable Rules

> **Successor to `YAML_FORMAT.md` for DocModel document files** (ADR-0022).
> Non-document YAML (`config.yaml`, `brand*.yaml`, `blocks.catalogue.yaml`) is
> unchanged.

**Purpose:** specify the exact JSON formatter configuration so DocModel ⇄ JSON
round-trips are byte-stable.

**Audience:** the developer implementing `src/docmodel/serialize.ts`.

---

## Why this matters

A lossless round-trip requires **identical bytes on disk across save cycles**.
Without deterministic key order and stable whitespace, every autosave shows up
as noise in cloud-sync history.

The format-neutral `canonicalize()` engine in `src/docmodel/canonicalize.ts`
normalizes key order; `JSON.stringify` with pinned options emits stable text.

---

## The exact config

```typescript
// src/docmodel/json-config.ts

/** Two-space indent — matches historical YAML indent depth. */
export const JSON_STRINGIFY_INDENT = 2;

export function stringifyDocModelJson(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_STRINGIFY_INDENT)}\n`;
}
```

Parse entry point:

```typescript
// src/docmodel/serialize.ts
export function parseDocModelJson(source: string): unknown {
  return JSON.parse(source);
}

export function serializeDocModel(doc: DocModel): string {
  const canonical = canonicalize(doc);
  return stringifyDocModelJson(canonical);
}
```

---

## Key-order policy: canonical via `KEY_ORDERS`

Unlike YAML's `sortMapEntries: false`, JSON has no insertion-order preservation
across parsers. **Every closed shape must register all fields in `KEY_ORDERS`.**
Authored blocks (`{sender}:{slug}` types) are exempt — only `id` and `type` are
ordered; dynamic manifest attrs follow in source order (ADR-0016).

The canonicalizer re-emits objects with keys in `KEY_ORDERS` order; unknown keys
append in source insertion order (data is never dropped).

See `src/docmodel/canonicalize.ts` for the full `KEY_ORDERS` table and shape
dispatch helpers.

---

## Byte-stability guarantee

- **Save → load → save produces identical bytes** after the first canonical save.
- **First save may differ from hand-authored source bytes** (key reordering).
  Second and subsequent saves are stable — this is what the round-trip tests assert.
- **Trailing newline:** every document file ends with `\n`.

### Does NOT guarantee

- **Comments** — JSON has none; use block `note` fields.
- **Floating-point cross-platform stability** — chart numbers use integers or
  strings per schema.
- **Unicode normalization** — strings round-trip as-is.

---

## Required tests

- `tests/docmodel/json-roundtrip.test.ts` — byte-stable round-trip on
  `examples/sample-proposal.json` and `examples/sample-deck.json`; every closed
  fixture field registered in `KEY_ORDERS`.

When extending the schema, add `KEY_ORDERS` entries in the same PR. The
round-trip test fails with the path to any unregistered field.
