# AGENTS.md

<!-- agentic-workflow-baseline: v0.3.7 -->
<!-- Baseline conventions are adopted BY REFERENCE: cite them `AW-NNNN` (AW-0007); this repo's own
     docs/adr/ is for domain decisions in its own number space. Never copy a baseline ADR file in. -->

Operational guardrails for any agent (Claude Code, subagents, contributors)
working in this repository.

The agentic-workflow skills referenced here (`/agentic-workflow:architect|init|plan|review|run|setup`, plus `grill-me`/`grill-with-docs`) run **cross-CLI** — under Claude Code, Codex, and Cursor (AW-0007). They are installed globally (symlinked from the canonical pack), never vendored into this repo; cite baseline conventions as `AW-NNNN` rather than copying them in.

> **Two jobs, two guides.** This file governs **building the app** (editor,
> Tauri, blocks, schema). To **author a client document** — fill a
> `templates/*.json` into a finished DocModel JSON for a specific engagement —
> read [AUTHORING.md](AUTHORING.md) instead.

## Repository layout

```
.
├── AGENTS.md                       ← you are here
├── CLAUDE.md                       ← redirects to this file
├── README.md                       ← short orientation
├── brand.example.yaml              ← brand-token reference shape
├── blocks.catalogue.yaml           ← 15 pre-built block specs + setup-AI instructions
├── tasks/                          ← active task files (one unit of work each)
├── templates/task.template.md      ← the task template (/agentic-workflow:plan output)
├── docs/                           ← all design/spec docs
│   ├── DOCUMENT_SYSTEM_ARCHITECTURE.md  — the "why" memo
│   ├── BUILD_BRIEF.md                   — milestones M0–M6 + acceptance
│   ├── DECISIONS.md                     — settled decisions + roadmap + open items
│   ├── TYPES.md                         — all shared TypeScript types
│   ├── BLOCK_IMPLEMENTATION_GUIDE.md    — copy-pattern for the 15 blocks
│   ├── SETUP_PIPELINE.md                — AI ingestion + code-gen pipeline spec
│   ├── SETUP_INSTALL_FLOW.md            — per-consultant install CLI wizard
│   ├── TAURI_IPC.md                     — JS↔Rust command list with signatures
│   ├── YAML_FORMAT.md                   — historical byte-stable YAML rules (see ADR-0022)
│   ├── UI_REVIEW_PANEL.md               — wireframe for the comment-review panel
│   ├── UI_LIBRARY.md                    — wireframe for the doc library
│   └── archive/                         — retired docs (v1 backlog index, completed task bodies, loop state)
├── starter/                        ← drop-in project configs (M0 starter pack)
├── examples/                       ← valid + invalid YAML/JSON fixtures
└── reference/                      ← fully-worked code patterns to copy
    ├── primitives/                 — block-primitives: BrandProvider, ProseRenderer, helpers
    ├── callout/                    — reference block: schema + renderer + node + test
    ├── chart/                      — second worked block: ECharts + side panel
    └── mapping/                    — DocModel ⇄ editor orchestrator with losslessness invariant
```

## Required reading

Before editing anything, read in this order:

1. [docs/DOCUMENT_SYSTEM_ARCHITECTURE.md](docs/DOCUMENT_SYSTEM_ARCHITECTURE.md) — the architecture memo. The "why" behind every constraint.
2. [docs/BUILD_BRIEF.md](docs/BUILD_BRIEF.md) — what to build, milestones, acceptance.
3. [docs/DECISIONS.md](docs/DECISIONS.md) — recorded decisions. Treat as binding.

If the brief and the memo conflict, the memo's §2 principle and §3 requirements win — stop and ask.

## Reference reading (consult as needed)

### Specifications

