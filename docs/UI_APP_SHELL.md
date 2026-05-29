# App Shell UI — Design Spec (M7-spike scope)

**Purpose:** concrete design for the M7-spike app shell — the deliberately-narrow first integration milestone that proves a real consultant can open a YAML document, edit it, insert blocks via the palette, save it, and export it to PDF via the user's default browser. M7-spike does NOT include a library, install wizard, AI, comments, deck rendering, or settings — those surfaces stay as already-built-but-disconnected modules until M8+ where their scope can be informed by what consultant testing of the spike reveals.

**Audience:** the developer implementing M7-spike (T-115 → T-123, ~33h total). M8's incremental updates to this spec are tracked by T-124 (see §M8 forward-references below).

**Companion to:** `docs/BUILD_BRIEF.md` §3 (M7 entry), `docs/TASKS.md` Phase 7 (T-115..T-123), `docs/TAURI_IPC.md` (IPC contract), `docs/DECISIONS.md` (D-39 perf budget, D-36 watchdog HOC), `docs/UI_LIBRARY.md` + `docs/UI_REVIEW_PANEL.md` + `docs/SETUP_INSTALL_FLOW.md` (cross-referenced ONLY for what M7-spike defers — none of those surfaces ship in M7-spike).

---

## Why this milestone matters

Before M7-spike, every subsystem (schema, renderer, editor, comments, deck, library, cost-ledger, LLM, setup) had passing unit tests, but `src/App.tsx` returned `null` and the 17 Tauri IPC commands were registered but mostly no-op stubs. The privacy-notice promise of "13-month auto-prune" was encoded in tested modules but never called at runtime because there was no shell to call them.

M7-spike fixes that gap with the minimum useful integration — enough that a consultant can actually touch the editor surface and surface UX problems early. **Anything that isn't on the critical path from "open a file" to "export a PDF" is deferred to M8+.**

The deliberate narrowness is the design. The prior plan iteration had M7 cover library + install wizard + AI + comments + deck + settings + reviewer — ~90h of work whose result nobody sees until week 2. M7-spike trades feature surface for feedback latency: ship something a consultant can break in a week, learn from what breaks, design M8 with that knowledge.

---

## What M7-spike does (scope)

1. **Launches into a single-document shell.** No library, no install wizard, no router. `src/App.tsx` holds React state for "is a doc open?"; switches between a welcome screen and a single DocumentView.
2. **File → Open: native dialog → pick a YAML → render in the editor.** Uses `@tauri-apps/plugin-dialog` for the picker, `read_yaml_file` IPC for the read, the existing `src/editor/file-open.ts` helper for YAML → DocModel parsing.
3. **Edit the document via the existing Editor surface.** `src/editor/Editor.tsx` (TipTap) wired to the loaded DocModel via the existing mapping orchestrator (`src/editor/mapping.ts`).
4. **Insert blocks via the BlockPalette.** The existing `src/editor/BlockPalette.tsx` component (15 default blocks, fully implemented, never previously mounted) is mounted in DocumentView. Triggered by a `+` toolbar button OR the `/` keyboard shortcut. `generatedBlocks` prop is `[]` for M7-spike (runtime loading lands in M8 T-132).
5. **File → Save / Save As: write back to YAML.** Save writes to the existing path via `write_yaml_file` IPC; Save As prompts via native save dialog, writes to chosen path, switches the active path. Out-of-library toast is M8-meaningful (no configured library folder yet in M7-spike, so it never fires).
6. **File → Export PDF: pre-render HTML → write to temp → open in user's default browser.** The user finishes the export with `Cmd-P` / `Ctrl-P` → "Save as PDF" in their browser. See §Browser PDF handoff below.
7. **Errors don't crash the app.** Top-level `AppErrorBoundary` + `withRenderWatchdog` wrap on DocumentView per D-36 / D-39.

---

## What M7-spike does NOT do (deferred)

The disconnect between "built modules" and "wired surface" is intentional in M7-spike. These surfaces exist as tested code; M8+ wires them.

| Surface                                         | Built?                                   | Wired in M7-spike? | Where wired                                    |
| ----------------------------------------------- | ---------------------------------------- | ------------------ | ---------------------------------------------- |
| Install wizard (`src/setup/install.ts`)         | ✓ (CLI)                                  | ✗                  | M8 T-127 (GUI folder picker)                   |
| Library view (`src/library/`)                   | ✓ (pure logic)                           | ✗                  | M8 T-128 + T-129 (card grid + filters)         |
| Document templates                              | ✗ (M8 T-130)                             | ✗                  | M8 T-131 (Create from Template)                |
| Generated-block runtime loading                 | ✓ (`src/setup/load-generated-blocks.ts`) | ✗                  | M8 T-132 (palette extension)                   |
| Deck renderer (`src/renderer/DeckRenderer.tsx`) | ✓                                        | ✗                  | M10 (deck view)                                |
| Comments + AI proposals (`src/comments/`)       | ✓                                        | ✗                  | M9 (review panel + AI flow)                    |
| Cost-ledger surface                             | —                                        | —                  | **Removed — ADR-0019** (no spend metering)     |
| Reviewer mode                                   | ✓ (logic)                                | ✗                  | M11                                            |
| Settings panel                                  | partial (autosave knob in config only)   | ✗                  | M9 (deferred-UI feature list)                  |
| Keychain wiring (`get_secret` / `set_secret`)   | stub                                     | ✗                  | M9 (LLM keys)                                  |
| The other 14 IPC commands                       | mixed (real-ish or stubs)                | ✗                  | M8/M9 as needed                                |
| Router / multi-doc / multi-window               | n/a                                      | ✗                  | M8 (router); M9+ (tabs); future (multi-window) |
| Signed installers / auto-updater                | scaffold (T-110)                         | n/a                | Phase 9 (T-108, T-109)                         |

M7-spike touches **only 3 of the 17 IPC commands**: `read_yaml_file` and `write_yaml_file` get hardened (T-117); `export_pdf` gets reimplemented as browser-handoff (T-118, semantics change documented in TAURI_IPC.md). The other 14 stay as their current registered stubs.

---

## Wireframe

### State 1 — Welcome (no document loaded)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  File ▾                                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                                                                              │
│                                                                              │
│                          ┌─────────────────────────┐                         │
│                          │      Jayson Docs         │                         │
│                          │                          │                         │
│                          │  [  Open Document  ]     │                         │
│                          │                          │                         │
│                          └─────────────────────────┘                         │
│                                                                              │
│                                                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

Minimum chrome: just the File menu and an "Open Document" button centered in the window. Clicking the button is identical to File → Open.

### State 2 — DocumentView (a document is loaded)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  File ▾                                       Acme Q3 Proposal.yaml   ●     │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌──┐                                                                         │
│ │+ │ ┌──────────────────────────────────────────────────────────────────┐    │
│ └──┘ │                                                                   │    │
│      │  # Acme Q3 Proposal                                               │    │
│      │                                                                   │    │
│      │  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed    │    │
│      │  do eiusmod tempor incididunt ut labore et dolore magna aliqua. │    │
│      │                                                                   │    │
│      │  ┌─ Callout ─────────────────────────────────────────────┐       │    │
│      │  │ Key insight: …                                         │       │    │
│      │  └────────────────────────────────────────────────────────┘       │    │
│      │                                                                   │    │
│      │  [Cursor here] ▌                                                  │    │
│      │                                                                   │    │
│      └──────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ● = autosave in flight (debounce from T-82, default 2s)                     │
│  + = BlockPalette trigger (also "/" keyboard shortcut)                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

The DocumentView is essentially the existing `DocumentRenderer` + `Editor` composition, full-window, plus:

- a `+` button in the top-left toolbar (or wherever the existing Editor toolbar lives) that opens the BlockPalette
- title-bar showing the current file's basename + a dot indicator for autosave-in-flight
- the File menu (Open / Save / Save As / Export PDF)

