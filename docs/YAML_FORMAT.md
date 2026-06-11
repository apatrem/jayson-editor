# YAML Serialization Format — Byte-Stable Rules

> **Superseded for DocModel document files:** ADR-0022 replaces YAML document
> files with deterministic JSON Document files. This file is retained as
> historical implementation context until the clean-break task replaces it with
> JSON document-file serialization rules and renames DocModel helpers/tests away
> from YAML terminology. Non-document YAML artifacts such as `brand.yaml`,
> `config.yaml`, and `blocks.catalogue.yaml` may remain YAML.

**Purpose:** specify the exact YAML formatter configuration so DocModel ⇄ YAML round-trips are byte-stable (acceptance criterion T-40, decision D-05/D-18).

**Audience:** the developer implementing `src/docmodel/serialize.ts`.

**Companion to:** `TYPES.md`, `docs/archive/TASKS.md` (T-40).

---

## Why this matters

A "lossless round-trip" is more than "the parsed objects match." It also means **the YAML text on disk is stable across save cycles** — otherwise, every save shows up as a diff in the user's cloud-storage history, swamping real changes. With 5–10 LLM cycles per doc and autosave running on top, byte instability would make the history view useless.

The `yaml` npm package (v2.x) gives us full control of formatting. This document pins the choices.

---

## The exact config

```typescript
// src/docmodel/yaml-config.ts
import { Document, parseDocument, stringify, type ToStringOptions, type ParseOptions } from "yaml";

/**
 * The single source of truth for YAML serialization options.
 * Used by BOTH src/docmodel/serialize.ts (load + save) AND
 * src/docmodel/canonicalize.ts (the canonicalizer for round-trip tests).
 */
export const YAML_STRINGIFY_OPTIONS: ToStringOptions = {
  indent: 2,                        // 2-space indentation
  indentSeq: true,                  // sequence items indented relative to parent
  lineWidth: 100,                   // wrap long scalars at column 100 (0 disables wrapping; we want wrap)
  minContentWidth: 20,              // don't wrap if remaining space < 20 chars
  doubleQuotedAsJSON: false,        // keep YAML-native quoting, not JSON
  doubleQuotedMinMultiLineLength: 80,
  singleQuote: false,               // prefer double quotes for strings that need quoting
  defaultStringType: "PLAIN",       // unquoted strings when safe
  defaultKeyType: "PLAIN",          // unquoted keys
  blockQuote: "literal",            // multi-line strings as | literal blocks
  trueStr: "true",
  falseStr: "false",
  nullStr: "null",                  // explicit null, never empty
  collectionStyle: "block",         // "key:\n  value:" not "key: { value: ... }"
  flowCollectionPadding: false,     // [a, b, c] not [ a, b, c ]
  simpleKeys: true,                 // no complex keys (we don't have any anyway)
  directives: false,                // no `%YAML 1.2` header
  sortMapEntries: false,            // PRESERVE key order from the source (critical — see below)
};

export const YAML_PARSE_OPTIONS: ParseOptions = {
  prettyErrors: true,
  strict: true,                     // reject duplicate keys, unknown types
  uniqueKeys: true,
};
```

---

## Key-order policy: STABLE, not SORTED

`sortMapEntries: false` is **deliberate**. Sorting keys would technically achieve byte-stability, but:

1. It would reorder the YAML the human authored or the LLM produced. The doc would look "shuffled" from the consultant's perspective.
2. It would make AI-generated outputs harder to diff against expected templates (the LLM emits keys in semantic order; sorted output would mask intent).

Instead, we preserve key order by always going **through the same code path** for save:

```typescript
// src/docmodel/serialize.ts
import { DocModel } from "@schema/docmodel";
import { stringify } from "yaml";
import { YAML_STRINGIFY_OPTIONS } from "./yaml-config";

/**
 * Serialize a DocModel to YAML.
 *
 * IMPORTANT: the input object's key order is preserved. To get byte-stable
 * round-trips, the caller must construct the object with keys in the
 * canonical order (enforced by `canonicalize(doc)` — see below).
 */
export function serializeDocModel(doc: DocModel): string {
  const canonical = canonicalize(doc);
  return stringify(canonical, YAML_STRINGIFY_OPTIONS);
}
```

---

## The canonicalizer

`canonicalize(doc)` re-emits the object with keys in a known order. This is what makes the round-trip stable: parse → canonicalize → stringify produces the same bytes for the same logical doc, regardless of the source's key order.

