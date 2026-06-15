# Decisions Log — Jayson Editor

**Date:** 2026-05-21
**Status:** Captured from a grilling session that stress-tested the architecture memo and build brief.
**Companion to:** `DOCUMENT_SYSTEM_ARCHITECTURE.md`, `BUILD_BRIEF.md`, `brand.example.yaml`, `blocks.catalogue.yaml`

---

## How to use this document

This is the **decisions log**: each entry captures a decision made during scoping, with its rationale and consequences. When the architecture memo or build brief is unclear, this doc explains *why* a given path was chosen.

- **Decisions** are numbered and grouped by domain.
- **Roadmap items** are features deliberately deferred — listed at the bottom, with the version they target (or in the version-less **Unscheduled** bucket).
- **Open items** are decisions still pending; they must be resolved before or during v1 build.

When an ambiguity arises, refer here first for the original rationale; if a decision needs revisiting, amend this doc and propagate to the memo + brief.

---

## 1. Users & operating model

### D-01 — Users are internal staff at the consultancy
Internal consultants only — no external contractors, no multi-tenancy.
**Why:** Simplifies training, data governance, and rollout. Lets v1 ship with single-user-per-install assumptions and no auth.
**Implication:** No login UI in v1; identity is set at install time (see D-22).

### D-02 — Volume: 40 new docs/month, ~30 consultants
40+ new client documents per month across ~30 consultants. Hard target, not estimate.
**Why:** Anchors capacity planning, LLM cost budget, and library-UX requirements.
**Implication:** Library UI needs to handle 500+ docs after 12 months (see D-19).

### D-03 — Iteration is heavy and hybrid
Each doc goes through 5–10 LLM cycles. Each cycle touches 10+ blocks. Consultants iterate via two parallel modes: (a) direct manual edits in the editor and (b) comment-to-AI requests with threaded follow-ups.
**Why:** Comment-to-AI is the **core workflow**, not polish. Hybrid editing means the system must handle concurrent manual + AI edits without clobbering either.
**Implication:** Scoped block patches must be precise; comments are *threads* with multiple AI exchanges (see D-12).

---

## 2. Editing semantics & state model

### D-04 — Current document state is the single source of truth
When AI patches arrive, they apply against the **current** (post-manual-edit) document state, not the snapshot from when the comment was made.
**Why:** Consultants edit blocks they've also commented on. The current state must win.
**Implication:** Before each "Process all" batch, the app auto-saves the doc as a clean checkpoint. AI patches are generated against this checkpoint.

### D-05 — Autosave is mandatory; version history via cloud storage
Autosave persists the JSON DocModel on edit (debounced). Version history relies on the consultant's existing cloud-sync provider (Dropbox/GDrive/OneDrive) — the app does not implement its own VCS.
**Why:** Most consultants already have synced cloud folders with file history. Reusing that is free and trustworthy.
**Implication:** No app-side commit/checkpoint UI. Recovery from corruption = consultant uses cloud-sync history.

### D-06 — Undo/redo is in-memory only, per editing session
The undo stack lives in the editor's memory. It is **discarded when the editor window closes**. Cross-session undo is out of scope.
**Why:** Avoids implementing a persistent undo history; the cloud-storage history already covers cross-session recovery.
**Implication:** Undo never reaches into "yesterday's edits." Within a session, anything is undoable.

### D-07 — Undo is granular per operation
Every editor edit and every individual comment-accept/reject is a separate undo step. Batched comment processing is **not** a single undo entry.
**Why:** Gives consultants fine-grained control during dozens-of-proposals batches. Aligns with how Word/Google Docs feel.
**Implication:** The undo stack contains mixed types (text edits, block edits, comment acceptances). UI doesn't need to differentiate — it's just a list of operations.

### D-40 — External-change detection: auto-reload clean, prompt dirty
A Rust-side file watcher (`notify`) watches the **open doc folder** and the **library root** (the cloud-sync root scanned for doc folders, D-19/D-20). When the on-disk DocModel changes under an open document: if the in-memory doc is **clean** — its latest revision has been **successfully persisted**, with no autosave write pending or failed — reload silently with a toast; otherwise prompt **Reload from disk / Keep mine** and **suspend the queued autosave until the consultant answers**, so a pending write can't overwrite the external bytes mid-prompt. Keep mine resumes autosave so the next write overwrites, with the cloud provider's version history (D-05) as the recovery net. **Deletion or rename of the open on-disk DocModel** is treated the same way — prompt rather than act silently; on Keep mine the next save re-creates the file at its path, but the deletion is always surfaced first so a deliberately deleted document is never silently resurrected. No auto-merge. Library-root events refresh the library index. The shared-data folder (D-20) is **not** watched in v1 — its values (brand tokens, roster, references, shared assets) are read at setup / on open, so an admin's update becomes visible only after an app restart or manual refresh; this staleness is **accepted for v1**, not assumed harmless (stale shared data can affect generated content, so a v1.1 watcher or refresh action may be warranted — see roadmap).
**Why:** Doc folders live in a cloud-sync root (D-19/D-20), so another machine or an external agent can rewrite files under the app; with mandatory autosave (D-05), a stale in-memory DocModel silently clobbering newer synced bytes is a real data-loss path — and "clean" must mean *persisted*, not *a debounce timer elapsed*, because the autosave path clears its pending buffer before the write completes (`src/editor/autosave.ts`). Same-stack prior art: erictli/scratch (Tauri 2 + notify, 500ms debounce, `file-change` event) — patterns only, the repo is unlicensed.
**Implication:** New watcher + `file-change` event (create / modify / delete) to add to `docs/TAURI_IPC.md` when implemented. The watcher must ignore its own autosave writes (suppress paths just written / compare a content hash) so a flush doesn't self-trigger a reload. `draft.md` during the free-markdown phase is **out of scope for v1** — that phase has no on-disk DocModel yet (created at Structure — D-19) and the markdown surface has no defined dirty-state; revisit if/when in-app markdown refinement lands (see `docs/GENERATION_PIPELINE.md`).

