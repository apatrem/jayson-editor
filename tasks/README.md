# tasks/ — the active backlog

One file per task, `T-NNN-<slug>.md`, from [templates/task.template.md](../templates/task.template.md).
Created by `/agentic-workflow:plan` after a grilling session; a human approves
task files before implementation fans out. See `AGENTS.md → Workflow (PR-based)`
and ADR-0023.

- A task is **done when its PR merges**; the implementing PR ticks the
  acceptance boxes in the task file.
- `depends-on` gates start order (IDs here, must be merged first).
- `parallel-safe: yes` tasks may run concurrently, one worktree each.
- The completed v1 backlog (T-01–T-196, autonomous-loop era) is archived at
  [docs/archive/TASKS.md](../docs/archive/TASKS.md).

**Pending human action (not a task):** the M9b acceptance-gate review requested
in [docs/archive/STATUS.md](../docs/archive/STATUS.md) — run the M9b acceptance
test (author → share → receive → render flow) and approve or raise issues.
