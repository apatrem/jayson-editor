# Architecture Decision Records

Durable decision record for this repository. Read top to bottom — each is self-contained.

> **Baseline conventions live in the agentic-workflow repo — cite them `AW-NNNN`**
> (e.g. `AW-0010` = remediation loop). This `docs/adr/` holds **domain decisions
> in this repo's own number space (0001–0023)**. Adopt baseline conventions **by
> reference, not by copy**: record `agentic-workflow-baseline: <highest AW-NNNN
> adopted>` in `AGENTS.md` and cite `AW-NNNN` where a baseline convention applies.
> Never copy a baseline ADR file into this repo (it drifts and burns your number
> space). Rationale: **AW-0007**.

| # | Decision |
|---|----------|
| [0001](0001-no-iframe-sandbox-for-generated-blocks.md) | No iframe sandbox for AI-generated blocks; rely on layered static defenses + a runtime watchdog |
| [0002](0002-pre-commit-hook-for-autonomous-loop-branches.md) | Pre-commit hook enforces autonomous-loop protocol invariants on `main` and `bakeoff/*` branches |
| [0003](0003-pre-commit-gate-enforcement.md) | Pre-commit hook invokes project-wide gates (tsc + lint + tests) for code commits |
| [0004](0004-three-tier-block-library-with-authored-blocks.md) | Three-tier block library; Authored blocks auto-install via lint + watchdog |
| [0005](0005-authored-block-transport-format.md) | Authored blocks travel as single `.tsx` files with a manifest header; scaffold-mismatch quarantines with a regenerate option |
| [0006](0006-authored-block-threat-model.md) | Authored-block threat model: AI hallucination + compromised-sender; defer insider + spoofing to v1.1 |
| [0007](0007-authored-block-capability-restriction.md) | Authored blocks restricted to the simple-container subset; extended capabilities deferred |
| [0008](0008-block-registry-manifest-shape.md) | Block registry: two manifest APIs — imperative `defineBlock` for Standard/Brand, declarative `defineAuthoredBlock` for Authored |
| [0009](0009-authored-block-identity-and-replacement.md) | Authored block identity is `slug + sender email`; updates from the same sender replace in place |
| [0010](0010-authored-block-soft-archive-on-removal.md) | Authored block removal is a soft archive; documents keep rendering until the file is permanently deleted |
| [0011](0011-authored-block-generation-ux.md) | Authored-block authoring: in-document, preview-first hybrid, AI sees the document |
| [0012](0012-authored-block-codegen-uses-frontier-model.md) | Authored-block code generation always uses the frontier model; no per-call toggle |
| [0013](0013-authored-blocks-are-declarative-data.md) | Authored blocks are parsed as declarative data, never executed as code |
| [0014](0014-ratify-swc-ecma-parser-rust-runtime-dependency.md) | Ratify `swc_ecma_parser` as a Rust runtime dependency for Authored-block lint-at-receive |
| [0015](0015-editor-closed-schema-includes-installed-authored-manifests.md) | The editor's closed schema = static blocks ∪ the installed authored manifest set |
| [0016](0016-authored-blocks-persist-as-sender-slug-editor-keyed-by-slug.md) | Authored blocks persist in the DocModel as `{sender}:{slug}`; the editor stays slug-keyed and the mapping reconciles the two |
| [0017](0017-single-editing-surface-and-pagedjs-page-view.md) | Single WYSIWYG editing surface; paged.js owns page view and print |
| [0018](0018-per-instance-layout-overrides-in-docmodel.md) | Minimal per-instance layout overrides live in the canonical DocModel |
| [0019](0019-drop-cost-ledger.md) | Drop the cost ledger; the app does not meter or cap LLM spend |
| [0020](0020-local-ui-settings-outside-docmodel.md) | UI view preferences are machine-local localStorage, never in the DocModel |
| [0021](0021-multi-pass-generation-pipeline.md) | Multi-pass generation pipeline (writing → structuring → data) |
| [0022](0022-json-docmodel-supersedes-yaml.md) | On-disk projection format: JSON, not YAML |
| [0023](0023-adopt-agentic-workflow-retire-autonomous-loop.md) | Adopt the agentic-workflow conventions; retire the autonomous TASKS.md loop |