---

## 3. Block library & schema

### D-08 — Two-tier closed block library (15 pre-built + AI-generated extensions)

**Amended by [ADR-0004](adr/0004-three-tier-block-library-with-authored-blocks.md):** the cap of 10 in Tier 2 is removed (sized at ~15 per consultancy by current observation), and a third tier — **Authored blocks**, consultant-generated on demand and shareable peer-to-peer — is introduced with its own trust gate (lint + watchdog, no human review). See CONTEXT.md for canonical tier names (Standard / Brand / Authored). The text below is the original decision; ADR-0004 is the source of truth.

- **Tier 1:** 15 generic blocks built into the app (see `blocks.catalogue.yaml`). Brand tokens make them feel native per consultancy.
- **Tier 2:** Up to 10 consultancy-specific blocks generated by a setup-time AI when an observed pattern can't be expressed by Tier 1.

**Why:** Tier 1 alone covers ~80% of patterns; Tier 2 covers the long tail without a developer sprint per consultancy.
**Implication:** Setup AI is part of M1 deliverables; v1.1+ adds consultant-authored custom blocks beyond the setup pass.

### D-09 — Generated blocks are heavily mitigated
Six mitigations apply to any AI-generated block (see Layer 1 of the memo):
1. Constrained template (AI fills a scaffold, not free React)
2. Whitelisted imports only — extended per ADR-0001 to forbid `parent`, `top`, `window.localStorage`, `document.cookie`, `postMessage`, intrinsic monkey-patching
3. Forbidden patterns (no `dangerouslySetInnerHTML`, `eval`, `fetch`, etc.)
4. **Human review gate** (`/generated-blocks/pending/` → `/generated-blocks/active/`)
5. **Runtime render-budget watchdog** — see [ADR-0001](adr/0001-no-iframe-sandbox-for-generated-blocks.md). Originally specified as a CSP-sandboxed iframe; superseded by the watchdog + an extended lint after the O-08 spike resolution.
6. Regen pipeline tied to scaffold version bumps

**Why:** AI-generated code that ships unreviewed is an attack surface and a quality-control gap. The review gate makes it impossible to deploy ungoverned code. The watchdog (replacing the original iframe sandbox) contains the runaway-loop / leak threat without iframe overhead.

### D-10 — Asset paths in YAML are constrained
Block asset paths must start with `assets/` (per-doc, relative) or `$brand:` (token reference). Absolute paths and `..` traversal are **rejected by the Zod schema**.
**Why:** Makes "moving a doc breaks assets" structurally impossible. Tokens decouple brand changes from per-doc files.

---

## 4. LLM strategy

### D-11 — Model stratification: fast/cheap default, thinking on-demand
- **Comment-to-AI default:** a cheap/fast model (e.g., GPT-5.5).
- **Thinking toggle in the comment popup:** routes that one comment to a frontier model (e.g., Claude Opus 4.7).

API keys + provider configuration set at install time by devops.
**Why:** Comments are high-volume, mostly low-stakes. Frontier models for the hard cases keep cost predictable without sacrificing quality where it matters.

**Amended by [ADR-0012](adr/0012-authored-block-codegen-uses-frontier-model.md):** a third LLM-use category — `authored-block-generation` — is added for Authored-block code generation (initial generation, preview iteration, scaffold-mismatch regen on receipt). Always uses the frontier model; no per-call toggle, because failure on code gen is asymmetric. Every consultant install provisions all three keys, not just author-mode installs.

### D-12 — Comments are threaded conversations
Each comment is a thread: `instruction → ai-proposal → follow-up → ai-proposal → ...`. Follow-ups don't trigger immediate AI calls — they queue, then submit in the next batch with full thread context.
**Why:** Mirrors how a consultant reviews a junior's draft — iterative, with pushback.
**Implication:** The Comment schema has a `thread[]` array of typed entries. Prompt-caching the doc context keeps cost manageable across iterations.

