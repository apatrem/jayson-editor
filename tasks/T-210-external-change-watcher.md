# T-210: External-change watcher — auto-reload clean, prompt dirty (D-40)

<!-- Provenance: D-40 in docs/DECISIONS.md (grilling 2026-06-10; lands with PR #6). Not from the archived backlog. -->

## Objective
Doc folders live in a cloud-sync root, so another machine or an external agent can rewrite files under the open app; with mandatory autosave, a stale in-memory DocModel silently clobbering newer synced bytes is a data-loss path. Implement D-40: a Rust-side `notify` watcher on the open doc folder + the library root, emitting a `file-change` event; the frontend auto-reloads when the in-memory doc has no unsaved delta, and prompts **Reload from disk / Keep mine** when dirty. No auto-merge. Library-root events refresh the library index.

## Acceptance criteria  (must be machine-checkable)
- [ ] Rust watcher emits `file-change { kind, path }` for create/modify/delete under watched roots, debounced (~500ms per path); modify on a now-missing file reclassifies as delete → Rust unit tests in `src-tauri/src/`
- [ ] Frontend on `file-change` for the open DocModel: clean → reload + toast; dirty (within autosave debounce window) → prompt with Reload / Keep mine; Keep mine lets the next autosave overwrite → `tests/` with mocked event payloads (JSON shape, not Error instances — see AGENTS.md review playbook)
- [ ] Library-root events trigger an index refresh → library test
- [ ] `docs/TAURI_IPC.md` documents the event + any start/stop watch commands
- [ ] Shared-data folder is NOT watched (explicit non-goal assertion)
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src-tauri/Cargo.toml` (`notify` v6), new `src-tauri/src/watcher.rs` (or `ipc/watch.rs`), `src-tauri/src/lib.rs` (registration)
- Frontend: open-doc state (dirty tracking vs autosave), reload prompt UI, `src/library/index-builder.ts` refresh hook
- `docs/TAURI_IPC.md`

## Out of scope
- Auto-merge / conflict resolution (cloud provider version history is the recovery net — D-05)
- Watching the shared-data folder (deferred in D-40)
- `draft.md` watcher UX beyond the same generic reload prompt

## Risks / do-not-touch
- "Dirty" is defined by the autosave debounce window — don't invent a second dirty-state source of truth
- Don't reintroduce any persisted usage/telemetry while instrumenting (hard guardrail)
- Watcher events during the app's own autosave write must not trigger a self-reload loop (ignore self-writes — e.g. suppress events for paths just written, or compare content hash)

## Meta
- mode: medium           # data-loss surface + cross-layer (Rust watcher ↔ frontend dirty-state) — dual review justified
- risk: low
- depends-on: []         # D-40 text lands with PR #6; implementation is independent
- parallel-safe: no      # touches src-tauri/src/lib.rs registration (shared with T-202/T-209/T-211)
- size budget: < 300 changed lines
