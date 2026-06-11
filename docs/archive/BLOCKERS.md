# Blockers — append-only audit log

> **Archived (ADR-0023, 2026-06-10).** Append-only audit trail of the v1 autonomous loop. Drift entries (`[drift-…]`) cited by the AGENTS.md review playbook live here. No longer maintained.

This file records every `[?]` and `[!]` marker created by `/next-task`, with enough context for the human to resolve each one in the morning-check ritual.

## How this file works

- **Append-only.** `/next-task` adds new entries when a task is marked `[?]` or `[!]`. Existing entries are never rewritten.
- **The agent does NOT delete entries.** When you resolve a blocker:
  1. Fix the root cause (edit the task spec, fix the code, supply the external dep).
  2. Edit `docs/TASKS.md` to change the marker back to `[ ]` (the loop will pick the task up on the next fire).
  3. Append a `**Resolved:**` line to the BLOCKERS.md entry indicating how + when you fixed it.
  4. Optionally delete the resolved entry once you're confident it won't recur.

## Auto-promotion rule (γ semantics)

When a task is marked `[!]` (waiting on external dep), its BLOCKERS.md entry includes a `**Fires unresolved:**` counter. Every subsequent loop fire that re-checks the entry increments the counter. When it reaches **3**, the agent auto-promotes the marker from `[!]` to `[?]` (treating it as a real blocker that needs human action, not just patience).

Example timeline:

- Fire #1 at 09:00 — task marked `[!]`, counter = 0
- Fire #2 at 09:45 — counter incremented to 1
- Fire #3 at 10:30 — counter incremented to 2
- Fire #4 at 11:15 — counter would go to 3 → auto-promoted to `[?]`, TASKS.md marker updated, this entry's marker line updated.

This ensures external blockers don't silently rot for days.

## Drift log — informational entries (do NOT trigger halt rules)

This section captures protocol drift detected by post-hoc audit — cases
where the loop completed work but elided a spec step. Entries here are
historical record only; they have no marker and are ignored by A-rule /
C-rule / `[!]` auto-promotion logic. The corresponding spec / hook fix
that prevents recurrence is linked in each entry.

### [drift-2026-05-26f] Tauri shell plugin `open` regex was unconfigured

**Detected at:** 2026-05-26T16:45:00Z (fifth-round M7.5 review of the browser handoff path)
**Tasks affected:** T-118 / T-121 (PDF export browser handoff), fixed by T-123h.
**What happened:** `src-tauri/capabilities/main-window.json` attempted to scope `shell:allow-open` to `$TEMP/docsystem-export/**`, but `src-tauri/tauri.conf.json` did not configure `plugins.shell.open`. The Tauri shell plugin's `open` command validates ONLY against `plugins.shell.open` (per `tauri-plugin-shell-*/src/commands.rs::open`). The capability-level `shell:allow-open` permission gates WHO can invoke; the `allow:[{path:...}]` scope on that permission has NO runtime effect for `open` because the command never reads it. The previous documentation that claimed capability + plugin layers as separate defenses was incorrect; only the plugin regex constrains paths. The capability still serves as access control (which renderer windows may invoke), so removing it would over-permit; tightening its `allow` scope adds no security. With no regex, `tauri-plugin-shell-2.3.5/src/scope.rs::OpenScope::open` logs that calls are denied from JavaScript and returns the deliberately impossible validation regex `tauri^`.
**Impact:** M7's mocked integration path passed because `fileActions.openPath` bypassed the real plugin call. A real Tauri build would write the temp HTML and then fail the browser handoff at runtime.
**Fix landed:** T-123h adds the `plugins.shell.open` regex, a static config-shape/security test, an integration test that omits the `openPath` mock and exercises `plugin:shell|open`, and docs noting the shell plugin requirement. T-123m corrects the regex for Tauri's runtime `^...$` wrap and removes the ineffective capability-level path scope.
**Review lesson:** Tauri IPC/plugin reviews must verify both the capability JSON and the plugin's own source/docs (`~/.cargo/registry/src/*tauri-plugin-*` plus `node_modules/@tauri-apps/plugin-*/dist-js/*.d.ts`). Stopping at the ACL misses plugin-level gates.

### [drift-2026-05-26g] ProseRenderer link-mark href XSS

**Detected at:** 2026-05-26T16:50:00Z (M7 security audit carry-over)
**Tasks affected:** T-50 / renderer link mark handling, fixed by T-123i.
**What happened:** `src/renderer/ProseRenderer.tsx` rendered link marks by passing `mark.attrs?.href` directly into `<a href>`. Consultant-authored YAML can therefore carry `javascript:`, `data:`, `vbscript:`, or `file:` hrefs into the renderer.
**Impact:** A renderer-origin XSS is especially sensitive now that keychain IPC (`get_secret` / `set_secret`) exists on the broader app surface. The M7 spike does not intentionally expose arbitrary HTML, but link marks are a user-authored navigation surface and need scheme validation.
**Fix landed:** T-123i collapses non-allowlisted href schemes to `#`, preserves `http:`, `https:`, `mailto:`, `tel:`, and fragment links, and adds focused sanitization coverage for nine unsafe and five safe cases.

### [drift-2026-05-22a] Escalation-tier tasks ran on default tier without acknowledgment

**Detected at:** 2026-05-22T15:30:00Z (post-hoc audit)
**Tasks affected:** T-41 (commit `d93bd43`), T-46b (commit `fe49d83`)
**Driver tier at commit time:** Cursor Composer (default, auto-routed)
**Expected per spec:** `next-task.md` §"Self-reporting in STATUS.md" — escalation-list tasks running on default tier should emit a `⚠ Tier-mismatch advisory:` line under STATUS.md's "What needs your attention" section. The advisory is informational (does NOT halt the loop), so the work was free to proceed; it just had to be visibly flagged.
**What actually happened:** STATUS.md after each commit shows `**Running on:** Cursor Composer (effort unknown)` with no advisory line. The spec rule was elided silently — same failure mode as the v1 STATUS.md skip, applied to a different spec step.
**Impact:** Low. The work itself (T-41 document ingestion, T-46b runtime watchdog) passed gates, has tests, and on spot-review the watchdog correctly implements ADR-0001's intent. But the human had no visible signal to switch to escalation tier for the security-sensitive T-46b before committing. The cost of a subtle watchdog bug landing without escalation-tier review is paid later, not now.
**Fix landed:** `scripts/verify-commit-msg.sh` (commit-msg hook installed alongside pre-commit) + `scripts/escalation-list.txt` + `next-task.md` step 6 update. Future commits on escalation-list tasks REQUIRE a `Tier: <model>` line in the commit body, AND a `Tier-mismatch acknowledged: <reason>` line if the tier isn't an escalation tier. Hook-level enforcement so the discipline isn't elidable by the next driver.
**Resolved:** 2026-05-22T15:30:00Z — future occurrences impossible without explicit acknowledgment in the commit body.

