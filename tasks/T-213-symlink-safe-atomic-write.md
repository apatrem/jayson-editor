# T-213: Symlink-safe atomic temp write (security hardening)

<!-- Provenance: T-201 (PR #9) codex review, blocker #2. Pre-existing pattern shared by every scoped write command. -->

## Objective
`write_content_to_canonical_path()` opens a predictable `<target>.tmp` sibling with `create(true).truncate(true)` and **no exclusive/no-follow creation** (`src-tauri/src/ipc/fs.rs`). A pre-existing symlink or hard link such as `doc.json.tmp` inside an allowed root can point outside the scope; the write truncates/overwrites that out-of-scope file before the rename. Because these are custom `std::fs` commands, the Tauri FS-plugin ACL provides **no second validation layer** (see AGENTS.md review playbook). This affects every scoped write (`write_yaml_file`, `write_document_file`, authored-block writes). Make the temp creation symlink-safe.

## Acceptance criteria  (must be machine-checkable)
- [ ] The fix lands in the **shared** `write_content_to_canonical_path` helper so **all three write families inherit it** — `write_document_file`, `write_yaml_file`, AND `write_authored_block_file` (PR #9 Opus review: they all call the shared helper and carry the identical `.tmp` vuln) → assert via tests on each command, not just the document path
- [ ] The temp file is created with exclusive + no-follow semantics (e.g. `O_EXCL | O_NOFOLLOW` on Unix; equivalent reparse-point rejection on Windows), or a unique randomized temp name plus an explicit symlink/type check before write → Rust unit test
- [ ] A pre-existing **symlink** at the temp path pointing outside an allowed root does NOT cause an out-of-scope write — the operation errors instead (Rust failure-path test)
- [ ] A pre-existing **regular file** / leftover `.tmp` from a crashed run is handled deterministically (errors or is safely replaced — documented), per the failure-path completeness convention in AGENTS.md
- [ ] Windows reparse-point / hard-link path covered, with a `windows-latest` CI matrix entry running the test (else tracked — a `#[cfg(windows)]` test with no Windows runner is "not actually run" per the review playbook)
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build` + `cargo test` (rust-lockfile-parity / windows-cargo-test jobs)

## Files likely involved
- `src-tauri/src/ipc/fs.rs` (`write_content_to_canonical_path` and the shared temp-write helper), Rust failure-path tests
- `.github/workflows/ci.yml` if a Windows matrix entry is needed for the reparse-point test

## Out of scope
- KEY_ORDERS completeness (T-212)
- Any change to the scope/extension validation that already works (the review confirmed relative/`..`/non-`.json`/out-of-scope-parent/read-side symlink rejection all hold)

## Risks / do-not-touch
- Preserve the atomic write-then-rename guarantee and canonical-path validation — this hardens the temp step only
- Verify against the actual behavior on each OS (the review playbook: a `#[cfg(<os>)]` test with no matching CI runner is functionally synthetic)

## Meta
- mode: medium           # security-sensitive atomic write touching every scoped write command — independent review warranted
- risk: low
- depends-on: []         # hardens an existing shared helper; independent of T-201's merge
- blocked-by: none
- parallel-safe: no       # edits src-tauri/src/ipc/fs.rs — collides with T-201/T-210/T-211 work on the same file
- frozen-tests: none
- size budget: < 200 changed lines
