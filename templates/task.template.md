# T-000: <title>

<!-- Output of a /grill-me session. One unit of work, small enough to review. -->

## Objective
<what + why, one short paragraph — no implementation prescription>

## Acceptance criteria  (must be machine-checkable)
- [ ] <criterion> → covered by `tests/<file>`
- [ ] gate green: `npm run lint && npm test && npm run build`

## Files likely involved
- <path>

## Out of scope
- <explicit non-goals>

## Risks / do-not-touch
- <protected contract this task must not change>

## Meta
- mode: solo            # solo (default) | competitive (only for hard / ambiguous / risky)
- size budget: < 300 changed lines (split or stack if larger)