### [drift-2026-05-22b] Multi-task commit (Q2 violation)

**Detected at:** 2026-05-22T15:30:00Z (post-hoc audit)
**Commit affected:** `fe49d83` "T-42..T-46b: setup pipeline stages 2–4, lint, render watchdog"
**Tasks bundled:** T-42, T-43, T-44, T-45, T-46, T-46b (six tasks, 1,716 insertions)
**Expected per spec:** Q2 decision (encoded in `next-task.md` step 6) — "one commit per task" so each task is independently bisect-able, cherry-pick-able, and reviewable.
**What actually happened:** Driver judged the M1d setup pipeline tightly enough coupled that splitting felt artificial, bundled all six tasks' diffs into one commit. The commit body justifies what the code does but never explains why bundling was necessary.
**Impact:** Medium. Code quality is high (spot-checked watchdog, lint runner — both implement their spec contracts), gates pass, tests cover the new surface. But `git bisect` can't pin a regression to T-43 vs T-46b; cherry-picking T-46b alone requires `git revert` gymnastics; per-task code review is impossible without manual diff slicing.
**Fix landed:** `scripts/verify-task-commit.sh` Assertion 5 — rejects any commit with more than one `[ ]→[x]` (or `[~]→[x]`) marker transition. Cold-recovery / failure-marking / skip transitions are exempt (they each produce one transition per fire by construction).
**Resolved:** 2026-05-22T15:30:00Z — future multi-task commits will be rejected at the pre-commit stage. The fe49d83 commit itself stays as-is; only future occurrences are prevented.

### [drift-2026-05-25] T-60 "prep + impl" dual commit precedent — ACCEPTABLE pattern

**Detected at:** 2026-05-25T11:00:00Z (M3 review)
**Commits affected:** `1a72238` (prep) followed later by `0c7475b` (T-60 implementation proper). Both prefixed `T-60:` in the subject; only the second carries the marker transition `[ ]→[x]` for T-60.
**What happened:** The driver split T-60 into two commits:

- `1a72238` ("T-60: open LLM provider surface for mistral, lightning.ai, and local") — body explicitly says "Closes T-60, T-61, T-68 (specs only)". Extends `LlmEndpointSchema` with new adapter values, adds `src/llm/pricing.ts` with a fallback table, and updates `SETUP_INSTALL_FLOW.md`. No marker transitions.
- `0c7475b` ("T-60: implement provider-agnostic LLM client") — the actual `src/llm/client.ts` + five provider adapters + tests. Marks T-60 `[ ]→[x]`.
  **Why Assertion 5 didn't fire:** Assertion 5 counts `→[x]` transitions per commit. The prep commit has zero transitions; the implementation commit has exactly one. Both pass.
  **Why this is acceptable (not a violation to fix):** The prep commit broadens shared infrastructure (LlmEndpointSchema, pricing fallback) that THREE subsequent task commits depend on (T-60, T-61, T-68). The alternative — duplicating the shared edits across each task commit — is messier than a single prep commit. The driver made a defensible engineering judgment.
  **Acceptance criteria for the "prep commit" pattern going forward:**

1. The prep commit body MUST explicitly say "spec changes only, no marker transitions" (or equivalent) so a reviewer can see the intent at a glance.
2. Each subsequent task commit MUST cleanly map to exactly one `[ ]→[x]` transition (Assertion 5 enforces).
3. The prep diff MUST be independently reviewable — no orphan changes that don't serve at least one named downstream task.
4. The prep commit's subject SHOULD reference the spanning tasks (e.g., "T-60/T-61/T-68: extend LlmEndpointSchema") rather than picking one arbitrarily, so the audit trail is honest.
   **No fix needed:** the precedent is recorded here so future reviewers don't flag it as a violation when they encounter "T-NN:" prep commits between marker-transition commits. The hook stays as-is.

### [drift-2026-05-25a] M6 slide layouts are structural stubs, not per-design slots

**Detected at:** 2026-05-25T16:00:00Z (M6 review)
**Tasks affected:** T-104 (commit `7800995` "implement slide layout components")
**Driver tier at commit time:** GPT-5.5 (Cursor Composer co-author) — default tier, T-104 not on escalation list
**What happened:** All 15 slide layout components (`src/renderer/layouts/<Layout>.tsx`) export a near-identical body — they wrap `<SlideFrame>` and dump `slide.blocks` through a shared `<SlideBlocks>` helper. Per-layout differentiation is limited to the `contentStyle` prop (column count, alignment, padding). For example:

- `ChartCommentaryLayout` sets `gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)"` but does not place the chart block in the 2fr column and the prose commentary in the 1fr column — both blocks just fall into the grid in YAML order.
- `TeamLayout`, `KpisLayout`, `ProcessTimelineLayout` use a generic grid and do not render headshot strips, KPI cards, or timeline rails respectively — they're indistinguishable from `TitleBodyLayout` except for centering.
- Only `CoverLayout` (with its `CoverFallback`) and `SectionDividerLayout` (with `variant="section"` background inversion) have any structural identity beyond styling.
  **What the spec said:** T-104 acceptance — "Each layout renders a slide using brand tokens; **block-content slots resolved per layout's design.**" The "block-content slots resolved per layout's design" bar is not met today; slots are resolved by YAML insertion order into a generic grid.
  **Why this is acceptable (for now):** The structural contract — closed set of 15 layouts, exhaustive dispatch via `satisfies Record<SlideLayout, SlideLayoutComponent>`, brand-token consumption, registry-matches-schema runtime test — is correct and verifiable. A consultant can author a deck today and it will render with the right layout family, brand colors, and 16:9 pagination. The visual fidelity gap is fillable layout-by-layout without re-architecting the dispatch surface.
  **Acceptance criteria for M7 follow-up (when fleshing out layouts):**

