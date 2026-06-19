# T-216: Evaluate CSS-variable theming vs. resolved-value brand tokens

<!-- Provenance: surfaced by the cross-lineage review of PR #21
     (docs/PRIOR_ART_AGENT_NATIVE_SLIDES.md → "Leave open"). An evaluation/decision
     task: produce an ADR, not a feature. -->

## Objective

Decide whether the renderer should theme blocks via **CSS custom properties**
(live, re-themeable without re-render — the BuilderIO `agent-native` "Tweaks"
model) or keep the **committed resolved-JavaScript-value** pattern
(`useBrandTokens()` + `resolveBrandToken()`), or adopt a hybrid. The prior-art
note flagged live CSS-var theming as attractive for instant re-theme of existing
documents but **not adopted** because it conflicts with the current binding
copy-pattern. This task resolves that open question with a recorded decision
(an ADR), so no code changes land on a hunch. **Decision-only / spike — no
production theming rewrite in this task.**

## Acceptance criteria  (must be machine-checkable)
- [ ] A new ADR `docs/adr/0024-<slug>.md` exists with a clear **Decision**
  (adopt CSS-var theming · keep resolved-value · hybrid) and a **Consequences**
  section → `docs/adr/0024-*.md`
- [ ] The ADR's Context weighs, at minimum, impact on: `BrandProvider`, every
  block renderer (the `reference/callout` + `reference/chart` 4-file pattern),
  the **PDF SSR render path** (headless-Chromium must have CSS custom properties
  populated at print time — memo Layer 5), the brand-token schema shape
  (`src/schema/brand`), and lossless re-theming of already-saved documents → ADR Context
- [ ] The ADR reconciles with the existing binding pattern: it either supersedes
  or explicitly upholds `docs/BLOCK_IMPLEMENTATION_GUIDE.md` §4 ("consume tokens
  via `useBrandTokens()`/`resolveBrandToken()`", §7 anti-pattern "Storing the
  variant-to-style mapping in CSS — Can't be SSR'd; breaks PDF export") and
  `reference/primitives/README.md` point 2 → ADR + cross-reference
- [ ] `docs/adr/README.md` indexes ADR-0024 → `docs/adr/README.md`
- [ ] The prior-art note's "Leave open" action item is updated to point at
  T-216 / ADR-0024 instead of "a separate task/ADR" →
  `docs/PRIOR_ART_AGENT_NATIVE_SLIDES.md`
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `docs/adr/0024-*.md` (new)
- `docs/adr/README.md`
- `docs/PRIOR_ART_AGENT_NATIVE_SLIDES.md`
- (read-only inputs) `reference/primitives/BrandProvider.tsx`,
  `reference/callout/Callout.tsx`, `reference/chart/Chart.tsx`,
  `docs/BLOCK_IMPLEMENTATION_GUIDE.md`, `src/export/` PDF path

## Out of scope
- Rewriting `BrandProvider`, block renderers, or the brand-token schema (that is
  a *follow-up* task, gated on this ADR's decision).
- Any change to the committed theming behaviour at runtime.
- The `frozen-acceptance` list and application logic.

## Risks / do-not-touch
- Do not change `docs/BLOCK_IMPLEMENTATION_GUIDE.md` §4/§7 behaviour or the
  reference block pattern in this task — only an ADR may *propose* superseding it,
  for human sign-off.
- Governance/decision-record surface (ADR + binding copy-pattern): escalated by
  the AGENTS.md risk floor regardless of declared mode.
- A decision to adopt CSS vars MUST resolve the PDF-SSR concern (§7 anti-pattern)
  before it can be accepted; do not hand-wave it.

## Meta
- mode: medium           # produces an ADR touching a binding renderer pattern → governance, risk-floor ≥ medium
- risk: high             # core acceptance (a sound design decision) is not a runnable test
- depends-on: []         # independent; informed by PR #21's prior-art note
- blocked-by: none       # PR #21 need not merge first, but cite it
- parallel-safe: yes     # disjoint file set (new ADR + README + the prior-art note)
- frozen-tests: none
- size budget: < 300 changed lines
