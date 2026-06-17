# T-215: Align AGENTS.md to agentic-workflow baseline AW-0011 (by reference)

<!-- Provenance: agentic-workflow baseline sync — adopt AW-0010/0011/0004 ref.3 conventions without copying baseline ADR files. -->

## Objective

Bring this repo's `AGENTS.md` up to the current agentic-workflow baseline (AW-0011)
**by reference**: cite `AW-NNNN` for baseline conventions, stamp
`agentic-workflow-baseline: 0011`, and index this repo's own ADRs 0001–0023. Do not
copy baseline ADR files into `docs/adr/` or renumber this repo's domain ADRs.

## Acceptance criteria  (must be machine-checkable)
- [x] `AGENTS.md` carries `agentic-workflow-baseline: 0011` and the AW-0007 by-reference note → `AGENTS.md` lines 3–5
- [x] AW-0011 minimalism lens: decision-hierarchy ladder + minimalism floor + `SHORTCUT(…)` marker convention in Working style; advisory minimalism dimension in Review playbook → `AGENTS.md`
- [x] AW-0004 refinement 3: `mode` is a floor; protected/destructive surface forces ≥ `medium` regardless of declared mode → `AGENTS.md` effort/review dial
- [x] AW-0010 remediation loop: remediator = tier implementer; targeted re-verify (uncapped) vs full re-review on excess findings; cap 3 review rounds → `needs-human` → `AGENTS.md`
- [x] `docs/adr/README.md` indexes ADRs 0001–0023 and records the `AW-NNNN` reference convention → `docs/adr/README.md`
- [x] No baseline ADR file copied into `docs/adr/` (only README added; no new `00NN-*.md` baseline files)
- [x] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `AGENTS.md`
- `docs/adr/README.md` (new)
- `tasks/T-215-agentic-workflow-baseline-alignment.md` (this file)

## Out of scope
- Copying or renumbering agentic-workflow baseline ADRs into `docs/adr/`
- Migrating npm → pnpm
- Changes to `tests/frozen-acceptance.json` or application code

## Risks / do-not-touch
- Preserve this repo's domain ADRs 0001–0023 unchanged
- Do not weaken existing hard guardrails or review-playbook conventions

## Meta
- mode: medium           # docs/conventions alignment — independent dual review warranted
- risk: low
- depends-on: []         # independent of implementation tasks
- blocked-by: none
- parallel-safe: yes      # disjoint file set (AGENTS.md + docs/adr/README.md + task file)
- frozen-tests: none
- size budget: < 300 changed lines
