# Build Brief — Jayson Editor

**For:** the implementing developer / Claude Code
**Companion to:** `DOCUMENT_SYSTEM_ARCHITECTURE.md` (the architecture memo)
**Date:** 2026-05-21

---

## How to use this brief

The architecture memo explains **why**. This brief is **what to do**: repository
layout, build milestones, and acceptance criteria. Read the memo first, then
build to this brief. If the two ever appear to conflict, the memo's §2 principle
and §3 requirements win — stop and ask rather than guessing.

Work milestone by milestone. Do not start a milestone until the previous one's
acceptance criteria all pass.

---

## 0. Guardrails (non-negotiable)

- **Greenfield.** Start from an empty repository. Import no code, schema, or
  config from any prior prototype (memo R14).
- **Open-source only** for the build/runtime stack — use only the components
  listed in memo §5. Do **not** add any other runtime dependency without
  explicit written approval. The LLM is the sole non-OSS component (memo §9).
- **Do not use** Tiptap Pro, Tiptap Cloud, or any paid SaaS.
- **DocModel is canonical** (memo §2). The editor, Yjs, and YAML are
  projections of it. Never make editor state or a CRDT document the source of
  truth.
- **Do not build** anything in memo §10: no think-cell clone, no free-canvas
  deck editor, no DOCX/PPTX import or parsing, no PPTX export, no real-time
  collaboration in v1, no live-models platform.
- **Demo DOCX/PPTX are a setup-time reference only** (memo R15). Never write
  runtime code that parses or generates Office files; the setup pipeline is
  the only permitted exception.
- **When uncertain, stop and ask.** Do not invent brand values, client
  content, or block types. Use `TBD` placeholders and flag them.

---

## 1. Repository layout

```
jayson-editor/
  package.json
  tsconfig.json
  vite.config.ts
  README.md
  /src
    /schema          # Zod schema = the company template as code (memo L1)
      docmodel.ts    #   DocModel type + top-level schema
      blocks.ts      #   one schema per block type (the closed block library)
      brand.ts       #   brand-token schema
    /docmodel        # DocModel operations
      load.ts        #   load + validate
      serialize.ts   #   DocModel <-> YAML projection (lossless)
      patch.ts       #   scoped block-patch operations
    /renderer        # DocModel -> HTML (memo L5)
      /blocks        #   one React component per pre-built block type
      DocumentRenderer.tsx
      DeckRenderer.tsx        # v1.1
    /editor          # WYSIWYG (memo L3, §6)
      /nodes         #   one custom TipTap node per pre-built block type
      Editor.tsx
      mapping.ts     #   DocModel <-> editor-document mapping
    /comments        # comment mark + comment-to-AI workflow (memo §7)
    /llm             # LLM interface: outline generation, scoped patches (L2)
    /export          # Playwright PDF export + .docsys bundle export
    /brand           # brand-token file (authored at setup from demo files)
    /block-primitives # scaffold components that generated blocks must use
  /generated-blocks  # consultancy-specific blocks created by setup AI
    /pending         #   awaiting human review — app refuses to load these
    /active          #   approved blocks — app loads these at runtime
  /setup             # setup-time tooling
    scan-demos.ts    #   ingest DOCX/PPTX/PDF -> brand draft + catalogue diff
    regenerate.ts    #   re-run generation against current scaffold; diff -> /pending
    lint-generated.ts #  whitelist + forbidden-pattern enforcement
  /templates         # slide-layout library (v1.1)
  /scripts           # validate.mjs, export-pdf.mjs, setup-install.mjs
  /fixtures          # sample DocModel YAML; valid + invalid validation fixtures
  /tests
```

---

## 2. Stack & setup

