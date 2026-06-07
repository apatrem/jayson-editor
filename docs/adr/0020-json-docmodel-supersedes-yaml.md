# ADR-0020 — On-disk projection format: JSON, not YAML

<!-- Filename retained from the initial draft while this ADR is Proposed; the
H1 above is the corrected title. Rename to 0020-on-disk-projection-format.md
when the ADR is Accepted. -->

**Status:** Proposed (design session 2026-06-07)
**Amends:** **D-18** (corrects its overloaded "canonical on-disk format" wording — see Context)
**Related:** memo §2 (DocModel is canonical), [ADR-0021](0021-multi-pass-generation-pipeline.md),
[GENERATION_PIPELINE.md](../GENERATION_PIPELINE.md)

## Context

**The DocModel is the canonical model; the on-disk file is a Projection of it** —
not the source of truth. The code is decisive: `file-open.ts` does
`DocModelSchema.parse(parseDocModelYaml(raw))` (YAML → Zod → DocModel) and
`file-save.ts` does `serializeDocModel(doc)` (DocModel → YAML). Memo §2 and
CONTEXT.md agree. D-18's phrase "canonical on-disk format" used *canonical* to
mean *the one standard disk encoding*, not source-of-truth — a wording collision
this ADR corrects. So this is a **projection-format change, not a model change.**

D-18 chose YAML for that on-disk projection for three reasons: human-readable
cloud-sync diffs, emergency hand-editability, and native LLM reading. Two of those
three premises no longer hold under the converging design:

- The document is **never hand-authored in the source format** — consultants edit
  in the WYSIWYG surface (R4); the file is machine-written from the canonical
  DocModel.
- A single unified file is **not required** — chart specs are inline JSON; only
  bulk data (CSV) and binaries live in separate files.

The remaining premise (LLM access) is better served by JSON, and the new
generation pipeline (ADR-0021) explicitly **optimizes for LLM generation**.

Markdown/Markdoc/MDX were evaluated as the *container* format and rejected:

- Markdoc has **no schema-constrained generation path** (no provider can emit
  grammar-constrained Markdoc), so it optimizes LLM *readability* at the cost of
  generation *reliability* and structural enforcement (R6). Used as a container it
  would put document structure at the mercy of a free-text parser.
- The prose-authoring advantage of markdown is captured *without* adopting it as
  the container: prose lives as `prosemirror-fragment` leaves, generated in a
  separate free-markdown writing pass (ADR-0021) and wrapped, not regenerated.

## Decision

The **on-disk Projection serializes as JSON instead of YAML.** The canonical
DocModel and `canonicalize()` (the format-neutral byte-stability engine) are
unchanged — `serialize.ts` swaps `yaml.stringify` for `JSON.stringify(canonical,
null, 2)` and `yaml.parse` for `JSON.parse`. The on-disk JSON is the canonicalized
DocModel serialized directly (a near-identity projection).

- Chart/table/KPI **specs are inline** in the document JSON (JSON nests arbitrarily;
  the Markdoc "nested-attributes get clunky → external file" workaround does not
  apply).
- **Bulk data tables externalize to CSV**, referenced by id/path, only above a
  small row threshold — because they bloat the LLM context, are a corruption
  surface, and CSV is far more token-efficient for tabular data (aligns with R8:
  static snapshots typed/pasted from Excel).
- **Binary assets** (images, logos) remain external as today.
- Markdown remains a **transient projection** for LLM prose work (GENERATION_PIPELINE
  §1), never a persisted second source of truth.

JSON is chosen over YAML for a machine-only, LLM-optimized format because:
generation is reliable under native structured-output / JSON-schema-constrained
decoding; there is no indentation-sensitivity hazard; and it is editor-native and
ECharts-native in memory (already true under D-18, which kept JSON in-memory).

## Consequences

- **Migration inventory required:** `YAML_FORMAT.md` (byte-stable serialization
  rules), `examples/*.yaml`, `templates/*.yaml`, `AUTHORING.md`, the
  DocModel↔editor mapping, and any IPC that reads/writes the on-disk file. The
  losslessness invariant in `reference/mapping/` carries over unchanged (it is
  about DocModel↔editor, not the file syntax).
- **Byte-stable round-trips remain a requirement** — re-target the existing
  guarantee from YAML to a deterministic JSON serializer (canonical key order,
  stable formatting).
- The on-disk-vs-in-memory distinction in D-18 collapses: JSON is now both.
- Open question deferred: whether a thin human-readable view is still wanted for
  cloud-sync diffs; if so it is a *read-only projection*, not an editable source.

## Notes

This ADR records only the format decision. The generation pipeline that depends on
it is ADR-0021 and GENERATION_PIPELINE.md.
