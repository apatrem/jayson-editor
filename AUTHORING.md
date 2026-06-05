# AUTHORING.md

How an agent authors a **client document** in this repo: take one of the
`templates/*.yaml` files and fill it into a valid DocModel YAML for one specific
engagement.

> This is the **content-authoring** guide. For **building the app** (editor,
> Tauri, blocks), read [AGENTS.md](AGENTS.md) instead. The two never overlap:
> nothing here changes app code; nothing in `AGENTS.md` authors client content.

## What you produce

A DocModel YAML — the canonical document, per [CONTEXT.md](CONTEXT.md). Every
other form (editor state, HTML, PDF) is a *projection* of it. You are writing
the source of truth, so it must validate.

Output goes to `documents/<client>-<slug>.yaml`. The contents of `documents/`
are **git-ignored** — real engagements carry `confidentialityLevel: high`, so
client content never gets committed to this repo. Only this guide and the
templates are tracked.

## The one hard rule: never invent client content

Per `AGENTS.md` § "Hard guardrails": **when uncertain, stop and ask; use `TBD`;
do not invent.** Every `[REPLACE: …]` placeholder is client content you must not
fabricate.

- Fill a placeholder **only** from supplied source material.
- Anything the source doesn't cover becomes literal **`TBD`** in the YAML.
- If the source is too thin to produce a coherent document, **stop and ask**
  rather than guessing.
- Never invent brand values (`brandRef` stays `$brand:default` unless the intake
  gives a real ref), client facts, figures, names, or block types.

## Where the content comes from

In priority order:

1. **Intake file** — if `documents/<client>.brief.md` exists, read it first; it
   is the preferred source.
2. **Inline** — material the user pastes or describes in the session supplements
   (and may override) the intake file.

If neither is present, ask for one before generating anything.

## Workflow

### 1. Pick the template (two axes)

Selection = `docKind` × `kind`:

|              | document (flowing prose) | deck (slides)                  |
| ------------ | ------------------------ | ------------------------------ |
| **proposal** | `commercial-proposal.yaml` | `commercial-proposal-deck.yaml` |
| **report**   | `standard-report.yaml`     | `standard-report-deck.yaml`     |

The user must state **both** axes ("commercial proposal, slide deck"). If either
is missing or ambiguous from the request + intake, **ask** — never default.

These four are the *common* templates, not the complete set. Always start from a
template verbatim; never hand-roll a document structure from scratch.

> A `document` has top-level `sections:`; a `deck` has top-level `slides:`. Each
> section/slide carries `id`, a title/`layout`, and `blocks:`.

### 2. Agree the section list

Sections are flexible containers — you may add, remove, and reorder them to fit
the engagement.

1. Show the chosen template's **default sections** (or slides) as the starting
   menu and ask the user which to **keep, drop, or add**.
2. For every section the user **adds**, ask which catalogue blocks go inside it
   (see next step).

### 3. Fill — and only ever use catalogue blocks

The closed boundary in this project is around **block types**, not sections. A
section is just a container; the moment you build one you are emitting *blocks*,
and every block — template-provided or one you add — must be one of the **15
Standard blocks**, in the exact shape its schema allows:

```
bullet-list  callout  chart  diagram  divider  heading  image  kpi-cards
numbered-list  prose  risk-matrix  roadmap  table  team  timeline
```

- The authoritative menu of block shapes and attrs is
  [blocks.catalogue.yaml](blocks.catalogue.yaml). Consult it when composing a new
  section; copy block shapes from it (or from the chosen template).
- **Never invent a block `type` or an attr** to make a section work. If the data
  doesn't fit any Standard block, stop and ask.

### 4. Fill rules

- **No placeholders survive.** Every `[REPLACE: …]` is either filled from source
  or set to `TBD`. Zero `[REPLACE` substrings may remain — the validator
  enforces this.
- **`meta` block:**
  - `client` / `project` / `sector` / `owner` / `reviewers` / `tags` /
    `language` ← from intake; missing → `TBD` (or omit optional fields).
  - `createdAt` / `updatedAt` ← today's date, RFC 3339 (e.g.
    `2026-05-28T00:00:00Z`).
  - `status: draft`, `archived: false` on generation.
  - `confidentialityLevel` ← keep the template's `high` unless the intake says
    otherwise.
  - `brandRef` ← keep `$brand:default`; use a real ref only if the intake gives
    one.
  - `schemaVersion` / `kind` / `docKind` ← set by the template; never hand-edit.
- **Stable IDs.** Sections/slides and blocks you add get unique, descriptive
  kebab-case ids (e.g. `risks-callout`, `risks-table`). Never reuse an id —
  `validateDocModel` rejects duplicates.
- **Formatting.** Mirror the template's YAML style (2-space indent, double quotes
  where it quotes, block collections). The app owns byte-stable serialization
  ([docs/YAML_FORMAT.md](docs/YAML_FORMAT.md)) and will normalise on first save,
  so the binding check below is *parse + validate*, not byte-equality. Section
  comments are fine.

### 5. Validate — the "done" gate

```
npm run validate documents/<client>-<slug>.yaml
```

This runs the same `validateDocModel()` the app uses at import (Zod schema +
duplicate-id check), and additionally fails on any residual `[REPLACE …]`
placeholder and warns on open `TBD` values. **A document is not done until this
exits 0.**

### 6. Report open items

End the session with an **"Open items"** summary: every `TBD` you left and every
question you'd have asked with more source material. No invention — surface the
gaps instead.

## Limitations / future work

Validation currently relies on the **in-repo Node CLI** (`npm run validate`,
which needs the repo's `tsx`/Node toolchain). This is fine while authoring
happens inside `jayson-editor`. For **portable / client deployment** — copying this
guide and a template out into a Node-less environment — that gate won't exist and
we'll need another validation path (validation through the app's IPC layer, or a
bundled standalone validator). Design that before this guide is copied out of the
repo; it will warrant its own grilling + ADR.