- [docs/TYPES.md](docs/TYPES.md) — every shared TypeScript type lives here. No type is defined twice.
- [tasks/](tasks/) — the active backlog: one file per task, each with machine-checkable acceptance criteria. (The v1 backlog is archived: index at [docs/archive/TASKS.md](docs/archive/TASKS.md), completed bodies at [docs/archive/TASKS_ARCHIVE.md](docs/archive/TASKS_ARCHIVE.md).)
- [docs/BLOCK_IMPLEMENTATION_GUIDE.md](docs/BLOCK_IMPLEMENTATION_GUIDE.md) — copy-pattern for the 15 blocks.
- [docs/SETUP_PIPELINE.md](docs/SETUP_PIPELINE.md) — setup AI pipeline (ingestion + code-gen + lint).
- [docs/SETUP_INSTALL_FLOW.md](docs/SETUP_INSTALL_FLOW.md) — per-consultant install CLI prompts.
- [docs/TAURI_IPC.md](docs/TAURI_IPC.md) — every JS↔Rust command with signatures.
- [docs/GENERATION_PIPELINE.md](docs/GENERATION_PIPELINE.md) — cold-start generation design.
- [docs/YAML_FORMAT.md](docs/YAML_FORMAT.md) — historical YAML rules; JSON is canonical (ADR-0022).
- [docs/UI_REVIEW_PANEL.md](docs/UI_REVIEW_PANEL.md) — wireframe + state model for the comment-review panel.
- [docs/UI_LIBRARY.md](docs/UI_LIBRARY.md) — wireframe + state model for the doc library.

### Worked code (copy these patterns; do not invent new ones)

- [reference/primitives/](reference/primitives/) — block-primitives. **Foundation — every block depends on these.**
- [reference/callout/](reference/callout/) — the canonical simple block (4-file pattern).
- [reference/chart/](reference/chart/) — second worked block introducing cross-field schema, atom nodes, JSON-encoded payload, side panel, SSR render path.
- [reference/mapping/](reference/mapping/) — top-level DocModel ⇄ editor orchestrator with losslessness invariant.

### Drop-in scaffolding

- [starter/](starter/) — pinned configs for `npm init`, Tauri 2.x setup, ESLint, Prettier, Vitest.

### Data specs

- [blocks.catalogue.yaml](blocks.catalogue.yaml) — the 15 pre-built block specs.
- [brand.example.yaml](brand.example.yaml) — brand-token reference shape.
- [examples/](examples/) — valid + invalid YAML/JSON fixtures (use as test inputs and few-shot LLM context).

## Planning workflow

**All non-trivial plans must go through the `grill-me` skill** (or
`/agentic-workflow:architect` for architecture-level work, which wraps
`grill-with-docs`). Before writing code for any new feature, milestone, or
refactor:

1. Draft the plan.
2. Invoke `grill-me` to stress-test it — resolve every branch of the decision
  tree before implementation begins.
3. Decompose the settled plan into task files via `/agentic-workflow:plan`.
4. Only then does code land.

This applies to anything bigger than a one-file edit or a typo fix.

## Workflow (PR-based — ADR-0023)

The autonomous TASKS.md loop is retired (ADR-0023). Work flows through
**task files + worktrees + PRs + CI**; a human merges every PR.

> *LLMs propose. Tools verify. Git isolates. CI decides. Humans merge. Rules remember.*

### Tasks

- One unit of work = one file in [`tasks/`](tasks/), named `T-NNN-<slug>.md`,
  from [templates/task.template.md](templates/task.template.md). Bigger than
  the old ≤4h backlog atoms — sized to a reviewable PR, with
  **machine-checkable acceptance criteria** mapped to test files.
- Acceptance that cannot be a runnable test ⇒ `risk: high` in the task meta.
- Tasks are created by `/agentic-workflow:plan` after grilling; the human
  approves task files before implementation fans out.
- `depends-on` gates start order; `parallel-safe: yes` tasks (disjoint file
  sets, no shared contract) may run concurrently, one worktree each.
- A task is **done when its PR merges**. The implementing PR ticks the
  acceptance boxes in its task file; reference the task ID (`T-NNN`) in commit
  messages and the PR title.

### Branches, worktrees, PRs

- Work in your own worktree on `agent/<lineage>/<task>` (e.g.
  `agent/claude/T-204-placeholder-engine`); **never commit to `main`**
  (protected — PR + green `quality` check).
- Start every task from a clean worktree cut from the current `origin/main`;
  never carry uncommitted changes into or between tasks (pre-flight).
- Small PRs: routine < 300 changed lines; split or stack larger ones.
  Separate mechanical churn from behavioural change.
- Never force-push. Never amend pushed commits. Never `--no-verify` /
  `--no-gpg-sign`. Never `git add -A` / `git add .` — stage explicit paths
  only. (`.cursor/cli.json` denies these for Cursor agents.)

### The gate (one command)

```bash
ruby scripts/check-specs && npm run lint && npm test && npm run build
```

CI's `quality` check runs exactly this on every PR. Run it locally before
claiming success — do not invent passing results.

