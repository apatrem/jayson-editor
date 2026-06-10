# tasks/ — the active backlog

One file per task, `T-NNN-<slug>.md`, from [templates/task.template.md](../templates/task.template.md).
Created by `/agentic-workflow:plan` after a grilling session; a human approves
task files before implementation fans out. See `AGENTS.md → Workflow (PR-based)`
and ADR-0023.

- A task is **done when its PR merges**; the implementing PR ticks the
  acceptance boxes in the task file.
- `depends-on` gates start order (IDs here, must be merged first).
- `parallel-safe: yes` tasks may run concurrently, one worktree each.
- The v1 autonomous-loop backlog is archived: milestone index + final legacy
  state at [docs/archive/TASKS.md](../docs/archive/TASKS.md), completed task
  bodies at [docs/archive/TASKS_ARCHIVE.md](../docs/archive/TASKS_ARCHIVE.md).
- T-201–T-204 are the Phase 12 coarse re-plan (PR #5) with frozen acceptance
  tests (committed red on purpose; see the frozen-test guardrail in AGENTS.md).
  T-205–T-211 absorb the remaining legacy entries + D-40/D-41.

**Pending human action (not a task):** the M9b acceptance-gate review requested
in [docs/archive/STATUS.md](../docs/archive/STATUS.md) — run the M9b acceptance
test (author → share → receive → render flow) and approve or raise issues.