- **Runtime:** Node + npm, Vite + React + TypeScript.
- **Approved app/runtime dependencies:** `react`, `react-dom`, `vite`,
  `typescript`, `zod`, `yaml`, `echarts`, `mermaid`, `@tiptap/react`,
  `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `playwright`,
  and Tauri 2.x.
- **Approved setup-only dependencies:** Office/PDF extraction and static-analysis
  libraries used exclusively by `setup:*` commands, as specified in
  `docs/SETUP_PIPELINE.md`. These must never enter the editor, renderer, or
  exported deliverable runtime bundle.
- **Dev-only:** `vitest` (tests), `@types/*`, ESLint + Prettier, and parser
  tooling needed for generated-code linting.
- **Version pinning:** implementation pins exact versions in `package.json` and
  lockfiles after the half-day technical scan; no `^` or `~` ranges.
- **npm scripts:** `dev`, `build` (`tsc --noEmit && vite build`), `validate`
  (schema-check fixtures), `export:pdf`, `test`.
- Block reordering uses TipTap's built-in node drag/drop. If a separate
  drag-and-drop library is wanted, flag it for approval first — it is not in §5.

---

## 3. Milestones

### M0 — Project scaffold
- [ ] Empty repo → Vite + React + TypeScript app, the §1 folder layout, ESLint/Prettier, vitest.
- [ ] All npm scripts defined; `dev` and `build` run clean.
- **Acceptance:** `npm run build` passes with `tsc --noEmit`; the empty app renders; CI/lint is green.

### M1a — Schema & DocModel
- [ ] Zod schema for the DocModel: metadata, brand reference, ordered sections, ordered typed blocks.
- [ ] **Every block has a stable `id`.**
- [ ] Brand-token schema (per `brand.example.yaml`); one authoritative brand file per consultancy.
- [ ] `validate()` rejects invalid documents with clear, located errors.
- [ ] YAML projection: `DocModel -> YAML` and `YAML -> DocModel`.
- **Acceptance:**
  - the valid fixture DocModels validate.
  - the invalid fixtures all fail with readable errors.
  - **YAML round-trip is byte-stable and lossless** (automated test).
  - duplicate stable IDs fail validation.

### M1b — Pre-built 15-block library
- [ ] **Pre-built 15-block generic catalogue** — implement each block per `blocks.catalogue.yaml`. One Zod schema + one React renderer + one TipTap node view per block.
- [ ] no block type exists outside the closed library.
- **Acceptance:**
  - a fixture DocModel using each of the 15 pre-built blocks validates.
  - each block has schema, renderer, editor-node mapping, and tests per `docs/BLOCK_IMPLEMENTATION_GUIDE.md`.

### M1c — Setup pipeline safety shell
- [ ] **Setup AI block-generation pipeline safety shell:**
  - [ ] CLI command `setup:scan-demos` that ingests DOCX/PPTX/PDF demos and produces a draft brand-token file + a catalogue diff (existing-block uses + new-block proposals).
  - [ ] Generated blocks land in `/generated-blocks/pending/` with the metadata header (`Generated by`, `Source patterns`, `Reviewed by`, `Last regen`).
  - [ ] App **refuses to load** any block still in `/pending/`. Human reviewer manually moves approved files into `/generated-blocks/active/`.
  - [ ] **Constrained code generation**: generated React/TipTap code uses a pre-defined scaffold; AI only fills the `attrs` schema and a restricted JSX render slot.
  - [ ] **Whitelist enforcement**: a lint rule fails the build if generated code imports outside the whitelist (`react`, `@tiptap/*`, `echarts/*`, `./brand-tokens`, `./block-primitives`).
  - [ ] **Forbidden patterns**: build fails on `dangerouslySetInnerHTML`, `eval`, `Function`, `fetch`, `XMLHttpRequest`, or any direct CSS injection.
  - [ ] **CSP-sandboxed rendering**: generated blocks render inside a Content-Security-Policy-constrained iframe in the editor; pre-rendered to static HTML at PDF export time.
  - [ ] **Hard cap**: setup escalates to developer review if more than 10 new blocks are proposed.
- **Acceptance:**
  - `setup:scan-demos` produces a draft catalogue + brand file from sample DOCX/PPTX/PDF fixtures; output is in `/pending/` and the app refuses to load until a human moves it to `/active/`.
  - a deliberately-malicious generated block (containing `dangerouslySetInnerHTML` or a `fetch` call) is rejected by the lint rule and does not build.

### M1d — AI-assisted generated blocks
- [ ] Stage 4 constrained code generation fills the scaffold for proposed blocks.
  - [ ] **Auto-generated tests**: each generated block ships with one valid fixture, one invalid fixture, and a snapshot test of rendered HTML.
  - [ ] **Regen pipeline**: a `setup:regenerate` command re-runs generation against the current scaffold version, diffs the output, and routes any drift to `/pending/` for human re-review.
- **Acceptance:**
  - generated blocks pass the same schema, renderer, mapping, and lint checks as pre-built blocks.
  - `setup:regenerate` routes drift to `/pending/` for human re-review.

### M2 — Renderer + HTML/PDF
- [ ] One React component per block type under `/renderer/blocks`.
- [ ] `DocumentRenderer` composes blocks into an HTML document; brand tokens applied from the brand file.
- [ ] Playwright PDF export; running headers/footers and page numbers via `page.pdf()` `headerTemplate`/`footerTemplate`; page-break CSS (`break-inside: avoid`).
- **Acceptance:** a fixture DocModel renders to HTML and to PDF; **HTML and PDF are produced by the same Chromium render and match visually**; the renderer runs with **no editor present**; brand is consistent across two different fixture documents.

### M3 — LLM interface
- [ ] Outline-driven generation: structured outline in → schema-valid DocModel out.
- [ ] Generated output is **validated against the schema before acceptance**; invalid output is rejected, never silently used.
- [ ] Scoped block patch: a `BlockPatch` changes exactly one block by `id`.
- [ ] **Model stratification** (per D-11): default to a cheap/fast model for comment-to-AI; route to a frontier "thinking" model only when the consultant toggles it in the comment popup. Model + API key per provider configured at install time.
- [ ] **Batched call with caching** (per D-13): one API call per batch returns N structured patches. Prompt-cache the schema + brand + doc-state context. Per-patch validation after response; retry failed patches one-at-a-time with corrective re-prompt. Full-call failure retries the batch once, then falls back to per-comment.
- [ ] **Threaded comments** (per D-12): each comment carries a `thread[]` of typed entries (`instruction`, `ai-proposal`, `follow-up`). Follow-ups queue locally and ship in the next batch with full thread context.
- **Cost ledger / monthly cap: removed ([ADR-0019](adr/0019-drop-cost-ledger.md)).** The app does not meter or cap LLM spend; spend is governed by provider-side billing. The install-time privacy disclosure now states that no usage/cost data is stored.
- **Acceptance:**
  - given a sample outline, the LLM produces a valid DocModel
  - a scoped patch modifies only its target block and leaves all others byte-identical
  - malformed LLM output is rejected with a clear error
  - a 20-comment batch produces 20 validated patches in a single API call (with caching) and per-patch retry recovers any individual failures
  - a follow-up on a comment includes the prior `ai-proposal` in the next batch's context

### M4 — WYSIWYG editor
- [ ] TipTap (open-source core) on ProseMirror; one custom node per block type.
- [ ] Structural blocks → atom nodes with a schema-validated `attrs` payload edited via a React node view; prose → native rich text.
- [ ] `mapping.ts`: `DocModel <-> editor document`, with **losslessness tests both ways**.
- [ ] Block-library palette (closed set); reorder/add/remove; grid-anchored placement; **no free canvas**.
- **Acceptance:** load a DocModel, edit it, save it back → round-trip is lossless (automated test); a consultant can add/remove/reorder blocks; the editor **cannot** produce off-schema content; consultants never see YAML/JSON (R4).

### M5 — Comment-to-AI
- [ ] Custom inline comment **mark** with an ID; comment records in a top-level `comments[]` array on the DocModel (shape per memo §7).
- [ ] Single-comment and **batch** ("process all") workflows.
- [ ] AI returns a patch scoped to the comment's block; shown as an **accept/reject proposal**; **never auto-applied**.
- **Acceptance:** highlight → comment → AI proposal → accept/reject works; comments survive save/reload **and** YAML round-trip; batch mode works; the AI never edits outside the comment's block (automated test).

### M6 — Deck renderer (v1.1)
- [ ] `DeckRenderer` over the **same** DocModel; a fixed, closed library of slide layouts.
- **Acceptance:** the same DocModel renders as a deck; layouts are a closed set; no free positioning; deck reuses the schema, editor, and comment system unchanged.

### M7 — Document Editor Spike (minimum runnable app)

Deliberately narrow first integration milestone: prove a real consultant can open a YAML document, edit it, insert blocks via the palette, save it, and export it to PDF via the user's default browser — WITHOUT a library, install wizard, AI, comments, deck rendering, or settings. Those surfaces stay disconnected modules until M8+ where their scope can be informed by what M7-spike user testing reveals.

- [ ] `UI_APP_SHELL.md` spec describes the single-document shell architecture (no router, no install wizard, no library scan).
- [ ] Two Tauri IPC commands hardened: `read_yaml_file` and `write_yaml_file`. `export_pdf` IPC reimplemented as a browser-handoff (pre-renders HTML, writes to temp via Rust, opens in user's default browser via `shell.open`). The other 14 IPC commands stay as registered no-op stubs (not called by the spike).
- [ ] `src/App.tsx` no longer returns null — boots a single-document shell. Welcome screen with "Open Document" button; once a document is open, DocumentView fills the window.
- [ ] DocumentView wires DocumentRenderer + Editor + the autosave debounce from T-82. File → Save / Save As work via fs IPC.
- [ ] BlockPalette (existing 15-block component) mounted in DocumentView with `+` button + `/` keyboard shortcut to insert blocks; `generatedBlocks` slot empty for M7-spike (filled by M8 T-132).
- [ ] File → Export PDF: pre-renders self-contained HTML + opens in user's default browser via `shell.open` (Tauri shell plugin). User completes the export with Cmd-P → Save as PDF.
- [ ] Top-level `withRenderWatchdog` wrap on DocumentView honours D-39 perf budget; top-level error boundary so a thrown block doesn't crash the whole app.
- **Acceptance:**
  - launching the app shows a blank welcome screen with a single "Open Document" button.
  - clicking Open Document opens the native file dialog; selecting `examples/sample-proposal.yaml` renders the document in the editor with BlockPalette mounted.
  - editing prose, inserting a block from the palette, then File → Save, then File → Open + reload → the edits and inserted block are preserved (lossless round-trip).
  - File → Export PDF pre-renders a self-contained HTML file, opens it in the user's default browser; the user can then save as PDF natively.
  - T-123 integration test covers the full open → edit + insert block → save → reopen → export-pdf-handoff happy path end-to-end.
  - the brand is hardcoded to `brand.example.yaml` for the spike (no brand-picker UI yet).
  - the empty-document fixture loads without throwing.

### M8 — Integrated App + Library (library + templates + Brand blocks)

Second integration milestone. Fires AFTER M7-spike ships and consultant testing of the editor surface has had a chance to surface any UX rework. Adds router infrastructure, first-launch folder picker, library card grid (with empty-state "Use Sample" button), 4 standard document templates with a "Create from Template" surface, Brand-block runtime loading from `generated-blocks/active/`, and pipeline end-to-end validation.

Note on vocabulary: "generated blocks" in M8 means **Brand blocks** (Tier 2 per CONTEXT.md / ADR-0004) — installed by the M1d setup pipeline. The third tier — **Authored blocks** (consultant-generated on demand, emailable peer-to-peer) — is explicitly deferred to M9+. M8 does not implement Authored-block generation, receipt, lint-at-receive, or the registry refactor those mechanics will sit on; the existing on-disk shape under `generated-blocks/active/` is sufficient for what M8 ships.

- [ ] Update `UI_APP_SHELL.md` to reflect M8 architecture (router, folder-picker routing, library state model, partial-config schema decision).
- [ ] Harden the 4 remaining fs IPC commands (`list_directory`, `file_exists`, `ensure_directory`, `move_file`) + all 3 config IPC commands.
- [ ] App boot reads config via IPC; routes to folder picker if absent OR if the configured `paths.cloudSyncRoot` no longer exists; otherwise routes to library.
- [ ] First-launch folder-picker screen (single dialog — just "Choose where your documents are saved", per grilling Q4 Option B). Identity (name/email) and brand-folder NOT collected here — deferred to M9.
- [ ] Library view per `UI_LIBRARY.md` (card grid + filter + sort + search; reuses `src/library/` pure-logic modules; empty-state shows "Use Sample" button).
- [ ] Router (`src/ui/router/Routes.tsx`) mediates welcome ↔ folder-picker ↔ library ↔ document; M7-spike's File → Open stays available as an "Open from disk" escape hatch.
- [ ] **Document templates:** 4 standards shipped (commercial proposal doc + deck, standard report doc + deck) in `templates/`; library has "Create from Template" button + modal.
- [ ] **Brand-block runtime loading:** `generated-blocks/active/` contents (Brand blocks installed by M1d) loaded on app startup, available in the BlockPalette alongside the 15 Standard blocks.
- [ ] **End-to-end pipeline validation:** the M1d setup pipeline gets an integration test proving scan-demos → AI-propose → lint reject malicious → approve cycle works on committed fixture demos.
- **Acceptance:**
  - first launch with no config opens the folder picker; completing it lands in the library view.
  - empty cloud-sync folder shows the empty-state with "Use Sample" button; clicking copies sample-proposal.yaml in.
  - library lists all YAML docs; filter + sort + search work.
  - "Create from Template" → pick any of 4 → name it → opens in editor; new doc appears in the card grid.
  - BlockPalette shows any Brand blocks from `generated-blocks/active/` alongside the 15 Standard defaults.
  - Clicking any library card routes to DocumentView (same view M7-spike built); the M7-spike File menu (Open / Save / Save As / Export PDF) still works.
  - **Not in M8 (deferred to M9+):** AI / comments / cost-ledger UI; deck rendering; reviewer mode; settings panel features beyond folder re-pick; in-app surface to trigger generated-block creation (still devops CLI for Brand blocks in M8); consultant-facing "request a new block" flow; **the entire Authored-block tier (ADR-0004 + ADR-0005)** — generation UX, `.tsx` manifest transport, drag-onto-window install, lint-at-receive, quarantine, scaffold-mismatch regen — plus the single-file block-registry refactor those mechanics depend on.

---

## 4. Per-component "done means"

| Component | Done when |
|-----------|-----------|
| Schema | Every block type validated; closed library enforced; clear errors |
| DocModel + YAML | Lossless round-trip proven by test; renders without the editor |
| Renderer | One component per block; HTML+PDF from one render; brand consistent |
| LLM interface | Output schema-gated; patches provably scoped to one block |
| Editor | DocModel⇄editor mapping lossless (tested); off-schema content impossible |
| Comment-to-AI | Proposals never auto-apply; comments survive serialization; batch works |
| Deck renderer | Closed layout set; reuses all shared layers unchanged |
| Document Editor Spike (M7) | Single-document shell wired (File → Open → edit → save → Export PDF via browser handoff); 2 fs IPC commands hardened (`read_yaml_file`, `write_yaml_file`); `export_pdf` IPC reimplemented as HTML browser-handoff; BlockPalette mounted; T-123 integration test passes in CI |
| Integrated App + Library (M8) | First-launch folder picker → library card grid; 4 standard document templates ship; library "Create from Template" surface works; `generated-blocks/active/` loaded at startup and surfaced in BlockPalette as Brand blocks; M1d pipeline validated end-to-end; T-134 integration test passes in CI. M8 still does NOT include AI/comments/cost-ledger UI, deck rendering, reviewer mode, signed installers, or the Authored-block tier (ADR-0004 + ADR-0005) and its registry refactor — those are M9-M11 + Phase 9 |

---

## 5. Testing requirements

- **Mandatory automated tests:** schema validation (valid + invalid fixtures);
  YAML round-trip losslessness; DocModel⇄editor mapping losslessness; LLM-patch
  scoping (only the target block changes).
- Render smoke tests: each block type renders to HTML and to PDF without error.
- Keep `/fixtures` with at least two complete sample DocModels and a set of
  deliberately-invalid documents.

---

## 6. Definition of done — v1

- M0–M5 acceptance criteria all pass.
- The **flowing-document path works end to end**: structured outline → LLM
  generation → editor → comment-to-AI → HTML + PDF output.
- The build/runtime stack is verified open source (memo §5); the LLM is the
  only external dependency.
- The system runs locally; a DocModel renders to PDF/HTML with the editor
  switched off.
- No item from memo §10 has been built.

v1.1 (decks) and v2 (collaboration, interactive HTML / live models) follow
only after v1 is shipped and in consultants' hands.