### D-13 — Batched LLM calls with caching, fallback to per-comment on failure
Default: one API call per batch returns N structured patches in a single response. Failed-validation patches retry one-at-a-time with corrective re-prompting. Full-call failure retries the batch once, then falls back to one-at-a-time.
**Why:** Batched + prompt caching is the cheapest path (3–4× cheaper than per-comment). Per-comment is the resilience fallback.
**Implication:** LLM interface must support both modes; structured output must include per-patch validation status.

### D-236 — LLM invalid output: schema-validate, corrective retry (max 2), then fail loud
Every LLM call whose output must conform to a schema (structured patches, generation-pass artifacts, setup pipeline outputs) is validated immediately after decode. On validation failure, retry with a corrective re-prompt that includes the schema errors — **at most 2 retries** (3 attempts total), matching the setup pipeline (`SETUP_PIPELINE.md` Stage 2). After the retry budget is exhausted, **halt and surface an honest error** — never pass partial, silently degraded, or schema-invalid output downstream.
**Why:** Invalid LLM output is a routine failure mode, not an exceptional one. Silent degradation (especially at the structuring trust boundary in ADR-0021) would violate memo §2 and the conservative-halt posture of the autonomous task loop. A fixed retry cap keeps cost predictable while giving the model a fair correction pass.
**Implication:** Generation passes (GENERATION_PIPELINE.md §7), patch batches (D-13), and setup stages share the same retry contract. Moment-1 generation gates and Moment-2 readiness flags are separate — D-236 governs only the retry-or-halt behavior during LLM calls, not whether a valid-but-flagged draft may open in the editor.

