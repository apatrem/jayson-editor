# T-211: Single app instance per machine (D-41)

<!-- Provenance: D-41 in docs/DECISIONS.md (grilling 2026-06-10; lands with PR #6). Not from the archived backlog. -->

## Objective
Two app instances autosaving the same DocModel is a silent last-writer-wins data-loss path. Implement D-41: register `tauri-plugin-single-instance` so a second launch focuses the existing window instead of starting a second process, forwarding second-launch arguments to the running instance.

## Acceptance criteria  (must be machine-checkable)
- [ ] `tauri-plugin-single-instance` registered first in the builder chain (before other plugins, per the plugin's docs) → config-shape assertion or Rust unit test
- [ ] Second-launch callback focuses/unminimizes the main window and receives argv → covered by a Rust-side test of the callback logic (full two-process E2E is manual; note it in the PR)
- [ ] Capability/ACL additions (if any) reviewed against the actual plugin source — AGENTS.md review playbook applies
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` (plugin registration + focus callback)
- `src-tauri/capabilities/` if the plugin needs an entry

## Out of scope
- Routing second-launch file-open arguments to a specific document (no file association exists yet)
- The cross-machine variant of the hazard (T-210)

## Risks / do-not-touch
- Plugin registration order matters (single-instance must be first); cite the plugin doc in a comment if order is load-bearing

## Meta
- mode: low
- risk: low
- depends-on: []
- parallel-safe: no      # one-line collision with every other task touching src-tauri/src/lib.rs
- size budget: < 60 changed lines
