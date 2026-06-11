# Jayson Editor

**Jayson Editor** is a local-first desktop application for producing high-quality consultancy deliverables — proposals, reports, and slide decks — from a single structured source of truth.

Rather than hand-formatting documents, you author a **DocModel**: a validated, schema-backed representation of your content. The DocModel is rendered into polished HTML and PDF through a curated, closed library of layout blocks, so every document stays on-brand and internally consistent without manual styling. Brand tokens and any custom blocks are generated once at setup time with AI assistance, then locked in for repeatable, predictable output.

Key ideas:

- **DocModel-first** — content lives in a structured, validated model (Zod schemas), not in free-form formatting. The model is the source of truth; HTML and PDF are derived artifacts.
- **Closed block library** — a fixed set of vetted layout primitives keeps output consistent and on-brand, with no arbitrary styling drift.
- **Setup-time AI** — brand tokens and custom blocks are generated up front with AI, then frozen, so day-to-day authoring stays deterministic.
- **Local desktop app** — runs as a Tauri shell; your documents and data stay on your machine.
- **Editing & review** — a TipTap-based editor maps to the DocModel, with a comment-to-AI workflow for iterative revisions.

## Prerequisites

- **Node.js** ≥ 20.11 and **npm** ≥ 10
- **Ruby** 3.x (stdlib only) for `scripts/check-specs`
- **Rust** toolchain (for Tauri desktop builds; optional for web-only dev)

## Install

```bash
git clone <repo-url> jayson-editor && cd jayson-editor
npm ci
pipx install pre-commit && pre-commit install   # local hygiene hooks
```

## Dev loop

```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm test             # Vitest
npm run lint         # ESLint
npm run build        # tsc --noEmit && vite build
npm run tauri:dev    # Tauri desktop shell (requires Rust)
```

Other scripts (stubs until later milestones): `validate`, `export:pdf`, `setup:scan-demos`, `setup:install`, `setup:validate`, `setup:regenerate`.

## Project layout

```
src/
  schema/           # Zod schemas (DocModel, blocks, brand)
  docmodel/         # load, serialize, patch
  renderer/         # DocModel → HTML/PDF
  editor/           # TipTap nodes + mapping
  comments/         # comment-to-AI workflow
  llm/              # LLM client + patches
  export/           # PDF / bundle export
  brand/            # brand-token runtime
  block-primitives/ # shared renderer primitives
  generated-blocks/   # setup AI output (pending/ vs active/)
  setup/              # setup-time CLI sources (stubs in M0)
  templates/          # slide layouts (v1.1)
fixtures/           # sample DocModel document fixtures
tests/              # Vitest suites
scripts/            # validate, export-pdf, check-specs, hooks
src-tauri/          # Tauri 2.x Rust shell + IPC stubs
docs/               # architecture, types, tasks, decisions
reference/          # copy-paste patterns (callout, chart, mapping, primitives)
examples/           # valid + invalid DocModel and LLM fixtures
starter/            # pinned drop-in configs for greenfield init
```

## Documentation

| Topic | File |
|---|---|
| Agent workflow & rules | [`AGENTS.md`](AGENTS.md) |
| Architecture (why) | [`docs/DOCUMENT_SYSTEM_ARCHITECTURE.md`](docs/DOCUMENT_SYSTEM_ARCHITECTURE.md) |
| Build plan & milestones | [`docs/BUILD_BRIEF.md`](docs/BUILD_BRIEF.md) |
| Settled decisions | [`docs/DECISIONS.md`](docs/DECISIONS.md) |
| Task backlog | [`tasks/`](tasks/) — archived v1 backlog: [`docs/archive/TASKS.md`](docs/archive/TASKS.md) |
| Shared TypeScript types | [`docs/TYPES.md`](docs/TYPES.md) |
| Block implementation | [`docs/BLOCK_IMPLEMENTATION_GUIDE.md`](docs/BLOCK_IMPLEMENTATION_GUIDE.md) |
| Setup AI pipeline | [`docs/SETUP_PIPELINE.md`](docs/SETUP_PIPELINE.md) |
| Install CLI | [`docs/SETUP_INSTALL_FLOW.md`](docs/SETUP_INSTALL_FLOW.md) |
| Tauri IPC | [`docs/TAURI_IPC.md`](docs/TAURI_IPC.md) |
| Document file format decision | [`docs/adr/0022-json-docmodel-supersedes-yaml.md`](docs/adr/0022-json-docmodel-supersedes-yaml.md) |
| Historical YAML format | [`docs/YAML_FORMAT.md`](docs/YAML_FORMAT.md) |
| Review panel UI | [`docs/UI_REVIEW_PANEL.md`](docs/UI_REVIEW_PANEL.md) |
| Library UI | [`docs/UI_LIBRARY.md`](docs/UI_LIBRARY.md) |

## Spec sanity check

```bash
ruby scripts/check-specs
```

Parses every YAML/JSON spec and fixture in the repo (CI runs this on every push).

## Status

MVP is running. LLM not wired. In active development.

## Stack

Tauri 2 · React · TypeScript · TipTap · Zod · ECharts · Mermaid · Playwright.

## License

This project is licensed under the Apache License 2.0.

If you redistribute this software or derivative works, you must preserve the license, copyright notices, and attribution notices as required by the Apache License 2.0.

See LICENSE and NOTICE.
