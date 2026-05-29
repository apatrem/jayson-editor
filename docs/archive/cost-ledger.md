# Archived: the cost ledger (deferred)

**Status:** removed from the app in the pre-release pivot. See
[ADR-0019](../adr/0019-drop-cost-ledger.md).

This file preserves the design knowledge for the **cost ledger** — a local SQLite
store of per-call LLM spend plus a monthly cap (D-14/D-34) — which was scaffolded and
then removed before release. It is kept so the feature can be revived later without
re-deriving the design.

## Why it was built, and why it was dropped

- **Built for:** enforcing D-14's monthly per-consultant spend cap (80% warning, 100%
  hard stop, admin override), justified under D-34/O-10 as operationally necessary,
  storing only cost-computation fields (no prompt/response content), 13-month retention,
  with View/Wipe/Disable controls.
- **Dropped because:** for a single trusted internal user with in-budget spend, the
  complexity (Rust SQLite + sink + cap enforcement + settings view + prune + doc
  attribution) and the persistent-file disclosure surface outweighed a modest guardrail.
  Spend is now governed by provider-side billing. Full rationale in ADR-0019.

## How to revive

The implementation was deleted in the `drop-cost-ledger` work (the commit titled
"Remove cost-ledger scaffolding (phase 1 …)"). Recover the modules from git history:
`src/cost-ledger/{db,limits,prune}.ts`, `src-tauri/src/ipc/cost.rs`,
`src/ui/settings/CostLedgerView.tsx`, the `CostLedgerSink` on `src/llm/client.ts`,
the install-time DB creation + cost prompts, and `costLimits` on `InstallAppConfigSchema`.
The reviewer-hardened plan to *activate* it end-to-end (with its 14 settled decisions)
is reproduced verbatim below.

---

# Appendix — the full "activate the ledger" plan (verbatim, for reference)

# Activate the LLM runtime + wire the cost ledger end-to-end

## Context

The app ships with a large, well-tested but **dormant** LLM + cost-ledger stack. Today
`LLMClient` is never instantiated in production, `DocumentView`'s `callLlm` prop is never
supplied, the entire comment-review UI (`ReviewPanel`, `ProposalCard`, `BatchSubmit`, …)
is built but **never mounted**, and the Rust cost IPC (`src-tauri/src/ipc/cost.rs`) is a
**stub** (all 4 commands are no-ops; no SQLite; the `CostLedgerRowInput` struct is even
missing `id`/`pricingSource`). The real SQLite code in `src/cost-ledger/db.ts` is
better-sqlite3 (Node-only) — unusable in the webview.

Goal: make the LLM runtime **active** for both consumers (authored-block generation **and**
comment-to-AI), record every call to a real cost ledger, **enforce** the monthly cap
(D-14/D-34), and surface LLM usage in an in-app **Settings** view. Reuse the existing
scaffolding; build new code only where genuinely missing (chiefly the Rust persistence layer).

This plan incorporates seven design decisions settled in a review-driven grilling (see
**Settled decisions** at the end), including a reviewer pass that caught real bugs/gaps.

## Architecture — runtime data flow

```
App boot
  └─ read_app_config (IPC) ─ loadRuntimeConfig()
        ├─ full config (has llm block)  ─► LLM AVAILABLE: new LLMClient({config:{llm}, keychain:get_secret, costLedger:sink})
        └─ M8 partial config (paths only) ─► LLM DISABLED: facade=null; features visible-but-disabled + "finish setup" hint

Cost sink:  enabled ? invoke("insert_cost_row",{row}) : no-op    (live flag from costLimits.enabled)

User action (generate block | submit comments)
  1. pre-flight cap:  validated listCostRows() ─► evaluateRowsAgainstMonthlyLimit(rows, costLimits)
        · disabled → allow · over hard cap → block · read/validate fails → ALLOW + visible warning (fail-open)
  2. client.call(modelKind, request)  ──► provider fetch ──► LLMResponse (provider usage)
  3. recordCost() ─► sink ─► insert_cost_row   (callKind: authored-block-generation | comment-batch | comment-single)

Settings → My LLM Spend
  validated listCostRows() ─► summarizeCostRows(rows,{monthlyUsdHard}) ─► CostLedgerView(rows, summary)
  View ▸ Wipe(clear_cost_history) ▸ Disable toggle ─► set_cost_tracking_enabled(bool)  [read-modify-write full config in Rust]
App launch ─► invoke("prune_old_rows",{cutoff: costLedgerRetentionCutoff().toISOString()})
```

