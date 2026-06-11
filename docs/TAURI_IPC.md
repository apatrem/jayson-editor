# Tauri IPC Surface — Command Specification

**Purpose:** define every Tauri command the app needs, with signatures on both sides (Rust `#[tauri::command]` + TypeScript `invoke<T>(...)`). The JS↔Rust boundary is where the security model lives — if a command is missing or sloppy, the model leaks.

**Audience:** the developer implementing M0 (T-02) and M3/M4 (LLM + file I/O).

**Companion to:** `starter/src-tauri/src/lib.rs`, `starter/src-tauri/src/ipc/`, `starter/src-tauri/tauri.conf.json`, `DECISIONS.md` (D-22, D-23, D-32, D-34).

---

## Design principles

1. **Every privileged operation is a command.** Filesystem reads, keychain access, PDF export, SQLite writes — all go through `invoke(...)`. The frontend never imports `node:fs`, `node:path`, or anything that bypasses the boundary.
2. **Commands accept and return JSON-serializable types only.** Text files return strings. Binary asset reads return base64 strings when the caller immediately embeds bytes into self-contained export HTML; no raw filesystem handles ever cross the boundary.
3. **Errors are typed.** Each command returns `Result<T, IpcError>` where `IpcError` is a tagged-union enum (NotFound, PermissionDenied, Invalid, etc.). The frontend gets a discriminated TypeScript error and can dispatch UI per case.
4. **Side effects are explicit.** Commands that mutate state name the resource (`write_document_file`, `set_secret`, `move_file`). Commands that read are pure verbs (`read_document_file`, `read_app_config`).
5. **The CSP and `assetProtocol.scope` in `tauri.conf.json` are part of the contract.** A command accepting a path must validate that the path is within an allowed scope; rejecting paths outside scope at the Rust layer.

## Shared types

### Rust (`src-tauri/src/ipc/types.rs`)

```rust
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Error)]
#[serde(tag = "kind", content = "message", rename_all = "kebab-case")]
pub enum IpcError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("permission denied: {0}")]
    PermissionDenied(String),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("io error: {0}")]
    Io(String),
    #[error("internal: {0}")]
    Internal(String),
}

pub type IpcResult<T> = Result<T, IpcError>;
```

### TypeScript (`src/ipc/types.ts`)

```typescript
export type IpcError =
  | { kind: "not-found"; message: string }
  | { kind: "permission-denied"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "io"; message: string }
  | { kind: "internal"; message: string };

export function isIpcError(e: unknown): e is IpcError {
  return typeof e === "object" && e !== null && "kind" in e && "message" in e;
}
```

---

## §1 — File I/O

These commands wrap the Tauri FS plugin with path-scope validation. The frontend never receives raw filesystem handles. The allowed roots are derived from `src-tauri/tauri.conf.json` `app.security.assetProtocol.scope`; there is no separate Rust-side hardcoded allowlist.

**M7-spike command surface:** only `read_document_file` and `write_document_file`
are registered. `list_directory`, `file_exists`, `ensure_directory`, and
`move_file` are documented below for M8, but are intentionally deferred in M7 and
return "command not registered" from the renderer. M8 T-125 re-registers them
with the same canonicalize + scope-check hardening used by the Document file
commands.

**ADR-0022 clean-break target:** DocModel document files are deterministic JSON.
The file IPC commands are domain-named and enforce `.json` document paths. Keep
JSON parsing and DocModel schema validation in TypeScript; Rust only shuttles
scoped UTF-8 text.

### `read_document_file(path: string) -> string`

**Rust:**

```rust
#[tauri::command]
pub async fn read_document_file(app: tauri::AppHandle, path: String) -> IpcResult<String> {
    let roots = asset_scope_roots(&app);
    // canonical_document_read_target enforces `.json` + canonical-path scope
    // (extension re-checked after symlink resolution), then reads.
    read_document_file_from_path(&path, &roots)
}
```

**TypeScript:**

```typescript
import { invoke } from "@tauri-apps/api/core";

export async function readDocumentFile(path: string): Promise<string> {
  return invoke<string>("read_document_file", { path });
}
```

**Behavior:**

- Reads UTF-8 text. Rejects non-UTF-8 (Invalid).
- Path must be within an `assetProtocol.scope` glob (rejects otherwise: PermissionDenied).
- Path must end in `.json`.
- Does NOT parse JSON or validate the DocModel — the frontend does that. Rust just shuttles bytes.

