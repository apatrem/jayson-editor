# UI view preferences are machine-local localStorage, never in the DocModel

**Status:** accepted

## Context

The Page view is gaining consultant-facing display controls — **Page flow**
(Continuous vs Full-page), **Page spread** (Single vs Spread), and **Page zoom**
(50/75/90/100 % or Fit) — and "more local settings will be added later." These
control *how the consultant looks at a document*, not *what the document is*.

The repository's foundational guardrail is that the **DocModel is canonical**
(memo §2): TipTap editor state, YAML on disk, and rendered HTML/PDF are all
*Projections*, reconstructible from the DocModel, and the YAML serialization is
byte-stable so documents diff cleanly. That dogma makes it tempting to reach for
the nearest persistence we already have — the document — and stash a `meta.ui`
blob there. Doing so would be a mistake: it would put view state into the
canonical document, pollute every doc diff with per-viewer noise, and travel
with a file shared between consultants (your zoom level is not my zoom level).

There is already one ad-hoc precedent for machine-local UI state:
`ReviewModeToggle` persists the review mode to `localStorage` under
`docsystem.editor.reviewMode`. We are formalising that pattern rather than
inventing a parallel one.

## Decision

**View preferences are [[local-setting]]s: machine-local, app-wide, persisted in
the renderer's `localStorage` under `docsystem.*` keys, and never written to the
DocModel or its YAML.**

- **Machine-local.** Stored in `localStorage`, not in any document and not in a
  synced location. They do not travel with a shared `.yaml` file.
- **App-wide, not per-document.** One value per preference for the consultant,
  applied to every document. A document does not remember its own zoom.
- **Outside the DocModel.** The canonical document and its byte-stable YAML are
  untouched; preferences never appear in a doc diff. No `meta.ui` field exists.
- **Additive by key.** Each new preference is one more `docsystem.*` key read at
  mount and written on change — not a new store, schema, or IPC surface.

First-run defaults: every document opens in **Edit** mode; Page view defaults to
**Continuous / Single / Fit**. The Edit↔Page-view mode itself is *not* persisted.

## Consequences

- **No cross-machine or cross-install sync.** A consultant on a second machine
  starts from defaults. Acceptable: these are ergonomic view choices, not content.
- **Cleared if localStorage is wiped** (or in a fresh webview profile); the app
  silently falls back to defaults. No migration, no integrity concern — nothing
  of value is lost.
- **The boundary is now documented and enforced by convention:** anyone tempted
  to add a viewer preference to `meta`/the DocModel should add a `docsystem.*`
  key instead. The CONTEXT.md `Local setting` vs `Document settings` entries draw
  the same line in the team's vocabulary.
- Consistent with the no-telemetry / no-persisted-usage posture (ADR-0019): these
  keys hold only inert UI choices, no behavioral or usage signal.

## Considered alternatives

- **`meta.ui` inside the DocModel** — trivial to implement (reuse the existing
  doc persistence), but puts per-viewer state into the canonical document,
  dirties every diff, and leaks one consultant's view choices into a shared file.
  Rejected as a direct violation of the DocModel-is-canonical guardrail.
- **A Rust-side Tauri config file** — survives a localStorage clear and is
  readable by the native layer, but adds IPC commands and a second config surface
  for what are inert, non-critical renderer-only toggles. Deferred; revisit only
  if a preference ever needs to be read by Rust or to outlive the webview profile.
- **Per-document preferences (sidecar or non-canonical doc corner)** — lets each
  document reopen exactly as last viewed, but the consultant explicitly wants one
  stable set of options "when opening the app," and per-doc storage reintroduces
  the canonical-vs-view-state tension a sidecar was meant to avoid. Rejected.