### State 3 — BlockPalette open

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  File ▾                                       Acme Q3 Proposal.yaml         │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌──┐                                          ┌─────────────────────────┐   │
│ │+ │ ┌────────────────────────────────────┐   │  Insert block            │   │
│ └──┘ │  …                                 │   │ ─────────────────────── │   │
│      │  …                                 │   │  Prose                   │   │
│      │  …                                 │   │  Heading                 │   │
│      │  …                                 │   │  Bulleted list           │   │
│      │  …                                 │   │  Numbered list           │   │
│      │  …                                 │   │  Callout                 │   │
│      │  …                                 │   │  Pull-quote              │   │
│      │  …                                 │   │  Chart                   │   │
│      │  …                                 │   │  Image                   │   │
│      │  …                                 │   │  Table                   │   │
│      │  …                                 │   │  Diagram                 │   │
│      └────────────────────────────────────┘   │  Side-by-side            │   │
│                                                │  KPI band                │   │
│                                                │  Risk matrix             │   │
│                                                │  People                  │   │
│                                                │  Reference list          │   │
│                                                │                          │   │
│                                                │ (M7-spike: 15 default;   │   │
│                                                │  M8 adds generated)      │   │
│                                                └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

The palette uses the existing `BlockPalette.tsx` component without modification. Triggered by the `+` button or `/` keyboard shortcut. Clicking an entry fires the matching TipTap `insertXxx` command on the editor and closes the palette.

---

## State model

M7-spike's app state is **a single React state hook in `src/App.tsx`** — no router, no Redux, no Zustand, no context (except for `BrandProvider`, which already exists).

```ts
type AppState =
  | { kind: "welcome" }
  | {
      kind: "document";
      path: string; // absolute path to the YAML on disk
      doc: DocModel; // parsed in-memory representation
      dirty: boolean; // is there an unsaved edit?
      paletteOpen: boolean; // is BlockPalette visible?
    };
```

Transitions:

```
welcome ── File → Open (or click "Open Document") ──> document
document ── File → Open (a different file) ─────────> document (new path)
document ── (Open dialog cancelled) ────────────────> unchanged
document ── AppErrorBoundary reset (only on caught
            top-level error; user clicks "Back to
            welcome screen" in the error panel) ────> welcome  [recovery only]
welcome ── (no exit — closing the window quits app)
```

There is **no user-initiated `welcome ← document` transition** in M7-spike — no File → Close, no "X" on the document title. The only path back to welcome is the **error-only reset**: when `AppErrorBoundary` (T-122) catches a top-level render exception that escapes per-block boundaries, the error panel shows a "Back to welcome screen" button as the recovery escape hatch. This is exceptional, not part of normal use. A user-initiated "close document" action (with the dirty-doc confirmation it would need) is deferred to M8+ where library-then-document navigation needs a non-error close path.

**Implication for T-122:** the error reset transition discards `state.doc` and `state.path` without saving (the document is already in an error state; any unsaved edits live only in the React state hook). T-122's design MUST make this consequence visible: the error panel copy reads "Document failed to render — unsaved edits may be lost. Try reopening the file, or return to the welcome screen." T-122 tests cover the transition.

> **Note (M8 forward-ref):** M8 T-126 introduces `src/ui/router/Routes.tsx` with typed routes `{ kind: 'welcome' | 'folder-picker' | 'library' | 'document' }`. The `document` route in M8 carries `{ openDocs: Array<{ id, path }>, activeIndex }` to leave room for browser-style tabs in M9+. M7-spike's single React state hook is a deliberate simplification that the M8 router refactor will absorb without rearchitecting the underlying DocumentView component.

---

## Component breakdown

| Component            | File                                         | Built?              | M7-spike change                                                        |
| -------------------- | -------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `App`                | `src/App.tsx`                                | stub (returns null) | rewritten as single-state shell (T-119)                                |
| `MenuBar`            | `src/ui/menu/MenuBar.tsx`                    | new (T-121)         | top-level menu container, hosts FileMenu                               |
| `FileMenu`           | `src/ui/menu/FileMenu.tsx`                   | new (T-121)         | Open / Save / Save As / Export PDF wiring                              |
| `WelcomeScreen`      | `src/ui/views/WelcomeScreen.tsx` (or inline) | new (T-119)         | minimal "Open Document" button                                         |
| `DocumentView`       | `src/ui/views/DocumentView.tsx`              | new (T-120)         | wires DocumentRenderer + Editor + autosave + BlockPalette              |
| `AppErrorBoundary`   | `src/ui/AppErrorBoundary.tsx`                | new (T-122)         | top-level boundary wrapping DocumentView                               |
| `BlockPalette`       | `src/editor/BlockPalette.tsx`                | ✓                   | mounted in DocumentView (T-120b); no change to component itself        |
| `Editor`             | `src/editor/Editor.tsx`                      | ✓                   | unchanged; consumed by DocumentView                                    |
| `DocumentRenderer`   | `src/renderer/DocumentRenderer.tsx`          | ✓                   | unchanged; consumed by DocumentView and by `renderStaticHtmlForExport` |
| `render-static-html` | `src/export/render-static-html.ts`           | new (T-118)         | renderer-safe pure function for browser PDF handoff                    |
| `withRenderWatchdog` | `src/block-primitives/RenderWatchdog.tsx`    | ✓                   | wraps DocumentView per D-39 (T-122)                                    |

---

## File menu wiring (T-121)

Standard convention for Save / Save As (per grilling Q10):

### Open

- Invokes `@tauri-apps/plugin-dialog`'s `open({ filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }] })`.
- On selected path: `read_yaml_file(path)` → parse via existing `src/editor/file-open.ts` → set state to `{ kind: 'document', path, doc, dirty: false, paletteOpen: false }`.
- On dialog cancel: state unchanged.
- On parse / IPC error: show toast "Couldn't open <basename>: <ipcError.message>"; state unchanged.

### Save

- If `state.kind === 'document'` and `state.path` exists: serialize `state.doc` via existing YAML formatter → `write_yaml_file(state.path, yaml)` → toast "Saved." → mark `dirty: false`.
- If somehow there's no path (cannot happen in M7-spike since every doc was opened from disk; but defensive): fall through to Save As.

### Save As

- Invokes `save({ filters: [{ name: 'YAML', extensions: ['yaml'] }], defaultPath: state.path })` from `@tauri-apps/plugin-dialog`.
- On selected path: serialize doc → `write_yaml_file(newPath, yaml)` → **switch `state.path` to the new location** (so future Saves go there; autosave switches with it; title bar updates) → toast "Saved As." → mark `dirty: false`.
- On cancel: state unchanged.
- **Out-of-library toast (M8-meaningful, dormant in M7-spike):** if the new path is outside `config.paths.cloudSyncRoot`, show "Saved to {path}. This document is outside your library folder and won't appear in the library." In M7-spike there's no configured library folder yet (no install wizard wired), so this toast never fires. T-121's unit tests still exercise the branch with a mocked config so the code path doesn't bit-rot before M8 makes it live.

### Export PDF

- Pre-renders the current doc to self-contained HTML via `renderStaticHtmlForExport(state.doc, brand)` (T-118).
- `invoke('export_pdf', { html, suggestedName: '<docBasename>.pdf' })` → returns `{ kind: 'browser_handoff', path: '/tmp/.../docsystem-export/.../foo.pdf.html' }`.
- `invoke('plugin:shell|open', { path: returnedTempPath })` (via `@tauri-apps/plugin-shell`) → opens the temp HTML in the user's default browser.
- Tauri 2.x's shell plugin requires the `shell:allow-open` capability plus a `plugins.shell.open` regex in `tauri.conf.json`. The capability decides which windows may call `open`; the plugin regex is the only path / URL constraint used by `tauri-plugin-shell-*/src/commands.rs::open`. An inline `allow: [{ path: ... }]` scope on the capability has no runtime effect for `open`, and configuring only the capability produces the plugin's "purposefully impossible regex" runtime denial.
- Toast: "Opened in your browser — use Cmd-P / Ctrl-P to save as PDF."