All cost recording flows through `LLMClient.recordCost` → the single renderer sink → Rust, so
both consumers and all retries are captured uniformly, using **provider** token counts.

## Phase 1 — Rust SQLite persistence + IPC + config command

- **`src-tauri/Cargo.toml`** — add `rusqlite = { version = "0.32", features = ["bundled"] }`.
- **`src-tauri/src/ipc/cost.rs`** — replace the stub:
  - DB path via `app: tauri::AppHandle` → `app.path().app_config_dir()?/cost.db` (`use tauri::Manager`).
    `open_db(app)` runs a migration **mirroring `src/cost-ledger/db.ts` exactly** (v2 DDL with the
    same 11 columns + CHECK constraints, the two indexes, `PRAGMA user_version = 2`, no-op at v2),
    so the install-time better-sqlite3 DB and the runtime rusqlite DB are byte-compatible.
  - Extend `CostLedgerRowInput` with the missing `id: String` and `pricing_source: String`
    (camelCase wire names via the existing `#[serde(rename_all="camelCase")]`).
  - `insert_cost_row(app, row)` → INSERT 11 columns.
  - **new** `list_cost_rows(app) -> Vec<CostLedgerRowOutput>` → `SELECT * ORDER BY timestamp ASC, id ASC`;
    map to a camelCase Serialize struct matching TS `CostLedgerRow`; **omit `docId` when NULL** (never emit `null`).
  - `clear_cost_history(app)` → `DELETE FROM cost_ledger`.
  - `prune_old_rows(app, cutoff: String) -> i64` → `DELETE … WHERE timestamp < ?1` (cutoff is ISO, so
    the renderer reuses `costLedgerRetentionCutoff` from `prune.ts`).
  - **Remove** the unused `get_cost_summary` stub (summary is computed in TS via `limits.ts`).
  - Run via `tauri::async_runtime::spawn_blocking` (rusqlite is blocking).
  - **Tests** (temp-dir DB): insert→list round-trip; clear; prune deletes only pre-cutoff rows; a
    `PRAGMA table_info` assertion that the columns are exactly the 11 metadata columns (no-content invariant).
- **`src-tauri/src/ipc/config.rs`** — **new** `set_cost_tracking_enabled(app, enabled: bool)`:
  read the full config JSON, **validate it is a full config** — proceed only when `costLimits.enabled` already
  exists as a boolean; **reject M8-partial / malformed configs with a clear error** (never create the field).
  Then set `costLimits.enabled` and write the **whole** object back (atomic, reusing the existing write path) so the
  `llm` block can never be clobbered. Tests: missing `costLimits` → rejected; non-boolean/malformed `costLimits` →
  rejected; successful toggle preserves every other field (incl. `llm`).
- **`src-tauri/src/lib.rs`** — `generate_handler!`: keep `insert_cost_row`/`clear_cost_history`/`prune_old_rows`;
  **add** `list_cost_rows`, `set_cost_tracking_enabled`; **remove** `get_cost_summary`.

## Phase 2 — Runtime config + LLMClient + cost sink + cap facade

- **`src/cost-ledger/schema.ts` (new, renderer-safe).** Move the pure-Zod pieces out of `db.ts` —
  `CostLedgerRowSchema`, the `CostLedgerRow` type, `COST_LEDGER_COLUMNS`, and the call-kind / pricing-source enums —
  into a module with **no `better-sqlite3` / `node:*` imports**. `db.ts` imports them back (keeping its DB code);
  `limits.ts`, `client.ts`, `CostLedgerView.tsx` repoint their `import type` to `schema.ts`; the new `listCostRows()`
  **value-imports** `CostLedgerRowSchema` from here so the webview bundle never pulls Node-only code into it
  (the AGENTS.md "Node in renderer" hazard). No behavior change — pure module split + import repoint.
