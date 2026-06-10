# T-208: Code signing (macOS + Windows)

<!-- Provenance: archived T-108 [!] (docs/archive/TASKS.md). Blocked on external accounts since 2026-05-27. -->

## Objective
Turn on installer signing. All plumbing is wired (2026-05-29): macOS Developer ID + notarization is env-driven in `release.yml`; Windows uses the Azure Trusted Signing `signCommand` overlay merged in CI when secrets exist. What remains is procurement + secret population, then verifying a signed release end-to-end. Full runbook: `docs/RELEASE.md`.

## Acceptance criteria
- [ ] Apple: enrollment done, Developer ID Application cert exported, `APPLE_*` secrets populated
- [ ] Azure: Trusted Signing account + service principal created, `AZURE_*` secrets populated, overlay placeholders filled in `src-tauri/tauri.windows.signing.conf.json`
- [ ] A `v*.*.*` tag build produces a signed `.dmg` (Gatekeeper-clean) and signed `.msi`/`.exe` (SmartScreen-trusted); Linux stays unsigned AppImage
- [ ] gate green on the release tag: CI `quality` + `Release` workflow

## Files likely involved
- GitHub repo secrets (not files), `src-tauri/tauri.windows.signing.conf.json` placeholders
- `docs/RELEASE.md` (tick the setup steps / correct drift found while executing)

## Out of scope
- Auto-updater (T-209 — independent key + feed)

## Risks / do-not-touch
- Don't weaken the workflow's "unsigned builds still succeed" fallback — signing stays opt-in via secret presence
- Cert material never lands in the repo; secrets only

## Meta
- mode: low
- risk: high             # acceptance requires real certs + a CI release run — not locally runnable; never auto-merge eligible
- depends-on: []         # externally blocked: Apple Developer enrollment + Azure Trusted Signing account
- parallel-safe: no      # touches release workflow/config shared with T-209
- size budget: < 100 changed lines (config/doc only)
