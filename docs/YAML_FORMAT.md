# JSON Serialization Format — Byte-Stable Rules

<!-- Filename retained from before the YAML→JSON migration while ADR-0020 is
Proposed. Rename to JSON_FORMAT.md and sweep the 8 references (AGENTS.md,
README.md, docs/TASKS.md, AUTHORING.md, ADR-0020, GENERATION_PIPELINE.md) when the
ADR is Accepted / the migration task runs. -->

**Purpose:** specify the exact JSON serialization so DocModel ⇄ on-disk-file
round-trips are byte-stable. Supersedes the YAML formatter config per
[ADR-0020](adr/0020-json-docmodel-supersedes-yaml.md).

**Audience:** the developer implementing `src/docmodel/serialize.ts`.

**Companion to:** `TYPES.md`, `docs/TASKS.md`.

---

## Why this matters

A "lossless round-trip" is more than "the parsed objects match." It also means
**the text on disk is stable across save cycles** — otherwise every save shows up
as a diff in the consultant's cloud-storage history, swamping real changes. With
5–10 LLM cycles per doc and autosave (D-05) on top, byte instability would make
the history view useless.

---

## The exact config

JSON has almost no formatting knobs — which is the point. The whole serializer is:

```typescript
// src/docmodel/serialize.ts
import { canonicalize } from "./canonicalize";
import type { DocModel } from "../schema/docmodel";

export function serializeDocModel(doc: DocModel): string {
  return JSON.stringify(canonicalize(doc), null, 2) + "\n";
}

export function parseDocModel(source: string): unknown {
  return JSON.parse(source);
}
```

- `canonicalize(doc)` (unchanged, format-neutral) imposes `KEY_ORDERS` and strips
  `undefined`. It is the byte-stability engine and it does not know about the
  serialization format — so it carries over from the YAML implementation verbatim.
- `JSON.stringify(…, null, 2)` — 2-space indent; deterministic given key order.
- Trailing `\n` for POSIX-clean diffs.
- There is **no** quoting / line-width / anchor / comment configuration to pin
  (unlike YAML). The `yaml` dependency is no longer used for the DocModel
  projection — it remains in use for `config.yaml` / `brand*.yaml` /
  `blocks.catalogue.yaml` (see [ADR-0020](adr/0020-json-docmodel-supersedes-yaml.md)
  scope).

---

## Key-order policy: STABLE, not SORTED

`canonicalize.ts` preserves a deliberate semantic key order (via `KEY_ORDERS`)
rather than sorting alphabetically. Sorting would technically achieve stability
but would shuffle the order a human or the LLM produced and make AI output harder
to diff against templates. We get stability instead by always serializing through
`canonicalize()`, which re-emits keys in the known order; unlisted keys are
appended in insertion order (data is preserved, never dropped). See
`src/docmodel/canonicalize.ts` for the `KEY_ORDERS` table — it is reused unchanged
across this migration.

---

## What this guarantees (and what it doesn't)

### Guarantees
- **Save → load → save produces identical bytes** — `canonicalize` normalizes
  order; `JSON.stringify` is deterministic given that order.
- **LLM-generated JSON is normalized on first save** — an AI doc with keys in a
  weird order is rewritten canonically on first `serializeDocModel`; subsequent
  saves are stable.
- **Diff readability stays high** — `id`/`type` first, semantic fields follow.

### Does NOT guarantee
- **Floating-point byte-stability across machines.** Chart numbers are stored as
  integers or strings (`"42.5"`) per the chart schema — no raw floats in the
  DocModel — so this does not bite in practice.
- **Unicode normalization.** Strings round-trip as-is (no NFC normalization).
- (The YAML "inline comments aren't preserved" caveat is moot — JSON has no
  comments. The per-block `note` field remains the supported channel for
  consultant notes.)

---

## Required test (byte-stable round-trip)

```typescript
// tests/json-roundtrip.test.ts  (adapts the prior YAML round-trip test)
import * as fs from "node:fs";
import { serializeDocModel, parseDocModel } from "@docmodel/serialize";
import { validateDocModel } from "@schema/validate";

describe("JSON round-trip is byte-stable and lossless", () => {
  const fixtures = ["examples/sample-proposal.json", "examples/sample-deck.json"];

  test.each(fixtures)("%s round-trips byte-stably", (path) => {
    const original = fs.readFileSync(path, "utf8");
    const validated = validateDocModel(parseDocModel(original));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const reemitted = serializeDocModel(validated.doc);
    const reemittedAgain =
      serializeDocModel(validateDocModel(parseDocModel(reemitted)).doc!);
    expect(reemittedAgain).toBe(reemitted); // second + all later saves identical
  });
});
```

The key insight is unchanged from the YAML era: **the first save may differ from
the source bytes** (canonicalize reorders), but **the second and all subsequent
saves are byte-identical**.

---

## When extending the schema

Any new schema addition (new block type, new field, new comment-thread variant)
**MUST** add a corresponding `KEY_ORDERS` entry in `src/docmodel/canonicalize.ts`
in the same PR — or byte-stability silently breaks for the new field (it would be
appended in insertion order, which is not stable across save paths). ADR-0021's
field additions (`dataState`, `source`, `sourceHint`, `verifiedBy/At`,
`sourceIntent`, …) are a concrete batch that must each land in `KEY_ORDERS`. The
round-trip test catches misses — it fails with the path of the unregistered shape.