### `write_document_file(path: string, content: string) -> void`

Writes UTF-8 text atomically (write-to-temp + rename). Rejects paths outside scope.
On Windows, replacement uses `MoveFileExW` with replace-existing and write-through
flags so the target is replaced by a single OS-level move instead of a
delete/backup-then-rename sequence. Cross-platform: the tmp file is written and
fsync'd before the swap. Crash mid-swap leaves either the original or the new
file intact, never neither.

### `read_binary_file(path: string) -> base64 string`

Reads an image asset for PDF export inlining. Registered in M7.5 T-123e.

**Behavior:**

- Path must be absolute and within the same scoped roots as `read_document_file`.
- Path must end with `.jpg`, `.jpeg`, `.png`, `.svg`, or `.webp`.
- File size must be at most 5 MB.
- Returns base64-encoded bytes so the frontend can build `data:image/{mime};base64,...` in `renderStaticHtmlForExport` without JSON number-array amplification.

### `list_directory(path: string) -> DirEntry[]`

**Registration:** deferred in M7-spike; re-registered in M8 T-125 with full T-117 hardening.

```typescript
interface DirEntry {
  name: string;
  path: string; // absolute
  kind: "file" | "directory";
  isDocumentFile: boolean; // helper: name endsWith .json
  isDocFolder: boolean; // helper: directory containing a document .json file
}
```

Used by the library UI to scan the cloud-sync root. Returns one level deep — caller recurses if needed.

### `file_exists(path: string) -> boolean`

**Registration:** deferred in M7-spike; re-registered in M8 T-125 with full T-117 hardening.

Quick existence check. Returns false for both "doesn't exist" and "exists but not readable" — they're equivalent for the UI.

### `ensure_directory(path: string) -> void`

**Registration:** deferred in M7-spike; re-registered in M8 T-125 with full T-117 hardening.

`mkdir -p` semantics. Used by Save As (D-19) to create the doc folder.

### `move_file(from: string, to: string) -> void`

**Registration:** deferred in M7-spike; re-registered in M8 T-125 with full T-117 hardening.

Used by the setup pipeline to move files from `/generated-blocks/pending/` to `/generated-blocks/active/` after human review.

### Path scope validation (shared private helper)

```rust
fn validate_path_in_scope(path: &str) -> IpcResult<PathBuf> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|e| IpcError::Invalid(format!("path canonicalize failed: {}", e)))?;
    // Read scope globs from app state (initialized from tauri.conf.json at startup).
    // Reject if the canonical path doesn't match any allowed glob.
    // Reject if the path contains `..` traversal segments (defense in depth — canonicalize should resolve, but check anyway).
    if !is_within_allowed_scope(&canonical) {
        return Err(IpcError::PermissionDenied(format!("path outside allowed scope: {}", canonical.display())));
    }
    Ok(canonical)
}
```

---

## §2 — OS Keychain (LLM API keys per D-22, D-23)

API keys are stored in the OS keychain by the install script (T-73) and read on demand. They never live in the config file.

### `get_secret(name: string) -> string`

**Rust:**

```rust
#[tauri::command]
pub async fn get_secret(name: String) -> IpcResult<String> {
    let entry = keyring::Entry::new("docsystem", &name)
        .map_err(|e| IpcError::Internal(e.to_string()))?;
    entry.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => IpcError::NotFound(name),
        _ => IpcError::Internal(e.to_string()),
    })
}
```

**TypeScript:**

```typescript
export async function getSecret(name: string): Promise<string> {
  return invoke<string>("get_secret", { name });
}
```

**Naming convention:** secret names are namespaced: `llm.fast.api-key`, `llm.thinking.api-key`. The install script chooses the names; the LLM client reads them by name from `AppConfig.llm.*.keychainEntry`.

### `set_secret(name: string, value: string) -> void`

Used only by the install/setup flow. The main app should never set secrets at runtime.

### `delete_secret(name: string) -> void`

Used by an uninstall flow or a "rotate keys" admin action.

---

## §3 — App configuration

The local config file (`AppConfig` per `TYPES.md §10`) lives at the OS app-config dir. Reads and writes go through Rust to ensure path scoping.

### `read_app_config() -> AppConfig`