`npm test` excludes the frozen acceptance suites listed in
[`tests/frozen-acceptance.json`](tests/frozen-acceptance.json); they run in the
**non-required** `frozen-acceptance` CI lane (expected red) until each
implementing task's PR removes its files from that list — the list may only
shrink (ADR-0023). Run the frozen lane locally with `npm run test:frozen`. Local hygiene hooks:
`pipx install pre-commit && pre-commit install` (see `.pre-commit-config.yaml`).

### Effort/review dial (`mode` in the task meta)

- **`low`** *(default — prefer it, justify higher)*: one implementer + the gate
  + one adversarial reviewer (blockers only, ≤10 ranked findings).
- **`medium`**: adds an independent dual review on the PR
  (`/agentic-workflow:review` — GPT-5.5 xhigh + Claude effort-high, synthesized).
- **`hard`**: competitive best-of-N across lineages + smart-merge, then the
  medium dual review.
- **`mode` is a floor, not a ceiling** (AW-0004, refinement 3): the declared tier
  is a minimum the task author sets, never a ceiling. A change touching
  **protected/destructive surface** is forced to **≥ `medium`** regardless of
  declared mode — record *"escalated by risk floor"* in the task and PR. Trigger
  set (surfaces that route to a human or halt the gate):
  - destructive filesystem ops — `rm -rf`, in-place rewrites, symlink/dir
    replacement (terminal-safety rules; `.cursor/cli.json` denies)
  - the gate or CI config itself (`ruby scripts/check-specs`,
    `.github/workflows/`, `tests/frozen-acceptance.json`)
  - lockfiles / dependency manifests (`package-lock.json`, `src-tauri/Cargo.lock`, new
    dependencies without justification)
  - migrations · schema · data-shape changes (DocModel contract,
    `docs/JSON_FORMAT.md`, block schema)
  - auth · secrets · security boundaries (Tauri capabilities, IPC scope)
  - public API / contract changes (shared types in `docs/TYPES.md`, IPC
    signatures in `docs/TAURI_IPC.md`)
  - governance · decision records · architecture/docs — ADRs (`docs/adr/**`), `AGENTS.md`, `CONTEXT.md`, the architecture memo (`docs/DOCUMENT_SYSTEM_ARCHITECTURE.md`), and this baseline-conventions surface. Per AW-0004 (refinement 3), governance/decision-record/docs/architecture changes are forced to ≥ `medium` regardless of declared mode. Boundary: only changes to decision records, conventions, and binding architecture requirements count as governance; routine prose — typos, examples, comments, non-contract README/docs maintenance — stays `low` (AW-0004).

The engine for spawning workers is external (Superset — see
`/agentic-workflow:run`); this repo records policy, not engine API.

### Remediation & escalation loop (AW-0010)

After review produces a blockers-only punch-list:

- **Remediator** = the tier's implementer (`low`/`medium` → default implementer;
  `hard` → winning best-of-N lineage). Fresh spawn on the same branch/worktree,
  prompt = punch-list, gate-until-green, commit-don't-push.
- **Default re-check:** targeted re-verify — hand each blocker back to the
  reviewer that raised it for RESOLVED / NOT-RESOLVED. Uncapped; not counted
  toward the review-round cap.
- **Excess findings:** when the blocker count meets or exceeds the per-tier threshold N (low 3 / medium 4 / hard 5), reviewers mark
  the diff systemically shaky, or remediation touched far beyond the punch-list —
  escalate one tier (`low→medium→hard`) and run a **full fresh review round**
  on the remediated diff.
- **Cap:** at most **3 full review rounds** (round 1 = initial tier review;
  targeted re-verifies are free). Blockers surviving round 3 → **`needs-human`**
  — hand the PR to the human merger with open blockers flagged (consistent with
  humans-merge; ADR-0023).

### Lessons → guardrails

