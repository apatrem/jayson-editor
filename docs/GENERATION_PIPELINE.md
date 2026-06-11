# Generation Pipeline — Design

**Status:** settled (grilling session 2026-06-07 + follow-up); vocabulary in
`CONTEXT.md`. Implementation tracked in `tasks/` (T-201–T-204 from the PR #5 plan, plus T-206–T-207; see ADR-0023).
**Companion to:** `DOCUMENT_SYSTEM_ARCHITECTURE.md`, `DECISIONS.md`,
`blocks.catalogue.yaml`, `TYPES.md`.
**Amends:** **D-18** (canonical on-disk format — see
[ADR-0022](adr/0022-json-docmodel-supersedes-yaml.md)) and **D-15** (initial doc
generation — see [ADR-0021](adr/0021-multi-pass-generation-pipeline.md)).

> This document describes how a brief becomes a first-draft DocModel. It is the
> **cold-start generation** machine. It is *not* the editing machine — once a
> document exists, all further change goes through the patch-based editing flow
> (D-13, `BlockPatch`). The two are decoupled through the canonical DocModel
> file; see §1.

---

## 0. The one principle this inherits

Memo §2 governs everything below: **the DocModel is canonical; the editor,
markdown, and any serialization are projections of it, never sources of truth.**
Two consequences shape the whole pipeline:

- Markdown is a **transient projection**, generated on demand and consumed back
  in. It is never a second persisted source of truth. Trying to keep markdown
  and the DocModel as co-equal editable copies reintroduces the §2 lossy
  round-trip and broken-anchor failure modes (see §1).
- The pipeline's output is the canonical DocModel. Everything the consultant
  must act on (unverified data, unrepresentable intent, overflow) is **persisted
  as flags inside the DocModel**, so generation and editing can run in different
  hosts (§9) and the editor still surfaces every flag.

---

## 1. Canonical model and the round-trip question (Q1)

**Decision:** JSON DocModel is the sole canonical artifact at every instant.
Markdown is a disposable projection minted in either direction on demand. The
generation/editing lifecycle is a **phase-gate with scoped regeneration**:

```
brief
  → [Pass 0] outline
  → [Pass 1] writing  ───────────────►  markdown draft (transient)
                                          │  consultant may refine freely,
                                          │  in-app or in their own LLM
                                          ▼
  → [Pass 2] structuring  ────────────►  JSON DocModel (CANONICAL) ── gate ──►
  (+ Pass 2.5 layout for decks, same Structure draft action)
                                          │
                                          ├─ editor: patch-based editing (D-13)
                                          └─ "rewrite this section":
                                               scoped regenerate-and-replace
```

**Phase-gate handoff (v1).** Pass 0–1 run in a Claude Code skill. The skill
creates **`YYYY-MM-DD - {client}/`** and writes **`outline.json`** (Pass 0) then
**`draft.md`** (Pass 1). The consultant refines `draft.md` freely, then crosses
the gate in-app via an explicit **Structure draft** action (never automatic).
Structure runs Pass 2 (+ Pass 2.5 for decks), expands the folder to
**`YYYY-MM-DD - {client} - {title}/`**, writes the matching **`{folder}.json`**
on-disk DocModel, and archives `draft.md` → `.generation/source-draft.md`.
**v1 is one-way** — no full-doc re-structure (v1.1 roadmap: restore archived
draft and re-structure with confirm).

**Why not full bidirectional sync.** Markdown is strictly *poorer* than the
DocModel — it has no native representation for charts, KPI cards, timelines,
roadmaps, callout tone, slide layouts, ProseMirror marks, **stable block ids**,
or **comment anchors**. Round-tripping all of that through markdown means
extending markdown with custom syntax for every block (i.e. reinventing
Markdoc/MDX, already rejected — see ADR-0022) *and* still degrading on the
constructs markdown can't carry. Two live editable copies = two sources of truth
= the canonical ambiguity §2 forbids, plus a heterogeneous merge engine.

**What is feasible — and what we do:**

- **Down-conversion (JSON → markdown)** is a cheap, deterministic, on-demand
  projection (§2). Used to re-feed the LLM for section refinement / new sections.
- **Up-conversion (markdown → JSON)** is the structuring pass (§6), one-way.
- **"Rewrite this section"** serializes a *bounded subtree* to markdown, runs the
  writing pass, re-structures, and **replaces the subtree wholesale** (no merge;
  comments on those blocks are explicitly orphaned because the user asked to
  rewrite them; block ids are re-minted in that subtree).

The phase-gate means: before structuring, the consultant edits markdown freely
(full prose quality, no structure yet); after structuring, prose edits happen in
the WYSIWYG/ProseMirror surface or via patches. Scoped regeneration restores the
"AI rewrites prose in markdown" capability *after* the gate without re-opening
two-sources-of-truth.

---

## 2. The placeholder contract, and derive-not-store (Q2, Q5)

Non-prose intent travels between passes as a **placeholder**. One grammar serves
both directions:

```
[[block: <suggested-kind?> | intent: "<natural-language intent>" | id: <local-id>]]
```

- **Up** (writer output): `intent` always, `suggested-kind` optional (a hint, not
  a binding — Q5), `id` a stable local handle prose can reference.
- **Down** (`toPlaceholder(block)`): the same shape, derived from the block's
  **current** self-describing fields.

**Derive, never store (Q2).** Down-conversion does **not** read a stored
description field — that would denormalize the block and go stale the moment the
consultant edits it in the editor. Instead `toPlaceholder(block)` is a
deterministic function of the block's current human-facing fields:

| Block | Derived from |
|---|---|
| `chart` | `title` + `chartType` + `data.series[].name` + axis titles + `takeaway` |
| `table` | caption + column headers |
| `kpi-cards` | each card `label` + `value` |
| `timeline` / `roadmap` | `title` + phase/lane labels |
| `callout` | it *is* prose (`prosemirror-fragment`) — extract it |

Down-conversion is **100% deterministic — no LLM**. The LLM is reserved for
up-conversion (writing, structuring resolution) and rewriting only.

**Testable invariant:** `toPlaceholder(structure(p)) ≈ p` — structuring a
placeholder then collapsing it reproduces the original placeholder
(semantically). A unit test per block type.

**Provenance:** the original writing-pass intent is persisted as a write-once
**`sourceIntent`** field on every block born from a placeholder at structuring —
for traceability in the side panel, explicitly *not* the thing down-conversion reads.

**Catalogue-informed writer (Q5).** The writer is told only the *coarse
capability menu* (charts, comparisons-over-time, KPIs, timelines, callouts) so it
never asks for the impossible — but it does **not** know the 15 block types or
their schemas. Block-type choice and the `avoid:` rules in `blocks.catalogue.yaml`
belong to **structuring**, which keeps the writer in pure-prose mode (no
structural tax) while giving structuring a strong prior it can override.

---

## 3. Passes 0–1.5: outline, writing, coherence (Q4)

A 200-slide deck / 50-page report **cannot** be generated in one call
(output-token ceilings, quality decay over long generations, no granular retry).
So generation decomposes, and the outline is the load-bearing pass.

### Pass 0 — Outline (the coherence backbone)
A **rich** outline, not a table of contents. Per section it carries:
- the one **key message** (for decks, this is the slide headline),
- the **claims/evidence that section owns** — and no other section may assert,
- explicit **cross-references** ("builds on §2's three levers"),
- a contribution to a controlled **glossary** (canonical term per concept) and a
  **claims/figures ledger**.

For decks the outline is **slide-granular** (one leaf ≈ one slide), so it *is*
the deck skeleton. Each slide leaf carries a **`layout` id** referencing
`slide-layouts.catalogue.yaml` (see §5). Persisted as **`outline.json`** in the
doc folder at Pass 0 (structured data — not markdown frontmatter alone).
(R7: "generation starts from a structured outline.")

### Pass 1 — Writing (per-section fan-out)
Each section/slide expands independently, anchored on the outline + the
prompt-cached glossary + claims-ledger + brand voice (caching per D-13). Default
is **parallel fan-out**; a **sequential** mode (each section sees a running
summary) is **user-toggleable** (app and/or generation prompt) for prose-flow-
critical work, at the cost of latency = sum of sections.

**Two waves even in parallel:** *primary* sections fan out first; *derived*
sections (executive summary, conclusion, key-takeaways, transitions) generate in
a **second wave** seeded by the actual body prose, not the outline — so they
summarize what was really written.

For decks, the writer expands each slide to a **capacity budget** read from the
**same `slide-layouts.catalogue.yaml` row** as the slide's outline `layout` id
(single source — Pass 1 budgets match Pass 2.5 fit-check caps). The budget is
just numbers — it does not reintroduce taxonomy reasoning, so the writer stays
in prose mode.

### Pass 1.5 — Coherence
- **Deterministic glossary lint** always (flag off-glossary synonyms).
- **LLM coherence-stitch for reports only** (prose-dense, callback-heavy);
  decks are modular and skip it. The stitch *edits prose*, so its edits are
  surfaced/logged like any writing edit (§7, §8) — never silent.

---

## 4. Pass 2: structuring (Q6)

Structuring turns (possibly externally-refined) markdown into the canonical JSON
DocModel. **It is the trust boundary** (see §9): incoming markdown is untrusted
and validated here.

**`draft.md` frontmatter.** Pass 1 emits YAML frontmatter at the top of
`draft.md` with `title`, `client`, and `createdAt` (from Pass 0). Structuring
uses frontmatter for folder expand and `meta`; if frontmatter is missing, fall
back to the first `#` H1 for `{title}`.

**Deterministic-first; the LLM is scoped to two judgments only.**

| Job | How |
|---|---|
| Segment markdown into block units | **Deterministic** (markdown delimits it) |
| Map headings/lists/tables/paragraphs → blocks | **Deterministic** (syntax encodes the type) |
| Prose → ProseMirror fragment | **Deterministic**, schema-aware (see below) |
| Resolve `[[placeholder]]` → final kind + shape | **LLM** (uses `avoid:` rules) |
| **Promotion** (paragraph→`callout`; number-table→`chart`) | **LLM** (per `avoid:` rules) |
| Assign ids, cross-refs, `sourceIntent`, validate | **Deterministic** |

**Schema-aware prose→ProseMirror.** `prose.body` is a `prosemirror-fragment` with
a *specific* allowed mark/node set. The converter must target the editor's exact
PM schema; markdown constructs outside it are coerced or dropped deterministically
and logged — never emitted as fragments the editor can't render.

**Closed-catalogue fallback.** A placeholder that no catalogue block can represent
(hard constraint: no off-catalogue types, BUILD_BRIEF §0) **degrades to a `prose`
block carrying the intent + a "couldn't realize as a structured block — needs
attention" flag.** Never invent an off-catalogue block; never silently drop intent.

**Fidelity gates (§8):** prose-preservation invariant, placeholder-completeness,
override-rate monitor, PM-schema conformance, schema-validate + 2× corrective
retry (D-236). See also D-236 for the shared retry contract.

---

## 5. Pass 2.5: deck layout (Q7) — decks only, v1

Reports bypass this entirely (linear flow + renderer pagination). Decks need
slide-boundary + layout assignment + slot-fitting on a fixed grid (R5; memo
LAYER 5; D-30's 15 slide layouts). **Ships in v1** — bundled into the same
**Structure draft** action as Pass 2 (not a separate consultant step).

**Catalogue:** `slide-layouts.catalogue.yaml` at repo root (parallel to
`blocks.catalogue.yaml`). Each layout entry: id, `use-when`, slots with accepted
block kinds and numeric **capacity** per slot. Pass 1 writer budgets, LLM layout
proposal, and deterministic fit-check all read this file. Editor slot maps must
validate against it (T-196).

**LLM proposes, deterministic engine decides.**
- Slide **boundaries** come from the slide-granular outline (§3), not structuring.
- The **LLM proposes** the best-matching layout from the catalogue (`use-when`).
- A **deterministic fit-check is the authority**: does the template have slots for
  these blocks within capacity?

**Overflow ladder (v1):** on fit failure → retry next **higher-capacity** layout
(catalogue ordering) → else **auto-split** to continuation slide +
`layoutOverflow` flag → **halt Structure** if still failing (D-236). **No silent
compression in v1.**

**Content adaptation lives in the writer, never silently in structuring.** Fitting
content to a slide is done up front via the writer's capacity budget (§3), sourced
from the same catalogue row as the outline layout id.

This keeps deck support inside R5 (fixed grid), R9 (not a think-cell clone), and
the memo §10 "no deck editor" guardrail — LLM free-placement would drift toward
the forbidden free-form deck editor.

---

## 6. Pass 3: data enrichment (Q3) — explicit post-structuring step

Runs only after structuring (only then is each block's required data *shape*
known). **Not bundled into Structure draft** — consultant clicks **Fill
illustrative data** when ready. Scope: **whole document**, skipping blocks
already `dataState: confirmed`.

**Two kinds of data, opposite risk:**
- **Grounded data** (from the consultant's uploaded material, roster/fees/
  references per D-15): the LLM may place it and **cite the supplied document**.
  Safe — grounded, not invented.
- **External factual data** (market sizes, growth rates): the LLM is **never the
  source of record** (R8: data is typed/pasted as static snapshots).

**Policy = Option C, with a hard split on sources:**
- The LLM fills **shape-correct, plausible-trend illustrative numbers**.
- Blocks carry a `dataState`: `empty | draft-illustrative | confirmed`.
- Illustrative blocks render with a **shared watermark** helper + ⚠ badge.
- **`source` (name + link)** is *human-authoritative*: the LLM fills it **only**
  for grounded data; for external/illustrative data it stays **empty** — the LLM
  **never authors a citation** (citation hallucination next to fake numbers is
  worse than no source: it defeats the watermark and invites rubber-stamping).
- **`sourceHint`** is a separate, LLM-authored *advisory* field ("check INSEE /
  the Fédération Française de la Chaussure / Euromonitor") — **never rendered as a
  citation**, ignored on verification.

**Verification & integrity:**
- The "Mark data verified" checkbox transitions `draft-illustrative → confirmed`,
  clearing the watermark. It is **gated on a real `source` being present** —
  so "verified" means human-attested data *and* a human-provided source.
- **Editing data or source after verification reverts** `dataState` (re-watermarks).
- Optional `verifiedBy` + `verifiedAt` for audit.
- Illustrative data must be **shape-valid** against the chart's declared schema.

---

## 7. Verification, gates, and the two moments (Q8)

### Per-pass gates
- **Outline:** schema-valid; claim-ownership (every claim owned by exactly one
  section; no orphans/overlaps).
- **Writing:** glossary lint; deck capacity-budget adherence; claim-leakage check
  (a section asserts no claim outside its lane, invents no free-floating figure).
- **Coherence:** contradiction detection (reports); stitch edits are visible/logged.
- **Structuring:** prose-preservation invariant; placeholder-completeness;
  `toPlaceholder(structure(p))≈p`; override-rate monitor; PM-schema conformance;
  schema-validate + 2× retry (D-236).
- **Layout (decks):** deterministic fit-check; overflow flagged; no orphan block.
- **Data:** `dataState` integrity; source-present-to-verify; edit-reverts;
  shape-validity.

### Two moments, distinct UX
- **Moment 1 — during generation (fail-loud).** A pass that fails its gate after
  the 2× corrective retry **halts and surfaces an honest error** ("couldn't
  structure section 7 — here's why"); it never passes partial/degraded output
  downstream. Mirrors D-236 and the autonomous-loop conservative-halt posture.
- **Moment 2 — after generation (readiness flags).** The document opens as a
  complete, editable draft carrying flags that surface in three places:
  1. **on the block in the canvas** (watermark/hatch, ⚠ badge, colored bar);
  2. **in the side panel** when clicked (what's wrong + the fix action);
  3. **in one document-level readiness checklist** — a "⚠ N items need review"
     counter; each line clickable to jump to the block; the list shrinks to 0 as
     items are resolved.

### The capstone: aggregated readiness gate

All "needs a human" flags converge into one blockers list:

```
blockers = [ dataState ≠ confirmed,
             "degraded to prose" flags,
             overflow / auto-split flags,
             unverified sources (confirmed without source),
             unresolved contradiction flags,
             size flag (block/slide count > D-35 envelope) ]
```

**Export is never locked.** Blockers surface in the canvas (watermarks/badges),
side panel, and a document-level checklist. At **Export PDF/HTML**, a popup
summarizes remaining blockers with **Review items** (primary) and **Export with
flagged content** (secondary, one-click — no typed reason).

**Honest contract:** the pipeline guarantees *structural validity, prose fidelity,
and that every judgment-call is flagged* — **not** factual accuracy, narrative
quality, or that the layout "looks right." Those are human gates. The output is a
**valid draft with flags, not a guaranteed-shippable document.**

---

## 8. Host and scale (Q9)

### Host — V1 is a Claude Code skill (refines D-15)
- Pass 0 (outline) + Pass 1 (writing) run as a **Claude Code skill** — outline +
  **sub-agents per section** (a natural fit for the parallel fan-out of §3).
- Pass 0 creates **`YYYY-MM-DD - {client}/`**, writes **`outline.json`**, sets
  `createdAt` from outline start.
- Pass 1 writes **`draft.md`** with YAML frontmatter (`title`, `client`,
  `createdAt`) plus prose and placeholders.
- The consultant may **refine `draft.md` freely** (in-app or external LLM) before
  **Structure draft** in the app (§1).
- Structure (Pass 2 + 2.5 for decks) → canonical `{folder}.json` DocModel.
- Pass 3 (**Fill illustrative data**) is a separate explicit action in the app.
- The pipeline is **host-agnostic**: the design is identical whether generation
  runs in the skill (v1) or in-app (later). Only the "Generate" front-end moves.
- The two moments split across the host boundary cleanly: **Moment 1** lives where
  generation runs (skill terminal in v1); **Moment 2** lives in the editor —
  because every flag is persisted in the DocModel.
- *Candidate in-app mechanic for "later" (not committed — see the "Integrated
  scaffolding" roadmap entry in `DECISIONS.md`):* run Pass 0–1 by detecting a
  locally installed agent CLI (Claude Code / Codex) and executing it as a
  subprocess from the Rust shell — no per-seat API-key provisioning; the Rust
  HTTP client stays primary for the structured passes (2 / 2.5 / 3). The
  subprocess gotchas (PATH expansion across version managers, prompt via stdin,
  timeout + kill handle, `which`/`where` detection) have working prior art in
  erictli/scratch — patterns only, that repo is unlicensed.

### Trust boundary for externally-refined markdown
Because the consultant may refine markdown in a tool we don't control, the
markdown entering structuring is **untrusted**. Mitigations:
- an **import-time contract lint** (placeholders well-formed? ids intact? broken
  structure?) with clear messages *before* the full structuring pass;
- a light **brand-voice lint** (forbidden words) surfaced as Moment-2 flags, not a
  hard gate;
- a **robust, re-anchorable placeholder grammar** — visually obvious (not deleted
  by accident), simple enough that an external LLM preserves it, and
  re-anchorable by content/intent if the local id is lost;
- ship the skill with a one-line "keep the `[[…]]` markers; edit prose freely"
  note for the refinement step.

### Scale — reconcile ambition with the validated envelope
D-35 validates the app at **~200 node-views**. A 200-slide deck ≈ 800–1000+
node-views (3–5 per slide) — **4–5× the benchmarked envelope** — which stresses
the editor (ProseMirror large-doc cliff), PDF render (Chromium), and the
render-budget watchdog (D-36), none tested at that size. A 50-page report is
closer to the envelope (prose-dense, fewer node-views/page).

**Decisions (v1):**
- **Single DocModel always** — add a **size flag** when block/slide count exceeds
  the D-35 envelope; no forced split. Outline-time linked-document split deferred
  to v1.1 (`DECISIONS.md` roadmap).
- **Commit to re-validating perf** at the larger target — extend the **D-39**
  benchmark harness to a ~1000-node-view fixture; set the v1 ceiling on evidence.
- **Render only visible slides (virtualization)** is the deck-specific fallback
  for unavoidable single-large docs. Cautions: virtualizing one ProseMirror doc
  is genuinely hard (selection/find/decorations/watchdog assume rendered nodes);
  decks window naturally (discrete slides); **D-37**'s lazy ECharts mount via
  IntersectionObserver is a building block. **Virtualization helps the editor,
  not export** — Chromium still renders the whole doc, so export perf is a
  separate measurement.

---

## 9. What this revises, and open items

**Revises (binding decisions — recorded as ADRs):**
- **D-18** → [ADR-0022](adr/0022-json-docmodel-supersedes-yaml.md): JSON DocModel
  replaces YAML as the canonical on-disk format (markdown/Markdoc evaluated and
  rejected as the container).
- **D-15** → [ADR-0021](adr/0021-multi-pass-generation-pipeline.md): initial doc
  generation becomes this multi-pass pipeline.

**Open items to resolve before tasks:**
1. ~~Concrete placeholder grammar + the re-anchoring algorithm when ids are lost.~~ → [PLACEHOLDER_GRAMMAR.md](PLACEHOLDER_GRAMMAR.md) (T-190); implementation T-191.
2. ~~Slide-template capacity metadata.~~ → **`slide-layouts.catalogue.yaml`** (T-196); single source for Pass 1 budgets + Pass 2.5 fit-check.
3. The schema additions: `dataState`, `source`, `sourceHint`, `verifiedBy/At`,
   `sourceIntent`, degraded/overflow/**size** flags — reconcile with `TYPES.md` §12 + `src/schema/generation.ts` (T-192).
4. ~~Readiness gate model.~~ → advisory blockers + export summary popup — [UI_READINESS_GATE.md](UI_READINESS_GATE.md), `src/generation/readiness.ts` (T-193).
5. The v1 document-size ceiling (output of the D-39 re-validation).
6. ~~YAML→JSON migration inventory.~~ → [JSON_MIGRATION_INVENTORY.md](JSON_MIGRATION_INVENTORY.md): **clean break**, two-phase folder naming, JSON basename = folder name (T-183–T-187).
7. **`outline.json` schema** — Zod shape for Pass 0 outline (slide `layout` ids, claims ledger, glossary).