Returns the parsed config. Throws NotFound if no config exists (first launch case — caller routes to install flow).

### `write_app_config(config: AppConfig) -> void`

Writes atomically. Used by setup install + by Settings UI updates.

### `get_config_dir() -> string`

Returns the absolute path of the app-config dir (e.g. `~/Library/Application Support/com.consultancy.docsystem` on macOS). Useful for the cost ledger location.

---

## §4 — Cost ledger — REMOVED

The cost ledger and its IPC commands (`insert_cost_row`, `get_cost_summary`,
`clear_cost_history`, `prune_old_rows`) were removed — the app no longer meters or
caps LLM spend. See [ADR-0019](adr/0019-drop-cost-ledger.md).

---

## §5 — PDF export

Browser handoff uses Tauri 2.x's shell plugin, which has two validation layers: `src-tauri/capabilities/main-window.json` grants `shell:allow-open` only for the export temp directory, and `src-tauri/tauri.conf.json` `plugins.shell.open` must also match the handoff path or accepted web URLs. The ACL alone is not sufficient; when `plugins.shell.open` is missing, the plugin rejects renderer calls with its deliberately impossible fallback regex.

### `export_pdf(input: PdfExportInput) -> ExportHandoff`

The command name is kept as `export_pdf` for historical reasons and to preserve
the registered IPC command count. In M7-spike it does **not** produce a finished
PDF. It writes print-ready HTML to a scoped temp file and returns a browser
handoff path; the user finishes the export in their browser with
Cmd-P / Ctrl-P → Save as PDF. A v1.1 task may rename this to
`prepare_print_handoff` for honesty.

```typescript
interface PdfExportInput {
  html: string;
  suggestedName: string;
}

interface ExportHandoff {
  kind: "browser_handoff";
  path: string;
}
```

**Behavior:** writes `html` to
`<tmpdir>/docsystem-export/<uuid>/<sanitized-base-name>.html`, returns
`{ kind: "browser_handoff", path }`, and expects the frontend to open `path`
with `@tauri-apps/plugin-shell`. `suggestedName` sanitization strips a trailing
`.pdf` first, replaces non-`[A-Za-z0-9._ -]` characters with `_`, strips
leading dots, clamps to 200 characters, appends `.html`, then canonicalizes the
result to ensure it remains under the temp export root.

**Cleanup:** on app startup, the Tauri setup hook sweeps
`<tmpdir>/docsystem-export/` before any new export runs. Cleanup failures are
logged and do not block app launch.

**Why this is a Rust command and not pure JS:** the Rust side owns the privileged
filesystem write and temp-root validation. The renderer remains responsible for
creating safe, self-contained HTML.

---

## §7 — Authored-block lifecycle commands (T-167, ADR-0010)

Three commands implement the soft-archive lifecycle for Tier 3 Authored blocks
(see `docs/adr/0010-authored-block-soft-archive-on-removal.md`):

```
active/  ──archive──▶  archived/   (hidden from palette; existing docs still render)
archived/ ──restore──▶ active/     (re-appears in palette)
archived/ ──permanently-delete──▶  (gone; docs render RemovedBlockPlaceholder)
```

All three handlers live in `src-tauri/src/ipc/fs.rs` and share the same
`asset_scope_roots` security model as all other file I/O commands.

### Path scope note

The `generated-blocks/archived/` directory is a subdirectory of the user's
`cloudSyncRoot`, which is itself under one of the broad `assetProtocol.scope`
patterns (e.g., `$HOME/Dropbox/**`).  No additional `tauri.conf.json` scope
entries are required — the existing patterns already cover
`generated-blocks/archived/`.

### Capability note

All three commands are custom `#[tauri::command]` handlers registered via
`invoke_handler!` in `src-tauri/src/lib.rs`. In Tauri 2.x, custom commands
registered this way are available to any window that holds `core:default`
(already granted in `capabilities/main-window.json`). No additional capability
entries are needed.

### `archive_authored_block(srcPath: string, dstDir: string) -> string`

**Rust:**

```rust
#[tauri::command]
pub async fn archive_authored_block(
    app: tauri::AppHandle,
    src_path: String,
    dst_dir: String,
) -> IpcResult<String>
```

**TypeScript:**

```typescript
export async function archiveAuthoredBlock(
  srcPath: string,
  dstDir: string,
): Promise<string>
```

