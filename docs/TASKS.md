# Implementation Tasks — Jayson Editor v1

> **System change (2026-06-09, `/agentic-workflow:plan`):** this file is now a
> **milestone index + remaining legacy backlog**. New work is specified in
> [`../tasks/`](../tasks/) as coarse tasks with frozen acceptance tests and
> human-approved plan PRs — do not add tasks here. Completed task bodies moved
> to [TASKS_ARCHIVE.md](TASKS_ARCHIVE.md); their `[x]`/`[skip]` header stubs
> remain below so dependency resolution and the loop's marker grammar keep
> working.

**Purpose:** decompose `BUILD_BRIEF.md` milestones (M0–M6) into atomic tasks of ≤4 hours each.

**How to use this doc:**
- Work tasks in dependency order — IDs are roughly topological.
- Each task has: **inputs** (files/types it needs), **outputs** (files it produces), **acceptance** (how you know it's done), **est.** (hours).
- Mark `[x]` when done. Add to PR descriptions: "Closes T-23, T-24, T-25."
- When a task is larger than 4h, split it. When it's < 30min, batch with neighbors.

**Companions:**
- `TYPES.md` — type definitions referenced by tasks
- `BLOCK_IMPLEMENTATION_GUIDE.md` — copy-pattern for block tasks
- `SETUP_PIPELINE.md` — full spec for setup pipeline tasks
- `SETUP_INSTALL_FLOW.md` — per-consultant install CLI flow (T-73)
- `TAURI_IPC.md` — JS↔Rust command surface (T-02, T-60, fs commands)
- `YAML_FORMAT.md` — byte-stable formatter config (T-40; superseded by `JSON_FORMAT.md` per ADR-0022 — see T-183)
- `JSON_MIGRATION_INVENTORY.md` — YAML→JSON migration checklist (T-182)
- `GENERATION_PIPELINE.md` — cold-start generation design (ADR-0021)
- `PLACEHOLDER_GRAMMAR.md` — inter-pass placeholder spec (T-190)
- `UI_REVIEW_PANEL.md` — review-panel design (T-92 onwards)
- `UI_LIBRARY.md` — library UI design (T-84)
- `../starter/` — drop-in configs for T-01 through T-09
- `../reference/primitives/` — block-primitives every renderer depends on
- `../reference/callout/` — worked simple block (copy 14 times)
- `../reference/chart/` — worked complex block (cross-field schema + side panel + SSR)
- `../reference/mapping/` — worked top-level DocModel ⇄ editor orchestrator
- `../examples/` — fixtures for acceptance tests

**Conventions:**
- Tasks prefixed `T-NN`. NN is ordering, not strict; cross-phase deps are noted.
- "**est.**" is best-case for an experienced TS/React developer. Multiply ×1.5 for an LLM, ×2 for a junior.

---

## Phase 0 — M0: Project Scaffold

Foundation. Nothing else compiles until this is done.

### T-01 [x] · Initialize repo and Vite + React + TypeScript app

### T-02 [x] · Set up Tauri 2.x desktop shell

### T-03 [x] · Pin exact dependency versions

### T-04 [x] · Set up ESLint + Prettier + EditorConfig

### T-05 [x] · Set up Vitest with one passing sample test

### T-06 [x] · Create the full folder structure (empty)

### T-07 [x] · Add npm scripts

### T-08 [x] · Set up CI (GitHub Actions or equivalent)

### T-09 [x] · Write project README with quickstart

---

## Phase 1 — M1a–M1d: Schema, Block Catalogue, and Setup Pipeline

The single largest phase. Plan ≥ 6 weeks of focused work.

### Sub-phase 1A — Core schema (no blocks yet)

### T-10 [x] · Implement `StableIdSchema` and `AssetPathSchema`

### T-11 [x] · Implement `ProseMirrorFragmentSchema`

### T-12 [x] · Implement `BlockBaseSchema`

### T-13 [x] · Implement `MetaSchema`

### T-14 [x] · Implement `CommentSchema` + `ThreadEntrySchema`

### T-15 [x] · Implement `BlockPatchSchema`

### T-16 [x] · Implement `BrandTokensSchema`

### T-17 [x] · Implement `SectionSchema` and `SlideSchema`

### T-18 [x] · Implement `DocModelSchema` (top-level)

### T-19 [x] · Implement `validateDocModel` entry point

### Sub-phase 1B — Brand-token consumption

### T-20 [x] · Implement `BrandProvider` + `useBrandTokens` hook

### T-21 [x] · Implement `resolveBrandToken(brand, ref)`

### T-22 [x] · Implement `resolveAssetPath(brand, sharedFolderPath, docFolderPath, ref)`

### Sub-phase 1C — The 15 pre-built blocks

For each block: follow `BLOCK_IMPLEMENTATION_GUIDE.md`. Each block produces 4 files (schema, renderer, node, test).

**Estimation guide:** simple blocks (heading, prose, image, divider) ~4h each. Medium (callout, bullet/numbered list, kpi-cards, timeline, team) ~6h. Complex (chart, table, risk-matrix, roadmap, diagram) ~10–12h.

### T-23 [x] · Copy `reference/primitives/` to `src/brand-tokens/` + `src/block-primitives/`

### T-23b [x] · Reference block: copy `reference/callout/` to production paths

### T-24 [x] · Implement `prose` block (4 files)

### T-25 [x] · Implement `heading` block (4 files)

### T-26 [x] · Implement `bullet-list` block (4 files)

### T-27 [x] · Implement `numbered-list` block (4 files)

### T-28 [x] · Wire up the `BlockSchema` discriminated union

### T-29 [x] · Implement `kpi-cards` block (4 files)

### T-30 [x] · Implement `image` block (4 files)

### T-31 [x] · Implement `table` block (4 files)

### T-32 [x] · Implement `chart` block (4 files + side panel)

### T-33 [skip] · Implement `callout` block — see T-23 (reference) ✅

### T-34 [x] · Implement `timeline` block (4 files)

### T-35 [x] · Implement `roadmap` block (4 files)

### T-36 [x] · Implement `risk-matrix` block (4 files)

### T-37 [x] · Implement `team` block (4 files)

### T-38 [x] · Implement `diagram` block (4 files)

### T-39 [x] · Implement `divider` block (4 files)

### T-40 [x] · YAML round-trip + losslessness test

### Sub-phase 1D — Setup AI pipeline

### T-41 [x] · Implement document ingestion (DOCX/PPTX/PDF -> analysis JSON)

### T-42 [x] · Implement brand-extraction LLM call (Stage 2)

### T-43 [x] · Implement catalogue-diff LLM call (Stage 3)

### T-44 [x] · Implement the scaffold templates (literal files)

### T-45 [x] · Implement code-generation LLM call (Stage 4)

### T-46 [x] · Implement the lint enforcement (whitelist + forbidden patterns + hex colors)

### T-46b [x] · Implement the runtime render-budget watchdog (D-36, ADR-0001)

### T-47 [x] · Implement pending/active loading discipline

### T-48 [x] · Implement the `setup:scan-demos` CLI command end-to-end

### T-49 [x] · Implement the `setup:regenerate` and `setup:validate` CLI commands

---

## Phase 2 — M2: Renderer + HTML/PDF

### T-50 [x] · Implement `ProseRenderer` (rich-text serializer)

### T-51 [x] · Implement `DocumentRenderer`

### T-52 [x] · Set up Playwright for headless Chromium PDF export

### T-53 [x] · Implement running headers and footers via Playwright `page.pdf()`

### T-54 [x] · Implement page-break CSS rules

### T-55 [x] · Add the `divider` block's page-break handling

### T-56 [x] · Add Mermaid pre-rendering for PDF export

### T-57 [x] · Add ECharts pre-rendering for PDF export

### T-58 [x] · Implement HTML vs PDF render parity test

### T-59 [x] · Brand consistency test across two fixture docs

---

## Phase 3 — M3: LLM Interface

### T-60 [x] · Implement provider-agnostic LLM client

### T-61 [x] · Implement prompt caching as a per-adapter capability

### T-62 [x] · Implement outline-driven generation (initial doc creation)

### T-63 [x] · Implement `BlockPatch` application logic

### T-64 [x] · Implement batched comment-to-AI request builder

### T-65 [x] · Implement per-patch validation + corrective retry

### T-66 [x] · Implement threaded comment context assembly

### T-67 [x] · Set up SQLite for cost ledger

### T-68 [x] · Implement cost-ledger insert on every LLM call

### T-69 [x] · Implement monthly limit enforcement

### T-70 [x] · Implement 13-month sliding-window retention

### T-71 [x] · Implement `Settings → My LLM Spend` view

### T-72 [x] · Implement an automated test verifying the ledger never records prompt content

### T-73 [x] · Install CLI flow + privacy notice + cost-tracking toggle

---

## Phase 4 — M4: WYSIWYG Editor

### T-74 [x] · Set up TipTap editor with StarterKit

### T-75 [x] · Register all 15 block TipTap nodes in the editor

### T-76 + T-77 [x] · Implement DocModel ⇄ ProseMirror orchestrator

### T-78 [x] · Implement closed-schema enforcement in the editor

### T-79 [x] · Implement block-palette UI

### T-80 [x] · Implement block drag-reorder

### T-81 [x] · Implement grid-anchored placement for slide layouts

### T-82 [x] · Implement autosave with debounce

### T-83 [x] · Implement undo/redo with operation-level granularity

### T-84 [x] · Implement library UI (D-27)

### T-85 [x] · Implement Save As (creates a folder, not a file)

### T-86 [x] · Implement Open (accepts folder or YAML inside one)

### T-87 [x] · Implement asset-missing and orphaned-asset linting

### T-88 [x] · Implement chart-data side panel

### T-89 [x] · DocModel <-> editor mapping losslessness test (acceptance criterion)

### T-89b [x] · Build the perf-spike anchor fixture (D-35, D-39)

### T-89c [x] · Build the perf benchmark harness (D-39)

### T-89d [x] · Build the watchdog adversarial test (D-39)

---

## Phase 5 — M5: Comment-to-AI

### T-90 [x] · Implement the comment mark (inline highlight)

### T-91 [x] · Implement comment creation flow

### T-92 [x] · Implement comment review panel (mode B — default)

### T-93 [x] · Implement inline track-changes review (mode A)

### T-94 [x] · Implement two-pane diff review (mode C)

### T-95 [x] · Implement review-mode toggle + per-consultant persistence

### T-96 [x] · Implement batch submit ("Process all")

### T-97 [x] · Implement follow-up queue

### T-98 [x] · Implement Accept/Reject (with undo)

### T-99 [x] · Implement conflict detection (overlapping patches in same block)

### T-100 [x] · Implement reviewer mode (read-only with comments)

### T-101 [x] · Test: comments survive save/reload and YAML round-trip

### T-102 [x] · Test: AI never edits outside the comment's target block

---

## Phase 6 — M6: Deck Renderer (v1.1)

### T-103 [x] · Implement DeckRenderer with layout dispatch

### T-104 [x] · Implement the 15 slide layouts (one component each)

### T-105 [x] · Implement deck PDF export

### T-106 [x] · Test: deck reuses schema, editor, and comment system unchanged

### T-107 [x] · Editor support for `kind: "deck"` (slide-aware navigation)

---

## Phase 6.5 — Scaffold hardening

Post-M6 audit surfaced two scaffold drift entries. Commit `e893e64` shipped icons + `.taurignore` + one verifier assertion; the remaining two tasks close the Cargo.toml feature pin + lockfile parity gaps so `npm run tauri:dev` from a fresh clone never auto-mutates committed files.

### T-113 [x] · Lock `protocol-asset` feature + treat starter as runnable

### T-114 [x] · Extend verify-bakeoff-v2.sh with Cargo.toml feature + lockfile-parity assertions

---

## Phase 7 — M7: Document Editor Spike (minimum runnable app)

First integration milestone. Deliberately narrow: prove a consultant can open a YAML, edit it, insert blocks via the palette, save, and export to PDF via the user's default browser — WITHOUT a library, install wizard, AI, comments, deck rendering, or settings. Those surfaces stay disconnected modules until M8+ where their scope can be informed by what M7-spike user testing reveals.

### T-115 [x] · Write UI_APP_SHELL.md (spike-scope spec)

### T-116 [x] · Resolve M7-spike architectural decisions (2 questions)

### T-117 [x] · Harden read_yaml_file + write_yaml_file IPC (spike scope)

### T-118 [x] · Implement export_pdf IPC as browser-handoff

### T-119 [x] · App entry — single-document shell

### T-120 [x] · DocumentView (kind = "document") with autosave

### T-120b [x] · Wire BlockPalette into DocumentView (block-insertion UI)

### T-121 [x] · File menu (Open / Save / Save As / Export PDF)

### T-122 [x] · Top-level error boundary + watchdog wrap

### T-123 [x] · M7-spike integration test (open → edit + insert block → save → export)

### T-123a [x] · Fix editor remount cycle (typing usability)

### T-123b [x] · Constrain multi-section documents in M7-spike (+ create shared single-section fixture)

### T-123c [x] · Lock down M7-spike trust boundary (shell scope + defer 4 fs IPCs)

### T-123d [x] · Real-fixture integration test (open sample-proposal + real export renderer)

### T-123e [x] · Inline image assets as data: URIs in export HTML (with new binary-read IPC)

### T-123f [x] · Resolve scope-drift trap (read scope from tauri.conf.json)

### T-123g [x] · Validate inserted-block schema round-trip in integration test

### T-123h [x] · Configure shell plugin `open` regex + non-mocked smoke test

### T-123i [x] · Sanitize ProseRenderer link-mark `href` (block `javascript:`/`data:`/`vbscript:`)

### T-123j [x] · Defense-in-depth security hardening (MEDIUM/LOW findings batch)

### T-123k [x] · Close the test gaps surfaced by M7.5 review

### T-123l [x] · Perf + cleanup polish (LOW findings batch)

### T-123m [x] · Fix shell-open regex correctness + test mirrors runtime wrap + remove dead capability ACL

### T-123n [x] · Replace Node `Buffer` with Web Platform APIs in renderer code (runtime BLOCKER)

### T-123o [x] · Fix Windows delete-then-rename data loss (gate-blocking)

### T-123p [x] · Defense-in-depth + cosmetic cleanup batch (NOT gate-blocking)

### T-123q [x] · M7.5 round-3 audit follow-ups (3 MEDIUMs + 3 LOWs batched, NOT gate-blocking)

---

## Phase 8 — M8: Library + Templates + Generated Blocks

Second integration milestone. Fires AFTER M7-spike ships and consultant testing of the editor surface has had a chance to surface any UX rework. Adds router infrastructure, first-launch folder picker, library card grid (with empty-state "Use Sample" button), 4 standard document templates with a "Create from Template" surface, generated-blocks runtime loading, and pipeline end-to-end validation.

### T-124 [x] · Update UI_APP_SHELL.md for M8 architecture

### T-125 [x] · Harden remaining fs + config IPC commands

### T-126 [x] · Router infrastructure (Routes.tsx + types) + folder-existence check

### T-127 [x] · First-launch folder picker (single-dialog install) + missing-folder re-pick

### T-128 [x] · Library view: scaffold + folder scan + empty-state "Use Sample"

### T-129 [x] · Library view: filters + sort + search

### T-130 [x] · Create 4 standard document templates

### T-131 [x] · Library "Create from Template" surface

### T-132 [x] · Wire generated-blocks runtime loading + BlockPalette extension

### T-133 [x] · Validate Brand-block pipeline end-to-end

### T-134 [x] · M8 integration test (install → library → create from template → open doc)

---

## Phase 9 — M9a: Block Registry Refactor + 15-Block Migration

Refactor the 15 Standard blocks from the 5-touchpoint pattern (split across `src/editor/nodes/`, `src/renderer/blocks/`, `src/editor/mapping.ts` switch arms, `src/editor/Editor.tsx` arrays) into a single `src/blocks/<name>/` folder per block with a `defineBlock({...})` manifest. Establishes the foundation that M9b (Authored-block tier) builds on. No new user-facing features in M9a — purely an architectural refactor that ships independently of M9b.

Decisions: ADR-0004 (three-tier model), ADR-0006 (threat-model prereqs), ADR-0007 (capability restriction), ADR-0008 (manifest shape + per-block schema/runtime split), ADR-0013 (declarative-data interpretation). Plan: `~/.claude/plans/can-you-lay-out-playful-squid.md`.

Note: T-135 (commit grilling outputs) and T-158a (write ADR-0013) were completed manually before M9a began — see commit `ebe84b9`. Not re-listed as tasks here; first eligible M9a task is T-136.

### T-136 [x] · Watchdog error boundary (ADR-0006 prereq)

### T-137 [x] · URL-attribute lint rule (ADR-0006 prereq)

### T-138 [x] · Reference pattern refresh

### T-139 [x] · Registry API + per-block schema/runtime module split (pure schema, runtime separate)

### T-158a [x] · ADR-0013: Authored blocks are declarative data, not executable code

### T-140 [x] · Registry loaders (schema + runtime, both static for M9a)

### T-141 [x] · Folder layout scaffolding (legacy-wrapper approach, schema + runtime per block)

### T-141a [x] · Example brand theme: professional consulting style + structural HTML snapshot baselines

### T-141b [x] · Make `mapping.ts` registry-aware (hybrid)

### T-141c [x] · Bridge: refactor M8's generated-blocks loader onto the runtime registry

### T-142 [x] · Migrate Divider block to registry

### T-143 [x] · Migrate Heading block to registry

### T-144 [x] · Migrate Prose block to registry

### T-145 [x] · Migrate Callout block to registry

### T-146 [x] · Migrate BulletList block to registry

### T-147 [x] · Migrate NumberedList block to registry

### T-148 [x] · Migrate Image block to registry

### T-149 [x] · Migrate Diagram block to registry

### T-150 [x] · Migrate Timeline block to registry

### T-151 [x] · Migrate Roadmap block to registry

### T-152 [x] · Migrate RiskMatrix block to registry

### T-153 [x] · Migrate Team block to registry

### T-154 [x] · Migrate KpiCards block to registry (atom-node-with-grid-panel pattern)

### T-155 [x] · Migrate Table block to registry (atom-node-with-column-schema pattern)

### T-156 [x] · Migrate Chart block to registry (atom-node-with-side-panel + ECharts SSR)

### T-157a [x] · Editor-side registry wire-through (delete mapping.ts switches, derive Editor.tsx from registry)

### T-157b [x] · Renderer-side registry wire-through (DocumentRenderer + DeckRenderer iterate registry)

### T-157c [x] · Schema-side registry wire-through (build discriminated union from schema-registry)

### T-158 [x] · Memo §3 + cross-reference cleanup

---

## Phase 10 — M9b: Authored-Block Tier (Tier 3)

Ship the consultant-generated, peer-to-peer-shareable block tier on top of M9a's registry. Three sub-areas: declarative authoring API + AST-to-data extractor, transport (manifest header + drag-onto-window install + Rust-sidecar lint-at-receive + scaffold-mismatch regen), lifecycle (identity + replacement + soft archive + IPC commands), plus authoring UX and LLM provisioning.

Decisions: ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0009 (identity), ADR-0010 (soft archive), ADR-0011 (authoring UX), ADR-0012 (LLM provisioning), ADR-0013 (declarative data). Plan: `~/.claude/plans/can-you-lay-out-playful-squid.md`.

### T-159 [x] · `defineAuthoredBlock` declarative API design

### T-160 [x] · `defineAuthoredBlock` runtime implementation (built-in expander code)

### T-161 [x] · Manifest header parser + serializer

### T-162 [x] · Identity scheme validator (`{sender}:{slug}` block types)

### T-163 [x] · Lint-at-receive (Rust sidecar via Tauri IPC) + AST-to-data extractor

### T-164 [x] · Drag-onto-window install + "Import block" menu item

### T-165 [x] · Quarantine state + UI

### T-166 [x] · Scaffold-mismatch detection + "Regenerate against current scaffold" UX

### T-167 [x] · Soft archive IPC commands + capability ACL update (verify against plugin source per AGENTS.md review playbook)

### T-168 [x] · `generated-blocks/archived/` folder + `RemovedBlockPlaceholder`

### T-169 [x] · BlockPalette filter (active-only) + Authored-block manager view

### T-170 [x] · Replacement logic (same-sender v2 replaces v1 in whichever folder v1 was in)

### T-171 [x] · In-document "Create new Authored block" trigger

### T-172 [x] · Preview-first hybrid authoring UI (chat + structured fields, live preview)

### T-173 [x] · Authored-block generation pipeline (LLM call + shared receive pipeline)

### T-174 [x] · Share flow (sender stamp + OS share-sheet attachment)

### T-175 [x] · LLM provisioning — `authored-block-generation` frontier-key category

### T-176 [x] · Cost ledger — new `authored-block-generation` category

### T-177 [x] · Settings → My LLM Spend view: surface the new category

### T-179 [x] · Update `docs/BLOCK_IMPLEMENTATION_GUIDE.md` for the `defineAuthoredBlock` pattern

### T-180 [x] · Multi-section document editing (section TipTap node + DocumentView mapping)

### T-181 [ ] · Render/export path for installed Authored blocks (preview + PDF + deck)
- **Depends-on:** editor-side Authored wiring (ADR-0015, ADR-0016 — `createEditorExtensions(authoredManifests)`, `AuthoredManifestsContext`, `loadAuthoredManifests`, mapping `AuthoredResolver`)
- **Reads:** `docs/adr/0016-authored-blocks-persist-as-sender-slug-editor-keyed-by-slug.md` ("deferred edges" section), `docs/adr/0013-authored-blocks-are-declarative-data.md`, `src/renderer/DocumentRenderer.tsx`, `src/renderer/DeckRenderer.tsx`, `src/blocks/authored/template-expander.ts` (`buildAuthoredRenderer`), `src/blocks/runtime-registry.ts` (`useAuthoredManifestsFromRegistry`)
- **Context:** The editor path now inserts/saves/reloads installed Authored blocks (slug-keyed TipTap node ↔ `{sender}:{slug}` DocModel type via the installed manifest set). But the render/export path still builds its dispatch map from static `loadAllBlocks()` only (`DocumentRenderer.tsx:28`), which contains **zero** Authored blocks (the dynamic scan is still stubbed in `loadAllBlocks`). So **every** installed Authored block — active or archived — misses the map and hits the `isAuthoredBlockType(block.type)` branch (`DocumentRenderer.tsx:212`) → `RemovedBlockPlaceholder`. Result: a doc the editor renders fine shows authored blocks as "removed" in the preview pane and in exported PDF/deck output. This is the explicit deferral recorded in ADR-0016. **Note:** the comment at `DocumentRenderer.tsx:208–211` is currently misleading — it claims archived Authored blocks "ARE in the registry" and only *permanently-deleted* ones reach the placeholder. That is false given the stub; fix the comment as part of this task.
- **Folds in (point 2 of the 2026-05-28 review):** stop the `DocBlockSchema as ZodType<Block>` cast from hiding the authored runtime shape. `src/blocks/schema-registry.ts` casts `DocBlockSchema` to `z.ZodType<Block>` so `Section.blocks` infers `Block[]` (deliberate, to keep the editor-wiring diff small — see ADR-0016). That makes the type *lie*: authored blocks are present at runtime but invisible to the type system, so render/export/review/patch/layout consumers get no compile-time nudge to handle them. Once this task makes the renderer authored-aware, widen `Section.blocks`/`Slide.blocks` to `DocBlock[]` and let the resulting compile errors enumerate every consumer; resolve each with explicit narrowing (`isAuthoredBlockType` → render-or-placeholder) rather than a blanket cast. The main render path already branches explicitly (`DocumentRenderer.tsx:212`); the goal is to make the *other* paths equally explicit.
- **Outputs:**
  - `src/renderer/DocumentRenderer.tsx` — accept the Installed manifest set (prop, defaulting to `useAuthoredManifestsFromRegistry()` so existing callers don't break). For an Authored block type, resolve its manifest by `fullType`/slug and render via `buildAuthoredRenderer(manifest)` (the renderer counterpart of `buildAuthoredTipTapNode`) instead of falling through to `RemovedBlockPlaceholder`. Keep the placeholder only for genuinely-uninstalled types (permanently-deleted blocks). Fix the stale `:208–211` comment.
  - `src/renderer/DeckRenderer.tsx` — same threading for slide-based docs.
  - PDF export path — ensure the installed set reaches the renderer used for export (preview and PDF must agree).
  - `src/ui/views/DocumentView.tsx` — pass the installed set (already read from `AuthoredManifestsContext`) into `DocumentRenderer` (currently rendered without it, ~line 372).
  - `src/blocks/schema-registry.ts` + `src/schema/containers.ts` — drop the `ZodType<Block>` cast; type `Section.blocks`/`Slide.blocks` as `DocBlock[]`. Thread `DocBlock` (with explicit narrowing) through `src/renderer/**`, the export path, and `src/review/**` / patch code as the compile errors surface.
  - Tests: a doc containing an installed Authored block renders the expanded block (not the placeholder) in `DocumentRenderer` and `DeckRenderer`; an uninstalled/permanently-deleted authored type still renders `RemovedBlockPlaceholder`; PDF export of an authored-block doc does not emit the placeholder.
- **Acceptance:** opening a document that contains an installed Authored block shows the block (not "removed") in the preview pane and in exported PDF/deck output; uninstalled authored types still show the placeholder; `tsc` is green with `Section.blocks: DocBlock[]` (no `ZodType<Block>` cast) and every consumer narrows explicitly.
- **est.** 6h (was 4h; +2h for the DocBlock propagation across consumers)

---

## Phase 12 — JSON canonical format + generation pipeline (ADR-0021/0022)

Depends on ADR-0022 (JSON on disk) and [JSON_MIGRATION_INVENTORY.md](JSON_MIGRATION_INVENTORY.md). JSON migration tasks (T-183–T-189) should land before or in parallel with generation implementation (T-190+). Generation skill (Pass 0–1) can ship while structuring (Pass 2+) is built in-app.

> **Coarse re-plan (2026-06-09, `/agentic-workflow:plan`):** the not-started tasks below are consolidated into coarser tasks with frozen acceptance tests under [`tasks/`](../tasks/): **T-201** (JSON persistence core ← T-183 + T-184), **T-202** (app on JSON ← T-185 + T-186 + T-187), **T-203** (markdown→ProseMirror ← T-195), **T-204** (deck layout fit-check ← T-196). Work them from `tasks/T-20x-*.md`, **not** from the entries below. In-flight T-191–T-194 are unchanged.

### T-182 [x] · Write YAML→JSON migration inventory

### T-183 [skip] · JSON_FORMAT.md + deterministic JSON serializer

> Consolidated into [tasks/T-201-json-persistence-core.md](../tasks/T-201-json-persistence-core.md) — do not start from this entry.
- **Depends-on:** T-182
- **Reads:** `docs/YAML_FORMAT.md`, `src/docmodel/{serialize,canonicalize,yaml-config}.ts`, ADR-0022
- **Outputs:** `docs/JSON_FORMAT.md`, `src/docmodel/json-config.ts` (or equivalent), migrate `serialize.ts` to JSON (`parseDocModelJson`), `tests/docmodel/json-roundtrip.test.ts`
- **Acceptance:** Byte-stable JSON round-trip; canonical key order documented; `npm test` green for new round-trip suite.
- **est.** 4h

### T-184 [skip] · read_json_file + write_json_file IPC

> Consolidated into [tasks/T-201-json-persistence-core.md](../tasks/T-201-json-persistence-core.md) — do not start from this entry.
- **Depends-on:** T-183
- **Reads:** `src-tauri/src/ipc/fs.rs`, `docs/TAURI_IPC.md`, `tests/ipc/fs.smoke.test.ts`
- **Outputs:** JSON IPC commands (rename or add alongside YAML during transition — decide in T-182 §9), updated TAURI_IPC.md, smoke tests
- **Acceptance:** Read/write a valid DocModel JSON file through IPC; atomic write-then-rename preserved.
- **est.** 3h

### T-185 [skip] · Wire editor open/save/autosave to JSON

> Consolidated into [tasks/T-202-app-on-json.md](../tasks/T-202-app-on-json.md) — do not start from this entry.
- **Depends-on:** T-184
- **Reads:** `src/editor/{file-open,file-save,autosave}.ts`, `src/ui/menu/FileMenu.tsx`, `docs/UI_APP_SHELL.md`
- **Outputs:** Editor + file menu use JSON IPC + `.json` dialog filters
- **Acceptance:** M7-spike flow (open → edit → save) works with `examples/sample-proposal.json`; autosave writes JSON.
- **est.** 3h

### T-186 [skip] · Migrate library scan + templates to JSON

> Consolidated into [tasks/T-202-app-on-json.md](../tasks/T-202-app-on-json.md) — do not start from this entry.
- **Depends-on:** T-185
- **Reads:** `src/library/index-builder.ts`, `templates/*.yaml`, `src/ui/library/CreateFromTemplateModal.tsx`, `docs/UI_LIBRARY.md`
- **Outputs:** `templates/*.json`, library scans `*.json`, create-from-template clones JSON; update integration tests
- **Acceptance:** M8 happy path works with JSON templates; library meta read parses JSON only.
- **est.** 4h

### T-187 [skip] · Doc/spec sweep for JSON canonical format

> Consolidated into [tasks/T-202-app-on-json.md](../tasks/T-202-app-on-json.md) — do not start from this entry.
- **Depends-on:** T-186
- **Reads:** `docs/TYPES.md`, `AUTHORING.md`, `docs/DECISIONS.md` (D-05, D-19), `docs/BUILD_BRIEF.md`, `AGENTS.md`
- **Outputs:** Updated specs; D-05/D-19 text amended (`proposal.json`); optional one-release YAML import shim (if decided in T-182 §9)
- **Acceptance:** No spec still claims YAML is the canonical DocModel format except historical/strikethrough context.
- **est.** 3h

### T-190 [x] · Write PLACEHOLDER_GRAMMAR.md (concrete grammar + re-anchoring)

### T-191 [~] · Implement placeholder parse + toPlaceholder (per block type)
- **Depends-on:** T-190
- **Reads:** `docs/PLACEHOLDER_GRAMMAR.md`, block schemas under `src/blocks/*/schema.ts`
- **Outputs:** `src/generation/placeholder.ts`, `src/generation/parse-placeholder.ts`, `tests/generation/placeholder.test.ts` (≥1 block type round-trip: `toPlaceholder(structure(p)) ≈ p`)
- **Acceptance:** Deterministic down-conversion for all 15 catalogue blocks; parse rejects malformed placeholders; callout + chart round-trip tests pass.
- **est.** 6h

### T-192 [~] · Add generation schema fields to TYPES.md (+ Zod)
- **Depends-on:** T-190
- **Reads:** `docs/GENERATION_PIPELINE.md` §6–§7, `docs/TYPES.md`
- **Outputs:** `dataState`, `source`, `sourceHint`, `verifiedBy`/`verifiedAt`, `sourceIntent`, degraded/overflow flag shapes in TYPES.md + `src/schema/` implementations
- **Acceptance:** Schemas validate; illustrative data watermark contract documented; `source` vs `sourceHint` separation enforced.
- **est.** 4h

### T-193 [~] · Readiness gate data model + export summary popup spec
- **Depends-on:** T-192
- **Reads:** `docs/GENERATION_PIPELINE.md` §7
- **Outputs:** `src/generation/readiness.ts` (pure logic), `docs/UI_READINESS_GATE.md`, tests for blocker aggregation; `canExport()` always true
- **Acceptance:** Blockers collected for checklist/popup; export never blocked; popup contract documented (Review items / Export with flagged content).
- **est.** 4h

### T-194 [~] · Markdown import contract lint (pre-structuring)
- **Depends-on:** T-191
- **Reads:** `docs/GENERATION_PIPELINE.md` §8, `docs/PLACEHOLDER_GRAMMAR.md`
- **Outputs:** `src/generation/import-lint.ts`, tests with valid/invalid external-refinement fixtures
- **Acceptance:** Detects broken placeholders, orphaned ids, structural damage before full structuring pass; clear error messages (Moment 1).
- **est.** 3h

### T-195 [skip] · Deterministic markdown → ProseMirror converter (structuring prose path)

> Consolidated into [tasks/T-203-markdown-to-prosemirror.md](../tasks/T-203-markdown-to-prosemirror.md) — do not start from this entry.
- **Depends-on:** T-191
- **Reads:** editor PM schema, `docs/GENERATION_PIPELINE.md` §4
- **Outputs:** `src/generation/markdown-to-prosemirror.ts`, tests for allowed mark/node set + coercion logging
- **Acceptance:** Known markdown constructs map to editor-renderable fragments; out-of-schema constructs dropped with logged warnings, never invalid fragments emitted.
- **est.** 8h

### T-196 [skip] · Deck layout fit-check engine (Pass 2.5)

> Consolidated into [tasks/T-204-deck-layout-fit-check.md](../tasks/T-204-deck-layout-fit-check.md) — do not start from this entry.
- **Depends-on:** T-192, D-30 slide layouts
- **Reads:** `docs/GENERATION_PIPELINE.md` §5, slide layout components
- **Outputs:** `slide-layouts.catalogue.yaml`, layout capacity metadata spec + `src/generation/layout-fit-check.ts` + tests; validate editor `LAYOUT_SLOTS` against catalogue
- **Acceptance:** Deterministic authority over LLM layout proposal; overflow → auto-split + flag path tested.
- **est.** 8h

**Phase 12 acceptance gate:** JSON DocModel round-trips byte-stable through editor save/load; placeholder grammar implemented with ≥2 block round-trips; readiness gate blocks export when blockers non-empty; import lint catches broken external markdown before structuring.

---

## Phase 11 — Deployment & Release

### T-108 [!] · Set up code signing (macOS, Windows) ← waiting: requires Apple Developer + Azure Trusted Signing accounts, then CI secrets
- **Outputs:** signing certs in CI secrets; signed build outputs
- **Plumbing wired (2026-05-29):** macOS path is env-driven in `release.yml` (Developer ID + notarization via `APPLE_*` secrets). Windows path is Azure Trusted Signing: opt-in `signCommand` overlay `src-tauri/tauri.windows.signing.conf.json` merged in CI when `AZURE_*` secrets exist, `trusted-signing-cli` install step added. Legacy `WINDOWS_CERTIFICATE*` slots removed. Full setup in `docs/RELEASE.md`. Now purely blocked on: (1) Apple Individual enrollment (~$99/yr) + Developer ID cert export, (2) Azure Trusted Signing account + service principal, (3) populating GitHub secrets + the 3 non-secret overlay placeholders.
- **Acceptance:** `npm run tauri build` produces a signed `.dmg` (macOS) and `.msi`/`.exe` (Windows). Linux uses unsigned AppImage.
- **est.** 6h (mostly cert procurement bureaucracy)

### T-109 [!] · Set up Tauri updater ← waiting: requires updater signing key and hosted release-feed URL
- **Outputs:** updater config in `tauri.conf.json`; release feed
- **Acceptance:** App checks for updates on launch; updates from a manually-hosted JSON feed.
- **est.** 4h
- **What the Tauri auto-updater is (logged 2026-05-29):** Tauri's built-in mechanism for shipping updates *without users re-downloading the installer*. Once enabled, a running copy of Jayson Editor will, on launch or on demand: (1) fetch a small JSON feed we host (e.g. `latest.json` attached to each GitHub Release) listing the newest version + download URL + signature; (2) compare it to the installed version; (3) if newer, download the new bundle, **verify it against an updater public key compiled into the app**, then install and relaunch. That signature check is the key safety property — it stops a tampered/spoofed feed from pushing a malicious update.
- **Why it's a SEPARATE key from code signing (T-108):** the updater keypair (`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, already wired as env vars in `release.yml`) is generated with `tauri signer generate` and is *independent* of the OS code-signing certs (Apple Developer ID / Azure Trusted Signing). Code signing proves the installer's origin to the OS; the updater key proves the *update feed* to the app itself. Both must be valid for a trusted update.
- **Why it's OFF today:** `release.yml` sets `includeUpdaterJson: false` and `tauri.conf.json` has no `app.updater`/`plugins.updater` block. Two prerequisites are missing: (a) the updater signing keypair (run `tauri signer generate`, store private key + password as the CI secrets above, paste the public key into config), and (b) a stable feed URL (the GitHub Releases `latest.json` endpoint, or a self-hosted URL). Emitting a feed the app can't validate would ship a half-working updater — hence it stays off until both land. This is independent of T-108 and can be enabled separately.
- **To enable later:** add `tauri-plugin-updater` (npm + Cargo), add an `plugins.updater` block to `tauri.conf.json` with `endpoints` (the feed URL) + `pubkey` (from `tauri signer generate`), flip `includeUpdaterJson: true` in `release.yml`, and add a check-for-updates call on app launch. See https://v2.tauri.app/plugin/updater/ . Full release/signing context: `docs/RELEASE.md` §Auto-updater.

### T-110 [x] · Build release pipeline (3 OSes)

### T-111 [x] · Write the privacy notice (install-time disclosure)

### T-112 [x] · Write the setup runbook

---

## Summary

| Phase | Milestone | Tasks | Est. hours | Notes |
|---|---|---|---|---|
| 0 | M0 | T-01 — T-09 | 9.5 | Scaffold |
| 1A | M1 (core schema) | T-10 — T-19 | 14.5 | |
| 1B | M1 (brand consumption) | T-20 — T-22 | 5 | |
| 1C | M1 (15 blocks) | T-23 — T-40 | ~110 | The biggest chunk |
| 1D | M1 (setup pipeline + watchdog) | T-41 — T-49 incl. T-46b | 50 | +watchdog per ADR-0001 |
| 2 | M2 (renderer/PDF) | T-50 — T-59 | 32 | |
| 3 | M3 (LLM interface) | T-60 — T-73 | 50 | |
| 4 | M4 (editor + perf gate) | T-74 — T-89 incl. T-89b/c/d | ~74 | +perf harness per D-39 |
| 5 | M5 (comments) | T-90 — T-102 | 52 | |
| 6 | M6 (deck) | T-103 — T-107 | 38 | v1.1 |
| 6.5 | Scaffold hardening | T-113 — T-114 | 4 | post-M6 audit fixes |
| 7 | M7 (document editor spike) | T-115 — T-123 (incl. T-120b) | ~33 | minimum runnable app |
| 7.5 | M7 review fixes (5 BLOCKERs + 9-round review backlog) | T-123a — T-123q | ~22 | review verdict 2026-05-26 across 9 rounds; AGENTS.md §Review playbook #1–#7; T-123o gate-blocking for M8, T-123p+T-123q optional for M8 but gate-blocking for v1.0 external |
| 8 | M8 (library + templates + Brand blocks) | T-124 — T-134 | ~36 | fires after T-123o (gate v4) + consultant testing; T-123p + T-123q can fire in parallel |
| 12 | JSON format + generation pipeline | T-182 — T-196 | ~50 | ADR-0021/0022; JSON migration T-183–T-187; generation T-190–T-196 |
| 9 | Deployment | T-108 — T-112 | 21 | renumbered from Phase 7; T-123p + T-123q's MEDIUMs must close BEFORE T-108/T-109/T-110 fire (v1.0 external gate) |
| | | | **~557.5h** | ≈ 13–14 weeks full-time for a strong dev, or ~7 months at half-time |

**Realistic v1 (excluding M6 deck path, including M7-spike + M7.5 fixes + M8):** ~518.5 hours ≈ 12–13 weeks full-time. The ~95.5h of M7-spike + M7.5 + M8 + scaffold hardening is the integration + review-fix work that turns the disconnected M1–M5 modules into a runnable consultancy app whose first user-visible surface actually works. Further deferred milestones (M9 comments/AI ~32h, M10 deck render ~7h, M11 reviewer ~4h, M-final ~8h) add another ~51h when spec'd later.

These numbers match the architecture memo's §11 estimate of "6–12 months commitment" — the lower bound is achievable with a strong developer focused full-time; the upper bound includes M6 and a real-world overhead (review, debug, refactor, meetings).

---

## How to use this list

- **Daily:** pick the next task with no unmet dependencies. Update its status. PR title format: `T-NN: <subject>`.
- **Weekly:** review velocity vs estimate. Adjust scope if running > 1.5× over.
- **Per phase:** confirm the BUILD_BRIEF acceptance gate before starting the next phase.
- **When blocked:** if a task can't proceed, note the blocker in this file and pick the next unblocked task.

This is a backlog, not a contract. Reorder freely as you learn — but always against the BUILD_BRIEF acceptance gates, which are the real targets.

**New work (Phase 12 onward):** specify via `/agentic-workflow:plan` into [`../tasks/`](../tasks/) — this list only tracks the remaining legacy entries to completion.
