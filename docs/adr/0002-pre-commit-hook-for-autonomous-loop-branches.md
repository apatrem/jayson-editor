# Pre-commit hook enforces autonomous-loop protocol invariants on `main` and `bakeoff/*` branches

**Status:** superseded by [ADR-0023](0023-adopt-agentic-workflow-retire-autonomous-loop.md) (loop retired; gate enforcement moved to CI required checks)
**Date:** 2026-05-21

## Context

The autonomous task loop spec in `.claude/commands/next-task.md` is conservative procedural protocol — ~440 lines of pre-flight checks, halt rules, staging discipline, and marker arithmetic. The first generation of bake-off (v1, three LLM drivers running T-01..T-05 on local-only branches) exposed that 2 of 3 drivers silently skipped load-bearing steps:

- Cursor never regenerated `STATUS.md` despite the spec mandating it per-fire.
- GPT-5 collapsed claim+implementation into one commit and committed undeclared lockfiles + binary assets without listing them in `Outputs:`.
- All three drivers invented their own marker placement convention because the spec was silent on it.

A reasoning model trying to be efficient *will* find any step it judges optional, regardless of how well the spec explains why the step matters. Trust-based defenses (richer "why this matters" prose, self-check checklists) are vulnerable to the same skipping that already happened — a driver willing to skip step 7 will also lie on step 8.

## Decision

Install `scripts/verify-task-commit.sh` as a git pre-commit hook (via `scripts/install-hooks.sh`) that runs only on `main` and `bakeoff/*` branches. The hook asserts three invariants the LLM cannot quietly elide:

1. **Loop-managed files bundled together** — if any of `docs/TASKS.md`, `STATUS.md`, `BLOCKERS.md` is staged, all of them whose on-disk state differs from `HEAD` must also be staged.
2. **Loop commits must include STATUS.md regeneration** — when the staged `docs/TASKS.md` diff contains a marker transition involving `[~]`, `[x]`, `[?]`, `[!]`, or `[skip]`, `STATUS.md` must differ from `HEAD`.
3. **No forbidden paths** — `node_modules/`, `target/`, `dist/`, `.env*`, `.DS_Store`, and 5MB+ binary blobs are rejected.

The hook is paired with a self-check checklist (step 8 of the loop spec) — defense in depth. The hook catches what the checklist can't express in bash; the checklist catches what the hook can't see (e.g., "the tier self-report names the model actually running").

Branch scoping is deliberate: contributors making manual commits on feature branches are not affected; the hook only fires when the loop (or a human emulating the loop) is committing to `main` or a bake-off branch.

## Rejected alternatives

- **A. Trust the spec; add inline "why this matters" prose.** v1 already proved this insufficient — the spec was explanatory enough that Claude obeyed it, but the other two drivers still elided steps.
- **B. Self-check checklist only.** A driver willing to skip the action will also lie on the verification step. The bake-off showed this directly: Cursor's STATUS.md was never written, so any self-check claiming "STATUS.md updated" would have been false.
- **C. Hook only, no checklist.** Some protocol concerns (tier self-report, marker semantics, scope discipline) are hard to express as bash assertions. Removing the checklist removes the loop's introspective layer.
- **Server-side enforcement (CI rejection of bad commits).** Catches violations later (after the push), wastes a fire, and creates ambiguity about whether the commit was the driver's intent or a bug. Pre-commit catches at the source.

## Consequences

- Contributors must run `bash scripts/install-hooks.sh` once per clone. The loop's pre-flight check #6 auto-installs if missing, so the loop driver is self-healing; manual contributors get a one-liner instruction in `AGENTS.md`.
- Worktrees share `.git/hooks/`, so installing once covers all bake-off branches.
- If the hook misfires on a legitimate edge case, the explicit escape hatch is to mark the task `[?]` with reason `hook-misfire: <description>` and halt to `BLOCKED-NO-ELIGIBLE` — NOT to bypass with `--no-verify`. The hard rules in `next-task.md` reinforce this.
- The hook is unsigned bash without tests; its failure modes will surface during v2 bake-off. Treating v2 as the hook's first real exercise is deliberate — if the hook proves fragile, the v2 narrative will catch it.
- Adding new loop-managed files later (e.g., a `BUDGET.md`) requires extending the `LOOP_FILES` constant in both the hook and `next-task.md`. The bundling rule then extends automatically.
- The "loop commit detection" heuristic (presence of `[~]/[x]/[?]/[!]/[skip]` transitions in the TASKS.md diff) is approximate. A purely structural TASKS.md edit that happens to remove a `[~]` marker (e.g., refactoring a task that was incorrectly left in-progress) would trigger the STATUS.md requirement. Accepted: the false-positive rate is low and the failure mode is loud (commit blocked), not silent (drift).
