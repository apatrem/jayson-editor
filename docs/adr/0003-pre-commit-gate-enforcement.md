# Pre-commit hook invokes project-wide gates (tsc + lint + tests) for code commits

**Status:** superseded by [ADR-0023](0023-adopt-agentic-workflow-retire-autonomous-loop.md) (loop retired; gate enforcement moved to CI required checks)
**Date:** 2026-05-22

## Context

`.claude/commands/next-task.md` step 5 (GLOBAL QUALITY GATES) requires every task commit to pass `tsc --noEmit` + `npm run lint` + `npm test` project-wide; failure marks the task `[?]` and halts. ADR-0002 established the pre-commit hook as the machine backstop for protocol invariants (loop-managed file bundling, forbidden paths, marker grammar), but it explicitly did NOT check build tools.

T-24 (prose block) demonstrated that driver discipline alone is insufficient: Cursor Auto silently skipped step 5, committed code that broke `tsc --noEmit` on `src/editor/nodes/ProseNode.tsx` (an unused import + three `unsafe-any` assignments), marked the task `[x]`, and STATUS.md reported "RUNNING — no action needed." The static-file hook from ADR-0002 had no way to detect that the build was broken; only post-hoc review caught it. Every subsequent task would have layered onto a tsc-red baseline until something failed loudly enough.

This is the same class of failure mode as v1's silent-skip cluster (Cursor skipping STATUS.md), which v2 fixed by moving the invariant from "driver should remember" to "hook enforces." The same move is now required for step 5.

## Decision

Extract step 5's gate sequence into `scripts/verify-gates.sh` — a single source of truth that runs `tsc --noEmit` + `npm run lint` + `npm test` in order, with a pre-M0 escape if `package.json` or `node_modules/` is absent. Both callers invoke it:

1. **The loop's step 5** (driver discipline path) — calls `bash scripts/verify-gates.sh`, treats non-zero exit as the existing failure-handling block (`[?]`, BLOCKERS.md, halt).
2. **`scripts/verify-task-commit.sh` Assertion 4** (machine backstop) — invokes the same script when the commit either is a real loop transition OR stages any `.ts/.tsx/.js/.jsx/.cjs/.mjs/.rs` file. Pure docs/markdown/script-only commits skip the gates to keep them fast (~0s overhead).

The hook backstop means a commit that breaks the build cannot land, regardless of which driver wrote it or whether step 5 was executed.

## Rejected alternatives

- **A. Run gates on every commit.** Pays ~4s on commits that can't possibly break the build (docs, BAKEOFF.md edits, ADRs). Tempts contributors to `--no-verify` (banned by hard rules). The marginal protection over Path C is zero — non-code commits can't fail tsc or lint.
- **B. Gates only on loop commits, detected via TASKS.md marker transition.** Catches the loop's automated commits but misses manual driver fixes that introduce regressions outside the loop (e.g., a contributor patching a bug on `main` without touching TASKS.md). T-24's fix commit itself is the canonical example — a code-only commit that the v1 hook would have ignored.
- **C. Adopted approach.** Gates fire when (loop transition) OR (any code file staged). Catches both the loop's commits and manual code edits. Skips docs-only commits.
- **D. No hook enforcement; trust step 5.** This is the pre-T-24 state. T-24 proved it's insufficient.

## Consequences

- Code commits now pay ~4s for `tsc + lint + tests` on the current codebase. Acceptable for the safety floor; will grow as the codebase grows. If total gate time crosses ~30s, the bottleneck (likely test suite) gets its own optimization or moves to CI-only with a faster pre-commit subset.
- Pre-M0 escape (`scripts/verify-gates.sh` skips when `package.json` or `node_modules/` is absent) means T-01 and T-02 commits don't trip on bootstrapping. After T-01 commits `package.json` and `npm install` runs, every subsequent task pays the gate cost.
- `GATES_VERBOSE=1 bash scripts/verify-gates.sh` shows full gate output for debugging; the hook by default shows only the first 30 lines of failing output to keep terminal noise bounded.
- `SKIP_TESTS=1` is an env-level escape hatch for unusual cases (e.g., committing a test-suite refactor in stages); the loop itself never sets it. If a contributor uses it routinely, that's a smell — investigate why tests don't fit the discipline.
- Worktrees share `.git/hooks/pre-commit` (a symlink installed by `scripts/install-hooks.sh`) and therefore share gate enforcement. The hook + gate runner are both committed in `scripts/`, so a fresh clone gets them automatically; only `install-hooks.sh` needs to run once per clone.
- Adding a future gate (e.g., `cargo check` for the Rust side of Tauri, or a custom architectural lint) extends `verify-gates.sh` and both callers benefit. No need to update the hook OR the spec separately.
- If the hook misfires on a legitimate edge case (e.g., a deliberate work-in-progress commit on a feature branch with intentionally broken tsc), the escape is the same as ADR-0002: mark the task `[?]` with reason `hook-misfire: <description>` and resolve cleanly. NEVER `--no-verify`. Feature branches not matching `main` or `bakeoff/*` are already exempt from the hook entirely.