- **`src/llm/runtime-config.ts`** (new) — `loadRuntimeConfig()` invokes `read_app_config`, parses with
  `InstallAppConfigSchema`. If it lacks an `llm` block (an **M8 partial config**), return
  `null` / `{ llmAvailable: false }` — **never throw**. `boot.ts` is left unchanged (it still accepts both
  schemas for routing); only LLM init is gated on a full config.
- **`src/schema/meta.ts` — persisted `meta.docId` (doc attribution source).** Add optional
  `docId: z.string().uuid().optional()` to `MetaSchema` (structural widen; `schemaVersion` stays `1.0.0`).
  **Backfill behavior (P3):** on open, if `meta.docId` is absent, generate a UUID into the **in-memory** doc and
  **mark it dirty** so autosave persists it; **force a synchronous save before the first attributed LLM call** so no
  cost row ever references an unpersisted id; cost rows always use that same in-memory value. The runtime threads
  `docId` into **both** consumers' cost rows for D-34 per-doc reporting. Update `serialize`/round-trip + meta tests.
  (Schema + helper land here; the dirty / save-before-first-call wiring lands with the consumers in Phases 4–5.)
- **`src/llm/runtime.ts`** (new) — facade that owns the runtime LLM, created **only when LLM is available**:
  - Renderer **cost sink** `{ insertRow: (row) => isTrackingEnabled() ? invoke("insert_cost_row",{row}) : undefined }`
    (sends the full `CostLedgerRow`; the type structurally forbids prompt/response content).
  - One `LLMClient({config:{llm}, costLedger:sink})` (default keychain `get_secret`, default providers).
  - **`listCostRows()`** — validated IPC wrapper: `CostLedgerRowSchema.array().parse(...)` (schema value-imported from
    the renderer-safe `schema.ts`; all-or-nothing, **no row-dropping**; normalize a stray `docId:null → undefined`).
  - **`assertWithinCostLimit()`** — if tracking disabled → allow; else `listCostRows()` →
    `evaluateRowsAgainstMonthlyLimit(rows, costLimits)` (**crossing-based**, reusing `limits.ts`); throw
    `CostLimitExceededError` when blocked; **on read/validate failure → allow + return a "cap unverified" warning**
    (fail-open) and log loudly.
  - `callForCodegen(request, docId)` stamps `cost:{callKind:"authored-block-generation",docId}` and routes
    `client.call("codegen", …)`. `commentClient: BatchedCommentClient` routes `client.call(modelKind, …)`; the
    **`comment-batch` vs `comment-single` distinction is carried by the request's `cost` field** (plumbed through
    `toLLMRequest`/retry in Phase 5), not guessed by the facade.
  - `resolveModel(modelKind) → {model, provider}` (from `config.llm`) — lets the comment flow record the resolved
    model name on `ai-proposal` entries (responses carry only content/usage, not the model).
  - `isTrackingEnabled()` reads a **live in-memory flag** mirrored from `costLimits.enabled`; the Settings
    toggle updates it so no `LLMClient` rebuild is needed. Disabled ⇒ sink no-ops **and** enforcement allows.
- **Tests** (mocked invoke/fetch): sink payload only metadata; disabled ⇒ no insert + cap allows; crossing-based
  block; fail-open on unreadable ledger; validated wrapper rejects a malformed array wholesale.

## Phase 3 — Settings route + usage view + Disable control + launch prune

- **`src/ui/router/types.ts`** — add `{ kind: "settings" }`; intent to reach it (reuse `__set` or add `open-settings`).
- **`src/ui/router/Routes.tsx`** — reducer case + render branch + `onOpenSettings` handler + back action.
- **`src/ui/menu/MenuBar.tsx` + `FileMenu.tsx`** — add `onOpenSettings` + a "Settings / My LLM Spend" entry.
- **`src/ui/settings/SettingsView.tsx`** (new container, `LibraryView` injectable-deps pattern):
  - Fetch via `listCostRows()`; compute `summary = summarizeCostRows(rows,{monthlyUsdHard})`; render the
    existing **`CostLedgerView`** (unchanged — stays a pure presenter) with `rows`, `summary`,
    `onClearHistory = () => invoke("clear_cost_history").then(refetch)`.
  - **Disable cost-tracking toggle (mandatory, D-34):** a small "Cost tracking: on/off" section above the table;
    `onToggle = (next) => invoke("set_cost_tracking_enabled",{enabled:next})` then update the live flag + refetch.
  - **LLM-not-configured state:** when `loadRuntimeConfig` reports no `llm` block, show a "Complete LLM setup to
    enable spend tracking" empty state instead of an empty table.
  - **Row-validation failure:** show a clear "couldn't read cost history (data format error)" state (no partial render).
