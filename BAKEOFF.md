# Model bake-off: T-01..T-05 across 3 drivers

**Purpose:** empirically pick the driver model/effort tier for the autonomous task loop AND validate the loop's protocol by running the same first 5 tasks through three LLMs and comparing the resulting branches.

**Companion to:** `.claude/commands/next-task-bakeoff.md`, `scripts/bakeoff-setup.sh`, `scripts/verify-bakeoff-v2.sh`.

---

## Current generation: v2

This document drives the **v2 bake-off**, which validates a spec that incorporates 10 fixes derived from the v1 post-mortem (see §Lessons from v1 below). The default branches and worktrees use the `-v2` suffix:

| Driver | Branch | Worktree (default) | Start tag |
|---|---|---|---|
| Claude Code | `bakeoff/claude-v2` | `../jayson-editor-claude-v2` | `bakeoff-start-v2` |
| Cursor | `bakeoff/cursor-v2` | `../jayson-editor-cursor-v2` | `bakeoff-start-v2` |
| Codex (GPT-5) | `bakeoff/gpt5-v2` | `../jayson-editor-gpt5-v2` | `bakeoff-start-v2` |

The v1 branches (`bakeoff/claude`, `bakeoff/cursor`, `bakeoff/gpt5`) and v1 tag (`bakeoff-start`) are **frozen** as the comparison baseline — do not delete them until after v2 validates and you cherry-pick a v2 winner onto main.

---

## Why this exists

`docs/TASKS.md` contains ~120 tasks. Picking the wrong driver wastes weeks of LLM quota on subtly broken commits. The bake-off costs about one day of any single tier's weekly cap and replaces theory with empirical results.

Three drivers run the same first 5 tasks (M0 scaffolding — T-01..T-05) on their own **local-only** branch:

- `bakeoff/claude-v2` — Claude Code, Sonnet 4.6 high (escalates to Opus 4.7 xhigh on retry)
- `bakeoff/cursor-v2` — Cursor, auto mode (mostly Composer 2.5)
- `bakeoff/gpt5-v2` — Codex desktop, GPT-5 high (escalates to xhigh on retry)

T-01..T-05 are all default-tier tasks. Escalation only fires if a task gets `[?]`'d and is retried by the human. Each driver's STATUS.md self-reports the model and effort it actually ran, so the human can audit what `cursor auto` picked vs. what was specified.

---

## Lessons from v1 (the 10 spec improvements)

The v1 bake-off ran the same 3 drivers against an earlier loop spec. All three completed T-01..T-05, but with telling differences. The post-mortem (captured via `/grill-with-docs`) identified 10 design improvements now encoded in the current spec:

| # | Lesson | Fix in v2 spec |
|---|---|---|
| 1 | Task headers had no marker placement convention — drivers invented their own (prefix vs suffix) | Marker is **suffix on header line**: `### T-NN [ ] · Title` |
| 2 | "Claim commits" (`T-NN: claim`) doubled the commit count and were easy to skip — GPT-5 silently collapsed them | Killed: one commit per task; pre-flight #7 catches mid-task crashes via stale `[~]` on disk |
| 3 | STATUS.md regeneration was a separate step and was silently skipped (Cursor never wrote STATUS.md) | Bundled into the same commit as the task; pre-commit hook rejects task commits that don't stage STATUS.md |
| 4 | `Outputs:` was incomplete for reproducibility files — GPT-5 over-committed lockfiles, Claude under-committed | Static allow-list in `next-task.md` covers `package-lock.json`, `Cargo.lock`, Tauri icons; deny-by-default for everything else |
| 5 | Verbose spec invited elision; no defense against the next skip | Self-check checklist (step 8) + `scripts/verify-task-commit.sh` pre-commit hook |
| 6 | `Inputs:` overloaded task-IDs + file paths + prose; dep-eligibility parsing was fragile | Split into `Depends-on:` (T-NN only) and `Reads:` (everything else) |
| 7 | Two parallel specs (`next-task.md` and `next-task-bakeoff.md`) would drift over time | Bake-off variant kept temporarily for v2 validation; after v2 passes, deleted and methodology lives in this file as a patches recipe (see §Patches recipe below) |
| 8 | BLOCKERS.md was mutated without explicit staging (same failure mode as STATUS.md) | Generalized rule: all loop-managed files (`docs/TASKS.md`, `STATUS.md`, `BLOCKERS.md`) staged together; hook enforces |
| 9 | No naming convention for re-running the methodology | Flat suffix: `bakeoff/<driver>-vN`, worktrees `../jayson-editor-<driver>-vN`, tag `bakeoff-start-vN`; `--version vN` flag on setup script |
| 10 | Comparison rubric was qualitative-only — same fuzzy "looks better" verdict every time | Binary checklist (`scripts/verify-bakeoff-v2.sh`) gates pass/fail; qualitative narrative supplements |

