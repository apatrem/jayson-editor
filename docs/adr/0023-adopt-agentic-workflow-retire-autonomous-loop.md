# Adopt the agentic-workflow conventions; retire the autonomous TASKS.md loop

**Status:** accepted
**Date:** 2026-06-10

**Supersedes:** [ADR-0002](0002-pre-commit-hook-for-autonomous-loop-branches.md)
(pre-commit hook for autonomous-loop branches) and
[ADR-0003](0003-pre-commit-gate-enforcement.md) (pre-commit gate enforcement).
**Revises:** the "Autonomous task loop" policy formerly in `AGENTS.md`.

## Context

v1 was built by an autonomous task loop driving `docs/TASKS.md`: ~206 atomic
tasks (≤4h each) with status markers (`[ ]`/`[~]`/`[x]`/`[?]`/`[!]`/`[skip]`),
conservative halt rules, loop-managed state files (`STATUS.md`, `BLOCKERS.md`),
two git hooks enforcing marker transitions and staging allow-lists, and slash
commands (`/next-task`, `/status`, `/skip`). It worked: 203/206 tasks landed,
the halt rules caught real rot, and `BLOCKERS.md` is a genuinely useful audit
trail.

But the costs grew as the project matured:

- **Marker bureaucracy.** Two hook scripts (~17KB of bash), bundling rules for
  loop-managed files, escalation-tier acknowledgments in commit messages, and
  stale `[~]` markers whenever a fire crashed — all to track state that PRs
  track natively.
- **The ≤4h atom ceiling.** Coherent work units (e.g. the JSON canonical
  migration, T-183–T-187) were split into 5 sequential micro-tasks with
  hand-maintained dependency chains, each carrying its own commit/gate
  overhead. Remaining v2-era work (generation pipeline, deck path) is better
  shaped as fewer, bigger, independently reviewable deliverables.
- **Single-writer serialization.** The loop ran one task at a time on `main`;
  parallel-safe work had no way to fan out.
- **A second workflow already exists.** The agentic-workflow plugin
  (scaffolded in PR #3) provides the backbone this repo now wants: `AGENTS.md`
  as cross-tool source of truth + a deterministic gate enforced by CI required
  checks on protected `main` + small PRs from isolated worktrees + an
  effort/review dial per task + **humans merge**. Running both regimes side by
  side invites drift.

## Decision

Retire the autonomous loop and adopt the agentic-workflow conventions as the
single workflow:

1. **Tasks** live as individual files in `tasks/T-NNN-<slug>.md` (template:
   `templates/task.template.md`) — bigger than the old atoms, sized to a
   reviewable PR, with **machine-checkable acceptance criteria** mapped to
   test files, plus `mode` (low/medium/hard), `risk`, `depends-on`, and
   `parallel-safe` metadata. Produced by `/agentic-workflow:plan` after a
   grilling session; a human approves task files before implementation.
2. **The gate** is one command, run identically by CI (`quality` check) and
   locally: `ruby scripts/check-specs && npm run lint && npm test && npm run build`.
   Protection moves entirely to **CI required checks + protected `main`**;
   the policy-enforcing git hooks are deleted. Local hooks are reduced to
   hygiene (`.pre-commit-config.yaml`).
3. **Isolation** is per-task worktrees on `agent/<lineage>/<task>` branches;
   every change lands via PR; **a human merges**.
4. **Effort/review** is the per-task `mode` dial (default `low`; justify
   higher), replacing the loop's model/effort tier table and escalation list.
5. The loop apparatus is removed: `/next-task`, `/status`, `/skip` commands
   (Claude + Cursor copies), `scripts/install-hooks.sh`,
   `scripts/verify-task-commit.sh`, `scripts/verify-commit-msg.sh`,
   `scripts/verify-gates.sh`, `scripts/escalation-list.txt`, and the
   loop-specific Cursor rule. The generic terminal-safety prohibitions
   (no force-push, no amend, no `--no-verify`, explicit-path staging) move
   into `AGENTS.md` and remain denied in `.cursor/cli.json`.
6. Loop state is archived, not deleted: `docs/TASKS.md` (milestone index +
   final legacy state), `docs/TASKS_ARCHIVE.md` (completed task bodies),
   `BLOCKERS.md` (append-only audit trail), and the final `STATUS.md` move
   to `docs/archive/`. The Phase 12 coarse re-plan (PR #5, `tasks/T-201`–
   `T-204` with frozen acceptance tests) stands as-is; the remaining legacy
   entries are re-grouped into `tasks/T-205`–`T-211`, preserving original
   task IDs and specs in each file's provenance line.

## Consequences

- New work = grill → plan (task files, human-approved) → worktree per task →
  gate green → small PR → tiered review → human merge. Parallel-safe tasks
  fan out concurrently instead of serializing through one loop.
- The 4 bash hook scripts and their bundling/marker rules disappear; nothing
  enforces marker grammar because there are no markers — PR state is task
  state.
- `STATUS.md` / `BLOCKERS.md` stop being maintained. Drift entries cited by
  the review playbook now resolve to `docs/archive/BLOCKERS.md`.
- The M9b acceptance gate review (pending since 2026-05-27) is now an ordinary
  human action item, no longer a loop halt condition.
- Bake-off tooling (`BAKEOFF.md`, `scripts/bakeoff-setup.sh`,
  `scripts/verify-bakeoff-v2.sh`) references the deleted hook scripts; it is
  retained as a historical experiment record and would need updating before
  any re-run.
- Anyone with the old hooks installed should remove them once this merges:
  `rm .git/hooks/pre-commit .git/hooks/commit-msg`, then
  `pre-commit install` for the hygiene hooks.