- **Launch prune (D-34):** in `App.tsx`/boot, fire-and-forget
  `invoke("prune_old_rows",{cutoff: costLedgerRetentionCutoff(new Date()).toISOString()})` once, log errors only.
- **Tests:** SettingsView maps rows→summary, renders CostLedgerView, clear+refetch; toggle calls the IPC and
  updates the flag; not-configured + error states; existing `CostLedgerView.test.tsx` still green.

## Phase 4 — Activate authored-block generation

- **`src/App.tsx`** — build the `runtime.ts` facade on mount (only if LLM available); thread
  `callLlm = (req) => runtime.callForCodegen(req, docId)` into `Routes` via `fileActions`.
- **`src/ui/router/Routes.tsx`** — add `callLlm` to `FileActionDeps`; pass to `WatchdoggedDocumentView`
  (prop already exists). When LLM unavailable, leave it undefined.
- **`src/ui/views/DocumentView.tsx`** — `handleGenerate` (≈434–461) already calls `callLlm`; add an
  `assertWithinCostLimit()` pre-flight, surface `CostLimitExceededError` + warnings (incl. the fail-open
  "cap unverified" warning) in the existing error/status UI. When LLM is unavailable, the **Generate**
  affordance is **visible-but-disabled with a discreet "finish setup" hint** (not hidden).
- **Tests:** generation triggers `client.call("codegen", …)`, records one `authored-block-generation` row,
  is blocked over the cap, and is disabled (with hint) on a partial config.

## Phase 5 — Activate comment-to-AI (mount the review surface)

The pipeline (`runBatchedCommentRequest`+retry, `applyPatch`, `acceptCommentProposal`, `commentToBatchedComment`)
and all UI components exist and are tested — this is wiring, plus one correctness fix.