### D-14 — Cost budget: mixed-model strategy is in budget
Expected spend with the mixed strategy: ~$120–250/month (≈ $1,500–3,000/year). Soft per-consultant monthly limits (e.g., €50/month) with 80% warning, hard stop at 100%, admin override.
**Why:** Predictable spend; protects against runaway loops.
**Implication:** App needs a per-consultant cost ledger — implementation rules in D-34 (carve-out from D-32's no-telemetry default).
**Superseded (2026-05-29, ADR-0019):** the monthly cap and the per-consultant cost ledger are dropped pre-release — Jayson Editor does not meter or cap LLM spend; spend is governed by provider-side billing / account limits. The ledger design is archived for a possible future release in [docs/archive/cost-ledger.md](archive/cost-ledger.md).

---

## 5. Setup, scaffolding & integration

### D-15 — Scaffolding skill runs in Claude Code (v1), integrated later
**Refined (2026-06-07, [ADR-0021](adr/0021-multi-pass-generation-pipeline.md)):** the skill becomes the multi-pass generation pipeline (outline → writing fan-out → coherence → structuring → layout → data); output is a **JSON** DocModel ([ADR-0022](adr/0022-json-docmodel-supersedes-yaml.md)), not YAML. The "runs in Claude Code (v1), integrate later" core is unchanged. Full design: [GENERATION_PIPELINE.md](GENERATION_PIPELINE.md).

Initial doc generation is a Claude Code skill that asks structured questions, references the consultancy's roster/fees/references, and outputs a YAML DocModel. Consultant loads the YAML into the Jayson Editor.
**Why:** Decoupled, fast to iterate, leverages an existing Claude Code workflow.
**Roadmap:** v1.1+ — integrate scaffolding into the editor as "New from template" with the same questionnaire inline.

### D-16 — Brand tokens are AI-generated from real company docs
The setup AI ingests demo DOCX/PPTX/PDFs and produces a populated `brand.yaml` (per `brand.example.yaml`). A human reviews and approves once. File then lives in the shared folder (D-20).
**Why:** Each consultancy gets their own brand without a developer touching code. Example file ensures consistent shape across consultancies.

### D-17 — Block catalogue is AI-curated against pre-built 15
Same setup AI scans demo files and produces a catalogue diff: which pre-built blocks the consultancy uses + proposals for any new blocks needed (subject to D-09 mitigations and 10-block cap).
**Why:** Most consultancies fit Tier 1 with only brand-token tweaks. The hybrid (D-08) is the cleanest fit.

---

## 6. File formats & storage

### D-18 — YAML is the canonical on-disk format
**Amended (2026-06-07, [ADR-0022](adr/0022-json-docmodel-supersedes-yaml.md)):** the canonical on-disk format is now **JSON**, serializing the canonical DocModel. The D-18 premises (human-readable diffs, hand-editability) no longer hold — the file is machine-written and edited via the WYSIWYG surface (R4) — and JSON is more reliable for LLM generation. Markdown/Markdoc were evaluated and rejected as the container. This is a **projection-format change, not a model change** — the canonical DocModel and `canonicalize()` are untouched — and it is scoped to the **DocModel document only**: non-document YAML (`config.yaml`, `brand*.yaml`, `blocks.catalogue.yaml`) stays YAML. The text below is the original decision.

Each doc is a YAML file. JSON is in-memory only. Cloud-storage diffs are human-readable; consultants can hand-edit in emergencies; LLMs read it natively.
**Why:** Maximizes diff readability, hand-editability, and direct LLM access (no unzip step). Ruled out a ZIP-based single-file format because it invalidates these properties.
**Implication:** Each doc is a folder, not a file (see D-19).

### D-19 — Each doc is a folder, not a file; export as `.docsys` bundle
**Amended (2026-06-07, grilling + ADR-0022):** on-disk DocModel is **JSON**, not YAML. Two-phase folder naming for cold-start generation; JSON basename matches folder name. Library scan rule updated.

Working format on disk:
```
2026-06-07 - Acme - SMR Proposal/
├── 2026-06-07 - Acme - SMR Proposal.json   ← canonical DocModel (basename = folder)
├── outline.json                             ← Pass 0 (pre-structure)
├── draft.md                                 ← Pass 1 (pre-structure; archived after Structure)
├── .generation/
│   └── source-draft.md                      ← archived markdown after Structure
└── assets/  (optional)
```

Pass 0 creates `YYYY-MM-DD - {client}/` only; Structure one-time expands to full name above.

"Export as .docsys" zips the folder for email/sharing.
**Why:** Folder atomicity prevents the DocModel and assets from being separated. ZIP-on-export gives the single-file UX when actually needed.
**Implication:** Save As creates/renames a folder explicitly; library UI scans folders containing exactly one `{folderName}.json`. **Clean break** from YAML — no import shim (pre-release).

Original YAML layout (superseded):
```
2026-05-21 - Acme - SMR Proposal/
├── proposal.yaml
└── assets/  (optional)
```

### D-20 — Shared company data lives in a cloud-synced folder (v1)
Brand tokens, roster, references, shared assets all live in a single cloud-synced folder (e.g., `~/Dropbox/Consultancy-Shared/`). Tauri app reads from a configured path.
**Why:** No infra needed; updates propagate via consultants' existing sync.
**Roadmap:** v1.1+ — move to a Git repo (`consultancy-shared-data`) for versioned, PR-reviewed updates.

### D-21 — Hybrid asset strategy
- **Brand assets** (logos, icons, fonts): in the shared folder (D-20), referenced via `$brand:logo.primary` tokens.
- **Per-doc assets** (cover photos, screenshots): in the doc's sidecar `assets/` folder, referenced via `assets/cover.jpg` relative paths.
- **Charts:** pure data in YAML; no asset file.

**Why:** Dedupes brand assets across 40+ docs/month while keeping per-doc content self-contained.

---

## 7. Deployment & runtime

### D-22 — Tauri desktop app on macOS / Windows / Linux
A native installer using Tauri 2.x. No central server. Files read/written directly from the local synced folder. LLM API keys in OS keychain. User identity, paths, and model configs set in a local config file at install.
**Why:** Sensitive client content never touches consultancy-owned servers. Offline-capable. No web ops burden.
**Cost:** Code-signing certs (~$300/year) + per-release CI for 3 OSes.
**Trade-off accepted:** System webview varies cosmetically per OS (Safari-like on Mac, Chrome-like on Windows). PDF output uses Playwright's headless Chromium — identical everywhere.

### D-23 — Identity is install-time, no login UI
User name, email, role, cloud-sync paths, and LLM keys are configured by a setup script at install time. The app trusts the local config — single-user-per-machine.
**Why:** Avoids building auth in v1. Comments are stamped automatically with the local user.
**Roadmap:** v2 — proper auth (SSO/OAuth) when real-time collaboration arrives.

### D-41 — Single app instance per machine
The Tauri shell registers `tauri-plugin-single-instance`: a second launch focuses the existing window instead of starting a second process; second-launch arguments are forwarded to the running instance.
**Why:** Two instances autosaving the same DocModel (D-05) is a silent last-writer-wins data-loss path with no conflict signal. One plugin registration closes it.
**Implication:** One-line dependency + handler in `src-tauri`; complements the external-change watcher (D-40), which covers the cross-machine variant of the same hazard.

---

## 8. Editor UX

### D-24 — Chart editing in a side panel
Selecting a chart block opens a right-side panel with: data grid, chart type, title, axis labels, brand-constrained color choice, legend position. Excel paste fills the grid. No inline chart editing.
**Why:** Charts are visually-dense; inline editing is cramped. Side panel preserves the doc layout while giving room for the grid.

### D-25 — Comment-review UI: toggleable inline ↔ panel ↔ diff
Three modes, toggled via toolbar segmented control or `cmd+shift+R`:
- **Panel** (default, B): side-panel queue of proposal cards
- **Inline** (A): Word-like track-changes in the doc
- **Diff** (C, power users): full-screen two-pane view

Choice persists per consultant in app prefs. State (accepted/rejected/pending) survives switches.
**Why:** Different consultants prefer different patterns. Toggling lets each pick.

### D-26 — Reviewer mode for human colleagues (plain comments only)
"Open as reviewer" opens a doc read-only. Reviewer can leave plain-text comments but cannot edit blocks directly and cannot trigger AI from their comments. Comments are tagged `role: reviewer`.
**Why:** Keeps responsibility clear: reviewers flag issues, owners decide whether to invoke AI.

### D-27 — Multi-doc library UI is the default landing
On launch, the app shows a library dashboard: doc cards with metadata (client, project, status, dates), filter sidebar, search bar. Reads from the cloud-sync folder via free-form recursive scan. Doc metadata comes from a `meta:` block in each YAML.
**Why:** With 500+ docs after 12 months, file-picker-only UX breaks down. Library is the daily entry point; "Open from disk" stays as escape hatch.

---

## 9. Multi-language

### D-28 — FR + EN, document-level language flag, EN editor UI
Each doc carries `language: "fr" | "en"` in metadata. Renderer applies typography rules per language (insécables, smart quotes). LLM prompts include the language directive. Editor chrome (buttons, menus) is English-only in v1.
**Why:** Two languages covers immediate need. EN editor UI is fine for bilingual consultants.
**Roadmap:** v1.1+ — additional languages (DE, ES) if needed; localize editor UI to FR.

---

## 10. Deck path

### D-29 — Decks are a separate DocModel kind sharing the schema (Option B)
A deck is `kind: "deck"` with *slide* blocks containing a layout name + content slots. Documents are `kind: "document"` with *section* blocks. **Leaf blocks** (chart, table, KPI, callout, etc.) are shared between both kinds.
**Why:** Strict reuse forced awkward fits for cover/divider slides. Shared leaves + distinct containers gives clean ergonomics on both paths.

### D-30 — 15 slide layouts for v1.1
Cover · Section divider · Agenda · Title+body · Two-column · Three-column · Chart full · Chart+commentary · Table · Quote · Process/timeline · Team · KPIs · Image+caption · Closing/next steps.
**Why:** Covers ~95% of consulting deck patterns. Smaller library forces escape to PowerPoint; larger adds maintenance burden.

---

## 11. Failure modes

### D-31 — Failure handling per scenario
- **LLM down / 503:** batched call retries once with backoff, then falls back to per-comment with status visible.
- **LLM returns invalid output:** auto-retry up to 2× with corrective re-prompt; if still invalid, surface as "failed" with raw output viewable; never auto-apply.
- **Corrupted YAML on disk:** refuse to open with parse error + line/column; offer raw YAML view in Monaco; recovery via cloud-storage history (no in-app recovery).

**Why:** Aggressive auto-recovery hides real problems and degrades trust. Loud failures + clear next steps are better than silent partial success.

---

## 12. Telemetry & GDPR

### D-32 — No usage telemetry in v1; operational cost-tracking is carved out as a non-analytics exception
**Default rule:** No telemetry in v1 — no usage analytics, no behavior tracking (accept/reject ratios, time-to-first-draft, block usage, etc.) persisted or transmitted.

**Carve-out — operational cost-tracking (D-34):** Per-consultant LLM spend IS tracked locally because it is **operationally necessary** to enforce the monthly cost limits committed in D-14. This is processing under "legitimate interest" (GDPR Art. 6(1)(f)) — strictly necessary to provide the service — not analytics.

**Why the distinction holds:**
- **Operational** = data the app needs to *function* (cost limits can't exist without tracking spend).
- **Analytics** = data collected to *observe* user behavior or improve the product.

These are categorically different under GDPR: the first is justified by service necessity, the second requires explicit consent or a stronger basis.

**Implication:** Pilot metrics (D-33) gathered via manual + interview methods, not telemetry.
**Roadmap:** Local opt-in behavioral telemetry + opt-in shared reports in v1.1+; central aggregate (with consent) considered for v2+.
**Revised (2026-05-29, ADR-0019):** the operational cost-tracking carve-out is withdrawn — the cost ledger was removed. D-32 now reads simply: no telemetry **and no persisted usage/cost data** in v1.

### D-34 — Operational cost-tracking — implementation rules
**Superseded (2026-05-29, ADR-0019):** the cost ledger was removed; these rules no longer apply. Retained for historical context.

Cost data is tracked locally (per D-32 carve-out), under the following strict constraints to keep it operational rather than analytical:

**What's tracked:**
- Per API call: timestamp, model used, input tokens, output tokens, computed cost, doc ID, **call category** (`comment-default`, `comment-thinking`, or `authored-block-generation` per [ADR-0012](adr/0012-authored-block-codegen-uses-frontier-model.md))
- Aggregates: cost per doc, cost per day, cost per month (per consultant — there is only one consultant per install per D-23)

The `authored-block-generation` category covers initial generation, preview iteration, and scaffold-mismatch regen on receipt — all in one bucket. Sub-categorisation and per-call cost previews are deferred to v1.1 if regen volume proves to be a budget pressure point; D-14's monthly cap is the v1 safety net.

**What's NOT tracked, even in the cost ledger:**
- Prompt contents, response contents
- Block IDs touched, comment IDs, comment content
- Accept/reject outcomes, edit patterns
- Any behavioral signal beyond what's strictly needed to compute spend

**Storage:**
- Local SQLite at the app's config path (e.g., `~/Library/Application Support/com.consultancy.docsystem/cost.db` on macOS).
- Never transmitted off the machine. Never written to the cloud-synced folder.
- Retention: 13 months (sliding window — auto-deletes older rows). Long enough for "this month vs last month" comparison; short enough to limit exposure.

**User-facing controls (mandatory):**
- **View** — `Settings → My LLM Spend` shows a table of all rows; consultant can see exactly what is stored.
- **Wipe** — one-click "Clear all cost history" wipes the SQLite. Warning: re-enables full monthly quota immediately.
- **Disable** — toggle to disable cost-tracking entirely. Disabling also disables monthly limits (the feature requires the ledger).

**Disclosure (at install time, in the privacy notice):**
- What's stored (the list above), where (local SQLite, machine-local), why (to enforce monthly limits), and how to view/wipe.

**Why these constraints matter:** They keep the carve-out legitimately "operational." If the cost ledger started capturing accept/reject ratios or comment counts, it would cross the line into behavioral analytics and lose the legitimate-interest justification.

---

## 13. Pilot & launch

### D-33 — 4-week pilot with 3 consultants
- 1 senior power user (champion)
- 1 mid-level (median user)
- 1 technically-skeptical consultant (stress test)

**Success metrics (gathered manually + interview):**
- ≥ 3 docs shipped end-to-end via the system
- ≥ 80% AI-proposal accept rate
- ≤ 2 critical bugs out-of-band
- NPS ≥ 7/10 across the 3 pilots
- Time-to-first-draft ≥ 40% faster than baseline Word workflow

**Rollback:** Word remains available throughout pilot. Pilot can pause at any point. If metrics miss by >50%, project pauses for diagnosis. A "failure" outcome is documented and acceptable.

---

## 14. Performance & runtime safety (resolves O-08)

### D-35 — Anchor scale: 200 node-views, 10 chart blocks per doc
Designs are validated against a typical "heavy" deliverable: ~200 node-views (the consultant's iteration ceiling at 5–10 LLM cycles × 20+ comments), ~10 chart blocks, 1–3 tables of up to 30×6 cells, dozens of inline comment marks.
**Why:** "TipTap at scale" is meaningless without a number; this is the load the system must handle smoothly. Docs above the anchor (rare in practice) get a separate "long-doc" optimization track if ever needed.
**Implication:** All perf targets in D-37/D-38 and the spike harness in D-39 use this fixture as their reference.

### D-36 — No iframe sandbox for generated blocks; runtime watchdog + extended lint
Originally specified as a CSP-sandboxed iframe (D-09 mitigation #5). Superseded by [ADR-0001](adr/0001-no-iframe-sandbox-for-generated-blocks.md): drop the iframe, extend the lint with additional forbidden patterns (`parent`, `top`, `window.localStorage`, `document.cookie`, `postMessage`, monkey-patching of intrinsics), add a runtime render-budget watchdog (50ms cap per render; offending blocks unmount with an error placeholder).
**Why:** iframes at the D-35 anchor cost ~500MB resident memory and seconds of mount time for ~15% marginal protection beyond what the lint + review already provide. The watchdog handles the strongest residual concern (runaway loops / leaks).
**Implication:** New M1 tasks: watchdog implementation + extended-lint patterns. Watchdog adversarial test is part of the D-39 deliverable.

### D-37 — Lazy ECharts mount via IntersectionObserver
Charts initialize on first scroll-into-view, not on doc open.
**Why:** ECharts `init()` + `setOption()` costs ~50–100ms per chart; mounting 10 eagerly on doc open adds 500–1000ms of jank. Lazy mount keeps cold open at the < 200ms target, scales cleanly if a future doc has 50 charts.
**Implication:** `reference/chart/Chart.tsx` will be updated to support lazy mount; `Chart` accepts a prop or auto-enrolls in an `IntersectionObserver`. Confirmed by the D-39 benchmark.

### D-38 — Table block: wrap `@tiptap/extension-table` with per-cell memoization
Use the official `@tiptap/extension-table` for structural behavior (rows, columns, header, cell navigation), but wrap each cell's React node-view with `React.memo` + fine-grained equality. Disable column resizing. Constrain cell content to a single paragraph with the allowed marks from `ProseRenderer`.
**Why:** Known TipTap-table issues (re-render cascades, slow cursor navigation) are well-understood and fixable via memoization. Custom-from-scratch is ~2 weeks of work vs ~1.5 days for the wrap; only justified if benchmarks fail.
**Implication:** T-31 (table block) uses this pattern. Targets confirmed by the D-39 benchmark: mount < 150ms; typing latency < 16ms; cell navigation < 16ms.

### D-39 — Perf spike deliverable: committed benchmark harness + watchdog adversarial test
A reproducible benchmark harness in `tests/perf/`, run in CI, that:
1. Loads a fixture matching the D-35 anchor.
2. Measures **6 metrics** with hard targets:
   - Cold doc open (with lazy ECharts mount): < 1s
   - First chart paint when scrolled into view: < 200ms each
   - Table mount: < 150ms
   - Table cell typing latency: < 16ms
   - Table cell navigation latency: < 16ms
   - Memory growth over a 30-min editing session: < 100MB linear growth
3. Includes a watchdog adversarial test: a deliberately-bad generated block that allocates in a hot loop; assert the watchdog unmounts it within 100ms of exceeding the budget.
4. Emits `docs/perf-spike-results.md` on each CI run.

**Why:** A markdown-only "I measured once and it felt OK" verdict is worse than no spike — perf regressions creep in invisibly. The harness makes the spike durable and protects D-37 / D-38 going forward.
**Implication:** New M1/M4 tasks (anchor fixture, harness, adversarial test) added to TASKS.md.

---

# Roadmap items (flagged during scoping)

Versions are nominal; actual sequencing depends on v1 outcomes.

### v1.1
- **Outline-time linked-document split** — when cold-start generation outline exceeds the D-35 envelope, propose splitting into multiple linked DocModels (e.g. one deck per workstream) with consultant override at outline approval; v1 ships single DocModel + size flag only (grilling 2026-06-07)
- **Full re-structure** — restore `.generation/source-draft.md` to `draft.md`, edit, run **Structure draft** again with explicit confirm (replaces entire DocModel; comments orphaned). v1 is one-way gate + scoped section regeneration only (grilling 2026-06-07)
- **Consultant-authored custom blocks** beyond the setup pass (email-shared first)
- **Integrated scaffolding** ("New from template" inside the editor with the questionnaire). *Candidate mechanic (not committed):* detect a locally installed agent CLI (Claude Code / Codex) and run Pass 0–1 as a subprocess from the Rust shell — **no *additional* provider API key for Pass 0–1** when an already-authenticated CLI is present (the structured passes 2/2.5/3 still use the install's keys per D-11/D-22/D-23); the Rust HTTP client stays primary for those passes. Solved gotchas documented by erictli/scratch (patterns only, unlicensed): PATH expansion across nvm/fnm/Homebrew, prompt via stdin, timeout + kill handle, `which`/`where` provider detection. Decide in its own grilling when this is scheduled — CLI availability across ~30 consultant machines is unverified.
- **Additional languages** (DE, ES) and FR editor UI
- **Per-language brand tokens** (different fonts/logos by language)
- **Admin UI** for tweaking brand tokens without YAML editing
- **Deck path** — 15 slide layouts + DeckRenderer (D-29, D-30). *Design prior art for `slide-layouts.catalogue.yaml`:* Slidev's layout system — layouts as components exposing **named slots**, slide content mapped into slots declaratively (`::slot::` sugar), and **cascading layout resolution** (built-in → theme → project). (Prior art only — the v1 slide-layout catalogue is a single closed authority per `slide-layouts.catalogue.yaml`; any layered/override model would be a separate future decision, not implied here.)
- **Opt-in local telemetry + opt-in shared pilot reports**
- **Move shared data to a Git repo** (`consultancy-shared-data`) with PR review

### v2
- **Real-time collaboration** via Yjs + self-hosted Hocuspocus
- **Interactive HTML deliverables** with embedded live models (scope TBD — see open items)
- **Synced library** for consultant-shared blocks (replacing email-based sharing)
- **Proper auth** (SSO/OAuth) for the multi-user/collab era
- **Central aggregate analytics** with explicit consent (if a clear use case emerges)

### Unscheduled (worth doing, not currently necessary — revisit after pilot feedback)
- **Library full-text search** — upgrade the library SearchBar from metadata-only filtering (`src/library/filter.ts` filters `Meta` fields) to full-text search over block content via an embedded Tantivy index in the Rust shell; stable block ids let hits deep-link to the block. Same-stack feasibility proven by erictli/scratch (tantivy + Tauri 2, watcher-driven incremental reindex) — patterns only, repo is unlicensed.
- **Slash-command block insertion** — **upgrade the existing `/` shortcut** (which today opens the BlockPalette, BUILD_BRIEF M7) to a cursor-anchored `/` suggestion menu whose items derive from the **Closed editor schema** (Standard blocks ∪ Installed manifest set), preserving that boundary (ADR-0015). Keyboard-flow insertion at the cursor without leaving the line. Prior art: TipTap `Suggestion` plugin (steven-tey/novel `slash-command.tsx`); item shape with aliases/groups (BlockNote).
- **Command palette + shortcut registry** — Cmd+K palette (e.g. `cmdk`) over library + editor actions with a discoverable shortcut cheat-sheet. Pure power-user convenience; pick up only if pilot consultants ask for it.

---

# Open items (still to resolve)

These were flagged during grilling but not pinned down. They must be resolved before or during v1 build:

### O-01 — Budget & developer hiring
Architecture memo §11 already flags this. A 6–12 month engineer commitment is needed. Business case must be written and approved before hire.

### O-02 — Doc-heavy vs deck-heavy weighting
Memo §11 — of the 40+/month volume, what's the actual split between flowing documents and decks? Affects whether the deck renderer should move earlier in the roadmap.

### O-03 — Pilot consultants — specific names
Three consultants matching the personas in D-33 need to be identified and committed.

### O-04 — Anonymization workflow
Skill example mentions client names being "anonymisable." How: at doc-creation toggle? At export time? Auto-redact via LLM? Not addressed in v1 architecture — likely needed.

### O-05 — Excel-paste UX detail for charts
D-24 says "Excel paste fills the grid" but the parsing rules (TSV vs CSV detection, handling merged cells, formatted numbers like "1.234,56" vs "1,234.56" per locale) need pinning down before M2.

### O-06 — Onboarding plan
How do consultants learn the system? Video walkthrough? In-app tour? Embedded help docs? Pilot can be informal but rollout to 30 needs a plan.

### O-07 — Devops/security audit depth
API key rotation, content sensitivity classification, audit logging (out of scope per D-32, but is *some* operational logging needed?), incident response, backup strategy beyond cloud sync.

### O-08 — RESOLVED — Half-day technical scan replaced by a perf-spike work package
**Resolution:** the scan's open questions are now four committed design decisions (D-35–D-38) and one ADR ([ADR-0001](adr/0001-no-iframe-sandbox-for-generated-blocks.md)), with a benchmark harness (D-39) as the durable artifact. See:

- **D-35** — Anchor scale (200 node-views, 10 charts per doc)
- **D-36** — No iframe sandbox; runtime watchdog + extended lint (ADR-0001)
- **D-37** — Lazy ECharts mount via IntersectionObserver
- **D-38** — Table block wraps `@tiptap/extension-table` with per-cell memoization + disabled column resize
- **D-39** — Perf spike deliverable: benchmark harness in `tests/perf/` + watchdog adversarial test + auto-generated results report; runs in CI

ECharts SSR for PDF export (the third item in the original scan) is captured in `reference/chart/Chart.tsx` (the exported `getEChartsOption` is the contract between the browser and SSR paths) and in M2 tasks T-57 (SSR pre-rendering).

### O-09 — Interactive HTML (v2) — what does it actually mean?
"Live models" is hand-wavy. When this becomes a v2 priority, it needs a concrete spec: what kind of interactivity (calculators? toggleable scenarios? embedded D3?), what user flows, what schema extensions.

### O-10 — RESOLVED — Cost-tracking is operational, not analytics
**Superseded (2026-05-29, ADR-0019):** moot — the cost ledger was removed; the app persists no usage/cost data and does not enforce a spend cap.

**Resolution (historical):** Carved out as a non-analytics exception. See D-32 (revised) and D-34. Per-consultant LLM spend is tracked in a local SQLite ledger under strict constraints (cost data only, no behavioral signal; 13-month retention; user-visible and user-wipeable). The legitimate-interest basis (GDPR Art. 6(1)(f)) covers it because the data is strictly necessary to enforce the monthly limits committed in D-14.

---

# How decisions connect to deliverables

| Layer / artifact | Decisions that shape it |
|---|---|
| `DOCUMENT_SYSTEM_ARCHITECTURE.md` Layer 0 (DocModel) | D-04, D-08, D-10, D-12, D-18 |
| `DOCUMENT_SYSTEM_ARCHITECTURE.md` Layer 1 (schema) | D-08, D-09, D-10, D-17 |
| `DOCUMENT_SYSTEM_ARCHITECTURE.md` Layer 2 (LLM) | D-11, D-12, D-13, D-14, D-34 |
| `DOCUMENT_SYSTEM_ARCHITECTURE.md` Layer 3 (editor) | D-06, D-07, D-24, D-25, D-26 |
| `DOCUMENT_SYSTEM_ARCHITECTURE.md` Layer 5 (rendering) | D-22, D-29 |
| `DOCUMENT_SYSTEM_ARCHITECTURE.md` Layer 6 (output) | D-19, D-22 |
| `BUILD_BRIEF.md` M1 | D-08, D-09, D-16, D-17, D-18 |
| `BUILD_BRIEF.md` M5 (comments) | D-12, D-25, D-26 |
| `BUILD_BRIEF.md` M6 (deck) | D-29, D-30 |
| `brand.example.yaml` | D-16 |
| `blocks.catalogue.yaml` | D-08, D-09, D-17 |
| Setup pipeline (new — Tauri install) | D-15, D-16, D-17, D-22, D-23 |
| Library UI | D-19, D-27 |
| Cloud-sync conventions | D-05, D-19, D-20, D-21 |

---

**End of decisions log.** When in doubt, this doc wins over the memo + brief; if a decision needs revisiting, edit here first and propagate.