### Autosave (inherited from T-82, not re-implemented)

- The existing `src/editor/autosave.ts` debouncer (default 2s, configurable via `AppConfig.editor.autosaveDebounceMs`) fires `write_yaml_file(state.path, yaml)` after the debounce.
- **Always writes to `state.path`.** Save As changes `state.path` → next autosave goes to the new location automatically. No special handling required.
- Autosave is silent (no toast); only the `●` indicator in the title bar reflects in-flight writes.

---

## Browser PDF handoff (T-118)

**Task ownership.** T-118 ships the "engine" only — `renderStaticHtmlForExport` + the `export_pdf` Rust IPC + the shell-plugin registration + the temp-dir cleanup hook + Cargo/npm dep adds + tests + `TAURI_IPC.md` update. **T-118 produces no UI components.** The File → Export PDF menu item, the `shell.open` invocation, and the "Opened in your browser…" toast all live in `src/ui/menu/FileMenu.tsx` (T-121). This split keeps the IPC + pre-render contract independently testable (T-118's JS smoke test invokes `export_pdf` directly, no menu involved) and avoids duplicating menu items across two tasks.

The M7-spike design for PDF export is a **two-step UX, zero-packaging** choice. Reasons:

1. **Zero added install surface.** Shipping a one-click in-app PDF requires bundling Playwright + a Node sidecar + a Chromium binary — ~120-180 MB per platform, 2-3 days of packaging engineering. That's a v1.1 task (see `docs/TASKS.md` "Future task note — post-M7 / v1.1") and explicitly outside M7-spike scope.
2. **Deterministic-enough fidelity.** Pre-rendered self-contained HTML + the user's browser print engine produces a result that's "good enough for v1" for proposals and reports. Most consultants already know `Cmd-P` → "Save as PDF" — the UX surprise is minimal.
3. **Mermaid + ECharts work in the browser without Node.** The existing `Diagram` and `Chart` blocks already render in the renderer process; reusing them via `renderToStaticMarkup` + `mermaid.render()` + `echarts.renderToSVGString()` produces inline SVGs in the exported HTML.

### Pre-render pipeline (`src/export/render-static-html.ts`, T-118)

```ts
export async function renderStaticHtmlForExport(
  doc: DocModel,
  brand: BrandTokens,
  docFolderPath: string,
  sharedFolderPath: string,
): Promise<string>;
```

1. Resolve all `mermaid` blocks → call `mermaid.render(id, src)` → get SVG string → replace block content with SVG.
2. Resolve all `echarts` blocks → `echarts.init(offscreenEl, null, { renderer: 'svg' }).renderToSVGString()` → SVG string.
3. Resolve all `image` blocks via the existing brand-token asset resolver, then inline them as `data:` URIs using the scoped `read_binary_file` IPC. Per-image cap: 5 MB. Total image payload cap: 50 MB. Over-cap images fall back to an inline "Image too large to export" SVG placeholder.
4. Render the doc tree via `renderToStaticMarkup(<DocumentRenderer doc={doc} brand={brand} imageDataUris={...} />)`.
5. Wrap the rendered HTML in:
   ```html
   <!doctype html>
   <html>
     <head>
       <meta charset="utf-8" />
       <title>{doc.meta.title}</title>
       <style>
         @page {
           size: A4 portrait;
           margin: 1.5cm;
         }
         /* inlined brand-derived CSS */
       </style>
     </head>
     <body>
       {rendered}
     </body>
   </html>
   ```
6. Return the full HTML string. **Zero external asset refs** (all images inlined as `data:` URLs from the existing brand-token resolver), **zero `<script>` tags** (renderer is purely SSR for the export path).

### SVG sanitization contract (`sanitizeSvgForImage`, T-123p)

The pre-render pipeline embeds every SVG image (and the pre-rendered Mermaid/ECharts SVGs) as `data:image/svg+xml;base64,…` consumed by `<img src=…>`. Browsers script-disable SVG content loaded through `<img>` — `<script>`, `on*=` handlers, SMIL animations, CSS `expression()`, and `<foreignObject>` HTML are all inert in that embedding context.

`sanitizeSvgForImage` (in `src/export/render-static-html.ts`) is a defense-in-depth allowlist-by-removal pass that strips:

- `<script>` blocks (DOM execution vector)
- `<style>` blocks (CSS `expression()` + `url(javascript:)`)
- `<foreignObject>` blocks (HTML smuggling)
- `<animate>`, `<animateMotion>`, `<animateTransform>`, `<set>` elements (SMIL can re-target a static-safe `href` to `javascript:` after sanitization)
- `href="javascript:…"` and `xlink:href="javascript:…"` attributes on any element
- `on*=` event-handler attributes

**Safe ONLY for `<img src="data:image/svg+xml,…">` consumption.** If the sanitized SVG is ever rendered via `<object>`, `<iframe>`, or inline `<svg>`, the sanitizer is insufficient — those contexts execute scripts, animations, and styles, and the contract must be re-audited (likely with a real SVG parser, not regex). The cross-boundary constraint also applies to anything reading the data URI back through `src-tauri/src/ipc/fs.rs::read_binary_file` — that IPC's MIME allowlist is the upstream half of the same contract.

### Rust side (`src-tauri/src/ipc/pdf.rs`, T-118)

Replaces the current no-op stub. Accepts `{ html: String, suggestedName: String }`. Writes the HTML to `<tmpdir>/docsystem-export/<uuid>/<sanitizedName>.html`. Returns `{ kind: 'browser_handoff', path: String }`.

Temp file location + cleanup policy: **system temp dir (`std::env::temp_dir()`) + UUID subfolder; cleanup on next launch** (resolved by T-116 Decision #2 — see §Architectural decisions). On Tauri's `setup` hook, the app sweeps `<tmpdir>/docsystem-export/` via `fs::remove_dir_all` before any window opens. Idempotent + OS-friendly + no orphan files left after a crash.

Suggested-name sanitization: the `suggestedName` parameter is sanitized to `[A-Za-z0-9._ -]+` (other characters replaced with `_`), leading dots stripped, max length 200 chars (Windows path-length safety), and the final concatenated path is `Path::canonicalize`-validated to live under `<tmpdir>/docsystem-export/` before being returned. Tests in T-118 cover the path-traversal rejection case. (See T-116 Decision #2 for the full contract.)

### Brand source

**Hardcoded `brand.example.yaml`** for M7-spike (resolved by T-116 Decision #1 — see §Architectural decisions). Loaded via a shared module `src/brand/defaultBrand.ts` (T-120 output) that owns the Vite raw import + the one-time parse:

```ts
// src/brand/defaultBrand.ts
import brandYaml from "../../brand.example.yaml?raw"; // src/brand → src → repo root
import { parse } from "yaml";
import { BrandTokensSchema, type BrandTokens } from "../schema/brand";

export const defaultBrand: BrandTokens = BrandTokensSchema.parse(parse(brandYaml));
```

DocumentView (and `renderStaticHtmlForExport`) both import `defaultBrand` from `src/brand/defaultBrand.ts`. This keeps the Vite raw import in exactly one place — readable, testable, and easy for M8/M9 to swap when a user-configurable brand-picker lands. M8+ may add a brand-picker / brand-folder surface (see `docs/SETUP_INSTALL_FLOW.md` Step 3 for the future contract).

---

## Watchdog + error boundary (T-122)

Per ADR-0001 (no iframe sandbox; runtime watchdog is the trust boundary) and D-39 (perf budget):

- `DocumentView` is wrapped with `withRenderWatchdog` (existing HOC in `src/block-primitives/RenderWatchdog.tsx`).
- A new `AppErrorBoundary` (T-122) wraps DocumentView in `src/App.tsx`. A thrown block renders `RenderFailedPlaceholder` for that block; if the error escapes the per-block boundary, AppErrorBoundary catches it and renders a top-level error panel reading "Document failed to render — unsaved edits may be lost. Try reopening the file, or return to the welcome screen." The panel has two buttons: "Try reopen" (re-invokes the open flow on the current `state.path`) and "Back to welcome screen" (the **error-only reset** transition documented in §State model — discards `state.doc` + `state.path` and returns to the welcome state).

The combination of per-block placeholder + per-DocumentView error boundary means a single bad block never crashes the app, and a catastrophic doc-level failure surfaces gracefully.

---

## Architectural decisions (T-116 — CLOSED)

> **Status:** RESOLVED 2026-05-26 by T-116. The two questions T-115 queued have explicit calls below. T-117..T-123 may now fire.

### Decision #1 — Brand source for the spike

**Decision: (a) — hardcoded `brand.example.yaml`, loaded via Vite raw import at build time.**

- **Options considered:**
  - **(a) Hardcoded `brand.example.yaml`** — load at build time via `import brandYaml from '../brand.example.yaml?raw'`; parse once on app boot.
  - **(b) File → Open Brand surface** — separate File menu item that prompts for a brand YAML path, validates against `BrandTokensSchema`, persists to config.
- **Why (a):** the spike's purpose is to validate the editor surface end-to-end. Adding a brand-picker doubles the install surface (a second file dialog, brand-validation error states, brand-config persistence) for zero learning about the editor. `brand.example.yaml` is already maintained as the canonical reference brand for tests and demos; reusing it costs nothing.
- **Why not (b):** brand-folder selection is a real consultancy concern (each firm has their own brand book), but the right place to surface it is the M8 install wizard or M9 settings panel — where multi-field config (folder + identity + LLM keys) already needs UI. Folding brand-picker into M7-spike would force half of M8's settings UI in early.
- **Implementation contract for T-120:**
  - T-120 adds `src/brand/defaultBrand.ts` — a tiny module that performs `import brandYaml from '../../brand.example.yaml?raw'` (relative path from `src/brand/` up to repo root), parses with `yaml.parse`, validates against `BrandTokensSchema`, and exports a single `defaultBrand` constant. Module-level evaluation runs once at load time.
  - DocumentView imports `defaultBrand` from `src/brand/defaultBrand.ts` and passes it to `<DocumentRenderer brand={defaultBrand}>`. `renderStaticHtmlForExport` (T-118) imports the same constant when called.
  - The brand import lives in exactly one file. DocumentView does NOT do the Vite raw import directly — that would put a relative path (`../../../brand.example.yaml?raw`) in `src/ui/views/DocumentView.tsx`, which is both error-prone and harder to mock in tests.
  - No brand-related UI in M7-spike: no menu items, no settings, no toasts.
- **M8 forward-reference:** T-127's folder-picker stays minimal (single dialog, just `paths.cloudSyncRoot`); brand-folder selection lands later — M9 or M9+ when AI cost attribution and identity entry also need surfacing.
- **Consumer tasks:** T-120 (DocumentView mount), T-118 (`renderStaticHtmlForExport` signature).

### Decision #2 — Temp HTML file location + cleanup policy

**Decision: (a) + (ii) — system temp dir (`std::env::temp_dir()`) + UUID subfolder + cleanup on next app launch.**

- **Options considered:**
  - **Location: (a) `std::env::temp_dir()`** vs **(b) app config dir.**
  - **Cleanup: (i) on app quit** vs **(ii) on next launch** vs **(iii) never (rely on OS temp-dir cleanup).**
- **Why (a) — temp dir:** that's literally what the OS temp dir is for. Putting transient export artefacts in the app config dir would pollute a user-facing location, surprise consultants on backup tools, and create a "what is this file?" recovery question every time we crash with files left behind.
- **Why (ii) — cleanup on next launch:** on-quit cleanup (i) requires an `app.on_window_event(WindowEvent::CloseRequested ...)` hook that runs reliably across macOS (Cmd-Q), Windows (X button), Linux (kill signals), AND crashes. On-launch cleanup (ii) is a single function called from `main()` before any export happens — works in 100% of scenarios including crash recovery. (iii) "never" is technically defensible (OS reaps temp eventually) but a consultant exporting 5 docs/day for a month would leave 150 abandoned ~2 MB HTML files in their temp dir — visible to `du` audits and "what's filling my disk?" investigations.
- **Concrete contract for T-118:**
  - **Root path:** `<tmpdir>/docsystem-export/` where `<tmpdir> = std::env::temp_dir()`.
  - **Per-export path:** `<tmpdir>/docsystem-export/<uuid-v4>/<sanitized-base-name>.html`. The UUID subfolder isolates concurrent exports and lets the next-launch sweep be a simple `remove_dir_all`.
  - **Sanitization:** the steps applied to `suggestedName` (in order):
    1. **Strip a trailing `.pdf` (case-insensitive)** if present. The renderer-side FileMenu (T-121) passes a name like `"Proposal.pdf"` for consistency with the user's "Save as PDF" mental model, but the temp file is HTML — we don't want `Proposal.pdf.html` cluttering the temp dir. So the contract is: callers MAY include `.pdf`; Rust strips it before appending `.html`.
    2. Sanitize the remaining base name to `[A-Za-z0-9._ -]+` (other characters replaced with `_`); strip leading dots; clamp to 200 chars (Windows path-length safety).
    3. The final concatenated path is `Path::canonicalize`-checked to confirm it lives under `<tmpdir>/docsystem-export/` (defence-in-depth against path traversal even after sanitization).
  - **Cleanup function:** `cleanup_export_temp_dir()` called once from `lib.rs` `setup` hook (Tauri's startup phase, before any window opens). Implementation: `let root = env::temp_dir().join("docsystem-export"); if root.exists() { let _ = fs::remove_dir_all(&root); }`. Errors are logged (via `log::warn!`) but never propagate — the export still works on a fresh `<uuid>` subfolder created on demand.
  - **Per-export setup:** `export_pdf` creates `<tmpdir>/docsystem-export/<new-uuid>/` lazily via `fs::create_dir_all` before writing.
  - **Known limitation (accept for M7-spike, revisit in M9+):** because cleanup wipes the entire `docsystem-export/` tree on launch, a previously-exported temp HTML disappears the next time the app starts — even if the user still has the export tab open in their browser and tries to reload it. Acceptable for the spike (consultants are guided to `Cmd-P` immediately after the tab opens, before reloading); M9+ may switch to TTL-based cleanup (sweep only entries older than 24h, or sweep individual `<uuid>` dirs on a per-export quit hook) once consultant testing surfaces the tab-reload friction in real workflows.
- **Return contract:** `export_pdf(html, suggestedName) -> Result<ExportHandoff, IpcError>` where `ExportHandoff = { kind: 'browser_handoff', path: String }`. The `path` is what the renderer passes to `shell.open`.
- **Why not write the user-facing PDF directly to the export dir:** the spike doesn't produce a PDF — the user does (via browser Cmd-P). The temp HTML is intermediate; once the browser opens it, the consultant saves the PDF wherever they want. We never own the final artefact.
- **Consumer tasks:** T-118 (`export_pdf` Rust impl + the new `setup`-phase cleanup hook), T-121 (FileMenu invokes the IPC + `shell.open`).

### Closed-decision recap

| #   | Decision                                                                                                            | Consumer      | Status     |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------- | ---------- |
| 1   | Brand source = hardcoded `brand.example.yaml` (Vite raw import, build-time)                                         | T-120 + T-118 | **CLOSED** |
| 2   | Temp HTML = `std::env::temp_dir() + /docsystem-export/<uuid>/` + cleanup on next launch (sweep `docsystem-export/`) | T-118 + T-121 | **CLOSED** |

T-117..T-123 are unblocked. Future amendments to this spec (M8+) append new dated sections; this T-116 closure block stays as-is for audit trail.

---

## Performance budgets (D-39)

M7-spike inherits the existing perf budgets from D-39 and ADR-0001:

- **DocumentView mount time:** ≤ 500ms p95 for sample-proposal.yaml (existing renderer benchmark target).
- **Per-block render time:** ≤ 50ms p95 (existing watchdog threshold; nothing M7-spike-specific).
- **Autosave latency:** debounce 2s default; the actual `write_yaml_file` IPC round-trip ≤ 100ms p95 (small file, local disk).
- **PDF pre-render:** `renderStaticHtmlForExport` ≤ 2s p95 for sample-proposal.yaml (no explicit watchdog; this is a user-initiated action with a clear "processing…" UI state).

No new benchmark targets are introduced. T-89c's perf-benchmark harness continues to pass.

---

## Keyboard shortcuts (M7-spike inventory)

| Shortcut               | Action                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Cmd/Ctrl + O`         | File → Open                                                                                                          |
| `Cmd/Ctrl + S`         | File → Save                                                                                                          |
| `Cmd/Ctrl + Shift + S` | File → Save As                                                                                                       |
| `Cmd/Ctrl + P`         | File → Export PDF (note: native browser print is `Cmd-P` AFTER the temp HTML opens)                                  |
| `/`                    | Open BlockPalette (when editor has focus and cursor is at a "fresh paragraph" position — same heuristic Notion uses) |
| `Esc`                  | Close BlockPalette without inserting                                                                                 |

Standard editor shortcuts (undo, redo, formatting) come from the existing Editor.

---

## Accessibility

- The welcome screen `<button>` has accessible name "Open Document".
- DocumentView has a `<main>` landmark; the BlockPalette popup gets `role="dialog"` + `aria-label="Insert block"` + focus-trap when open.
- The MenuBar uses native `<menu>` / `<menuitem>` semantics via the underlying Tauri menu API (or a `role="menubar"` + `role="menuitem"` polyfill if M7-spike uses an HTML menu — T-121 picks the approach).
- All keyboard shortcuts above are operable without a mouse.

No new accessibility commitments beyond existing-app surface conventions.

---

## File locations

```
src/
  App.tsx                                 # rewritten (T-119) — single-state shell
  brand/
    defaultBrand.ts                       # new (T-120) — owns the Vite raw import
                                          #   of brand.example.yaml (only place the
                                          #   asset path lives in source); parses
                                          #   + validates once at module load
  ui/
    AppErrorBoundary.tsx                  # new (T-122) — panel w/ "Try reopen"
                                          #   + "Back to welcome" (error-reset)
    menu/
      MenuBar.tsx                         # new (T-121)
      FileMenu.tsx                        # new (T-121) — Open/Save/Save As/Export PDF
    views/
      DocumentView.tsx                    # new (T-120 + T-120b)
      (WelcomeScreen optional inline)
  export/
    render-static-html.ts                 # new (T-118) — engine, no UI
src-tauri/
  src/
    ipc/
      fs.rs                               # hardened read+write only (T-117)
      pdf.rs                              # body replaced with browser-handoff (T-118)
    lib.rs                                # register tauri_plugin_shell::init() +
                                          #   call cleanup_export_temp_dir() from
                                          #   setup hook (T-118)
  capabilities/
    main-window.json                      # grants shell:allow-open; path/URL scope
                                          # is enforced by plugins.shell.open
  Cargo.toml                              # add uuid dep (T-118)
docs/
  UI_APP_SHELL.md                         # this file (T-115) + decisions appended by T-116
  TAURI_IPC.md                            # export_pdf section updated by T-118
tests/
  integration/
    m7-spike-harness.ts                   # T-123
    m7-spike-happy-path.test.ts           # T-123
    m7-spike-error-paths.test.ts          # T-123
  export/render-static-html.test.ts       # T-118
  ipc/fs.smoke.test.ts                    # T-117
  ipc/pdf.smoke.test.ts                   # T-118
  ui/App.test.tsx                         # T-119
  ui/views/DocumentView.test.tsx          # T-120 + T-120b extensions
  ui/menu/FileMenu.test.tsx               # T-121
  ui/AppErrorBoundary.test.tsx            # T-122
```

---

## What this spec deliberately doesn't include

M7-spike-scope is narrow on purpose. Things this spec **does not describe** because they're not in M7-spike:

- **No library view** (card grid, folder scan, filters). See `docs/UI_LIBRARY.md` for the M8 design (T-128 + T-129).
- **No install wizard** (folder picker, identity entry, LLM keychain setup). The CLI install in `src/setup/install.ts` stays available for devops batch rollouts; the GUI folder picker is M8 T-127.
- **No comments / AI proposal flow.** See `docs/UI_REVIEW_PANEL.md` for the M9 design.
- **No deck rendering or navigation.** M10.
- **No reviewer mode.** M11.
- **No settings panel.** M9 surfaces the deferred-UI list (autosave debounce slider, cost-tracking toggle, library folder re-pick, identity, brand picker, in-app generated-block creation).
- **No keychain wiring.** No AI in M7-spike means no keys to store; M9 wires `get_secret` / `set_secret`.
- **No router.** Single-state hook in App.tsx is fine for two states. M8 T-126 introduces `src/ui/router/Routes.tsx` with typed routes.
- **No multi-document / multi-window.** One doc at a time, one window. Tabs are M9+ (route shape supports them per T-126). Multi-window is undated future work.
- **No drag-and-drop file open.** Native dialog only.
- **No "Recent documents" menu.** No `lastOpenPath` persistence either — per grilling Q9 the app always starts at welcome (M7-spike) or library (M8). Last-open persistence is deferred until consultant testing surfaces it as friction.
- **No signed installers / auto-updater.** Phase 9 (T-108, T-109).

---

## Acceptance checklist (per T-115)

T-115 ships this spec; T-116 appends the two decisions; T-117..T-123 implement against it.

- [x] Describes the single-document shell architecture (no router, no install wizard, no library scan).
- [x] Documents the File menu wiring (Open / Save / Save As / Export PDF) with explicit Save vs Save As semantics.
- [x] Documents the browser PDF handoff pipeline (`renderStaticHtmlForExport` → IPC writes temp → `shell.open`).
- [x] Documents the watchdog + error-boundary wrap.
- [x] Documents the BlockPalette mount + insertion mechanism (T-120b scope).
- [x] Lists the two T-116 decisions (brand source + temp-file policy/location) with recommendations.
- [x] Cross-references the deferred work (library, comments, deck, install wizard, etc.) so M8+ plans can pick up the right design without re-discovering this spike's choices.
- [x] Explicitly enumerates what M7-spike doesn't do (the "deferred to M8+" matrix above) and why.
- [x] Lists file locations + perf budgets + keyboard shortcuts + accessibility commitments.

The M7-spike acceptance gate (per BUILD_BRIEF.md §3 M7) is equivalent to T-123 passing — that's not this task's gate.

---

## M7-spike change log

- 2026-05-26 — T-115: initial spec.
- 2026-05-26 — T-116: rewrote the "Architectural decisions" section as CLOSED. Decision #1: brand = hardcoded `brand.example.yaml` (Vite raw import). Decision #2: temp HTML in `std::env::temp_dir()/docsystem-export/<uuid>/` + cleanup-on-next-launch via Tauri `setup` hook. T-117..T-123 unblocked.
- 2026-05-26 — M7 spec review fixes (non-task amendment commit): (a) brand import now lives in `src/brand/defaultBrand.ts` instead of being raw-imported from inside DocumentView (the original `'../brand.example.yaml?raw'` path was wrong for `src/ui/views/`); T-120 outputs updated. (b) T-118 explicitly produces no UI — `ExportPdfMenuItem.tsx` removed from T-118 outputs; T-121's `FileMenu.tsx` owns ALL menu UI for Export PDF. (c) Added the error-only `document → welcome` reset transition (button on AppErrorBoundary panel; not a user-initiated close); T-122 outputs and acceptance updated. (d) Documented the known limitation that cleanup-on-launch invalidates previously-opened browser tabs (acceptable for spike; M9+ may revisit). (e) Rust strips a trailing `.pdf` from `suggestedName` before appending `.html`, so `Proposal.pdf` → `Proposal.html` not `Proposal.pdf.html`.
- M8 (T-124, future): appends an M8 section describing the router refactor, the folder-picker routing, the partial-config schema decision, and the multi-doc-ready route shape. M8 builds on this M7-spike spec rather than rewriting it.

---

# M8 — Library + Templates + Generated Blocks

This section is appended by T-124. It is the architecture spec the rest of M8 (T-125..T-134) executes against. M7-spike content above is unchanged; M8 builds on top.

## What M8 adds (scope)

- A **router** (`src/ui/router/Routes.tsx`) — typed route table for `welcome`, `folder-picker`, `library`, `document`. The current `AppState` discriminated union in `src/App.tsx` becomes the router's `Route` type, slightly extended.
- A **first-launch folder picker** (`src/ui/install/FolderPickerScreen.tsx`) — single screen, one button. The full CLI install in `src/setup/install.ts` stays available for batch rollouts (devops, scripted installs); the GUI picker only collects `paths.cloudSyncRoot`.
- A **library view** — `src/ui/library/LibraryView.tsx` and friends. Recursive folder scan via `list_directory` IPC, per-folder `read_yaml_file` for `meta` blocks, filters + sort + search + grid/list. Empty-state "Use Sample" button copies `examples/sample-proposal.yaml` into the configured folder.
- **4 standard document templates** under `templates/` — proposal, proposal-deck, report, report-deck. Loaded via Vite raw imports.
- A **"Create from Template" modal** — clones a template into `<cloudSyncRoot>/<userName>.yaml` and routes to DocumentView.
- **Generated-blocks runtime loading** — `loadGeneratedBlocks(generatedBlocksPath)` is called at app startup, results stashed in `GeneratedBlocksContext`, surfaced through BlockPalette's existing `generatedBlocks` prop.
- Hardened **fs + config IPC** — the 4 remaining fs commands (`list_directory`, `file_exists`, `ensure_directory`, `move_file`) and the 3 config commands (`read_app_config`, `write_app_config`, `get_config_dir`) gain real bodies + cargo + JS smoke tests.

M8 does NOT add: per-doc tabs (route shape supports them but UX is single-doc), settings panel, comments/AI proposals, deck rendering rework, reviewer mode, signed installers, auto-updater, drag-and-drop file open, recent-documents menu.

## D-101 — Partial config schema for M8

**The problem.** `InstallAppConfigSchema` in `src/setup/install.ts:32-59` requires the full identity + LLM keys + paths shape (`user`, `paths`, `llm`, `costLimits`, `editor`). M8 ships only `paths.cloudSyncRoot`. The other fields land in M9 (identity, keychain) and beyond. The schema needs a defined relationship with the M8-era partial state.

**Decision: option (a) — introduce `M8PartialConfigSchema` requiring only `paths.cloudSyncRoot`; widen to `InstallAppConfigSchema` in M9.**

Rationale:
- Option (b) "make M9-bound fields optional in `InstallAppConfigSchema`" — would let invalid M9 states pass validation (e.g., LLM keys missing when AI features are advertised as active). Future drift; rejected.
- Option (c) "stub config with sentinel placeholders" — `user.email: "unknown@example.com"`, `llm.fastModel.keychainEntry: "unset"`, etc. A reader can't distinguish "intentionally empty" from "wizard never asked", which breaks every downstream validator that relied on `.email()` / `.min(1)` actually meaning something. Rejected.
- Option (a) wins because it preserves type-level distinguishability between "M8 install (paths only)" and "full M9 install (paths + identity + LLM)". The M9 migration is a structural widen — purely additive on the type lattice — and the type system catches consumers who assume the full shape against an M8 partial.

**Schema (lives in `src/schema/app-config.ts`, NEW in T-125):**

```typescript
// src/schema/app-config.ts (NEW — T-125)
import { z } from "zod";

// What M8 actually writes from the GUI folder picker.
export const M8PartialConfigSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),  // M8 marker; M9 bumps to "0.2.0"
    paths: z
      .object({
        cloudSyncRoot: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type M8PartialConfig = z.infer<typeof M8PartialConfigSchema>;
```

The full `InstallAppConfigSchema` in `src/setup/install.ts` stays untouched; it's still what the CLI install writes (CLI = full identity + LLM = full shape). When M9 lands keychain + identity + LLM into the GUI, a successor `M9AppConfigSchema` will widen the GUI write — superseding `M8PartialConfigSchema` without breaking M8 installs (the discriminator is `schemaVersion`).

**Read path.** `read_app_config` IPC returns raw JSON (no Rust-side schema knowledge). The JS side parses against `M8PartialConfigSchema.safeParse(...)` and falls back to `InstallAppConfigSchema.safeParse(...)` when the M8 parse fails — so existing CLI-installed configs (full shape) keep working. On both failures, the router routes to `folder-picker` with `reason: 'first-launch'`.

**Write path.** The folder picker writes only `M8PartialConfigSchema` shape; the file is YAML at `<configDir>/config.yaml` (location per `docs/SETUP_INSTALL_FLOW.md` §"Configuration file written"). Atomicity uses the same write-then-rename pattern as `write_yaml_file`.

**M8-vs-M9 migration.** When M9 lands, an idempotent migration runs on every boot:
1. `read_app_config` returns the current JSON.
2. If it parses as `M8PartialConfigSchema` AND not `M9AppConfigSchema`, the M9 router routes the user through the identity + keychain wizard, then `write_app_config` upgrades the shape to `M9AppConfigSchema`. The migration is a one-way structural widen — no data loss.

## D-102 — Router library choice

**The problem.** The current `App.tsx` uses a 2-variant discriminated union (`welcome | document`). M8 grows this to 4 variants with intent-dispatched transitions and a boot-time async config read. The mainstream options:

- **React Router DOM v6** — popular, mature, but designed for URL-bar-driven routing. The desktop app has no URL bar; the route is purely in-memory state.
- **TanStack Router** — type-safe, file-based, modern. Same URL-bar mismatch as React Router; also adds ~30KB minified to the renderer bundle.
- **Custom typed routes** — extend the existing discriminated-union pattern in `App.tsx`. No new dependency. Type-safe via `z.discriminatedUnion` if needed.

**Decision: custom typed routes — no new dependency.**

Rationale:
- The app has 4 routes. The complexity threshold where a library pays for itself isn't crossed.
- Tauri's webview has no URL bar (no `<a href="...">`-style navigation). Routes are intents (open library, open document, etc.), not URLs.
- Routes are deeply typed. `library` carries the scan result; `document` carries the open doc array + active index; `folder-picker` carries the `reason` flag. A library that hides those in a generic `params` bag would lose the type-safety the rest of the codebase relies on.
- The 4 routes are unlikely to grow much in M9 (settings sub-routes will be flat siblings, not nested).

**Implementation (lives in `src/ui/router/Routes.tsx`, NEW in T-126):**

```typescript
// src/ui/router/types.ts (NEW — T-126)
export type Route =
  | { kind: "welcome" }  // legacy reset target; never the launch route
  | { kind: "folder-picker"; reason: "first-launch" | "missing" }
  | { kind: "library" }
  | {
      kind: "document";
      openDocs: Array<{ id: string; path: string }>;
      activeIndex: number;
    };

export type RouteIntent =
  | { intent: "open-document"; path: string }   // also from File → Open
  | { intent: "create-from-template"; templateId: string; newDocName: string }
  | { intent: "back-to-library" }
  | { intent: "re-pick-folder" }                // from "folder missing" banner
  | { intent: "use-sample" };                   // empty-library button
```

The `Route` discriminated union is the router's state. `RouteIntent` is the message bus: every UI event that wants to change routes dispatches a `RouteIntent`, the router reduces it to a new `Route`. This separation keeps components from manipulating route state directly — they request intents.

```typescript
// src/ui/router/Routes.tsx (NEW — T-126)
import { useEffect, useReducer } from "react";
import { withRenderWatchdog } from "../../block-primitives/RenderWatchdog";
// ...

interface RouterProps {
  bootStrategy: BootStrategy;  // injected for tests; production uses the IPC implementation
}

function routeReducer(route: Route, intent: RouteIntent): Route { /* … */ }

export function Routes({ bootStrategy }: RouterProps) {
  const [route, dispatch] = useReducer(routeReducer, { kind: "welcome" });

  useEffect(() => {
    void bootStrategy.bootRoute().then((next) => dispatch({ intent: "__set", route: next }));
  }, [bootStrategy]);

  switch (route.kind) {
    case "welcome":          return <WelcomeScreen onOpen={…} />;
    case "folder-picker":    return <FolderPickerScreen reason={route.reason} dispatch={dispatch} />;
    case "library":          return <LibraryView dispatch={dispatch} />;
    case "document":         return <DocumentView openDocs={route.openDocs} activeIndex={route.activeIndex} dispatch={dispatch} />;
  }
}
```

Each route component is wrapped with `withRenderWatchdog` so a thrown block in the document route can't take down library navigation. The watchdog budget for `library` is `LIBRARY_VIEW_RENDER_BUDGET_MS = 1500` (covers a 500-doc index scan); `document` keeps `DEFAULT_DOCUMENT_VIEW_RENDER_BUDGET_MS = 500` from M7-spike; `folder-picker` and `welcome` are trivial and use the default block budget.

## D-103 — Boot strategy + missing-folder check

The router's first action on mount is to decide which route to land on:

```typescript
// src/ui/router/boot.ts (NEW — T-126)
export interface BootStrategy {
  bootRoute(): Promise<Route>;
}

export function createIpcBootStrategy(): BootStrategy {
  return {
    async bootRoute() {
      // 1) Try to read app config.
      let config: M8PartialConfig | InstallAppConfig | null;
      try {
        const raw = await invoke<unknown>("read_app_config");
        config = parseConfig(raw);  // M8PartialConfigSchema | InstallAppConfigSchema | null
      } catch (error) {
        if (isIpcError(error) && error.kind === "not-found") {
          return { kind: "folder-picker", reason: "first-launch" };
        }
        throw error;
      }
      if (config === null) {
        return { kind: "folder-picker", reason: "first-launch" };
      }

      // 2) Verify the configured folder still exists.
      const exists = await invoke<boolean>("file_exists", { path: config.paths.cloudSyncRoot });
      if (!exists) {
        return { kind: "folder-picker", reason: "missing" };
      }

      // 3) Healthy boot — go to library.
      return { kind: "library" };
    },
  };
}
```

**Why a strategy interface, not direct IPC.** Tests inject a fake `BootStrategy`. The M7-spike test (`tests/integration/m7-spike-harness.ts`) keeps working by passing a strategy that synchronously resolves to `{ kind: "document", openDocs: [<test doc>], activeIndex: 0 }` — bypassing the boot probe entirely. T-126's acceptance bullet "M7-spike happy-path test still passes after refactor" depends on this seam.

**Why the welcome screen sticks around.** It's the **error-only reset target** from M7-spike (AppErrorBoundary's "Back to welcome" button). After a catastrophic render failure, the user lands on `welcome`, then clicks "Open" → goes to document. Post-M8, "Back to welcome" still works for tests and for the AppErrorBoundary's reset path; production users don't usually see it during normal navigation (they go library ↔ document).

## D-104 — App always starts at library

**Decision: no `lastOpenPath` persistence.** The app boots to `folder-picker` (first-launch / missing) or `library` (healthy). It never boots straight into a previously-open document.

Rationale: consultants are document-bouncing-frequent — they open ~5-10 different docs per day. Auto-restoring the last-open doc would frequently land them in the wrong context. The Library is the daily-entry point per `docs/DECISIONS.md` D-27. Save the persistence work for M9 if consultant testing surfaces it.

## D-105 — Multi-doc-ready route shape

**Decision: `document` route carries `openDocs: Array<{id, path}>` + `activeIndex`, even though M8 renders only one doc at a time.**

```typescript
// Route type fragment.
| {
    kind: "document";
    openDocs: Array<{ id: string; path: string }>;
    activeIndex: number;
  }
```

M8 invariant: `openDocs.length === 1`. The DocumentView component receives only `openDocs[activeIndex]` and ignores the rest. M9+ will add a tab bar that reads the array; the route shape doesn't need rearchitecting.

The `id` is a stable doc identifier (used by future tab key prop + AppErrorBoundary "this tab failed" handling). For M8 it can be `<path>` itself; M9 will switch to a deterministic UUID seeded by `<path>`.

## D-106 — Library state + index lifecycle

The library's data shape is `LibraryIndex` per `docs/UI_LIBRARY.md:128-132`. M8 implements only the launch-scan path (`buildLibraryIndex(root) → LibraryIndex`). The file-watcher refresh path is deferred to M9.

```typescript
// src/library/index-builder.ts (existing pure logic — preserved by T-128)
export function buildLibraryIndex(entries: RawDocFolder[]): LibraryIndex;

// T-128 NEW — IO wrapper around the existing pure builder.
export async function scanCloudSyncRoot(root: string): Promise<LibraryIndex>;
```

`scanCloudSyncRoot` issues one `list_directory(root, { recursive: true, maxDepth: 4 })` IPC call, then for every folder containing exactly one `*.yaml` file, calls `read_yaml_file` and parses **only** the `meta:` block (not the full doc — too slow at 500 docs). The full-doc parse happens only when the user opens a card.

**Performance budget.** Per `docs/UI_LIBRARY.md:170`, 500-doc index in < 2s. The `verify-gates.sh` test suite doesn't enforce that budget; T-128's acceptance includes a perf assertion: `tests/ui/library/LibraryView.test.tsx` runs against a 100-doc fixture and asserts the scan completes in < 400ms locally (extrapolates to < 2s on 500 docs on a CI-comparable runner).

## D-107 — "Use Sample" empty-state flow

When the library scan returns zero docs, render `EmptyLibraryState.tsx` with a single "Use Sample Document" button. On click:

1. Read `examples/sample-proposal.yaml` from the app bundle via Vite raw import (`import sampleProposalYaml from '../../../examples/sample-proposal.yaml?raw'`).
2. Call `ensure_directory` IPC to create `<cloudSyncRoot>/Sample Proposal/` (per D-19: each doc is a folder, not a flat file).
3. Call `write_yaml_file` IPC with `{ path: <cloudSyncRoot>/Sample Proposal/proposal.yaml, content: sampleProposalYaml }`.
4. Re-run `scanCloudSyncRoot(cloudSyncRoot)` → returns 1-doc index.
5. Render the card grid.

The Vite raw import keeps the sample bundled inside the app binary (no install-time copy step). The same approach is used by the 4 templates (D-108) and by `src/brand/defaultBrand.ts` for `brand.example.yaml`.

## D-108 — Templates: storage + load + clone

**Storage.** `templates/` directory at the repo root contains 4 YAML files committed to source: `commercial-proposal.yaml`, `commercial-proposal-deck.yaml`, `standard-report.yaml`, `standard-report-deck.yaml`. Each is a full `DocModel` validated against `DocModelSchema`, populated with placeholder copy + `[REPLACE: …]` markers.

**Load.** Vite raw imports (`import proposalTemplate from '../../templates/commercial-proposal.yaml?raw'`). All 4 templates loaded at module-load time. They're small (~5-30 KB each); the bundle cost is acceptable.

**Clone path.** When user picks a template + types a name "Acme Q3 Proposal":
1. Parse the template's YAML to `DocModel`.
2. Update `meta.client`, `meta.project`, `meta.createdAt`, `meta.updatedAt`, and regenerate stable IDs (`meta.docId`, every `block.id`, every `section.id`, every `slide.id`).
3. Serialize back to YAML via the existing `serializeDocModel`.
4. Create folder `<cloudSyncRoot>/<sanitizedName>/` via `ensure_directory` IPC (per D-19: each doc is a folder). Sanitization rule: same as `src-tauri/src/ipc/pdf.rs::sanitize_suggested_name` — `[A-Za-z0-9._ -]+` allowed; collisions get `(2)` / `(3)` suffix.
5. Write `<cloudSyncRoot>/<sanitizedName>/proposal.yaml` via `write_yaml_file` IPC.
6. Refresh the library index.
7. Route to `document` with `openDocs: [{ id: <docFolderPath>, path: <cloudSyncRoot>/<sanitizedName>/proposal.yaml }]`, `activeIndex: 0`.

**Why regen stable IDs at clone time.** Every doc needs unique stable IDs for the comment-thread tracking that lands in M9. Cloning a template without regenerating IDs would create duplicate IDs across docs the moment two consultants both clone the same template — a future ID collision waiting for M9. Doing it at clone time is cheap (~ms for a 30-section template) and lets M9 assume uniqueness without retroactive migration.

## D-109 — Generated-blocks runtime loading

**The existing pieces.**
- `src/setup/load-generated-blocks.ts` already exists. It scans `generated-blocks/active/`, parses each block's manifest, and returns a list of generated-block descriptors. It's used by the install-time scaffolding pipeline.
- `src/editor/BlockPalette.tsx` already has a `generatedBlocks` prop slot. M7-spike passes `[]` for it.

**M8 adds the runtime wiring.**
- `src/contexts/GeneratedBlocksContext.tsx` (NEW) — React context. Value is the loaded `GeneratedBlock[]` plus a `reload()` function. Default value is `{ blocks: [], reload: () => {} }`.
- `src/App.tsx` — on mount, after config is loaded (boot strategy resolved), call `loadGeneratedBlocks(cloudSyncRoot)` and write the result into the context. (`loadGeneratedBlocks` calls `resolveGeneratedBlockPaths` internally, which appends `generated-blocks/active/` — do NOT pre-append the suffix here.) On failure, log the error and keep `blocks: []` (palette degrades gracefully to defaults only; documented in T-132 acceptance).
- `src/ui/views/DocumentView.tsx` — reads `GeneratedBlocksContext`, passes `context.blocks` into the existing `<BlockPalette generatedBlocks={…} />` slot.

**Path discovery.** `<cloudSyncRoot>/generated-blocks/active/` is the production location. The install-time pipeline writes proposals into `<cloudSyncRoot>/generated-blocks/pending/`; the linter promotes accepted ones to `active/`. M8 only reads from `active/`.

**Reload triggers.** None in M8 — the context is built once at app startup. M9 wires a file watcher.

## D-110 — Config file format: YAML on disk, JSON over IPC

**Problem.** Two writers, two formats: `src/setup/install.ts` writes YAML to `config.yaml`; the current `config.rs` stub reads/writes JSON at `config.json`. T-125 must close this gap.

**Decision: YAML on disk (`config.yaml`); JSON over IPC.**

- **Read path.** `read_app_config` reads `<configDir>/config.yaml`, parses with `serde_yaml::from_str::<serde_yaml::Value>`, converts to `serde_json::Value` via `serde_json::to_value`, and returns it to JS. The JS side runs `M8PartialConfigSchema.safeParse(...)` then falls back to `InstallAppConfigSchema.safeParse(...)` — no Rust-side schema knowledge needed.
- **Write path.** `write_app_config` takes `serde_json::Value` from JS, converts to `serde_yaml::Value` via `serde_json::from_value::<serde_yaml::Value>`, serializes via `serde_yaml::to_string`, then write-then-renames to `<configDir>/config.yaml` (same atomicity pattern as `write_yaml_file`).
- **`config_path` helper.** Change `config.json` → `config.yaml`. T-125 owns this change in `src-tauri/src/ipc/config.rs`.
- **`serde_yaml` dep.** Already planned for the YAML IPC commands (T-125 hardening scope). Add one `serde_yaml = "0.9"` entry to `src-tauri/Cargo.toml`; reuse across `config.rs` and `fs.rs`.

**Rationale.** YAML on disk matches the CLI install writer — no two-format divergence. JSON over IPC is already the Tauri command transport contract (every other IPC command returns JSON). Using `serde_yaml` as a transparent YAML↔JSON bridge in Rust keeps format concerns out of the JS layer.

**Migration.** Any `config.json` files written by the current dev stub are abandoned — they were never written by a real install flow and can be deleted manually. No data-migration path needed.

## M8 component file map

```
src/
  App.tsx                            # refactored (T-126): mounts <Routes/>; removes the local AppState
  contexts/
    GeneratedBlocksContext.tsx       # new (T-132)
  schema/
    app-config.ts                    # new (T-125) — M8PartialConfigSchema
  ui/
    router/
      Routes.tsx                     # new (T-126) — typed route reducer
      types.ts                       # new (T-126) — Route + RouteIntent union
      boot.ts                        # new (T-126) — createIpcBootStrategy
    install/
      FolderPickerScreen.tsx         # new (T-127)
    library/
      LibraryView.tsx                # new (T-128) — scaffold + scan
      EmptyLibraryState.tsx          # new (T-128) — "Use Sample"
      FilterSidebar.tsx              # new (T-129) — controls (filter / sort / search)
      DocCard.tsx                    # new (T-128) — card render
      CreateFromTemplateButton.tsx   # new (T-131)
      CreateFromTemplateModal.tsx    # new (T-131)
src-tauri/
  src/
    ipc/
      fs.rs                          # 4 commands hardened (T-125): list_directory, file_exists, ensure_directory, move_file
      config.rs                      # 3 commands hardened (T-125): read_app_config, write_app_config, get_config_dir
templates/
  commercial-proposal.yaml           # new (T-130)
  commercial-proposal-deck.yaml      # new (T-130)
  standard-report.yaml               # new (T-130)
  standard-report-deck.yaml          # new (T-130)
tests/
  fixtures/demos/                    # new (T-133) — 2-3 small DOCX/PPTX/PDF + 1 malicious for the pipeline e2e
  integration/
    m8-happy-path.test.ts            # new (T-134)
    m8-error-paths.test.ts           # new (T-134)
    setup-pipeline-e2e.test.ts       # new (T-133)
  ipc/
    fs-remaining.smoke.test.ts       # new (T-125)
    config.smoke.test.ts             # new (T-125)
  ui/
    router/
      Routes.test.tsx                # new (T-126)
    install/
      FolderPickerScreen.test.tsx    # new (T-127)
    library/
      LibraryView.test.tsx           # new (T-128)
      filters.test.tsx               # new (T-129)
      CreateFromTemplateModal.test.tsx  # new (T-131)
    lifecycle/
      generated-blocks-load.test.tsx # new (T-132)
  templates/
    template-validity.test.ts        # new (T-130)
```

## M8 acceptance gate

T-134 ships the gate. Pass criteria:
1. `tests/integration/m8-happy-path.test.ts` and `tests/integration/m8-error-paths.test.ts` both pass in CI.
2. The full first-launch flow works end-to-end: no config → folder picker → library → "Use Sample" → card → DocumentView → edit → save → reopen → edits preserved → "Create from Template" → new doc visible in library.
3. BlockPalette shows the 15 standard blocks AND any blocks under `generated-blocks/active/`.
4. M7-spike happy-path test (T-123) still passes (router refactor invisible to the M7-spike test path).
5. The full project gates (`verify-gates.sh` = tsc + lint + tests) stay green.

## M8 change log

- 2026-05-27 — T-124: initial M8 spec. Locks D-101..D-109 (partial config schema, custom router, boot strategy, library-first launch, multi-doc-ready route shape, library index lifecycle, "Use Sample" flow, template clone, generated-blocks context). T-125..T-134 unblocked.