```typescript
// src/docmodel/canonicalize.ts

/**
 * The canonical key order for each shape. Add a new shape here when adding
 * a new schema (e.g. a new block type). Keys not listed are appended at the
 * end in insertion order — which means the schema's TypeScript declaration
 * order indirectly controls the YAML output for unlisted fields.
 *
 * Rule of thumb: put the most-meaningful field FIRST so a quick scan of the
 * YAML tells you what you're looking at.
 */
const KEY_ORDERS: Record<string, string[]> = {
  // Top-level
  DocModel: ["kind", "schemaVersion", "meta", "sections", "slides", "comments"],

  // Meta (TYPES.md §2)
  Meta: [
    "client", "project", "docKind",
    "sector", "tags", "language",
    "status", "archived", "confidentialityLevel",
    "owner", "reviewers",
    "createdAt", "updatedAt",
    "brandRef",
  ],

  // Containers
  Section: ["id", "title", "blocks"],
  Slide: ["id", "layout", "blocks", "notes"],

  // Blocks — base order, then per-block fields appended
  BlockBase: ["id", "type"],
  // ── Per-block specific orderings ─────────────────────────────────────
  prose: ["id", "type", "content", "align", "note"],
  heading: ["id", "type", "level", "text", "numbered", "note"],
  "bullet-list": ["id", "type", "items", "note"],
  "numbered-list": ["id", "type", "items", "startAt", "note"],
  callout: ["id", "type", "variant", "title", "body", "attribution", "note"],
  "kpi-cards": ["id", "type", "cards", "note"],
  chart: ["id", "type", "chartType", "title", "takeaway", "data", "axes",
          "palette", "showLegend", "showDataLabels", "note"],
  table: ["id", "type", "columns", "rows", "caption", "note"],
  timeline: ["id", "type", "orientation", "connector", "phases", "note"],
  roadmap: ["id", "type", "timeUnit", "startDate", "endDate",
            "workstreams", "milestones", "note"],
  "risk-matrix": ["id", "type", "gridSize", "xAxisLabel", "yAxisLabel",
                  "risks", "note"],
  team: ["id", "type", "layout", "members", "note"],
  image: ["id", "type", "src", "alt", "caption", "width", "align", "note"],
  diagram: ["id", "type", "source", "title", "caption", "width", "note"],
  divider: ["id", "type", "label", "subtitle", "numbering", "note"],

  // Comments (TYPES.md §5)
  Comment: ["id", "blockId", "range", "quotedText", "status",
            "thread", "createdAt", "updatedAt"],
  ThreadEntry_instruction: ["kind", "author", "authorEmail", "authorRole",
                            "text", "createdAt"],
  ThreadEntry_aiProposal: ["kind", "patch", "createdAt"],
  ThreadEntry_followUp: ["kind", "author", "authorEmail", "text", "createdAt"],
};

/**
 * Re-emit an object with keys in canonical order. Unknown keys are appended
 * in source insertion order (preserves data, never silently drops).
 */
export function canonicalize<T>(value: T): T {
  return canonicalizeValue(value, "DocModel") as T;
}

function canonicalizeValue(value: unknown, shapeName: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const childShape = inferShapeForArrayItem(shapeName, item);
      return canonicalizeValue(item, childShape);
    });
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const order = KEY_ORDERS[shapeName] ?? [];
    const orderedKeys = [
      ...order.filter((k) => k in obj),
      ...Object.keys(obj).filter((k) => !order.includes(k)),
    ];
    const out: Record<string, unknown> = {};
    for (const k of orderedKeys) {
      out[k] = canonicalizeValue(obj[k], childShapeFor(shapeName, k, obj[k]));
    }
    return out;
  }
  return value;                          // primitive
}

// Dispatch helpers — keep these explicit. Easier to debug than reflection.
function childShapeFor(parentShape: string, key: string, value: unknown): string {
  // Examples (extend as the schema grows):
  if (parentShape === "DocModel" && key === "meta") return "Meta";
  if (parentShape === "DocModel" && (key === "sections")) return "_arrayOfSection";
  if (parentShape === "DocModel" && (key === "slides")) return "_arrayOfSlide";
  if (parentShape === "DocModel" && key === "comments") return "_arrayOfComment";
  if (parentShape === "Section" && key === "blocks") return "_arrayOfBlock";
  if (parentShape === "Slide" && key === "blocks") return "_arrayOfBlock";
  if (parentShape === "Comment" && key === "thread") return "_arrayOfThreadEntry";
  return "_unknown";
}

function inferShapeForArrayItem(parentArrayShape: string, item: unknown): string {
  if (parentArrayShape === "_arrayOfSection") return "Section";
  if (parentArrayShape === "_arrayOfSlide") return "Slide";
  if (parentArrayShape === "_arrayOfComment") return "Comment";
  if (parentArrayShape === "_arrayOfBlock") {
    // Discriminate by `.type`.
    const t = (item as { type?: string })?.type ?? "";
    return KEY_ORDERS[t] ? t : "BlockBase";
  }
  if (parentArrayShape === "_arrayOfThreadEntry") {
    const k = (item as { kind?: string })?.kind ?? "";
    if (k === "instruction") return "ThreadEntry_instruction";
    if (k === "ai-proposal") return "ThreadEntry_aiProposal";
    if (k === "follow-up") return "ThreadEntry_followUp";
    return "_unknown";
  }
  return "_unknown";
}
```

