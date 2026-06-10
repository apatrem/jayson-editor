# T-203: Deterministic markdown → ProseMirror converter (structuring prose path)

<!-- /agentic-workflow:plan output (2026-06-09). Coarse re-plan: carries T-195 from docs/TASKS.md (kept distinct — its output is one self-contained module). -->

## Objective
Deterministically convert generation-pipeline markdown **prose segments** into
DocModel-canonical ProseMirror fragments (GENERATION_PIPELINE §4). Scope per
§4's job table: heading/list/table → **block** mapping is structuring's
separate deterministic job, NOT this converter — this module handles the
"Prose → ProseMirror fragment" row only. Output uses DocModel-canonical mark
names (`strong`/`em` — see `src/editor/normalize-prose-marks.ts`); editor-side
names (`bold`/`italic`) exist only past the editor boundary. Out-of-schema
constructs are dropped with logged coercion warnings; the converter never emits
a fragment the editor can't render after normalization and never throws on
hostile input.

## Acceptance criteria  (must be machine-checkable)
- [ ] `src/generation/markdown-to-prosemirror.ts` exports `markdownToProseMirror(markdown)` returning `{ body, warnings }` with `body` a doc-rooted fragment of paragraphs → `tests/generation/markdown-to-prosemirror.test.ts`
- [ ] Inline constructs map to **canonical** marks: `**bold**` → `strong`, `*italic*` → `em`, backticks → `code`; editor-side `bold`/`italic` never leak into the fragment → same file
- [ ] Fragment normalizes cleanly through `normalizeProseMarksForEditor` into `ALLOWED_EDITOR_MARK_NAMES` → same file
- [ ] Out-of-schema constructs (e.g. raw HTML elements outside the allowed set) are dropped with a coercion warning — never thrown, never emitted → same file
- [ ] Deterministic: identical input ⇒ identical output → same file
- [ ] gate green: `npm run lint && npm test && npm run build`

## Files likely involved
- `src/generation/markdown-to-prosemirror.ts` (new)
- `src/editor/Editor.tsx` (read-only: allowed node/mark name exports)

## Out of scope
- Heading/list/table → block mapping — structuring's separate deterministic job (GENERATION_PIPELINE §4 job table)
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