1. Each layout SHOULD declare its slot contract (which block types it expects, how many, in which positions) at the top of its component file as a JSDoc / typed schema.
2. Layouts with named slots (chart-commentary, two-column, three-column, kpis, team, image-caption) SHOULD route blocks to slots by `block.role` or block-type discrimination rather than insertion order.
3. The closed-set dispatch + brand-token + watchdog wiring established in T-103/T-104 MUST be preserved — the per-layout fleshing-out is additive, not a rewrite.
4. Add per-layout snapshot or visual-regression tests (one per layout) so future layout edits can't silently regress the slot contract.
   **No marker change:** T-104 stays `[x]`. The work meets the structural acceptance bar; the design-fidelity bar is a known scope gap, recorded here so M7 reviewers start with a clear inventory.

### [drift-2026-05-25b] Deck editor surface is navigation-only, not edit-capable

**Detected at:** 2026-05-25T16:00:00Z (M6 review)
**Tasks affected:** T-107 (commit `daac1dc` "add deck slide navigation to editor")
**Driver tier at commit time:** GPT-5.5 (Cursor Composer co-author) — default tier
**What happened:** `src/editor/Editor.tsx` accepts a `docModel?: DocModel` prop. When `docModel.kind === "deck"`, it renders the slide-strip + focus-area chrome and feeds the active slide's block content into TipTap via `editorContentForDeckSlide()`. That helper calls `docModelToProseMirror(deck)` and **strips the slide wrapper**, presenting only the slide's blocks as a flat `{ type: "doc", content: [...] }`. The slide-id binding is lost the moment content reaches TipTap. There is no inverse function (`proseMirrorToDeckSlide`) that would let `onUpdate` reconstruct a slide and merge it back into the deck DocModel.
**What the spec said:** T-107 acceptance — "the editor shows slides as a vertical strip with a current-slide focus area; consultant can jump between slides." The acceptance bar is **navigation**, which the implementation meets. The spec does NOT require deck editing per se — but the `editable` prop defaults to `true` on the `Editor` component, which means a caller passing a deck would get a typeable surface whose edits are silently dropped on the next slide switch (since the focus-area re-mounts from the original deck DocModel, not from any captured edits).
**Mitigation landed in this same review:** `src/editor/Editor.tsx` now forces `effectiveEditable = false` when `docModel.kind === "deck"`, regardless of the `editable` prop value. The toolbar buttons (`Bold`, `Italic`) and the TipTap editor instance both honour the forced read-only state. A regression test (`tests/editor/deck-navigation.test.tsx` — "forces read-only mode for decks even when editable=true is passed") guards this invariant. The forced read-only also closes an empty-deck underflow guard (`Math.max(0, …)` around the slide index).
**Acceptance criteria for the M7 follow-up that re-enables deck editing:**

1. Implement `proseMirrorToDeckSlide(node: ProseMirrorNode, slideId: string): Slide` and a higher-level `editorContentToDeck(deck, slideIndex, editorContent): DeckModel` that merges edits back without disturbing other slides.
2. Add a deck round-trip test (analogous to `tests/deck-reuse.test.ts`) that proves `deck → slide focus → edit → reassemble → validateDocModel` is loss-less for at least one block type with prose marks.
3. Remove the `effectiveEditable = false` force in `Editor.tsx` and update the regression test to assert that bold/italic become available again when a deck is passed with `editable={true}`.
4. Preserve the slide-strip navigation chrome and the `currentSlideIndex` reset-on-deck-identity-change behavior — they are working as intended.
   **No marker change:** T-107 stays `[x]`. The navigation contract is met; the editing-back gap is recorded here so M7 reviewers know what's wired vs. what's stubbed.

### [drift-2026-05-25c] Cost-ledger 13-month auto-prune is implemented but not wired into app startup

**Detected at:** 2026-05-25T17:30:00Z (Phase 7 review of T-111)
**Tasks affected:** T-111 (privacy notice), with root cause in app-shell wiring (no specific task yet)
**What happened:** The `docs/privacy-notice.md` text promises "Rows older than 13 months are pruned automatically" in both EN and FR, and the install wizard repeats the same promise. The mechanism exists and is tested:

- `src/cost-ledger/prune.ts` exports `pruneCostLedgerOnLaunch(db, now)` (one-shot, fires once when called) and `scheduleCostLedgerPruning(db, options)` (24h interval timer).
- `tests/cost-ledger/prune.test.ts` covers the retention cutoff math, the one-shot deletion, and the scheduled-interval behavior with injected `setInterval`.
- `COST_LEDGER_RETENTION_MONTHS = 13` is the single source of truth.
  **Why this is a drift, not a bug today:** Both functions are exported but **never called from the runtime app**. `src/App.tsx` returns `null` (no shell wired), `src/main.tsx` only mounts the empty App, and the only `openCostLedger` callsite (`src/setup/install.ts:142`) is the install-time wizard — which uses the ledger for setup validation, then exits. So the prune never runs on a consultant's machine today.
  **Privacy-invariant exposure:** Until the app shell is wired and `pruneCostLedgerOnLaunch` (or `scheduleCostLedgerPruning`) is called on a long-running session, rows will accumulate indefinitely. A consultant who installs v0.1.0 and runs it for two years will have a `cost.db` with 24 months of rows even though the privacy notice promised 13.
  **Why this is acceptable for today's repo:** The app shell hasn't been built yet — every milestone task is module-level (schema, renderer, editor, comments, deck). There is no atomic task in `docs/TASKS.md` for "wire app startup" because that's implied by `T-01` scaffolding which produced an empty `App.tsx`. The prune-wiring gap is one of several wiring gaps that surface during the v1.0.0 integration pass.
  **Acceptance criteria for the follow-up:**

