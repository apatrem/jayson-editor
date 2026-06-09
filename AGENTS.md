# AGENTS.md

Operational guardrails for any agent (Claude Code, subagents, contributors)
working in this repository.

> **Two jobs, two guides.** This file governs **building the app** (editor,
> Tauri, blocks, schema). To **author a client document** — fill a
> `templates/*.yaml` into a finished DocModel YAML for a specific engagement —
> read [AUTHORING.md](AUTHORING.md) instead.

## Repository layout

```
.
├── AGENTS.md                       ← you are here
├── CLAUDE.md                       ← redirects to this file
├── README.md                       ← short orientation
├── brand.example.yaml              ← brand-token reference shape
├── blocks.catalogue.yaml           ← 15 pre-built block specs + setup-AI instructions
├── docs/                           ← all design/spec docs
│   ├── DOCUMENT_SYSTEM_ARCHITECTURE.md  — the "why" memo
│   ├── BUILD_BRIEF.md                   — milestones M0–M6 + acceptance
│   ├── DECISIONS.md                     — settled decisions + roadmap + open items
│   ├── TYPES.md                         — all shared TypeScript types
│   ├── BLOCK_IMPLEMENTATION_GUIDE.md    — copy-pattern for the 15 blocks
│   ├── SETUP_PIPELINE.md                — AI ingestion + code-gen pipeline spec
│   ├── SETUP_INSTALL_FLOW.md            — per-consultant install CLI wizard
│   ├── TAURI_IPC.md                     — JS↔Rust command list with signatures
│   ├── YAML_FORMAT.md                   — byte-stable serialization rules
│   ├── UI_REVIEW_PANEL.md               — wireframe for the comment-review panel
│   ├── UI_LIBRARY.md                    — wireframe for the doc library
│   └── TASKS.md                         — ~112 atomic tasks ≤4h each
├── starter/                        ← drop-in project configs (M0 starter pack)
│   ├── package.json                — pinned dependency versions
│   ├── tsconfig.json               — strict TS + path aliases
│   ├── vite.config.ts              — Tauri-aware build config
│   ├── vitest.config.ts            — happy-dom test config
│   ├── .eslintrc.cjs               — arch-invariant lint rules
│   ├── .prettierrc                 — formatting
│   └── src-tauri/
│       ├── tauri.conf.json         — CSP + asset-scope + bundle settings
│       ├── Cargo.toml              — Rust deps incl. keyring
│       ├── src/lib.rs              — IPC command registration
│       └── src/main.rs             — native binary entry point
├── examples/                       ← valid + invalid YAML/JSON fixtures
│   ├── sample-proposal.yaml
│   ├── sample-deck.yaml
│   ├── sample-block-patch.json
│   ├── sample-comment-thread.json
│   ├── sample-llm-batch-request.json
│   ├── sample-llm-batch-response.json
│   └── invalid/                    ← each one fails validation in a documented way
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
- [docs/TASKS.md](docs/TASKS.md) — atomic backlog. Use task IDs (`T-NN`) in commit messages and PRs.
- [docs/BLOCK_IMPLEMENTATION_GUIDE.md](docs/BLOCK_IMPLEMENTATION_GUIDE.md) — copy-pattern for the 15 blocks.
- [docs/SETUP_PIPELINE.md](docs/SETUP_PIPELINE.md) — setup AI pipeline (ingestion + code-gen + lint).
- [docs/SETUP_INSTALL_FLOW.md](docs/SETUP_INSTALL_FLOW.md) — per-consultant install CLI prompts.
- [docs/TAURI_IPC.md](docs/TAURI_IPC.md) — every JS↔Rust command with signatures.
- [docs/YAML_FORMAT.md](docs/YAML_FORMAT.md) — formatter rules that guarantee byte-stable round-trips.
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

**All non-trivial plans must go through the `grill-me` skill.** Before writing
code for any new feature, milestone, or refactor:

1. Draft the plan.
2. Invoke `grill-me` to stress-test it — resolve every branch of the decision
  tree before implementation begins.
3. Only after the grilling settles should code land.

This applies to anything bigger than a one-file edit or a typo fix.

## Autonomous task loop

`docs/TASKS.md` is driven by an autonomous loop. The loop is conservative:
defaults to halting cleanly when something is wrong rather than charging ahead.

### Slash commands

- `**/next-task`** — one fire of the loop. Reads `docs/TASKS.md`, picks the
next eligible task, implements + tests + global-gates + commits + pushes,
then continues to the next task. Runs until a halt rule trips or
`ALL DONE`. Spec: [.claude/commands/next-task.md](.claude/commands/next-task.md).
- `**/status`** — read-only snapshot of loop state, recent commits, open
blockers, CI status. Safe to run anytime. Spec:
[.claude/commands/status.md](.claude/commands/status.md).
- `**/skip T-NN <reason>**` — permanently mark a task as deliberately not
doing. Treated like `[x]` for dependency-eligibility. Spec:
[.claude/commands/skip.md](.claude/commands/skip.md).

To drive the loop autonomously, in Claude Code:

```
/loop 45m /next-task
```

### Status markers in TASKS.md

Markers are placed as a **suffix on the task header line**, between the task ID and the `·` separator:

```
### T-NN [ ] · Title goes here
```


| Marker          | Meaning                                                                            |
| --------------- | ---------------------------------------------------------------------------------- |
| `[ ]`           | Not started — eligible when all `Depends-on:` are `[x]` or `[skip]`                |
| `[~]`           | In progress (current invocation); leftover from a crashed prior fire is auto-reset |
| `[x]`           | Done                                                                               |
| `[?]`           | Needs human input — counts toward halt rules                                       |
| `[!]`           | Waiting on external dep — doesn't halt; auto-promotes to `[?]` after 3 fires       |
| `[skip]`        | Deliberately not doing                                                             |
| `[GATE FAILED]` | On milestone header — halts the loop                                               |


Each task carries two distinct dependency-style fields:

- `**Depends-on:**` — comma-separated task IDs (`T-NN`) or `none`. Controls eligibility.
- `**Reads:**` — file paths, doc references, and `D-NN` decision references the task must consult during implementation. No eligibility role.

The old single `Inputs:` field is deprecated; do not introduce it on new tasks.

### Halt rules (conservative)

The loop halts when ANY of these trip:

1. **A-rule** — 2 consecutive `[?]` tasks (signals systemic rot, not bad luck).
2. **C-rule** — current milestone has any `[?]` (don't advance past a broken phase).
3. **Quality gate** — `tsc --noEmit` or `npm run lint` fails after a task; failure counts toward A-rule.
4. **Milestone gate** — full `npm run build && npm test` fails when entering a new milestone.
5. **CI failure** on `origin/main` (per the optional CI-poll config below).
6. **Push conflict** that survives a rebase retry.
7. **Pre-flight failure** (dirty tree, branch divergence, missing files).

Halts are **self-healing** — the loop's `/loop` interval keeps firing. When
the human resolves the blocker, the next fire auto-resumes.

### Morning-check ritual (5 minutes)

1. Open `STATUS.md` (auto-regenerated on every fire).
2. If state is `RUNNING` or `ALL_DONE` → nothing to do.
3. If state ends in `*HALT` / `*FAILED`:
  - Read the "What needs your attention" section.
  - Open `BLOCKERS.md` for full detail on each blocker.
  - Fix the root cause; edit the relevant marker in `docs/TASKS.md` from
  `[?]` back to `[ ]`.
  - Append a `**Resolved:`** line to the BLOCKERS.md entry.
  - The next loop fire (within 45 min) resumes autonomously.

### Loop configuration

```yaml
# Consumed by /next-task; edit here to change behavior
loop:
  ci-poll: true        # check `gh run list` on origin/main before each task
  ci-poll-tool: gh     # CLI tool to use; if missing, CI-poll is skipped (warned in STATUS.md, not halted)