- **Usage fix (P2#1):** in `src/llm/batch-comments.ts`, drop the **required `usage`** field from the model-response
  schemas (model returns only `results`) and take usage from the **provider** `response.usage` (already on
  `LLMResponse`). Stamp that provider usage onto `BatchedCommentResponse.usage` and the informational
  `ai-proposal` token counts. Make the **two shapes explicit**: the *raw model output* (`{ results }`, no `usage`)
  vs the *app-enriched* `BatchedCommentResponse` (`{ results, usage }`, provider-sourced). Rename/update
  `examples/sample-llm-batch-response.json` so it represents the **raw model output** (no `usage`) — not a model that
  self-reports tokens — and update `tests/llm-batch-comments.test.ts`. (The cost ledger already uses provider usage.)
- **`src/llm/comment-request.ts`** (new) — assemble a `BatchedCommentRequest` from the doc's `open` comments + a
  new `COMMENT_SYSTEM_PROMPT`, reusing `buildDocContext`/`buildBrandTokensContext` (from `generate-authored-block.ts`)
  and the schema-context string used by `generate-doc.ts`; uses `commentToBatchedComment` (`thread-context.ts`).
- **`src/ui/views/DocumentView.tsx`** — mount `ReviewModeToggle` + `ReviewPanel`/`InlineReview`/`DiffReview` +
  `BatchSubmit`, fed from `currentDoc.comments`. Inject `commentClient?: BatchedCommentClient` (from the facade
  via Routes/App, mirroring `callLlm`). When LLM unavailable → review actions **visible-but-disabled + hint**.
  - **Per-comment thinking toggle (D-11), ephemeral:** a per-comment fast/thinking choice in the review UI at
    submit time (not persisted in the doc); group the selected comments into **≤2 batches** by model kind. The
    model actually used is recorded in each `ai-proposal` entry's `model` field. No `Comment`-schema change.
  - `BatchSubmit.onSubmit` → `assertWithinCostLimit()` → `runBatchedCommentRequest(commentClient, input)` →
    append `ai-proposal` ThreadEntries (patch + model + provider tokens) → `setDoc` → autosave.
  - `onAccept`/`onReject` → `acceptCommentProposal`/`rejectCommentProposal` (`ApplyComment.ts` → `applyPatch`).
- **Cost-metadata plumbing (P1 fix).** `toLLMRequest` sets no `cost` today, so comment calls would mis-record as
  `generation` and the batch-vs-retry distinction is invisible at the client boundary. Thread a `cost:{callKind,docId}`
  through `toLLMRequest` / `runBatchedCommentRequest` / `retryInvalidPatch` / `buildRetryBatch`: **initial call →
  `comment-batch`, corrective per-comment retry → `comment-single`**. Recording then fires automatically in `recordCost`.
- **`ai-proposal.model` source (P2 fix).** Each `ai-proposal` entry requires a `model` string, but neither
  `LLMResponse` nor `BatchedCommentResponse` carries it. Use the facade's `resolveModel(modelKind)` to record the
  resolved endpoint model on the proposal (token counts come from provider usage, per the usage fix).
- **Tests:** mounting renders the panel from doc comments; submit calls the LLM, writes ai-proposals with
  provider tokens, records `comment-batch`/`comment-single` rows; accept applies the patch; over-cap submit blocked;
  fast/thinking selection produces ≤2 grouped batches.

## Phase 6 — Cross-cutting tests, gates, docs

- Full `npm test` + `cargo test --locked`; `tsc --noEmit`; `npm run lint`.
- **Docs (P3 + taxonomy reconciliation, decision (A)):**
  - **`docs/TYPES.md`** — §9: fix the file path (`src/cost-ledger/db.ts`), add the `pricingSource` enum field, and
    add `authored-block-generation` to the `callKind` enum so it matches the shipped schema exactly; document the new
    optional `meta.docId` on `MetaSchema`; and split the **raw model response** (`{ results }`) from the
    **app-enriched `BatchedCommentResponse`** (`{ results, usage }`, provider-sourced) so `usage` is no longer
    documented as model-emitted. Note the renderer-safe `src/cost-ledger/schema.ts` as the home of `CostLedgerRowSchema`.
  - **`docs/DECISIONS.md` D-34** — add a short **dated revision note**: the real `callKind` taxonomy is
    `{generation, comment-batch, comment-single, setup, authored-block-generation}` (labels by **operation**,
    superseding the original `comment-default`/`comment-thinking`); fast-vs-thinking comment spend is derived from
    the **`model` column**, not the callKind; cite ADR-0012.
  - **D-14 / `docs/privacy-notice.md`** — state the hard cap explicitly as **crossing-based**: "once recorded spend
    reaches the cap, the next call is blocked" (bounded one-call overshoot; 80% soft warning precedes). Confirm the
    notice's View/Wipe/**Disable** controls match the implementation.
  - **`docs/TAURI_IPC.md`** — update cost commands: `insert_cost_row`(+id,+pricingSource), **new** `list_cost_rows`,
    **new** `set_cost_tracking_enabled`, `prune_old_rows(cutoff)`, removal of `get_cost_summary`.
- New `T-IDs` in `docs/TASKS.md` are optional; if added they must be bundled with `STATUS.md`/`BLOCKERS.md`
  per the pre-commit hook — leave to the implementer.

## Reused (not rebuilt)

`src/llm/{client,providers,pricing}.ts` · `src/cost-ledger/{limits,prune}.ts` (pure, renderer-safe) ·
`src/llm/{batch-comments,thread-context}.ts` (with the usage fix) · `src/docmodel/patch.ts` (`applyPatch`) ·
`src/comments/*` (ReviewPanel, ProposalCard, BatchSubmit, ApplyComment, …) ·
`src/ui/settings/CostLedgerView.tsx` (pure presenter, unchanged) · existing `read_app_config`/`write_app_config`.

## Out of scope (flag, don't build)

- Replacing the install-time better-sqlite3 path (`src/cost-ledger/db.ts` stays for install + tests).
- Multi-consultant / ledger sync (D-23: one consultant per install).
- A literal pre-spend cost estimate (rejected — `maxTokens` is optional/unbounded; crossing-based is used).
- Real provider keys / live network in CI (tests mock `fetch`/`invoke`).

## Settled decisions (from the grilling)

1. **M8 partial configs stay valid** — graceful degradation: LLM init only when an `llm` block exists; otherwise
   features are **visible-but-disabled with a discreet "finish setup" hint**; `loadRuntimeConfig` returns null, never throws.
2. **Disable cost-tracking** is mandatory (D-34) — persisted via a **dedicated Rust `set_cost_tracking_enabled`**
   (read-modify-write the full config server-side, can't clobber `llm`); disabled ⇒ **no recording + no enforcement**;
   lives in the `SettingsView` container; historical rows stay viewable.
3. **Hard cap = crossing-based** (block the next call once recorded spend ≥ cap), explicitly documented; no pre-spend estimate.
4. **Comment usage from the provider**, not model-reported JSON — fix `batch-comments.ts` + fixture + test; stamp
   provider usage on `ai-proposal` entries (display); ledger already provider-sourced.
5. **Validate IPC rows** with `CostLedgerRowSchema.array()` (all-or-nothing); view shows an error state on failure;
   **enforcement fails open with a visible warning** when the ledger is unreadable.
6. **Docs match code (decision A)** — fix `TYPES.md §9`; update D-34 with a short **dated revision note**; no separate ADR.
7. **Per-comment thinking toggle is ephemeral** (chosen at submit, ≤2 batches by model kind, model recorded in the
   `ai-proposal`); no `Comment`-schema change.
8. **Per-doc attribution = persisted `meta.docId`** (optional UUID, lazy-backfilled on open/save). Rename-safe;
   path-derived and "omit docId" were rejected (they fragment / drop D-34 per-doc reporting).
9. **Comment cost metadata is plumbed through `toLLMRequest`/retry** — initial `comment-batch`, retry `comment-single`
   — fixing the latent "everything records as `generation`" bug at the client boundary.
10. **`ai-proposal.model` comes from a facade `resolveModel(modelKind)`** (config-derived), since responses don't carry it.
11. **`set_cost_tracking_enabled` validates the config** — toggles only when `costLimits.enabled` is an existing
    boolean; rejects partial/malformed configs; preserves all other fields (incl. `llm`).
12. **Renderer-safe `src/cost-ledger/schema.ts`** holds the pure-Zod `CostLedgerRowSchema` / type / columns; `db.ts`
    imports from it, so the renderer's value-import for validation never pulls `better-sqlite3`/`node:*` into the bundle.
13. **Two comment-response shapes are explicit** — raw model output (`{ results }`, no usage) vs app-enriched
    (`{ results, usage }`, provider-sourced); the fixture + `TYPES.md` reflect the split.
14. **`meta.docId` is force-persisted before the first attributed LLM call** (generate on open → mark dirty →
    synchronous save), so no cost row references an unpersisted id; rows use the in-memory value.

## Verification

1. `cd src-tauri && cargo test --locked && cargo build` — ledger persistence, config command, IPC; warning-free.
2. `npx tsc --noEmit` and `npm run lint` — clean.
3. `npm test` — new wiring tests + all existing `tests/cost-ledger/*`, `tests/llm-*`, `tests/review-panel.test.tsx`,
   `tests/comments-roundtrip.test.ts`, `CostLedgerView.test.tsx` green (incl. the updated batch-comments fixture/test).
4. End-to-end manual (real app, full config): run an authored-block generation and a comment batch (with a fast
   comment and a thinking comment) with a test key → confirm rows appear in **Settings → My LLM Spend**, the monthly
   total updates, "Clear history" wipes, the **Disable** toggle stops recording + preserves the `llm` block, and a
   call once spend ≥ cap is blocked. On an M8 partial config, confirm features are disabled-with-hint, not crashing.
5. Privacy: inspect `cost.db` after calls — only the 11 metadata columns, no prompt/response text.
```