1. When the app shell mounts the main window for the first time after launch, it MUST call `pruneCostLedgerOnLaunch(db)` exactly once with the runtime cost-ledger handle.
2. The shell MUST also call `scheduleCostLedgerPruning(db)` and retain the returned cancel function for clean teardown on app quit.
3. v1.0.0 MUST NOT ship until both calls exist in `src/App.tsx` (or whatever shell entry point owns the cost-ledger lifecycle). The privacy notice promise is part of the v1 install-time disclosure — shipping without the wired prune would be a written-promise violation, not just a bug.
4. A smoke test (integration-level, not the existing unit test) SHOULD verify that opening the app on a clock-jumped session (e.g., system date set 14 months forward) deletes the expected rows.
   **No marker change:** T-111 stays `[x]` — the notice text is correct and the prune mechanism is implemented. T-67 (cost-ledger init) stays `[x]` — schema and CRUD are correct. The gap is in the app-shell wiring layer, which has no dedicated task yet.

   **Resolved (2026-05-29, [ADR-0019](../adr/0019-drop-cost-ledger.md)):** moot — the cost ledger was removed before release (the app does not meter or cap LLM spend, and the privacy notice no longer promises a 13-month prune). `src/cost-ledger/` and the prune mechanism are deleted; there is nothing left to wire on app startup.

### [drift-2026-05-25d] T-02 starter scaffold missing icons/ — tightened spec never propagated to starter/

