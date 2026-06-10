# Release & Code Signing

How Jayson Editor is packaged into downloadable installers, and how to make those
installers trusted (no "unidentified developer" / SmartScreen warnings).

Related tasks: **T-108** (code signing), **T-110** (release pipeline). The
auto-updater (**T-109**) is intentionally deferred — see [§Auto-updater](#auto-updater-deferred).

---

## TL;DR

- **Building** is already wired. `npm run tauri:build` produces the native
  installer for the OS you run it on; the [`Release`](../.github/workflows/release.yml)
  workflow builds all three on a `v*.*.*` tag and attaches them to a GitHub Release.
- **Signing is opt-in.** Until you create the developer accounts and add the CI
  secrets below, builds still succeed — they're just **unsigned** (users see OS
  warnings). Nothing in this repo breaks while the accounts are pending.
- To turn signing on you need: an **Apple Developer Program** membership (~$99/yr)
  and an **Azure Trusted Signing** account (~$10/mo), plus the GitHub secrets listed below.

| OS | Installer | Built on | Signing mechanism |
|----|-----------|----------|-------------------|
| macOS | `.dmg` (+ `.app`) | `macos-latest` | Developer ID + notarization (env-driven) |
| Windows | `.msi` + `.exe` | `windows-latest` | Azure Trusted Signing via `signCommand` |
| Linux | `.AppImage` | `ubuntu-latest` | unsigned (by design) |

---

## Cutting a release

```bash
# from a clean main, after bumping version in package.json + src-tauri/tauri.conf.json
git tag v1.0.0
git push origin v1.0.0
```

The `Release` workflow runs the quality gates, then builds + (if secrets are
present) signs installers on each OS and publishes them to a GitHub Release named
`Jayson Editor v1.0.0`. Pre-release suffixes (`-rc`, `-beta`, `-alpha`) mark the
release as a prerelease automatically.

### Local one-off build (unsigned)

```bash
npm run tauri:build
# output: src-tauri/target/release/bundle/{dmg,msi,nsis,appimage}/
```

You can only build a given OS's installer **on that OS** — Tauri does not
cross-compile installers reliably.

---

## macOS — Apple Developer ID (signing + notarization)

The workflow is already wired for this; you only need the account and the secrets.

### 1. Enroll
[developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/)
— **$99/year**. Choose **Individual** (fastest; your name is the developer) or
**Organization** (needs a free [D-U-N-S number](https://developer.apple.com/support/D-U-N-S/);
shows a company name). The signing setup below is identical either way.

### 2. Create a "Developer ID Application" certificate
In your Apple Developer account → Certificates → **Developer ID Application**
(this is the cert for distribution *outside* the App Store). Download it, import
into Keychain Access, then export the cert **with its private key** as a `.p12`.

### 3. Add an app-specific password
At [account.apple.com](https://account.apple.com) → Sign-In & Security →
App-Specific Passwords. This is used for notarization.

### 4. Populate GitHub secrets
Settings → Secrets and variables → Actions → New repository secret:

| Secret | Value |
|--------|-------|
| `APPLE_CERTIFICATE` | base64 of the `.p12` — `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | the password you set when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Jane Doe (TEAMID)` |
| `APPLE_ID` | your Apple ID email |
| `APPLE_PASSWORD` | the app-specific password from step 3 |
| `APPLE_TEAM_ID` | your 10-char Team ID (Apple Developer → Membership) |

Tauri signs with `APPLE_SIGNING_IDENTITY` and notarizes automatically once
`APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` are present. No `tauri.conf.json`
change is required (`bundle.macOS.signingIdentity` stays `null` and falls back to
the env var).

---

## Windows — Azure Trusted Signing

We use **Azure Trusted Signing** (recently rebranded **Artifact Signing**) — a
cloud signing service (~$9.99/mo) that's far cheaper and simpler than a physical
USB-token certificate, gives immediate SmartScreen trust, and needs no hardware.

### 1. Set up the Azure account
1. Create an Azure subscription, then a **Trusted Signing account** in a supported
   region (e.g. East US → endpoint `https://eus.codesigning.azure.net/`).
2. Complete **identity validation** (individual / self-employed is now eligible in
   US/Canada/EU/UK; no multi-year history required since GA).
3. Create a **Certificate Profile** inside the account (this is the `-c` value).
4. Create an **App Registration** (Entra ID service principal) and grant it the
   **Trusted Signing Certificate Profile Signer** role on the account. Note its
   **Client ID**, **Tenant ID**, and a generated **Client Secret**.

### 2. Fill in the signing overlay
Edit [`src-tauri/tauri.windows.signing.conf.json`](../src-tauri/tauri.windows.signing.conf.json)
and replace the three non-secret placeholders:

```jsonc
"signCommand": "trusted-signing-cli -e https://REGION.codesigning.azure.net/ -a YOUR_ACCOUNT_NAME -c YOUR_CERT_PROFILE %1"
//                                    ^ your region          ^ account name    ^ certificate profile
```

These are not secrets, so they live in the committed file. The credentials below
are read from the environment by `trusted-signing-cli` and never stored here.

### 3. Populate GitHub secrets

| Secret | Value |
|--------|-------|
| `AZURE_TENANT_ID` | Entra ID tenant (directory) ID |
| `AZURE_CLIENT_ID` | App Registration (service principal) client ID |
| `AZURE_CLIENT_SECRET` | the client secret you generated |

### How it activates
The Release workflow checks for `AZURE_CLIENT_ID`. When present, it
`cargo install trusted-signing-cli` and runs the Windows build with
`--config src-tauri/tauri.windows.signing.conf.json`, so Tauri invokes
`signCommand` for every binary and the installer. When the secret is absent, the
Windows build stays unsigned (a workflow warning is logged) — the pipeline never
hard-fails just because signing isn't configured yet.

> The old `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` secret slots
> (for the legacy `.pfx`/USB-token model) were removed in favour of Trusted
> Signing. If you ever revert to a traditional cert, you'd reintroduce those and
> drop the Azure plumbing.

---

## Auto-updater (deferred)

`includeUpdaterJson: false` in the workflow and the lack of an
`app > updater` block in `tauri.conf.json` mean **the auto-updater is not enabled
yet** (tracked as **T-109**). When enabled, Tauri's updater lets a shipped app
check a hosted JSON feed (e.g. `latest.json` on the GitHub Release), discover a
newer signed build, download it, verify it against an updater public key baked
into the app, and install it — so users get updates without manually
re-downloading the installer. It requires two things we don't have yet: an
**updater signing keypair** (`TAURI_SIGNING_PRIVATE_KEY` — separate from the
OS code-signing certs above) and a **stable feed URL**. Until both exist,
emitting `latest.json` would ship a feed the app can't validate, so it stays off.

Working reference for when T-108/T-109 unblock: [erictli/scratch](https://github.com/erictli/scratch)
ships a current, minimal Tauri 2 `tauri-plugin-updater` setup with a GitHub
Actions `release.yml` — useful to crib the workflow *shape* from (that repo has
no LICENSE, so patterns only, no code).
