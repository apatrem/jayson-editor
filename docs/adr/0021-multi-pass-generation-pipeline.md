# ADR-0021 — Multi-pass generation pipeline (writing → structuring → data)

**Status:** Accepted (design session 2026-06-07)
**Refines:** **D-15** ("initial doc generation is a Claude Code skill … outputs a
DocModel")
**Related:** [ADR-0022](0022-json-docmodel-supersedes-yaml.md), D-13 (patch-based
editing), R7 (outline-first), R8 (static data), [GENERATION_PIPELINE.md](../GENERATION_PIPELINE.md)
(full design)

## Context

D-15 said initial generation is a Claude Code skill that asks structured questions
and outputs a DocModel, but left the internals open. We need extremely-high-quality
prose for large deliverables (decks, long reports) *and* output that conforms to
the closed, schema-validated block catalogue. These two goals pull in opposite
directions: making an LLM emit content *inside* a rigid structure degrades the
content (the "structured-output tax" — format-switching + escaping), while
free-form prose has no structural guarantees.

This is **cold-start generation only** — a separate machine from the patch-based
editing flow (D-13), decoupled through the canonical DocModel file.

## Decision

Separate **writing** from **structuring**, so prose is generated in the model's
strongest modality and only *wrapped* (not regenerated) into the DocModel:

1. **Pass 0 — Outline.** A *rich* outline is the coherence backbone: per-section
   key message, owned claims, cross-refs, glossary + claims-ledger. Slide-granular
   for decks. (R7.)
2. **Pass 1 — Writing (fan-out).** Sections expand in parallel, anchored on the
   cached outline/glossary/ledger; **sequential mode is user-toggleable**. Derived
   sections (exec summary, conclusions) generate in a second wave from real body
   prose. Decks write to a per-slide **capacity budget**.
3. **Pass 1.5 — Coherence.** Deterministic glossary lint always; LLM stitch for
   reports only.
4. **Pass 2 — Structuring.** Markdown → canonical JSON DocModel.
   **Deterministic-first**; the LLM is scoped to two judgments — placeholder
   resolution and promotion (per the catalogue `avoid:` rules). Prose →
   `prosemirror-fragment` is a deterministic, schema-aware conversion. This pass is
   the **trust boundary** for externally-refined markdown.
5. **Pass 2.5 — Layout (decks only).** LLM proposes a layout from the closed
   template library (D-30); a **deterministic fit-check is the authority**.
   Content adaptation happens in the writer (capacity budget), never silently in
   structuring; overflow auto-splits + flags.
6. **Pass 3 — Data (conditional).** Option C: shape-correct **illustrative**
   numbers, watermarked, `dataState ∈ {empty, draft-illustrative, confirmed}`. The
   LLM **never authors a citation** for external data — `source` is human-only
   (LLM fills it only for *grounded*, uploaded data); `sourceHint` is a separate
   advisory "where to look". Verification gated on a real source present (R8).

**Round-trip is a phase-gate with scoped regeneration**, not bidirectional sync
(ADR-0022 / GENERATION_PIPELINE §1): JSON is always canonical; markdown is a
transient, deterministically-derived projection (`toPlaceholder` derives from
current block fields — **never** a stored description).

**Readiness gate** — advisory blockers + export summary popup (not export lock); fail-loud halts (no silent degradation, per D-236). The pipeline's contract is *valid-draft-with-flags*, not guaranteed-shippable.

**Host:** V1 runs Pass 0–1 as a Claude Code skill (outline + per-section
sub-agents); the pipeline is host-agnostic and in-app integration is deferred.

## Consequences

- **Schema additions** to reconcile with `TYPES.md`: `dataState`, `source`,
  `sourceHint`, `verifiedBy/At`, `sourceIntent`, degraded/overflow flags, the
  placeholder grammar, slide-template capacity metadata.
- **New deterministic components:** schema-aware markdown↔ProseMirror converter,
  `toPlaceholder` per block type, the layout fit-check engine, the import-time
  contract lint, the readiness-gate model.
- **Scale:** large decks exceed the D-35 envelope — gate the v1 ceiling on a D-39
  perf re-validation; prefer splitting into linked documents; deck render
  virtualization is the fallback (helps editor, not export).
- Keeps deck support inside R5 / R9 / memo §10 (no free-form deck editor).

## Notes

Full design, rationale, and the resolved decision tree (Q1–Q9) live in
[GENERATION_PIPELINE.md](../GENERATION_PIPELINE.md).