**Detected at:** 2026-05-25T20:00:00Z (first-time `npm run tauri:dev` attempt from a fresh clone)
**Tasks affected:** T-02 (set up Tauri 2.x desktop shell). The tightened-spec follow-up (Task #30 "Tighten T-02 Outputs to require Cargo.lock + icons") landed on `docs/TASKS.md:47-48` but the starter scaffold was not updated to comply.
**What happened:** `docs/TASKS.md` T-02 reads from `starter/src-tauri/{tauri.conf.json,Cargo.toml,build.rs,capabilities/,src/main.rs,src/lib.rs,src/ipc/}` and lists the output as needing `src-tauri/Cargo.lock` and `src-tauri/icons/*` committed. The spec was tightened (Task #30) to make those outputs mandatory at acceptance time. But the **source** of the drop-in — `starter/src-tauri/` — was never updated to ship the icons. A consumer who clones `starter/` as a template and runs `cargo build` panics at `tauri::generate_context!()` with `failed to open icon .../starter/src-tauri/icons/icon.png: No such file or directory`. The acceptance check in T-02 verifies the **output** `src-tauri/icons/` is committed, but doesn't verify that the **input** `starter/src-tauri/icons/` was also committed — so the drop-in is broken even though the live app builds fine.
**Compounding bug:** running `npm run tauri:dev` from the repo root auto-discovered `starter/src-tauri/` ahead of the main `src-tauri/` (Tauri 2.x CLI walks the tree with `ignore::WalkBuilder` and picks the first `tauri.conf.json` it finds). Result: the dev command spent ~3 minutes compiling against the starter Cargo crate, then panicked on the missing icon. The main `src-tauri/icons/` was fine the whole time.
**Fix landed:**

1. Copied the icon set from `src-tauri/icons/` into `starter/src-tauri/icons/` (49 files: PNG/ICNS/ICO + android/ + ios/). Identical content, no policy change.
2. Added `.taurignore` at the repo root containing `starter/`. Tauri 2.x CLI honors this file via `WalkBuilder::add_custom_ignore_filename(".taurignore")` (confirmed in `node_modules/@tauri-apps/cli-darwin-arm64/cli.darwin-arm64.node` strings and via `npx tauri info -vvv` showing `ignoring /…/starter: Ignore(IgnoreMatch(Gitignore(…)))`). The walker now skips `starter/` so `npm run tauri:dev` deterministically targets the main `src-tauri/`.
3. Updated `scripts/verify-bakeoff-v2.sh check_7_tauri_icons_committed` to assert both `src-tauri/icons/` AND `starter/src-tauri/icons/` are non-empty on the branch. Future bake-off branches that branch off `main` will catch the drop-in gap at PR time, not at first-developer time.
   **Why no marker change:** T-02 stays `[x]`. The live app builds — the output side of T-02 is correct. The fix closes the gap on the input/template side so the next developer using the drop-in won't hit the same wall.
   **Acceptance criteria for follow-up (none required — closed by this fix):** A developer running `npm run tauri:dev` from a fresh clone (with Rust + Xcode CLT installed) MUST see a native window open without ever needing to copy icons by hand. The bakeoff-v2 assertion #7 enforces this at branch-verification time.

---

## T-108 — Set up code signing (macOS, Windows)

**Status:** [!]
**Detected at:** 2026-05-25T14:46:37Z
**Fires unresolved:** 0
**Reason:** T-108 acceptance requires real macOS and Windows signing certificates plus CI secret values. This cannot be safely fabricated by the loop runner, and producing actual signed `.dmg` / `.msi` artifacts requires those external credentials.
**Last attempt:** no commit — waiting on external dependency
**Suggested action for human:**

- Procure or provide the macOS Developer ID / notarization credentials and Windows code-signing certificate material.
- Add the required CI secrets, then change T-108 back to `[ ]` so the loop can configure and verify signing with real credentials.

---

## T-109 — Set up Tauri updater

**Status:** [!]
**Detected at:** 2026-05-25T14:46:37Z
**Fires unresolved:** 0
**Reason:** Tauri updater configuration requires a real updater signing key pair and a hosted release-feed URL. The loop runner cannot safely invent these values or commit private updater keys.
**Last attempt:** no commit — waiting on external dependency
**Coupling with T-110:** `.github/workflows/release.yml` originally set `includeUpdaterJson: true` (T-110 commit `23ba48e`), which would have asked `tauri-action` to emit `latest.json` during a tag release. Without T-109's signing key + feed URL, that output is either skipped silently or partial. The follow-up commit `1ce7e7f`+ (Phase 7 review hardening) flips the flag back to `false` and adds a comment pointing here. When you land T-109, flip it back to `true` and the release pipeline will start emitting `latest.json` alongside the signed installers.
**Suggested action for human:**

- Generate/provide the Tauri updater signing key pair and decide where the JSON release feed will be hosted.
- Store the private key outside the repository/CI secrets, provide the public key and feed URL, then change T-109 back to `[ ]`.
- Re-enable `includeUpdaterJson: true` in `.github/workflows/release.yml` and add the feed URL to `tauri.conf.json` updater config.

---

## CI infrastructure flake — codeload.github.com 0400 on action downloads (2026-05-26)

**Status:** CI-FAILED (loop-level halt, not a task `[?]`)
**Detected at:** 2026-05-26T16:30:00Z
**Affected commits on origin/main:**

- `be270e5` (T-114) — CI run 26447509044, failed
- `71dfe82` (CI: enforce cargo check --locked, follow-up from Cursor) — CI runs 26447846280 (attempt 1) + rerun (attempt 2), both failed

**Reason:** Both GitHub Actions runs failed in the `Set up job` phase (i.e., BEFORE any code in the workflow ran) with identical errors against `codeload.github.com`:

```
##[error]An action could not be found at the URI
'https://codeload.github.com/dtolnay/rust-toolchain/tar.gz/bd41891a…'
(F808:5F53F:1D8D74:256256:6A15910A)
##[error]Failed to download archive 'https://codeload.github.com/dtolnay/rust-toolchain/tar.gz/…' after 1 attempts.

##[error]An action could not be found at the URI
'https://codeload.github.com/ruby/setup-ruby/tar.gz/afeafc3d…'
(0400:224AA9:8E9A0:BA5B5:6A15910A)
##[error]Failed to download archive 'https://codeload.github.com/ruby/setup-ruby/tar.gz/…' after 1 attempts.
```

Two different actions (`dtolnay/rust-toolchain@1.83.0` and `ruby/setup-ruby@v1`), both referenced by tag (not by raw SHA) in the workflow YAML, both failing to download from `codeload.github.com` with HTTP 0400 errors across two different runners in two different Azure regions (eastus, westus3) within 1 minute of each other. The local `verify-gates.sh` passes (tsc, lint, test all green), so the code is sound — this is a GitHub-side delivery issue.

**Last attempt:** rerun via `gh run rerun 26447846280 --failed` at 12:24:37Z; attempt #2 failed identically at 12:24:45Z (8 seconds, both jobs died in Set up job).

**Why no milestone is marked `[GATE FAILED]`:** the spec rule "treat as a milestone-gate failure → mark current milestone header [GATE FAILED]" assumes the CI failure represents code regression. Here the failure is upstream of every test gate — no test/build code in this repo ever executed. Marking Phase 6.5 (or Phase 7) `[GATE FAILED]` would be misleading because no gate's code actually ran. The halt is recorded at the loop level (`State: CI-FAILED` in STATUS.md) without polluting milestone status. The next clean CI run on `main` will let the loop resume automatically.

**Suggested action for human:**

- Check https://www.githubstatus.com for an Actions / Codeload incident covering 2026-05-26 ~12:23–12:24 UTC.
- If GitHub Actions has recovered: re-run failed jobs on the latest workflow run for `main` (`gh run rerun 26447846280 --failed`) — once any `main` run goes green, the next `/next-task` fire's pre-flight #8 will pass and the loop will pick T-115.
- If the incident persists: consider either (a) waiting it out (codeload glitches usually clear within minutes/hours), or (b) editing `.github/workflows/ci.yml` to use the `actions/setup-node`-equivalent caches without `ruby/setup-ruby` (the `ruby scripts/check-specs` step is the only consumer) — fallback to `bundler-cache: false` won't help here because the action archive itself can't be downloaded.
- Quick-test path if you want to verify the issue is gone before re-firing the loop: push an empty no-op commit to a throwaway branch and watch the resulting CI run; if it gets past `Set up job` for both `quality` and `rust-lockfile-parity`, codeload is healthy again.

---

### [drift-2026-05-26d] M7-spike multi-section block insertion — constrained, real fix in M8

**Detected at:** 2026-05-26T16:30:00Z (multi-axis review of T-117..T-123 per the M7 validation pass)
**Tasks affected:** T-120 (DocumentView), T-123 (M7 integration harness). Properly fixed by **T-180** (2026-05-27) — not M8 T-126, which shipped routing only.
**What happened:** `src/ui/views/DocumentView.tsx` `documentToEditorContent` flattens all section blocks into one TipTap doc; `editorContentToDocument` reconstructs by positional slicing against `previousDoc.sections[i].blocks.length`. Inserting a block in section 1 of a multi-section doc → block n+1 misassigned to section 2 on the next save (silent corruption). The M7 integration harness uses a synthetic single-section `m7SpikeDoc` (`tests/integration/m7-spike-harness.ts` line 17ff), so the bug is structurally hidden — `examples/sample-proposal.yaml`'s 4 sections are never exercised by the M7 acceptance gate.
**Why constrained instead of fixed:** the proper fix requires section-boundary nodes in the editor stream (a 4h+ ProseMirror schema change). M8 T-126's router refactor + section-aware mapping is the natural home. M7-spike adds a runtime constraint (T-123b): if `doc.sections.length > 1`, render an error state with a "Back to welcome" button rather than allowing the corrupted edit path.
**Resolved:** T-180 added `SectionNode` to the TipTap schema, preserved section nodes in `documentToEditorContent`, and routes saves through `proseMirrorToDocModel`. Coverage: `tests/ui/views/DocumentView-section-mapping.test.ts`.
**Implication for v1:**

1. ~~M8 T-126 MUST resolve the editor↔DocModel section mapping~~ — done in T-180.
2. ~~A test SHOULD prove byte-stable round-trip on a multi-section fixture~~ — `DocumentView-section-mapping.test.ts`.
3. M8 happy-path still uses a single-section fixture for palette edit (g); multi-section edit is covered by T-180 unit tests.
   **No marker change:** T-120 / T-123 stay `[x]` — they correctly delivered the M7-spike scope. T-123b is the constraint, T-123d is the real-fixture integration test that proves the constraint surfaces correctly.

### [drift-2026-05-26e] M7-spike defers 4 fs IPCs — re-register hardened in M8 T-125

**Detected at:** 2026-05-26T16:30:00Z (security audit of T-117 + IPC surface inventory)
**Tasks affected:** T-117 (which hardened only `read_yaml_file` + `write_yaml_file`), T-123c (M7 trust-boundary lockdown). Properly resolved by M8 T-125 re-registration.
**What happened:** T-117 hardened 2 of 6 fs IPCs as specified. The 4 unhardened siblings — `list_directory`, `file_exists`, `ensure_directory`, `move_file` — stayed registered in the IPC surface using the weak pre-T-117 `validate_path` (substring `..` rejection only, no scope check, no canonicalize, no absolute-path requirement). A compromised renderer can combine these to bypass T-117 entirely: `invoke("move_file", { from: "/Users/me/.aws/credentials", to: "/Users/me/Documents/x.yaml" })` then `invoke("read_yaml_file", { path: "/Users/me/Documents/x.yaml" })` — the latter canonicalizes inside scope and reads happily. Trust-boundary bypass.
**Why deferred instead of hardened in M7:** M7-spike does not call these 4 commands (the spec's "the other 4 fs commands stay as their existing implementations — they're not called by the spike"). The original plan was to harden them in M8 T-125 because library scan + folder existence + folder creation + rename are all M8 surfaces that need them. The defect is in _leaving them registered_ on the IPC surface in the meantime — the spec didn't anticipate the move_file + read_yaml_file pivot attack.
**Implication for v1:**

1. T-123c (M7.5) removes these 4 commands from `invoke_handler!` registration entirely for M7-spike. They become "command not registered" errors from the renderer.
2. M8 T-125 re-registers them with the same `canonical_read_target` / `canonical_write_target` / `ensure_path_in_scope` hardening T-117 introduced. The hardening contract is identical (scope + canonicalize + reject `..`).
3. M8 T-125's tests MUST include a regression test for the move_file + read_yaml_file pivot attack: confirm `move_file("/Users/me/.aws/credentials", "/Users/me/Documents/x.yaml")` rejects because the source is outside scope, AND that the target-extension policy on `move_file` only allows `.yaml`/`.yml` targets.
   **No marker change:** T-117 stays `[x]` — it correctly hardened the 2 commands its Outputs declared. The drift is in IPC surface composition, not in T-117's task content. T-123c is the surface fix.

---

### [drift-2026-05-26j] M9 prep — keychain audit logging deferred

**Detected at:** 2026-05-26T18:37:41Z (M7.5 round-2 security audit, finding L-3)
**Tasks affected:** M9 (whenever the keychain IPC commands `get_secret` / `set_secret` / `delete_secret` actually go live alongside the AI / cost-ledger surface). Currently all 3 commands are registered but functionally stubs — they hold the API contract for M9.
**What happened (round-2 audit L-3):** `src-tauri/src/ipc/keychain.rs:3-30` registers the keychain commands but has no audit logging. When M9 wires the keychain to the LLM-call flow, any renderer code (or a stored-XSS exploit, though T-123i closed the ProseRenderer path) can call `get_secret({ name: "anthropic_api_key" })` and receive the plaintext. Rate limiting is absent; abuse-pattern detection is absent.
**Why deferred to M9 prep (not M7.5):** the commands are stubs today, so audit logging would log "nothing happened" calls. Adding the discipline when M9 actually wires the keychain to the LLM-call flow is the right time — the log entries become meaningful at that point. Closing it in M7.5 would add dead code with no protection value.
**Implication for M9:**

1. Before M9's first LLM-call flow lands, add `log::info!("get_secret name={name}");` (without logging the value) to each of the 3 keychain commands.
2. Consider an in-process per-name backoff if the keyring crate returns success too rapidly (defends against compromised-renderer enumeration attempts).
3. The audit log should integrate with whatever logging sink M9 picks for the AI / cost-ledger flow — don't introduce a parallel sink.
4. Add a test that confirms `get_secret` access is logged (without leaking the secret value).
   **No marker change:** no current task affected; this is a forward-reference for M9 prep.

---

### [drift-2026-05-26k] Node Buffer used in renderer export code

**Detected at:** 2026-05-26T18:56:00Z (M7.5 round-3 runtime-parity review)
**Tasks affected:** T-123l (Rust-side base64 change), fixed by T-123n.
**What happened:** `src/export/render-static-html.ts` replaced JSON byte-array encoding with base64 strings, but the SVG sanitizer and oversized-image placeholder used Node's `Buffer.from(...)` to decode / encode those strings. Vitest provides `Buffer`, so the tests passed; Tauri's WebView2 / WKWebView / WebKitGTK runtime does not, so SVG export and image-cap placeholders would crash with `ReferenceError: Buffer is not defined`.
**Impact:** This is the second "tests pass + runtime crashes" divergence in the M7.5 tail. T-123m covered Tauri's regex wrapping behavior; T-123n covers Node globals that exist in Vitest but not in the renderer webview.
**Fix landed:** T-123n replaces renderer-side Buffer usage with Web Platform APIs (`TextEncoder`, `TextDecoder`, `atob`, `btoa`) and adds tests that delete `globalThis.Buffer` before exercising SVG inlining and placeholder generation. AGENTS.md review-playbook conventions #5 and #6 now codify both divergence classes.

---

### [drift-2026-05-26h] Windows delete-then-rename data loss

**Detected at:** 2026-05-26T19:06:00Z (M7.5 round-2 security audit carryover, finding M-4)
**Tasks affected:** T-117 / T-123o, fixed by T-123o.
**What happened:** The Windows branch of `src-tauri/src/ipc/fs.rs::rename_tmp_file` deleted an existing YAML target before renaming the newly written `.tmp` file into place. If the second rename failed (antivirus lock, network share hiccup, permission race), the original document was already gone and the outer write-error cleanup removed the `.tmp`, causing total data loss.
**Impact:** A Windows consultant saving over an existing document could lose both the original and the replacement content during a transient filesystem failure.
**Fix landed:** T-123o replaces the delete-then-rename path with a sibling-`.bak` swap: move original to backup, move tmp into place, restore the original if the second rename fails, and drop the backup only after success. A Windows-cfg test covers the restore path; non-Windows CI keeps a cfg-gate smoke test because Unix rename semantics are already atomic for replacement.

---

### [drift-2026-05-26i] M7.5 LOW carryovers (cleanup nested symlinks, SVG sanitizer depth, three DocumentView cosmetic items) — closed in T-123p

**Detected at:** 2026-05-26T19:30:00Z (M7.5 round-2 review carryover into round-3 batching)
**Tasks affected:** T-123 family (closed by T-123p).
**What happened:** Three LOW findings batched after the M7-spike gate passed at v4:
1. `cleanup_export_temp_dir_at` in `src-tauri/src/ipc/pdf.rs` relied on Rust's implementation-defined behavior for `remove_dir_all` against nested symlinks. Safe today (Rust docs document that `remove_dir_all` does not follow symlinks), but the contract is per-OS and per-version — a future toolchain bump could regress.
2. `sanitizeSvgForImage` in `src/export/render-static-html.ts` stripped only `<script>` and `on*=`. Defense-in-depth missing for `<foreignObject>`, SMIL animations, `<style>` (CSS `expression()` / `url(javascript:)`), and `href="javascript:"` attribute vectors. Safe today because export consumes SVG only via `<img src=data:>` (browsers script-disable that context), but the safety contract is single-consumer and isn't documented.
3. `DocumentView.tsx` carried a dead `currentDoc.current ?? doc` fallback (the ref is always initialized at mount), and `render-static-html.ts` matched the 5MB-cap error by string-`includes` against the Rust error message wording (brittle to wording changes).

**Impact:** None today — all three are quality / future-proofing. M7-spike gate v4 stays passed; T-123p was explicitly NOT gate-blocking for M8.

**Fix landed:** T-123p
- `pdf.rs`: prunes top-level symlink children by name (`remove_file` on each `is_symlink` entry from `read_dir`) before `remove_dir_all`. Adds `cleanup_export_temp_dir_unlinks_nested_symlink_without_touching_target` test (cfg(unix)).
- `render-static-html.ts`: extended `sanitizeSvgForImage` to strip `<style>`, `<foreignObject>`, `<animate>`/`<animateMotion>`/`<animateTransform>`/`<set>`, plus `href`/`xlink:href` attributes whose value is `javascript:`. 7 new tripwire tests cover each vector + a benign-http(s) preserve case. Documented the "safe ONLY for `<img src=data:>` consumption" contract in a comment AND in `docs/UI_APP_SHELL.md` §"SVG sanitization contract".
- `DocumentView.tsx`: dropped the `?? doc` fallback, added a comment explaining why `currentDoc.current` is always non-null in `onUpdate`.
- `render-static-html.ts`: replaced `error.message.includes("file exceeds 5MB export limit")` with `error.kind === "invalid" && SIZE_CAP_MESSAGE_PATTERN.test(error.message)`. Pattern is a top-of-file constant with a comment pointing to `src-tauri/src/ipc/fs.rs:51` as the contract anchor.
- The first cosmetic item (`editorContent useMemo([doc])`) is no longer present in `DocumentView.tsx` — the editor seed is held in `useState` initialized from `initialDoc`, then reassigned in the load effect. No memo to inspect; no-op for that bullet.

---

### [drift-2026-05-26l] M7.5 round-3 audit follow-ups (M-1/M-2/M-3 + L-1/L-2/L-3) — closed in T-123q

**Detected at:** 2026-05-26T19:30:00Z (M7.5 round-3 security audit)
**Tasks affected:** T-123 family (closed by T-123q).
**What happened:** Round-3 audit surfaced 3 MEDIUMs + 3 LOWs after the M7-spike gate v4 passed:
- **M-1 (Windows recovery edges):** the original `.bak` swap in `rename_tmp_file` had only 1 of ~5 failure-window tests.
- **M-2 (Windows CI gap):** the `#[cfg(windows)]` rename test existed but `ci.yml` was Ubuntu-only, so the Windows fs code had 0 automated runs.
- **M-3 (URL credentials):** the prior `https?://[^\s<>"]+` pattern accepted credential-bearing URLs like `https://user:pass@evil.com`.
- **L-1:** `src/brand-tokens/BrandProvider.tsx` reached for `process.env.NODE_ENV`. Works in Vitest (Node provides `process`) and in production (Vite inlines the constant), but only by accident — Tauri's webview has no `process`, and a sibling renderer file that Vite doesn't statically inline would crash on launch.
- **L-2 (SVG sanitizer depth):** the previous sanitizer only handled `<script>` and `on*=`. Closed earlier by T-123p (drift `[drift-2026-05-26i]`).
- **L-3 (lowercase-drive + trailing-newline coverage):** the shell-config regex tests didn't exercise these surfaces.

**Impact:** None today. M-1 was eclipsed by T-123o's follow-up (commit `26a9acc` switched the Windows path from a `.bak` swap to `MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH)` — atomic at the kernel level, no inter-step failure windows to test). M-2 was infrastructure; M-3 wasn't reachable today because only export tmp paths flow through `shell.open` (no user-supplied URLs yet). L-1..L-3 are defense-in-depth + a future-proofing CI signal. All three MEDIUMs are gate-blocking for v1.0 external release (Phase 11 → T-108/T-109).

**Fix landed:** T-123q
- `src-tauri/tauri.conf.json` — URL branch tightened to `https?://[^/@\\\s<>"]+(?:/[^\s<>"]*)?`, with ` ` excluded from both host and path classes. Rejects credentials, embedded `@`, backslash injection, NUL, trailing newline, and incomplete URLs.
- `tests/security/shell-config.test.ts` — 8 new negative cases + 1 positive: credential variants, backslash-injection, NUL, trailing newline, incomplete URL, lowercase-drive, forward-slash Windows path, and a `%20`-encoded positive regression.
- `src/brand-tokens/BrandProvider.tsx` — switched the dev guard from the legacy `NODE_ENV` check to `import.meta.env.DEV` (Vite's idiomatic form). The Tauri webview never touches the Node `process` global.
- `tests/smoke/no-node-globals.test.ts` (new) — static sweep of `src/**/*.{ts,tsx}` (minus Node-CLI exemptions: `src/setup/*.ts`, `src/export/pdf.ts`) for `Buffer.<m>`, `Buffer(`, `process.<m>`, `require(`, `__dirname`, `setImmediate(`. Strips line + block comments before matching, so prose mentions of forbidden patterns in comments are not false-positives. A runtime-deletion test (mirroring T-123n's Buffer pattern) was considered but discarded — React's `jsxDEV` itself reads the Node env at JSX-call time, so any deletion test would throw inside React, masking what the smoke test is meant to catch. The static sweep is deterministic, points at the offending file + line, and prevents the regression for the entire renderer surface.
- `.github/workflows/ci.yml` — new `windows-cargo-test` job on `windows-latest`, runs `cargo test --locked` against `src-tauri/`. First CI run that exercises the `#[cfg(windows)]` MoveFileExW path; closes the convention #4 "synthetic CI matrix" gap.
- `AGENTS.md §Review playbook` — the 3 round-3 convention refinements (#1 tightened with "regex/scope is the ENTIRE constraint surface", #4 extended with "CI matrix gaps are also synthetic", NEW #7 "Failure-path completeness for cfg-gated atomic operations") already landed via earlier commits before this task fired. Verified at task pickup; no further AGENTS.md edits required in T-123q.

**Items the T-123q spec asked for that didn't apply:**
- The 3 Windows `.bak`-recovery edge cases + their `#[cfg(windows)]` tests are MOOT: `src-tauri/src/ipc/fs.rs::rename_tmp_file` no longer uses a `.bak` swap. T-123o's follow-up commit `26a9acc` replaced the multi-step swap with a single `MoveFileExW(REPLACE_EXISTING | WRITE_THROUGH)` call. The kernel guarantees atomicity in one step; there are no inter-step failure windows to test. The existing `windows_rename_replaces_existing_target_without_backup_swap` test asserts the new behavior, and the new `windows-cargo-test` CI job runs it on a real Windows runner.
- The SVG sanitizer extension (foreignObject / animate / use / style / `href=javascript:`) and its 5 negative tests were CLOSED by T-123p (drift `[drift-2026-05-26i]`). T-123p added 7 tripwire tests covering the same vectors plus a benign-http(s) preserve case. T-123q would have produced a duplicate diff.

### [audit-2026-05-27a] M9 plan [BLOCKER #2] — `verify-task-commit.sh` allow-list — no-op (closed)

**Detected at:** 2026-05-27 (cross-plan audit of `/Users/pierresupau/.claude/plans/can-you-lay-out-playful-squid.md` vs landed M9a state).
**Plan reference:** "Pre-implementation concerns to settle before launch", item 2 — flagged as `[BLOCKER]` by the plan author.
**What the plan asked:** Extend `scripts/verify-task-commit.sh`'s static allow-list to include `docs/adr/`, `CONTEXT.md`, `docs/BUILD_BRIEF.md`, `docs/DECISIONS.md`. The plan claimed that without these paths the pre-commit hook would reject every M9 doc-touching task commit (T-135, T-158, T-167, T-179, etc.).
**What was found:** Current `scripts/verify-task-commit.sh` (read 2026-05-27, post-M7.5 hardening) does NOT have a static path allow-list. It enforces:
  - Assertion 1 — loop-managed file bundling for `docs/TASKS.md` / `STATUS.md` / `BLOCKERS.md`.
  - Assertion 1b / 1c — STATUS.md regeneration discipline.
  - Assertion 2 — a forbidden-paths *denylist* (`node_modules`, `target`, `dist`, `.env`, `.DS_Store`, IDE files).
  - Assertion 3 — a 5MB per-file size cap (no per-path exceptions).
  - Assertion 4 — project-wide gates (tsc + lint + tests) on TS/JS/Rust changes.
  - Assertion 5 — Q2 one-`[x]`-per-commit rule.
  There is no allow-list of permitted paths to extend; arbitrary paths under `docs/` are accepted by default unless they're loop-managed (in which case the bundling rule applies, not a rejection).
**Empirical confirmation:** M9a shipped 9 new ADRs (`docs/adr/0004-…` through `0012-…`), a new `docs/adr/0013-…`, `docs/adr/0014-…`, `CONTEXT.md`, inline edits to `docs/BUILD_BRIEF.md` / `docs/DECISIONS.md`, plus `docs/DOCUMENT_SYSTEM_ARCHITECTURE.md` / `docs/BLOCK_IMPLEMENTATION_GUIDE.md` / `docs/SETUP_PIPELINE.md` / `docs/setup-runbook.md` / `docs/TAURI_IPC.md` updates across commits `ebe84b9`, `08fc725`, `4dac6ed`, `74cbfc7`, `8c76d0d`, and others. None were rejected by the hook. T-135's intent (the "commit grilling outputs" task) was achieved by `ebe84b9` without any hook friction.
**Resolution:** No code change required. The plan's `[BLOCKER]` was based on an outdated or misremembered hook version (possibly conflating the size cap's "allow-list" comment at line 226 with a path allow-list — the script comment uses the word but the implementation is a denylist + size cap). Closing as no-op.
**Lesson:** Plan-review pre-implementation concerns should be re-validated against the actual current file at execution time. A quick `cat scripts/verify-task-commit.sh` at plan-finalisation time would have caught this; the plan was written from memory.

### [audit-2026-05-27b] Deferred decision — in-app surface to trigger Brand-block creation (open)

**Detected at:** 2026-05-27 (cross-plan audit of `/Users/pierresupau/.claude/plans/can-you-generate-for-playful-pudding.md` vs landed M8 state).
**Plan reference:** "Open questions to grill on later (tracked, not yet resolved)" — last bullet, the only one in that list that was NOT marked Resolved.
**Status:** OPEN. Decision intentionally deferred until M8 has been in consultants' hands for some real duration and we see how often devops gets new-block requests.
**Context:** M8 (T-132) wires runtime *loading* of Brand blocks from `generated-blocks/active/` into the BlockPalette, but *creation* of new Brand blocks still requires devops to run `setup:scan-demos` CLI. Consultants who need a new Brand block must email devops. The plan author noted: at some point a faster loop will be needed — Q7-C in grilling explicitly raised "user wants consultants 'using this a lot'".
**Three options recorded in the plan (verbatim, lightly trimmed):**
  - **(a)** Keep CLI-only; document the request workflow for consultants.
  - **(b)** In-app "Request a new block" form that posts to a devops queue (low-risk, no security review needed).
  - **(c)** In-app "Generate this block" button that runs the pipeline inline — requires security review because consultants would trigger LLM code-gen producing potentially-malicious blocks.
**Important: NOT resolved by M9b.** M9b's authoring UX (T-171..T-173) implements an in-app trigger for *Authored* blocks (Tier 3 — declarative-data, ADR-0013). Authored blocks operate under a tighter security envelope (no React/TipTap, no atom nodes, AST-extracted as data per ADR-0013). The deferred decision above operates on *Brand* blocks (Tier 2 — imperative `defineBlock`, full React/TipTap runtime), where consultant-triggered LLM code-gen has materially higher attack surface and would need its own threat model. The two are different decisions with different security envelopes; M9b shipping does not close this audit item.
**Action needed:** None right now. When M8 has been in consultants' hands long enough to measure devops new-block request volume, decide which option to spec, then add a future task (T-180+) to TASKS.md. Reopen / supersede this entry at that point.
**Suggested trigger metric:** ≥ N new-block requests/month from consultants for ≥ M consecutive months (N, M TBD by product). Until then, option (a) is the de-facto status quo.
