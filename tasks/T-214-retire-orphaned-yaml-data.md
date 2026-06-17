# T-214: Retire orphaned document YAML (templates + examples) after the JSON cut

<!-- Output of Phase 2 (/agentic-workflow:plan). Drafted 2026-06-12 from the T-202 (#15) adversarial-review nit #2; awaits human approval before spawn. One unit of work, sized to a reviewable PR. -->

## Objective
After T-202 lands the ADR-0022 hard cut, the YAML copies of document data are
dead weight: `templates/*.yaml` have no remaining `src/` or test consumer, and
the `examples/sample-*.yaml` fixtures are still read only by test harnesses that
should now load the canonical `examples/sample-*.json` (created in T-201). Remove
the genuinely-orphaned YAML and migrate the lingering test consumers onto the
JSON fixtures, so the repo ships one canonical document format and no future
author is misled by stale `.yaml` data. This is data/fixture cleanup only — it
introduces no runtime behaviour and must not reopen any YAML document-IO path.

## Acceptance criteria  (must be machine-checkable)
- [ ] All four `templates/{commercial-proposal,commercial-proposal-deck,standard-report,standard-report-deck}.yaml` are deleted; a guard test asserts zero `src/`+`tests/` references to `templates/<name>.yaml` remain → `tests/docs/no-orphan-document-yaml.test.ts` (new)
- [ ] The test consumers of `examples/sample-proposal.yaml` / `examples/sample-deck.yaml` (the 9 files found at plan time: `render-parity`, `brand-consistency`, `deck-reuse`, `llm-generate-doc`, `ui/views/DocumentView-section-mapping`, `renderer/document-renderer`, `schema/validate`, `export/pdf-header-footer`, `docmodel/patch`) load `examples/sample-*.json` via `parseDocModelJson` instead; each test's **assertions are unchanged in strength** (only the fixture path/parse swaps) → the full suite stays green
- [ ] Both `examples/sample-proposal.yaml` and `examples/sample-deck.yaml` are deleted; the guard test asserts zero remaining references → same new file
- [ ] `examples/invalid/*.yaml` (3 files): deleted **iff** a repo-wide grep (and any directory-glob loader) confirms zero consumers; otherwise retained, with the live consumer named in the PR body → guard test covers the deleted ones
- [ ] Stale `.yaml` path references in `src/dev/browser-ipc-stub.ts` (the `/templates/**/*.yaml` glob + the `?doc=…yaml` help string) and in doc prose that points at the deleted files (`docs/UI_APP_SHELL.md`, `docs/grilling-editor-v2.md`) are updated to `.json` or removed; **allowlisted historical YAML references are untouched** (`docs/YAML_FORMAT.md`, `docs/archive/**`) → `tests/docs/json-canonical-sweep.test.ts` stays green
- [ ] No production code reintroduces `parseDocModelYaml` or YAML document IO (ADR-0022 hard cut preserved) → existing `app-on-json-wiring` ban assertion stays green
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- Delete: `templates/*.yaml` (4), `examples/sample-proposal.yaml`, `examples/sample-deck.yaml`, conditionally `examples/invalid/*.yaml` (3)
- Migrate fixture loading in the 9 test files listed above (and any harness re-export, e.g. `tests/integration/m7-spike-harness.ts` / `m8-harness.ts` if still YAML-pathed after T-202)
- `src/dev/browser-ipc-stub.ts` (dev-only glob + help string)
- `docs/UI_APP_SHELL.md`, `docs/grilling-editor-v2.md` (prose path references)
- New: `tests/docs/no-orphan-document-yaml.test.ts` (guard)

## Out of scope
- Non-document YAML stays YAML (ADR-0022): `brand.example.yaml`, `blocks.catalogue.yaml`, `starter/**`, authored-block manifests, config files — do not touch.
- Any behavioural change to the migrated tests beyond swapping the fixture format.
- Re-deriving fixture content — the `examples/sample-*.json` from T-201 are the source of truth; do not regenerate them.

## Risks / do-not-touch
- **Gameable test edits (AGENTS.md guardrail).** Migrating 9 test files is the
  risk surface: the only legitimate change per file is the fixture path/parse
  swap. The adversarial reviewer must diff every migrated test and confirm no
  assertion was weakened or dropped — a passing gate on a gutted test is the exact
  failure mode this task invites.
- `docs/YAML_FORMAT.md` and `docs/archive/**` deliberately retain YAML references
  as historical context (allowlisted in `json-canonical-sweep`); editing them to
  "clean up" would corrupt the historical record.
- The ADR-0022 hard cut must hold — this task removes YAML *data*, never adds back
  a YAML *parser/loader* for documents.

## Meta
- mode: low             # mechanical fixture-format migration, fully guarded by existing assertions + the gate; one adversarial reviewer checking assertion-strength parity is proportionate. Escalate to medium if the migration balloons.
- risk: low             # every criterion is a runnable test / grep assertion
- depends-on: [T-202]   # the orphaning only holds once #15 merges (production then imports *.json, not *.yaml)
- blocked-by: none
- parallel-safe: no     # broad test-fixture surface; must follow T-202's merge and may touch harness files other tasks also edit
- frozen-tests: none
- size budget: < 300 changed lines (the deletions + 9 small fixture-path swaps)
