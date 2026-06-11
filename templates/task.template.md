# T-000: <title>

<!-- Output of Phase 2 (/agentic-workflow:plan). One unit of work, sized to a reviewable PR. -->

## Objective
<what + why, one short paragraph — no implementation prescription>

## Acceptance criteria  (must be machine-checkable)
- [ ] <criterion> → covered by `tests/<file>`
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- <path>

## Out of scope
- <explicit non-goals>

## Risks / do-not-touch
- <protected contract this task must not change>

## Meta
- mode: low             # low (default) | medium | hard — effort/review dial (plugin ADR-0004); prefer low, justify higher
                        #   low    = 1 implementer + gate + 1 adversarial reviewer
                        #   medium = + independent dual review on the PR (/agentic-workflow:review)
                        #   hard   = competitive best-of-N + smart-merge, THEN the medium dual review (hard ⊇ medium)
- risk: low             # low | high — high if acceptance can't be a runnable test (never auto-merge eligible)
- depends-on: []        # task IDs (array) that must be merged first
- blocked-by: none      # non-task prerequisite (a PR, external account/key) that must clear before spawn
- parallel-safe: yes    # yes | no — disjoint file set AND no shared contract with other pending tasks
- frozen-tests: none    # test files frozen red by /plan; immutable without human sign-off (AGENTS.md guardrail)
- size budget: < 300 changed lines (split or stack if larger)