```

### Model + effort tier

Pick the right combination in your chat app before launching `/loop`:


| Tier                              | Use for                                                                                                                            | Claude Code                                    | Cursor (Composer) | Codex / ChatGPT    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------- | ------------------ |
| **Default** (~90% of tasks)       | Mechanical block work, schema, renderers, mapping                                                                                  | Sonnet 4.6 + **high**                          | Auto              | GPT-5.5 High       |
| **Escalation** (~10%, hard tasks) | Setup AI pipeline (T-41–T-49), watchdog (T-46b), perf benchmarks (T-89c, T-89d), retry of any `[?]` task | Opus 4.7 + **high** (xhigh after failed retry) | GPT-5.5 xHigh     | GPT-5.5 xHigh      |
| **Avoid**                         | This protocol is too detailed for these                                                                                            | Sonnet medium · Haiku                          | Composer 1        | GPT-4o · GPT-5 low |


Full guidance is in `[.claude/commands/next-task.md](.claude/commands/next-task.md)` under "Model and effort tier." The loop self-reports its tier in `STATUS.md` and emits `tier-mismatch` advisories for escalation tasks running on the default tier — informative, not blocking.

### Cursor auto-run (allowlist — no terminal deny-list UI)

Cursor does **not** expose a terminal **deny list** in Settings. Auto-run uses an **allowlist**: only listed command prefixes auto-run without approval; everything else prompts (or runs sandboxed in **Allowlist (with Sandbox)** mode).

**Settings path:** **Cursor Settings → Agents → Auto-Run** (and **Protection** toggles on the same page).

| Control | Purpose |
| --- | --- |
| **Auto-Run mode** | `Allowlist` or `Allowlist (with Sandbox)` for `/next-task` |
| **Command Allowlist** | Safe prefixes: `npm`, `npx`, `tsc`, `vitest`, `eslint`, `prettier`, `cargo`, `bash scripts/`, `gh`, specific `git` subcommands — avoid bare `git` if you want push/commit gated |
| **File-Deletion Protection** | On — blocks automatic deletes |
| **Dotfile / External-File Protection** | On as needed |

**Forbidden commands** for this repo (enforced three ways):

1. **`.cursor/cli.json`** — `permissions.deny` (`Shell(...)` tokens; deny beats allow)
2. **`.cursor/rules/autonomous-loop-terminal-safety.mdc`** — agent must not run them
3. **Pre-commit hook** — blocks bad commits even if a command slipped through

Do **not** add `git push --force`, `git commit --amend`, `--no-verify`, or `git add -A` / `git add .` to the IDE allowlist.

Optional global file (overrides in-app terminal allowlist when set): `~/.cursor/permissions.json` — see [Cursor permissions.json](https://cursor.com/docs/reference/permissions).

### Hard rules the loop will never violate

- Never force-push. Push rejection → halt to `PUSH-CONFLICT`.
- Never amend prior commits.
- Never bypass the pre-commit hook (`--no-verify`, `--no-gpg-sign`). The hook is the safety net.
- Never use `git add -A` / `git add .` — always explicit paths.
- Never stage files outside `Outputs:` ∪ allow-list ∪ loop-managed-files. The pre-commit hook fails the commit.
- Never commit changes to loop-managed files (`docs/TASKS.md`, `STATUS.md`, `BLOCKERS.md`) in isolation — they must be bundled together when any of them is mutated. The hook enforces this.
- Never silently adjust `DECISIONS.md` targets when a gate fails — file the regression as a blocker.
- Never delete `BLOCKERS.md` entries (append-only).
- Never start work without a clean pre-flight.

### Pre-commit hook

`scripts/verify-task-commit.sh` runs as the pre-commit hook on `main` and `bakeoff/`* branches. It enforces:

- Loop-managed files (`docs/TASKS.md`, `STATUS.md`, `BLOCKERS.md`) are staged together when any of them is mutated.
- Only files in the static allow-list may be staged outside the current task's declared `Outputs:`. See `[.claude/commands/next-task.md](.claude/commands/next-task.md)` for the allow-list.
- Marker transitions in `docs/TASKS.md` are well-formed (at most one `[ ]→[~]→[x]` or failure-path transition per commit).

Install with: `bash scripts/install-hooks.sh` (also runs automatically from the loop's pre-flight #6).

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
sign-off on the plan PR.

## Working style

- Build milestone-by-milestone. Do not start a milestone until the previous
one's acceptance criteria pass.
- Work tasks from `docs/TASKS.md` in dependency order. Reference task IDs
(`T-NN`) in commit messages and PR titles.
- Prefer editing existing files over creating new ones.
- Don't add features, abstractions, or error handling beyond what the task
requires.
- Default to no comments. Only write a comment when the *why* is non-obvious.
- For any new block: copy the four-file pattern from `reference/callout/`.
Do not invent a new shape.

## Review playbook (conventions for code-review / security-audit / test-engineer agents)

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
  hidden by this exact pattern (see `BLOCKERS.md [drift-2026-05-26c]` and
  related entries).
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
  them are required, OR the gap should be tracked as a `[!]` BLOCKERS
  entry until the matrix is wired. Concrete pattern: list every Rust
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