**Behavior:**
- `srcPath` must be absolute, end with `.tsx`, and be within the asset scope.
- `dstDir` must be absolute and within the asset scope; it is created if absent.
- The primary `.tsx` file is moved atomically.  The `.manifest.json` sidecar is
  moved on a best-effort basis (ignored if absent).
- Returns the absolute path of the file at its new location.

### `restore_authored_block(srcPath: string, dstDir: string) -> string`

Same signature and behaviour as `archive_authored_block`; semantically the
reverse operation (moves from `archived/` back to `active/`).

### `permanently_delete_authored_block(path: string) -> void`

**Rust:**

```rust
#[tauri::command]
pub async fn permanently_delete_authored_block(
    app: tauri::AppHandle,
    path: String,
) -> IpcResult<()>
```

**TypeScript:**

```typescript
export async function permanentlyDeleteAuthoredBlock(path: string): Promise<void>
```

**Behavior:**
- `path` must be absolute, end with `.tsx`, and be within the asset scope.
- Directories and out-of-scope paths are rejected with `PermissionDenied`.
- The `.tsx` file is deleted; the `.manifest.json` sidecar is deleted on a
  best-effort basis (ignored if absent).
- **Destructive and irreversible.** The UI must confirm with the user before
  calling.

---

## §6 — Commands that are NOT Tauri commands

Things to keep in JS (don't add Tauri commands for them):

- **LLM API calls.** The frontend calls Anthropic/OpenAI directly via `fetch` (the CSP allows `connect-src` to those origins). Pulling the API key through `get_secret` then calling `fetch` from JS is fine — the key never lives in JS state longer than one request.
- **Document JSON parsing.** Use Web/TypeScript JSON parsing in the frontend,
  followed by `validateDocModel`.
- **ProseMirror manipulation.** Pure JS.
- **ECharts rendering.** Pure JS for the editor; pre-rendered to SVG by JS in a Node subprocess (or browser worker) for PDF export.

---

## §7 — Why commands are split this way (rationale)

1. **Privileged ops in Rust, pure compute in JS.** Filesystem and keychain need the Rust layer because Tauri's security model gates them. Document JSON parsing is pure compute — no reason to cross the boundary.
2. **No `dangerouslySetInnerHTML`-equivalent escape hatch.** No `execute_arbitrary_javascript` command. No `read_any_file` command. The frontend cannot reach outside the scope defined in `tauri.conf.json`.
3. **Each command has one clear purpose.** Avoid `do_lots_of_stuff` commands — they accumulate special cases and become impossible to audit.
4. **All paths validated at the Rust layer.** Even though `AssetPathSchema` rejects bad paths in the schema, the Rust commands re-validate against `assetProtocol.scope`. Defense in depth.

---

## §8 — Implementation checklist

When implementing T-02 (Tauri shell setup) and T-60 (LLM client), tick these off:

- [ ] All commands from §1–§5 implemented in `src-tauri/src/ipc/{fs,keychain,config,cost,pdf}.rs`.
- [ ] `IpcError` enum in `src-tauri/src/ipc/types.rs`.
- [ ] TypeScript wrappers in `src/ipc/{fs,keychain,config,cost,pdf}.ts` — one file per Rust module.
- [ ] `tauri.conf.json` `assetProtocol.scope` covers all paths the FS commands will touch.
- [ ] `tauri.conf.json` CSP `connect-src` covers `https://api.anthropic.com` + `https://api.openai.com` (or your chosen providers).
- [ ] Integration tests: each Rust command has a test that exercises happy + error paths.
- [ ] Frontend integration tests: each TS wrapper mocks `invoke` and asserts the JSON envelope.
- [ ] An automated audit test that walks `src/` looking for direct imports of `node:fs`, `node:path`, etc. and fails the build (those must go through commands).

---

## §9 — Future / v1.1+ commands (not yet)

- `start_yjs_session(doc_id)` / `apply_yjs_update(...)` — when collaboration arrives in v2.
- `setup_run_scan(input_dir, output_dir)` — if we ever want the setup pipeline runnable from inside the app (currently a CLI per `SETUP_PIPELINE.md §2`).
- `export_docsys_bundle(doc_folder, output_zip)` — if "Export as .docsys" (D-19) moves from JS-side (using JSZip in the renderer) to Rust-side.

When adding any of these, keep the principles in §1 in mind.