v1 winner was Claude Code with Sonnet 4.6 high (cleanest protocol adherence). The v2 re-run validates that the 10 fixes close the failure modes the other two drivers hit in v1.

---

## Setup (run once per generation)

```bash
# From the repo root, on main, with a clean tree, AFTER the spec fixes have
# been committed and pushed to origin/main:
bash scripts/bakeoff-setup.sh                 # defaults to v2
bash scripts/bakeoff-setup.sh --version v3    # next-generation bake-off
```

The script (default mode):
- Verifies you're on `main` with a clean tree.
- Tags current `HEAD` as `bakeoff-start-v2` (used by `next-task-bakeoff` for crash recovery; v2 default).
- Creates three local branches off `HEAD`: `bakeoff/claude-v2`, `bakeoff/cursor-v2`, `bakeoff/gpt5-v2`.
- **Creates three git worktrees** (sibling directories) so each driver app can operate on its own checkout in parallel.
- Switches back to `main` in the primary worktree.
- Prints next-step instructions.

By default this produces a directory layout like:

```
~/Documents/
  ├── jayson-editor/               ← primary worktree (main); compare from here
  ├── jayson-editor-claude/        ← v1 worktree, FROZEN (do not touch)
  ├── jayson-editor-cursor/        ← v1 worktree, FROZEN
  ├── jayson-editor-gpt5/          ← v1 worktree, FROZEN
  ├── jayson-editor-claude-v2/     ← v2 worktree on bakeoff/claude-v2
  ├── jayson-editor-cursor-v2/     ← v2 worktree on bakeoff/cursor-v2
  └── jayson-editor-gpt5-v2/       ← v2 worktree on bakeoff/gpt5-v2
```

All directories share the same `.git`. Commits made in any worktree are visible to all the others. **Each app opens a different folder**, so they can't fight over which branch is checked out.

Verify:

```bash
git branch --list 'bakeoff/*' -v
git tag --list 'bakeoff-start*'
git worktree list
```

You should see six bake-off branches (3 v1 frozen + 3 v2), two tags (`bakeoff-start`, `bakeoff-start-v2`), and seven worktrees (main + 6 bake-off). Branches are **local-only** — no `git push` happens. None of the bake-off activity touches `main` or `origin`.

### Pre-commit hook (auto-installed)

