# starter/ — project scaffold files

Drop-in starting point for the M0 (project scaffold) tasks in `docs/archive/TASKS.md` (T-01 through T-09).

These files have **pinned versions and architecture-specific config** that match the decisions in `docs/DECISIONS.md`. Do not "upgrade" them speculatively — pin drift is a recurring source of subtle breakage.

## Files

| File | Purpose | Maps to |
|---|---|---|
| `package.json` | npm config with pinned dependencies and scripts | T-01, T-03, T-07 |
| `tsconfig.json` | Strict TS with path aliases | T-01 |
| `vite.config.ts` | Vite dev server + Tauri-aware build | T-01 |
| `vitest.config.ts` | Vitest with happy-dom + coverage | T-05 |
| `.eslintrc.cjs` | Strict ESLint with arch-invariant rules | T-04 |
| `.prettierrc` | Prettier formatting | T-04 |
| `src-tauri/tauri.conf.json` | Tauri 2.x config with CSP + asset scope | T-02 |
| `src-tauri/Cargo.toml` | Rust dependencies (Tauri 2.x + keyring) | T-02 |
| `src-tauri/build.rs` | Tauri build script | T-02 |
| `src-tauri/capabilities/main-window.json` | Minimal Tauri 2 permission set | T-02 |
| `src-tauri/src/main.rs` | Native binary entry point | T-02 |
| `src-tauri/src/lib.rs` | Tauri app setup + IPC command registration | T-02, T-60 |
| `src-tauri/src/ipc/` | Compile-clean IPC command stubs | T-02, T-60 |

## How to use these

```bash
# In the eventual greenfield project root:
cp -r starter/* .
cp starter/.eslintrc.cjs starter/.prettierrc .
npm install
npm run dev          # opens http://localhost:1420
npm run tauri:dev    # opens the native window
```

Then proceed to T-04 (ESLint setup), T-05 (Vitest), T-06 (folder structure), T-08 (CI), T-09 (README).

## Why these specific versions

- **Tauri 2.x** (not 1.x): 1.x is on its way to end-of-life; the security model in 2.x (capabilities, CSP scope, asset protocol) is what D-22 / D-32 / D-34 rely on.
- **TipTap 2.8** (not 3.x beta): 2.x is the stable line; 3.x is in flux. Pin to 2.8 specifically because earlier 2.x has known issues with React 18 strict mode.
- **Zod 3.23** (not 4.x): 4.x changes several APIs we use (`z.string().email()`, discriminated unions); pin 3.23 to avoid migration churn during build.
- **ECharts 5.5**: 5.x supports direct browser rendering and SSR via `setOption + getDataURL`, which we need for PDF export.
- **React 18.3** (not 19.x): 19.x has new behaviors around effects that interact poorly with TipTap; 18.3 is the safe pin.
- **Node 20.11+**: required for `node:test`, `node:sqlite`, and modern `--experimental-permission` if we ever want it.

## What's NOT in here (and why)

- **App icons** (`src-tauri/icons/`) — provided per-consultancy at setup time, not in the starter. The Tauri config references them by path.
- **The Tauri updater config** — added during the release pipeline (T-108), together with the generated pubkey.
- **A `keychain entitlements` file for macOS** — only needed if you sign with a Developer ID and want keychain access in production; configure during T-108.
- **Actual block code, schemas, renderer logic** — these live in `src/` of the eventual project; the starter is just the runtime scaffolding.

## Verification (do this after `cp`)

```bash
npm install                                    # should succeed with no peer-dep warnings
npm run lint                                   # 0 errors
npm run build                                  # builds the empty Vite app
npm run tauri:build                            # produces an unsigned binary (~10MB on Tauri 2.x)
```

If any of these fail on a clean clone, the starter is broken — file an issue before continuing.