---

## What this guarantees (and what it doesn't)

### Guarantees

- **Save → load → save produces identical bytes.** The canonicalizer normalizes order; the stringifier is deterministic given the options above.
- **LLM-generated YAML is normalized on first save.** When an AI produces a doc with keys in a weird order, the first save (via `serializeDocModel`) rewrites it canonically. Subsequent saves are stable.
- **Diff readability stays high.** Field order is meaningful — `id` and `type` always come first; semantic fields follow.

### Does NOT guarantee

- **Comments inside YAML files are not preserved.** The `yaml` library has comment-preservation APIs but they're fragile across edit-cycles. We strip comments on parse → don't emit them on stringify. (The DocModel's `note` field stores per-block consultant notes — that's the supported channel.)
- **Floating-point byte-stability across machines.** If a block stores a float (e.g. chart data), the YAML representation can vary minutely between platforms. Mitigation: chart numbers are stored as either integers or strings (`"42.5"`) per the chart schema. No raw floats in the DocModel.
- **Unicode normalization.** We don't NFC-normalize strings. If two strings are visually identical but use different code-point sequences, they round-trip as-is. Acceptable in practice; mention in T-40's test.

---

## Required tests (T-40 acceptance)

```typescript
// tests/yaml-roundtrip.test.ts
import { parse } from "yaml";
import * as fs from "node:fs";
import { serializeDocModel } from "@docmodel/serialize";
import { validateDocModel } from "@schema/validate";

describe("YAML round-trip is byte-stable and lossless", () => {
  const fixtures = [
    "examples/sample-proposal.yaml",
    "examples/sample-deck.yaml",
  ];

  test.each(fixtures)("%s round-trips byte-stably", (path) => {
    const original = fs.readFileSync(path, "utf8");
    const parsedOnce = parse(original);
    const validated = validateDocModel(parsedOnce);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const reemitted = serializeDocModel(validated.doc);
    // First pass: the doc parses cleanly.
    expect(validateDocModel(parse(reemitted)).ok).toBe(true);

    // Second pass: re-emit again. THIS pass must be byte-identical to the first.
    // (The first pass may differ from the on-disk source — the canonicalizer
    // may have reordered keys to canonical order. From that point on, output
    // is stable.)
    const reemittedAgain = serializeDocModel(validateDocModel(parse(reemitted)).doc!);
    expect(reemittedAgain).toBe(reemitted);
  });
});
```

The key insight: **first save may differ from the source bytes**, but **second and all subsequent saves are identical**. This is what we mean by "byte-stable round-trip."

If the test fails for a particular fixture, the failure points at the smallest reproducer — usually a field whose canonical order is missing from `KEY_ORDERS` (the new block type, the new schema addition). Add the entry, re-run.

---

## When extending the schema

Any new schema addition (new block type, new comment-thread variant, new top-level field) **MUST** add a corresponding entry to `KEY_ORDERS` in the same PR. The round-trip test catches missed entries — it will fail with a specific path showing where the canonicalization couldn't apply.

This is part of the M1 acceptance for adding blocks (`BLOCK_IMPLEMENTATION_GUIDE.md §2`). Update the guide if this becomes a frequent issue.

---

## Open question (deferred)

**Should we preserve comments in YAML files?** Some consultants may want to leave inline `# TODO: confirm with Marie` notes in the YAML. The `note` field handles the per-block case structurally. If we get feedback that consultants want file-level / between-blocks comments preserved, revisit using `yaml`'s `Document` AST API (slower, more code, but possible). Leave as a v1.1+ enhancement.
