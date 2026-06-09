# T-203: Deterministic markdown → ProseMirror converter (structuring prose path)

<!-- /agentic-workflow:plan output (2026-06-09). Coarse re-plan: carries T-195 from docs/TASKS.md (kept distinct — its output is one self-contained module). -->

## Objective
Deterministically convert generation-pipeline markdown prose into
editor-renderable ProseMirror fragments (GENERATION_PIPELINE §4): supported
constructs map to closed-schema nodes/marks, out-of-schema constructs are
dropped with logged coercion warnings, and the converter never emits a fragment
outside the closed editor schema and never throws on hostile input.

## Acceptance criteria  (must be machine-checkable)
- [ ] `src/generation/markdown-to-prosemirror.ts` exports `markdownToProseMirror(markdown)` returning `{ content, warnings }` → `tests/generation/markdown-to-prosemirror.test.ts`
- [ ] Headings, paragraphs, bold/italic, bullet + ordered lists map to nodes/marks within `ALLOWED_EDITOR_NODE_NAMES` / `ALLOWED_EDITOR_MARK_NAMES` → same file
- [ ] Out-of-schema constructs (e.g. raw HTML elements outside the allowed set) are dropped with a coercion warning — never thrown, never emitted → same file
- [ ] Deterministic: identical input ⇒ identical output → same file
- [ ] gate green: `npm run lint && npm test && npm run build`

## Files likely involved
- `src/generation/markdown-to-prosemirror.ts` (new)
- `src/editor/Editor.tsx` (read-only: allowed node/mark name exports)

## Out of scope
- Placeholder grammar parse (T-191, in flight) and import lint (T-194, in flight)
- Prose generation itself — skill-side, ADR-0021
- Link/image handling policy is the implementer's design call (the editor mark
  set has no `link` mark today) — whatever the choice, the closed-schema and
  warning contracts above still hold

## Risks / do-not-touch
- The closed editor schema is the authority — the converter adapts to it, never
  extends it (closed block library guardrail, AGENTS.md)
- The frozen test listed in Meta — never edited to make a gate pass

## Meta
- risk: low
- mode: solo
- depends-on: T-191
- parallel-safe: yes          # new module; only reads editor exports
- frozen-tests: `tests/generation/markdown-to-prosemirror.test.ts`
- size budget: < 300 changed lines
