# T-206: Deterministic markdown → ProseMirror converter (structuring prose path)

<!-- Provenance: archived T-195 (docs/archive/TASKS.md). -->

## Objective
The structuring pass (Pass 2) needs a deterministic converter from the markdown draft's prose to editor-renderable ProseMirror fragments: known markdown constructs map to the editor's allowed node/mark set; out-of-schema constructs are dropped with logged coercion warnings — never emitted as invalid fragments.

## Acceptance criteria  (must be machine-checkable)
- [ ] Known markdown constructs (headings, bold/italic, lists, …) map to editor-renderable fragments → `tests/generation/markdown-to-prosemirror.test.ts`
- [ ] Out-of-schema constructs are dropped with logged warnings; no invalid fragment is ever emitted (fragment validates against the editor schema) → same suite, adversarial fixtures
- [ ] Coercion log is structured (consumable by Moment-1 reporting), not console noise
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src/generation/markdown-to-prosemirror.ts` (new)
- `tests/generation/markdown-to-prosemirror.test.ts` (new)
- Reads: the editor PM schema (closed schema — ADR-0015), `docs/GENERATION_PIPELINE.md` §4

## Out of scope
- Placeholder handling (T-204 — the converter receives prose segments between placeholders)
- LLM-assisted structuring decisions (this converter is the deterministic part)

## Risks / do-not-touch
- The closed editor schema is a security boundary — the converter must target exactly the registered node/mark set, never extend it
- Mark mapping must match the existing prose bridge (`strong`/`em` ↔ `bold`/`italic`, see T-180 in the archive)

## Meta
- mode: low
- risk: low
- depends-on: [T-204]
- parallel-safe: yes     # new files under src/generation once T-204 is merged
- size budget: < 300 changed lines