Every recurring mistake becomes a test, a lint rule, or a line in this file —
never just a mental note. The [Review playbook](#review-playbook-conventions-for-code-review--security-audit--test-engineer-agents)
below is the accumulated set; extend it, don't trim it.

## Code intelligence

This project uses **CodeGraph** for semantic code exploration. If `.codegraph/`
is not yet initialized, run `codegraph init -i` before doing significant
exploration work.

Prefer codegraph tools over `grep`/`find` for:

- `codegraph_search` — locate symbols by name
- `codegraph_context` — pull relevant code for a task
- `codegraph_callers` / `codegraph_callees` — trace call flow
- `codegraph_impact` — assess blast radius before changing a symbol
- `codegraph_node` — fetch a symbol's source + metadata

When spawning Explore subagents, instruct them to use codegraph tools.

For pre-merge review, use the `code-review-and-quality` skill (multi-axis
review across correctness, readability, architecture, security, performance).

## Shell tooling

Use **RTK (Rust Token Killer)** for shell operations — it transparently
rewrites common commands (`git`, `ls`, etc.) to save 60–90% on tokens. The
Claude Code hook handles rewriting automatically; just run commands normally.

Meta commands (run `rtk` directly):

- `rtk gain` — token savings analytics
- `rtk discover` — find missed savings opportunities
- `rtk proxy <cmd>` — bypass filtering for debugging

## Hard guardrails (from docs/BUILD_BRIEF.md §0)

- **Greenfield.** No code/schema/config from prior prototypes.
- **Open-source only.** No Tiptap Pro/Cloud, no paid SaaS. LLM is the sole
non-OSS component.
- **DocModel is canonical** (memo §2). Editor state and CRDT docs are
projections, never sources of truth.
- **Closed block library.** 15 pre-built blocks + up to 10 AI-generated
per-consultancy blocks gated by the human-review pipeline in
`docs/SETUP_PIPELINE.md`. No off-catalogue block types.
- **No telemetry, and no persisted usage/cost data.** The app does not meter or
cap LLM spend — the local cost ledger was removed (ADR-0019); spend is governed
by provider-side billing. Do **not** reintroduce a cost ledger, spend cap, or any
persisted usage/cost store.
- **Do not build** anything in memo §10 (think-cell clone, deck editor,
DOCX/PPTX import/export, v1 real-time collab, live-models platform).
- **Demo Office files are reference only** — never parse or generate them
at runtime (the setup-time pipeline is the sole exception).
- **When uncertain, stop and ask.** Use `TBD` and flag it; do not invent brand
values, client content, or block types.
- **Frozen acceptance tests are immutable.** Test files headed
`FROZEN ACCEPTANCE TESTS` (T-201–T-204, `/agentic-workflow:plan`) and the
contract artifacts they pin (`docs/JSON_FORMAT.md`,
`slide-layouts.catalogue.yaml`) must never be edited to make a gate pass —
the implementation adapts to the test, not vice versa. Changes require human
sign-off on the plan PR. The exclude list `tests/frozen-acceptance.json` may
only shrink (an implementing task removing its now-green files); adding an
entry to mask a failure is forbidden.
- **Never silently weaken a failing target** (sibling of the frozen-test rule):
when a gate or acceptance target fails, do not adjust `DECISIONS.md` targets,
acceptance criteria, or frozen tests to make it pass — record the regression
in the task file and the PR, and let a human decide.

## Working style

- When work is milestone-scoped (docs/BUILD_BRIEF.md), do not start a milestone
until the previous one's acceptance criteria pass; encode cross-milestone
ordering as `depends-on`.
- Work tasks from [`tasks/`](tasks/) in `depends-on` order. Reference task IDs
(`T-NNN`) in commit messages and PR titles.
- **Smallest correct change, via the ladder** (AW-0011): needed at all? →
  stdlib → platform feature → already-installed dep → one line → minimal code.
  No unrequested abstractions; no new dependencies without justification.
- **Minimalism has a floor** (AW-0011) — never cut: input validation at trust
  boundaries, error handling that prevents data loss, security, accessibility.
  Reject invalid input; never auto-"fix" it — fail loudly.
- **Mark deliberate corners** with `// SHORTCUT(<ceiling>): <upgrade path>` —
  e.g. `// SHORTCUT(O(n²) scan): ok <1k rows; add an index if it grows`. The
  reviewer enforces this; `grep -rn 'SHORTCUT('` is the running ledger
  (AW-0011).
- Prefer editing existing files over creating new ones.
- Don't add features, abstractions, or error handling beyond what the task
requires.
- Default to no comments. Only write a comment when the *why* is non-obvious.
- For any new block: copy the four-file pattern from `reference/callout/`.
Do not invent a new shape.

## Review playbook (conventions for code-review / security-audit / test-engineer agents)

- **Minimalism (advisory, AW-0011):** over-engineering delete-list; deliberate
  corners marked `SHORTCUT(…)`. Advisory only — veto stays blockers-only
  (AW-0004).

When briefing a review agent on Tauri 2.x IPC, capability, or plugin changes,
include these explicit checks in the prompt:

- **Verify against the actual plugin source in `~/.cargo/registry/src/*tauri-plugin-*`.**
  Tauri 2.x's capability ACL is necessary but not always sufficient — many
  plugins have a SECOND validation layer at the plugin level (e.g.,
  `tauri.conf.json > plugins > shell > open` regex enforced by
  `tauri-plugin-shell-*/src/scope.rs::OpenScope::open`). A review that stops
  at the capability JSON shape misses these gaps. The shell-plugin gap was
  found in the fifth review round of M7.5 (drift entry `[drift-2026-05-26f]`)
  precisely because three prior agents only inspected the capability ACL.
  Concrete pattern: `find ~/.cargo/registry/src -path '*tauri-plugin-<name>*/src/*.rs' | xargs grep -A 20 'pub.*fn <command>\|OpenScope\|impl.*Scope'`.
  **Also verify the plugin's regex/scope is the ENTIRE constraint surface** —
  confirm the plugin does NOT also do implicit scheme allow-lists, path
  canonicalization, MIME checks, host validation, or any other gate the
  configured regex doesn't show. Round-3 audit's `https://user:pass@evil.com`
  credential-bypass finding surfaced because the audit confirmed
  `OpenScope::open` does ONLY a single `regex.is_match(path)` call — so the
  regex IS the entire defense, and credential-bearing URLs would slip past
  if not explicitly blocked in the pattern (drift `[drift-2026-05-26l]`).
- **Verify against the actual JS plugin docs in `node_modules/@tauri-apps/plugin-*/dist-js/*.d.ts`.**
  The TypeScript-side signatures and runtime behavior notes (especially the
  `@param` JSDoc on each exported function) often spell out the second-layer
  config requirement that the capability JSON alone won't tell you.
- **Tests that mock the IPC bridge (`window.__TAURI_INTERNALS__.invoke`)
  cannot prove plugin-level scope works.** Flag any "the test passes, so
  the boundary is closed" reasoning that depends on a mocked plugin invoke;
  require either a static config-shape assertion or a real Tauri-runtime
  integration check before treating the boundary as proven closed.
- **Synthetic fixtures hide bugs.** If a multi-axis review finds the
  integration harness uses a synthetic doc, or stubs the renderer/IPC under
  test, automatically flag any "test passes" claim as inconclusive until the
  harness uses the real fixture / real renderer. M7-spike shipped 5 BLOCKERs
  hidden by this exact pattern (see `docs/archive/BLOCKERS.md [drift-2026-05-26c]`
  and related entries).
  **Extension — CI matrix gaps are also synthetic.** A `#[cfg(<os>)]` or
  `if (process.platform === '...')` test that has no corresponding OS in the
  CI matrix is functionally equivalent to a synthetic harness — the test
  exists but never actually runs. Flag as `not actually run`. Round-3 audit
  caught this for `windows_rename_failure_restores_original_target` in
  `src-tauri/src/ipc/fs.rs` — the test was correct, but `ci.yml` was
  Ubuntu-only, so the Windows path had 0 automated runs until T-123q added
  a `windows-latest` matrix entry. Concrete sweep:
  `grep -rE 'cfg\(windows\)|cfg\(macos\)|process\.platform' src-tauri/ src/ tests/ | wc -l`
  and cross-check against `.github/workflows/*.yml` runner OS list.
- **Author-written acceptance tests are gameable — freeze them independently,
  and still review.** A `low`-tier implementer once made T-206's acceptance
  "pass" with tests that asserted far less than the contract (a stubbed
  round-trip checking `intent.includes(...)` instead of semantic equality;
  no max-size, collision, or fence cases) — green CI, 8 real grammar
  violations underneath. The fix is two-layered: (1) for any task whose
  acceptance isn't already a frozen test, **the orchestrator/human authors
  the strong contract tests independently and freezes them BEFORE the
  implementer runs** (`/agentic-workflow:plan` freezes red; the implementer
  adapts to the tests, never the reverse — verify the test files are
  byte-unchanged after implementation: `git diff <freeze>..HEAD -- <test files>`
  must be empty). (2) **Still run an adversarial cross-lineage review even
  when the frozen tests are green** — frozen tests have coverage gaps. T-206's
  60-case frozen contract was strong, yet an Opus pass still found a real
  production bug (HTML-comment stripping corrupting intents) and untested
  round-trip kinds the 60 cases missed. Green-and-frozen ≠ correct; it means
  "correct for the cases we thought of." When reviewing, ask: *does each test
  assert the full contract, or a weaker shadow of it?* — and *what does the
  contract require that no test exercises?*
- **Regex/glob/pattern wrapping.** When testing a regex/glob/pattern that a
  plugin or framework will MODIFY before applying (e.g., Tauri's `^...$`
  wrap of `plugins.shell.open` per `tauri-plugin-shell-*/src/lib.rs:155`;
  sshd's `Match` block prepending; CSP source-list whitespace splitting),
  the test MUST mirror the modification. Plain `new RegExp(pattern)` or
  `glob.match(pattern, input)` without the wrap is a false-positive trap.
  Cite the wrap source code (file + line) in a test comment so future
  readers can verify the test still mirrors current plugin behavior.
  M7.5 round-2 shipped a regex that blocks legitimate `https://` URLs at
  runtime because the test omitted the wrap (drift `[drift-2026-05-26f]`).
- **Node globals in renderer code.** Vitest provides Node globals
  (`Buffer`, `process`, `setImmediate`, `__dirname`, `require`); the Tauri
  webview does NOT. Any `Buffer.from`/`Buffer(...)`, `process.*`,
  `require(...)`, `__dirname`, `setImmediate(...)` in files under `src/`
  (excluding `src/setup/install.ts` which runs in Node at install-time) is
  a runtime BLOCKER. Sweep with
  `grep -rE 'Buffer\.|Buffer\(|process\.|require\(|__dirname|setImmediate' src/`
  during reviews of code that emits or transforms binary data, base64, or
  process state. Where a Web Platform API doesn't exist for the use case,
  the work MUST move to a Rust IPC command. **Pattern for binary/base64 in
  renderer:** prefer `TextEncoder` + `TextDecoder` + `atob`/`btoa` +
  `Uint8Array`; these are universally available in WebView2 / WKWebView /
  WebKitGTK. M7.5 round-2 shipped `Buffer.from(...)` in
  `src/export/render-static-html.ts` that crashes the export with
  `ReferenceError: Buffer is not defined` whenever an SVG image or the
  oversized-image placeholder fires (drift `[drift-2026-05-26k]`).
- **Failure-path completeness for cfg-gated atomic operations.** Any
  swap/rename/transaction with N steps must have tests for: (a) crash
  between each pair of consecutive steps, (b) pre-existing artifact from
  a previous crashed run blocking the first step, (c) post-success
  cleanup failure leaving an orphan. T-123o's initial Windows `.bak` swap
  had 4 steps but only tested 1 of ~5 failure scenarios; the round-3
  audit caught the gap (drift `[drift-2026-05-26l]`). When the operation
  is platform-specific, combine with the synthetic-fixtures convention
  above — both the failure-path tests AND the CI matrix entry that runs
  them are required, OR the gap should be tracked in the task file until
  the matrix is wired. Concrete pattern: list every Rust
  `fn` returning `IpcResult<T>` that does ≥2 filesystem mutations, count
  the corresponding test cases per failure window, flag any function
  with <3 negative-path tests.
- **JS-side error handling for Tauri `invoke()` must use `isIpcError` /
  `formatErrorMessage`, not `instanceof Error`.** Tauri's `invoke()`
  REJECTS WITH THE RAW JSON OBJECT (`{ kind, message }`), NOT an `Error`
  instance. So `catch (e) { e instanceof Error }` is ALWAYS FALSE for
  IPC failures, and any `error instanceof Error ? error.message :
  String(error)` pattern falls through to `String({kind, message})` →
  `"[object Object]"`, silently hiding the actual Rust error. M7 manual
  validation surfaced this in `src/App.tsx` (4 sites) — the user clicked
  Export PDF, got `[object Object]` in the error toast, and the real
  underlying failure was invisible. The fix lives at `src/ipc/errors.ts`
  (`isIpcError`, `formatErrorMessage`); every renderer-side `catch`
  block around an `invoke()` call must use `formatErrorMessage(error)`.
  Sweep: `grep -rE 'error instanceof Error|String\(error\)' src/ |
  grep -v 'ipc/errors\.ts'` should find zero hits outside the helper
  module. Tests that mock IPC rejection with `Error` instances (rather
  than the JSON shape) reproduce the test-vs-runtime gap the prior
  conventions warn about — mock with the JSON shape instead, mirroring
  `tests/ipc/errors.test.ts`.
