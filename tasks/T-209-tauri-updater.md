# T-209: Tauri auto-updater

<!-- Provenance: archived T-109 [!] (docs/archive/TASKS.md). Blocked on updater keypair + stable feed URL. -->

## Objective
Enable the Tauri updater so shipped apps discover, verify, and install new signed builds from a hosted `latest.json` feed without manual re-download. Independent of OS code signing (T-208): the updater keypair (`TAURI_SIGNING_PRIVATE_KEY`) proves the *feed*, the OS certs prove the *installer*. Full context: `docs/RELEASE.md` §Auto-updater (a current minimal reference implementation is linked there).

## Acceptance criteria
- [ ] Updater keypair generated (`tauri signer generate`); private key + password stored as CI secrets; pubkey in `tauri.conf.json`
- [ ] `tauri-plugin-updater` added (npm + Cargo); `plugins.updater` block with `endpoints` + `pubkey`; `includeUpdaterJson: true` in `release.yml`
- [ ] App checks for updates on launch and updates from the hosted feed (manual verification on one OS; documented in the PR)
- [ ] A tampered/unsigned feed entry is rejected (signature check) — verified once with a deliberately bad signature
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`, `src-tauri/src/lib.rs` (plugin registration)
- `.github/workflows/release.yml` (`includeUpdaterJson`)
- Launch-time update check call site, `docs/RELEASE.md`

## Out of scope
- OS code signing (T-208)
- Custom update UI beyond a minimal check-on-launch prompt

## Risks / do-not-touch
- Never emit `latest.json` before the app can validate it (half-working updater ships distrust)
- The updater pubkey is compiled in — rotating it later orphans installed copies; treat the keypair as long-lived

## Meta
- mode: low
- risk: high             # end-to-end acceptance needs a hosted feed + installed copy — not fully CI-checkable
- depends-on: []         # externally blocked: keypair generation decision + stable feed URL; independent of T-208
- parallel-safe: no      # touches release.yml + src-tauri/src/lib.rs (shared with T-208/T-210/T-211)
- size budget: < 200 changed lines