The first `/next-task-bakeoff` invocation per worktree runs `bash scripts/install-hooks.sh` automatically (pre-flight check #6), symlinking `scripts/verify-task-commit.sh` into `.git/hooks/pre-commit`. Worktrees share a single `.git/hooks` directory, so installing once covers all bake-off branches.

You can install proactively from the primary worktree:

```bash
bash scripts/install-hooks.sh
```

### Why parallel (and how to opt out)

The three desktop apps (Claude Code, Cursor, Codex) all read the file system. Without worktrees, they'd fight over a single checkout — only one branch can be active at a time. Worktrees give each app its own folder + branch, so all three can run simultaneously. The bake-off finishes in ~1 hour instead of ~3 hours.

If you'd rather run sequentially (one app at a time, checking out branches in turn):

```bash
bash scripts/bakeoff-setup.sh --no-worktrees
```

Then switch branches manually between drivers (the original setup behavior).

### Custom worktree location

Worktrees default to siblings of the main repo. Override with the `WORKTREE_BASE` environment variable:

```bash
WORKTREE_BASE=/tmp/bakeoff bash scripts/bakeoff-setup.sh
```

---

## Regenerate the bake-off variant spec (required before drivers)

`.claude/commands/next-task-bakeoff.md` is **not committed** in this repo — per decision Q7, it's retired after each bake-off generation completes. Before launching any driver, regenerate it by following the **Patches recipe for future bake-offs** at the bottom of this file. That recipe forks the current `.claude/commands/next-task.md`, applies 15 surgical patches to convert it to a local-only bake-off variant, and leaves the file at `.claude/commands/next-task-bakeoff.md` ready to use.

Skip this step and the driver sections below will reference a file that doesn't exist.

---

## Driver 1: Claude Code

**Model + effort:** Sonnet 4.6 + thinking budget = high  
**Escalation rule:** if any of T-01..T-05 gets `[?]`'d, switch the chat model to Opus 4.7 + xhigh, mark the task back to `[ ]` in TASKS.md, and re-fire.

**Open Claude Code in the dedicated worktree:**

```
~/Documents/jayson-editor-claude-v2/
```

(The worktree is already on `bakeoff/claude-v2` — no `git checkout` needed.)

In Claude Code:
1. Open the folder above as the working directory.
2. In the model picker: select **Claude Sonnet 4.6**.
3. Set thinking budget: **high**.
4. Run `/next-task-bakeoff` once manually to validate the protocol.
5. Inspect the resulting commit: T-01 should be marked `[x]`, the commit message starts with `T-01:`, `STATUS.md` was regenerated with a `Running on:` line that shows Sonnet 4.6 + high.
6. If clean: `/loop 30m /next-task-bakeoff` (or invoke `/next-task-bakeoff` manually four more times).

**Expected outcome:** 5 commits on `bakeoff/claude-v2` (T-01..T-05, one commit per task — no claim commits in v2 spec), STATUS.md state = `BAKEOFF_COMPLETE`.

**(Sequential mode without worktrees: `git checkout bakeoff/claude-v2` in the main repo before running.)**

---

## Driver 2: Cursor in auto mode (mostly Composer 2.5)

**Model + effort:** auto — Cursor routes as it sees fit; usually Composer 2.5.  
**Escalation rule:** if any of T-01..T-05 gets `[?]`'d, manually pin the chat model to Sonnet 4.6 + max thinking or Opus 4.7 + max thinking, mark the task back to `[ ]`, and re-send.

**Open Cursor in the dedicated worktree:**

```
~/Documents/jayson-editor-cursor-v2/
```

(The worktree is already on `bakeoff/cursor-v2` — no `git checkout` needed.)

In Cursor:
1. Open the folder above as a project.
2. Open Composer (or the agent chat).
3. **Model: auto** — do not pin a specific model. Cursor's auto mode is the data point being tested.
4. Paste the entire contents of `.claude/commands/next-task-bakeoff.md` as the system instructions for the chat (Composer's "Background" / system-prompt slot, or the first message if no dedicated slot exists).
5. Send: `Begin. Run the protocol on this branch. Stop when T-05 is [x].`
6. Re-invoke "Continue" if Composer pauses between tasks.

**Expected outcome:** 5 commits on `bakeoff/cursor-v2`, STATUS.md state = `BAKEOFF_COMPLETE`. The `Running on:` line records which model auto actually picked — that's the most interesting data point for this driver. The pre-commit hook will catch silent STATUS.md skips (the v1 Cursor failure mode).

**If Cursor's auto routes you to a fast variant** that the protocol's `Tiers that should NOT run this loop` list rejects: the slash command will halt to `BOOT-CHECK-FAILED` with state `TIER-TOO-LOW`. That's also useful information — it tells you auto is unsafe for this workload.

**(Sequential mode without worktrees: `git checkout bakeoff/cursor-v2` in the main repo before opening Cursor.)**

---

## Driver 3: Codex desktop with GPT-5

**Model + effort:** GPT-5 + reasoning effort = high  
**Escalation rule:** if any of T-01..T-05 gets `[?]`'d, switch effort to **xhigh** for the retry.

**Open Codex desktop in the dedicated worktree:**

```
~/Documents/jayson-editor-gpt5-v2/
```

(The worktree is already on `bakeoff/gpt5-v2` — no `git checkout` needed.)

In Codex desktop:
1. Open the folder above as a workspace (Codex has native filesystem access).
2. Model: **GPT-5**.
3. Reasoning effort: **high**.
4. Paste the entire contents of `.claude/commands/next-task-bakeoff.md` as the system instructions for the session.
5. Send: `Begin. Run the protocol on this branch. Stop when T-05 is [x].`
6. Re-invoke "Continue" if Codex pauses between tasks.

**Expected outcome:** 5 commits on `bakeoff/gpt5-v2`, STATUS.md state = `BAKEOFF_COMPLETE`. The pre-commit hook will catch silent lockfile drift, forbidden-path commits, and missing STATUS.md (the v1 GPT-5 failure modes).

**(Sequential mode without worktrees: `git checkout bakeoff/gpt5-v2` in the main repo before opening Codex.)**

---

## Running all three in parallel

With worktrees enabled (default), launch the three apps simultaneously:

1. **Window 1:** open Claude Code on `~/Documents/jayson-editor-claude-v2/`, configure model, run `/next-task-bakeoff`.
2. **Window 2:** open Cursor on `~/Documents/jayson-editor-cursor-v2/`, paste system prompt, send "Begin."
3. **Window 3:** open Codex on `~/Documents/jayson-editor-gpt5-v2/`, paste system instruction, send "Begin."

All three commit to their own branches independently. The shared `.git` (back at `~/Documents/jayson-editor/`) sees all three branches diverge in real time. When all finish, run the comparison commands from `~/Documents/jayson-editor/` on `main`.

**Don't make manual git changes in the main worktree while the bake-off is running** — leave it alone until all three drivers finish. If you need to inspect mid-run, use `git -C ~/Documents/jayson-editor-claude-v2/ log --oneline` etc. from any terminal.

---

## v2 success criteria (gate before qualitative review)

v2 has a binary pass/fail layer on top of the qualitative rubric, because the v1 grilling identified 10 specific spec fixes whose effectiveness this re-run must validate. The gate runs first:

```bash
bash scripts/verify-bakeoff-v2.sh --all
```

This script asserts 10 invariants per branch (`bakeoff/{claude,cursor,gpt5}-v2`):

1. **Marker suffix format** — every task header uses `### T-NN [marker] · Title` (decision Q1)
2. **Exactly 5 commits** in T-01..T-05 range, no extras (decision Q2 + Q3)
3. **No claim commits** — no `T-NN: claim` subjects on any branch (decision Q2)
4. **STATUS.md staged in every task commit** — pre-commit hook enforcement of decision Q3 + Q8
5. **STATUS.md self-reports tier** — `Running on:` and `Driver branch:` lines present (decision Q1 of the original loop spec)
6. **Reproducibility lockfiles committed** — `package-lock.json`, `src-tauri/Cargo.lock` present (decision Q4)
7. **Tauri icons committed** — at least one file in `src-tauri/icons/` (decision Q4)
8. **No legacy `Inputs:` field** in TASKS.md (decision Q6)
9. **Loop-managed bundling** — every commit touching `docs/TASKS.md` also touches `STATUS.md` (decision Q8)
10. **No forbidden paths** — no `node_modules/`, `target/`, `dist/`, etc. committed (decision Q4 + Q5)

Exit code 0 = v2 spec fixes validated on every branch. Non-zero = at least one regression; see per-branch FAIL lines.

## Qualitative rubric (after the binary gate passes)

Once `verify-bakeoff-v2.sh` passes, score each branch on five qualitative dimensions for the actual driver selection. Open three terminals (one per branch) or use the commands in the next section.

### 1. Completion (binary + count)

- All 5 tasks `[x]`? If not, where did it stop, and why?
- `STATUS.md` state = `BAKEOFF_COMPLETE`?

### 2. Spec adherence (1–5) — beyond the binary checklist

- Pre-flight checks ran (look for boot-check section in STATUS.md).
- `BLOCKERS.md` format correct (if any blockers occurred).
- No `git add -A` in any commit (check `git log -p`).
- Commit prefixes `T-NN:` present and consistent; messages descriptive.
- Self-check output at end of invocation (`Self-check before exit:`) — did the driver actually run it?

### 3. Code quality (1–5)

- `package.json` dependencies match `BUILD_BRIEF.md §2` (or T-03's spec).
- `tsconfig.json` is strict (`strict: true`, `noUncheckedIndexedAccess`, etc.).
- `.eslintrc.cjs` matches `starter/.eslintrc.cjs` invariants.
- `tsc --noEmit` passes.
- `npm install && npm run build` works on the branch.
- `npm test` passes the sample test from T-05.

### 4. Hygiene (1–5)

- Zero force-push attempts (moot but should never appear in any history).
- Zero commits on `main` (verify with `git log main` shows it unchanged).
- Zero files modified outside the declared `Outputs:` of each task.
- Pre-commit hook never bypassed (`git log --format='%B'` should show no `--no-verify` traces).

### 5. Speed & quota (informational)

- Wall-clock time across all 5 tasks (compare timestamps of first and last commit per branch).
- Rough token / message count if your app exposes it.

### Qualitative notes (the narrative layer per decision Q10)

- Did anything surprise you?
- Any drift from the spec that mattered?
- Commit-message prose quality — readable vs robotic?
- STATUS.md prose quality — helpful vs minimum-viable?
- Would you trust this driver overnight on the remaining ~115 tasks?

---

## Comparison commands

Run these from the primary worktree (`~/Documents/jayson-editor/`) after all v2 drivers finish.

```bash
# Step 0 — the gate: binary checklist
bash scripts/verify-bakeoff-v2.sh --all
# If non-zero, fix the spec or regenerate the failing branch(es) before
# proceeding to qualitative review.

# All bake-off branches at a glance (v1 + v2)
git branch --list 'bakeoff/*' -v

# v2 commit messages per branch (expect exactly 5 each, no claims)
V2_BRANCHES="bakeoff/claude-v2 bakeoff/cursor-v2 bakeoff/gpt5-v2"
for b in $V2_BRANCHES; do
  echo "═══ $b ═══"
  git log --oneline "$b" ^main
  echo ""
done

# v1 vs v2 commit-count comparison per driver
for d in claude cursor gpt5; do
  v1=$(git log --oneline "bakeoff/$d" ^main 2>/dev/null | wc -l | tr -d ' ')
  v2=$(git log --oneline "bakeoff/$d-v2" ^main 2>/dev/null | wc -l | tr -d ' ')
  printf "  %-10s  v1=%2s commits  v2=%2s commits  (expected v2=5)\n" "$d" "$v1" "$v2"
done

# File-level diff of each v2 branch vs main
for b in $V2_BRANCHES; do
  echo "═══ $b vs main ═══"
  git diff main.."$b" --stat
  echo ""
done

# What model + effort each driver self-reported in STATUS.md
for b in $V2_BRANCHES; do
  echo "═══ $b STATUS.md tier ═══"
  git show "$b:STATUS.md" 2>/dev/null | grep -E "Running on|Driver branch|tier-mismatch|State" || echo "  (no STATUS.md on $b)"
  echo ""
done

# Any blockers per branch?
for b in $V2_BRANCHES; do
  echo "═══ $b BLOCKERS.md ═══"
  git show "$b:BLOCKERS.md" 2>/dev/null | head -40 || echo "  (no BLOCKERS.md on $b)"
  echo ""
done

# Sanity: does each branch's package.json install + build cleanly?
# Warning: slow (npm install runs 3× and is destructive of node_modules).
# Skip if you've already eyeballed the results.
for b in $V2_BRANCHES; do
  echo "═══ $b build sanity ═══"
  git checkout "$b"
  rm -rf node_modules
  npm install --silent 2>&1 | tail -5
  npm run build 2>&1 | tail -5
done
git checkout main

# Commit hygiene — flag any commit touching > 20 files (scope creep)
for b in $V2_BRANCHES; do
  echo "═══ $b commit hygiene ═══"
  git log --stat "$b" ^main | grep -E "^ [0-9]+ files? changed" | awk '{if ($1 > 20) print "  LARGE COMMIT:", $0}'
done
```

---

## Picking a winner and cleanup (post-v2)

Per decision Q11: v2's winner is the canonical M0 implementation. We cherry-pick the v2 winner's 5 commits onto main and delete ALL bake-off artifacts (v1 frozen baseline + v2 fresh run) once main is updated.

Suppose `bakeoff/claude-v2` won:

```bash
# All commands run from the main worktree
cd ~/Documents/jayson-editor
git checkout main

# 1. Remove ALL worktrees first (v1 + v2)
git worktree remove ~/Documents/jayson-editor-claude        2>/dev/null || true
git worktree remove ~/Documents/jayson-editor-cursor        2>/dev/null || true
git worktree remove ~/Documents/jayson-editor-gpt5          2>/dev/null || true
git worktree remove ~/Documents/jayson-editor-claude-v2
git worktree remove ~/Documents/jayson-editor-cursor-v2
git worktree remove ~/Documents/jayson-editor-gpt5-v2

# 2. Cherry-pick the v2 winner's commits onto main
git cherry-pick bakeoff-start-v2..bakeoff/claude-v2
# This applies 5 commits (T-01 through T-05) on top of main.
git push origin main

# 3. Delete all bake-off branches (v1 + v2)
git branch -D bakeoff/claude bakeoff/cursor bakeoff/gpt5         2>/dev/null || true
git branch -D bakeoff/claude-v2 bakeoff/cursor-v2 bakeoff/gpt5-v2

# 4. Delete both recovery tags
git tag -d bakeoff-start        2>/dev/null || true
git tag -d bakeoff-start-v2

# 5. Decide whether to retire the bake-off variant spec
# Per Q7: kill next-task-bakeoff.md once v2 validates; methodology lives in
# this file's "Patches recipe for future bake-offs" section below.
git rm .claude/commands/next-task-bakeoff.md
git commit -m "Retire next-task-bakeoff.md after v2 validation; methodology in BAKEOFF.md"
git push origin main

# 6. Keep BAKEOFF.md, scripts/bakeoff-setup.sh, scripts/verify-bakeoff-v2.sh
# These ARE the future-bake-off infrastructure. Don't delete them.
```

**Important: worktrees first, branches second.** Git refuses to delete a branch that has a worktree on it. If you forget step 1, you'll get `error: Cannot delete branch 'bakeoff/claude-v2' checked out at ~/Documents/jayson-editor-claude-v2` — run `git worktree remove` and retry.

---

## Sanity check before launching all 3 drivers

To avoid burning 3× the quota on a misconfigured slash command, run **Driver 1** to its first commit only, then inspect:

```bash
cd ~/Documents/jayson-editor-claude-v2     # worktree, already on bakeoff/claude-v2
# In Claude Code (Sonnet 4.6 + high), invoke /next-task-bakeoff ONCE.
# Wait for it to finish T-01 and stop.

# Then verify (from the main worktree):
cd ~/Documents/jayson-editor
git log --oneline bakeoff/claude-v2 ^main     # Should show 1 commit: T-01: ...
git log main                                   # Should be unchanged
git show bakeoff/claude-v2:STATUS.md | head -10   # Should have "Running on: Claude Sonnet 4.6 at high"
git show bakeoff/claude-v2:STATUS.md | grep "Driver branch"   # Should match bakeoff/claude-v2
git show bakeoff/claude-v2 --stat              # Should touch task Outputs + STATUS.md + TASKS.md + allow-list only
```

If all five checks pass, launch Drivers 2 and 3. If any check fails, debug `.claude/commands/next-task-bakeoff.md` before committing more quota.

---

## What "good" looks like (anchor)

A clean v2 bake-off run on Claude Sonnet 4.6 high should produce:

```
bakeoff/claude-v2
├── T-01: initialize repo + vite app           (1 commit; bundles STATUS.md, TASKS.md marker, package-lock.json)
├── T-02: set up tauri 2.x desktop shell       (1 commit; bundles STATUS.md, TASKS.md, Cargo.lock, src-tauri/icons/*)
├── T-03: pin exact dependency versions        (1 commit)
├── T-04: set up eslint + prettier + editorconfig  (1 commit)
└── T-05: set up vitest with passing sample test    (1 commit)
```

**5 commits total** (one per task — no claim commits per v2 spec). STATUS.md state = `BAKEOFF_COMPLETE`. No `BLOCKERS.md` entries. No regressions.

Every commit:
- Stages `STATUS.md` (verified by hook).
- Stages `docs/TASKS.md` with exactly one marker transition (`[ ]→[x]`).
- Stages only files in the task's `Outputs:` ∪ static allow-list.
- Passes `scripts/verify-task-commit.sh` (the pre-commit hook).

Drivers that produce different commit counts, leave loop-managed files unstaged, or commit forbidden paths are doing something the protocol disallows. `scripts/verify-bakeoff-v2.sh` will catch it.

---

## Patches recipe for future bake-offs

Per decision Q7: after v2 validates the spec, `.claude/commands/next-task-bakeoff.md` is retired. Future bake-offs (v3, v4, …) start by forking the then-current `.claude/commands/next-task.md` and applying these patches to convert it to a local-only bake-off variant.

This recipe documents the diff so the next bake-off operator can recreate the variant in ~5 minutes without re-deriving it.

### Patches to apply to a copy of `.claude/commands/next-task.md`

1. **Header front-matter:** change `description:` to "Bake-off variant — implement T-01..T-05 on a local-only bakeoff/* branch; no push, no fetch, no CI-poll".

2. **Add bake-off invariants box** near the top:
   > - **Local-only.** Never `git push`, `git fetch`, or `git pull`.
   > - **Restricted task range.** Only T-01..T-05. Stop on `BAKEOFF_COMPLETE`.
   > - **Branch guard.** Refuse to run on `main`. Branch MUST start with `bakeoff/`.
   > - **No CI-poll.**

3. **Pre-flight check #1:** change "Current branch is `main`" → "Current branch starts with `bakeoff/`".

4. **Pre-flight check #3:** delete the `git fetch` + `HEAD == origin/main` assertion. Replace with: "The bake-off start tag exists. For `bakeoff/<driver>-vN`: tag `bakeoff-start-vN`. If missing, halt with 'run scripts/bakeoff-setup.sh --version vN first.'"

5. **Pre-flight check #8 (CI-poll):** delete entirely. Bake-off is offline.

6. **Pre-flight #7 stale `[~]` recovery:** change "Commit + push" → "Commit (local only — NO push)".

7. **Step 1 PICK:** add "Only T-01 through T-05 are in scope — refuse to pick anything else." Add bake-off-stop check: "if T-05 is already `[x]`: stop with `BAKEOFF_COMPLETE`."

8. **All `git push` in failure paths (steps 3, 5, 6.5):** delete. Bake-off never pushes.

9. **Step 6 commit message footer:** add `Bake-off branch: <current branch>` above the `Co-Authored-By:` line.

10. **Step 6.5 (milestone gate):** replace with "SKIPPED in bake-off. Post-bake-off validation runs `scripts/verify-bakeoff-v2.sh` instead."

11. **Step 7 NEXT:** add T-05 stop: "If T-05 was just marked `[x]`: stop with `BAKEOFF_COMPLETE`."

12. **Step 8 self-check:** add two extra checklist items:
    > ☐ STATUS.md "Driver branch:" line matches `git rev-parse --abbrev-ref HEAD`?
    > ☐ Zero `git push` attempts in this invocation?

13. **Stop conditions:** remove `ALL DONE`, `PUSH-CONFLICT`, `MILESTONE-GATE-FAILED`, `CI-FAILED`. Add `BAKEOFF_COMPLETE`.

14. **STATUS.md template:** add `**Driver branch:**` line. Add `## Bake-off scope (T-01..T-05)` section listing each task's marker.

15. **Hard rules:** add at top: "Never `git push`. Never `git fetch` / `git pull`. Never run on `main`. Never touch tasks outside T-01..T-05."

### How to apply

```bash
# In a fresh checkout, after spec fixes have landed on main:
cp .claude/commands/next-task.md .claude/commands/next-task-bakeoff.md
# Apply patches 1-15 above by hand. Takes ~15 minutes.

# Then run the v3 setup:
bash scripts/bakeoff-setup.sh --version v3

# Update this BAKEOFF.md's branch names from "-v2" to "-v3" via find-replace,
# and add a new row to the "Lessons from v1" table summarizing what v3 fixes.
# Run the bake-off; gate with: bash scripts/verify-bakeoff-v2.sh --all
# (the script's checklist is generation-agnostic; rename if you add v3-specific
# assertions).

# After v3 validates and you cherry-pick a winner, delete next-task-bakeoff.md again.
```

The recipe is intentionally short. The discipline is: **never let two parallel specs live in the repo for more than one bake-off cycle.** Drift is inevitable when both files are maintained; the post-v2 deletion forces convergence.
