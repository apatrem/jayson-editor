# ADR-0022 — JSON DocModel supersedes YAML as the canonical on-disk format

**Status:** Accepted (design session 2026-06-07; ADR renumbered from 0020 to resolve collision with [ADR-0020](0020-local-ui-settings-outside-docmodel.md))
**Supersedes:** **D-18** ("YAML is the canonical on-disk format")
**Related:** memo §2 (DocModel is canonical), [ADR-0021](0021-multi-pass-generation-pipeline.md),
[GENERATION_PIPELINE.md](../GENERATION_PIPELINE.md)

## Context

**The DocModel is the canonical *model*; the on-disk file is a *projection* of
it — not the source of truth.** The code is decisive: `src/editor/file-open.ts`
does `DocModelSchema.parse(parseDocModelYaml(raw))`, and `src/docmodel/serialize.ts`
does `serializeDocModel(doc)` → `canonicalize(doc)` → `stringify(...)`. D-18's
phrase "canonical on-disk format" overloaded *canonical* to mean *the one standard
disk encoding*, not *source of truth*. So this is a **projection-format change,
not a model change** — the canonical DocModel and the byte-stability engine
(`canonicalize()`) are untouched.

D-18 chose YAML as the canonical on-disk format for three reasons: human-readable
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

The **canonical on-disk format is JSON**, serializing the canonical DocModel.
Mechanically this is a near-identity change to one layer: `serialize.ts` swaps the
`yaml` package's `stringify`/`parse` for `JSON.stringify`/`JSON.parse`, while
`canonicalize()` — the format-neutral byte-stability engine — stays exactly as is.

**Scope — the DocModel document only.** D-18's wording was "each *doc* is a YAML
file", so this change applies only to the **DocModel document** (`*.yaml` →
`*.json`) and its read/write path. It does **not** touch the other YAML in the
repo: `config.yaml` (install/runtime config), `brand*.yaml` (brand tokens,
human-reviewed per D-16), and `blocks.catalogue.yaml` (developer spec). Those are
human-authored/reviewed config where comments and hand-editability remain assets
and none of the anti-YAML arguments apply — they stay YAML.

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

- **Hard cut, no backward compatibility:** the project is pre-release with no
  `.yaml` documents in the wild, so the YAML read/write paths for documents are
  **deleted**, not dual-supported — no legacy parser, no open-time converter.
  Repo-controlled fixtures (`examples/`, `templates/`) are converted once.
- **The `yaml` dependency is retained** — `config.yaml`, `brand*.yaml`, and
  `blocks.catalogue.yaml` keep using it. The change drops YAML *from the DocModel
  projection*, not from the repo.
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
