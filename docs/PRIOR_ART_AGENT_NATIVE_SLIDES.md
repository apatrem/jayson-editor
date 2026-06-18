# Prior Art — BuilderIO `agent-native` Slides template

**Date:** 2026-06-18
**Status:** Analysis note (informational). The *rejection* affirms existing
architecture; the *adopt* section flags one **open candidate** (CSS-variable
theming) that would **change** the committed renderer pattern — see "Leave open".
No binding decision is made here.
**Companion to:** [DOCUMENT_SYSTEM_ARCHITECTURE.md](DOCUMENT_SYSTEM_ARCHITECTURE.md) (memo §2, R6, R13),
[adr/0004-three-tier-block-library-with-authored-blocks.md](adr/0004-three-tier-block-library-with-authored-blocks.md),
[adr/0022-json-docmodel-supersedes-yaml.md](adr/0022-json-docmodel-supersedes-yaml.md)

---

## Why this note exists

BuilderIO's open-source `agent-native` "Slides" template is the closest public
prior art to Jayson Editor: an AI-driven, JSON-backed presentation builder. It
was raised during scoping as a possible model to learn from or adopt. This note
records **what it actually does** (from source), **what we considered borrowing**,
and **what we rejected and why** — so the comparison is not re-litigated later
and so reviewers can verify the claims against pinned sources.

**Bottom line:** the template's core strategy — *anchor design with agent
"skills" (Markdown guidelines) + store slide content as HTML chunks in JSON
fields* — anchors the **generator**, not the **artifact**. It is the design our
memo §2 and requirement R6 were written to reject as a primary consistency
mechanism. Two narrower ideas are worth adopting in their stronger form
(token-source-of-truth, exemplar-driven generation); a third (CSS-variable
theming) is left open as a separate evaluation, not adopted; the HTML-in-JSON
model itself is not adopted.

---

## Sources (pinned for verification)

All upstream citations are pinned to commit
[`bb38b6f`](https://github.com/BuilderIO/agent-native/commit/bb38b6f1213c38fd5724b7c9fcbe1bf436205d1e)
of `BuilderIO/agent-native` (fetched 2026-06-18). Reviewers should re-verify
against this SHA, since `main` moves.

| Ref | Path (under `templates/slides/`) | What it establishes |
|-----|----------------------------------|---------------------|
| S1 | `server/db/schema.ts` | `decks.data` and `design_systems.data` are opaque `text` columns — **no schema validation of content** |
| S2 | `.agents/skills/slide-editing/SKILL.md` | Each slide's `content` is *"a self-contained HTML string that renders at 1920x1080"*; styling rules are prose guidelines |
| S3 | `.agents/skills/create-deck/SKILL.md` | Generation = agent copies **exact HTML templates** with literal inline styles and calls `add-slide` sequentially |
| S4 | `.agents/skills/design-systems/SKILL.md` | Brand tokens stored as JSON; agent is *instructed* to substitute e.g. `#00E5FF -> colors.accent` **at generation time**; the skill *claims* the "Tweaks" panel applies live via CSS custom properties (the renderer only partially backs this — see S4-code) |
| S4-code | `app/components/deck/SlideRenderer.tsx`, `actions/patch-deck.ts` | The renderer injects only **base design-system** tokens as `--ds-*` CSS vars on a wrapper (`SlideRenderer.tsx`); `patch-deck.ts` persists `tweaks`, but no code at this SHA maps `tweaks`/`cssVar` onto CSS variables, and the literal-styled slide templates (S3) do not reference `--ds-*` anyway |
| S5 | `.agents/skills/actions/SKILL.md` | Zod is used on the **action I/O contract** (`defineAction({ schema })` / `outputSchema`) — the agent-tool boundary, **not** slide/brand content |
| S6 | `.agents/skills/frontend-design/SKILL.md` | Design quality guidance is advisory prose (vendored from `anthropics/skills`) |
| S7 | Web overview: <https://www.agent-native.com/docs/template-slides> | Product framing: open-source Slides/Pitch/PowerPoint replacement, Yjs CRDT, PPTX/DOCX import + export, MCP/A2A |

---

## What the template actually does

### Storage: HTML chunks in opaque JSON (S1, S2)

A deck is one JSON blob in `decks.data` (a `text` column). Each slide's
`content` is a **self-contained HTML string** with inline styles, rendered at a
fixed canvas size. There is **no structural/artifact schema for slide content**:
the action layer does run shallow Zod on slide *payloads* (`create-deck.ts`'s
`SlideSchema`, `add-slide.ts`), but `content` is validated only as
`z.string()` — i.e. "it is a string", never against a block/structure schema
— and `layout` is a free enum label. The stored deck blob itself
(`decks.data`) has no schema check (S1). "Layout" (title / section / content /
two-column / table) is a *naming convention for the agent*, not a structural
constraint; nothing prevents arbitrary HTML. This is the precise inverse of our
closed, enforced block library: their "layouts" are informal labels, whereas our
three-tier library
([ADR-0004](adr/0004-three-tier-block-library-with-authored-blocks.md)) makes
each block a typed, schema-gated unit, and Authored blocks pass a lint + runtime
gate before they can exist. They get flexibility; we get a guarantee.

### Anchoring: a 3-layer stack, none of it structurally enforced (S2, S3, S4)

| Layer | Mechanism | Enforcement |
|-------|-----------|-------------|
| 1. Skill guidelines | `frontend-design` / `slide-editing` prose + exact HTML templates to copy (S2, S3, S6) | **Advisory** — the model follows or drifts |
| 2. Design-system tokens | `colors/typography/spacing` JSON; agent told to substitute tokens **while writing** the HTML (S4) | **Advisory at generation time** |
| 3. CSS variables | renderer injects **base** design-system tokens as `--ds-*` wrapper vars (S4-code); `tweaks`/`customCSS` are persisted but not wired back to CSS vars at this SHA | **Partial / mostly inert** — the literal-styled templates (S3) don't consume `--ds-*`, so even base vars rarely re-theme content |

The tell that exposes the ceiling: the templates bake **literal** values
(`#00E5FF`, `Poppins`) into the HTML string (S3). Token substitution must happen
*as the agent writes the slide*. Once written, the brand value is frozen into
the blob; changing the design system afterward does **not** re-theme existing
decks, because the templates emit literal values rather than `var(--ds-*)`
references (S3, S4-code). **Brand lives at generation time, not as a live
reference.**

### The Zod question, resolved (S5)

The Zod in `actions/SKILL.md` validates the **agent action I/O contract** —
input args (`defineAction({ schema: z.object({...}) })`) and optional return
shape (`outputSchema`). That is the RPC/tool trust boundary — the analogue of
our Tauri IPC validation ([TAURI_IPC.md](TAURI_IPC.md)), **not** of our Layer-1
DocModel schema. Where that boundary touches slide content, it validates it only
as an opaque `z.string()` (`create-deck.ts`'s `SlideSchema`, `add-slide.ts`) —
"it is a string", not "it conforms to a block structure" — and the stored deck
blob (`decks.data`) has no schema check at all (S1). So the Zod usage *confirms
the gap* rather than filling it: they validate the shape of the agent's tool
calls, but not the structure of the artifacts those calls produce.

---

## Could "skills + HTML-in-JSON" anchor design styles?

Honest assessment: **probabilistically, not structurally.** It reduces drift at
write time; it does not eliminate non-conforming artifacts.

This is exactly the model our architecture was written against:

- **Memo §2** — the source of truth must be the schema-defined DocModel; editor
  state / HTML / a stale file format are *projections*. HTML-as-content makes the
  HTML blob canonical — the named §2 trap (editor lock-in, lossy round-trips,
  broken comment anchoring, loss of the "renders without the editor, validated"
  insurance policy).
- **R6** — template consistency must be *"enforced structurally — closed block
  library + schema, not by review."* Skill guidance is consistency *by
  instruction*, the opposite.

Concrete failure modes for our use case (30 consultants × 40+ brand-critical
docs/month):

1. **No rejection surface.** Nothing rejects off-brand output. Our
   validate-before-accept gate ([GENERATION_PIPELINE.md](GENERATION_PIPELINE.md),
   D-236) has no analogue — you cannot schema-check an HTML blob against a brand.
   Drift is silent and uncatchable.
2. **Re-theming is lossy.** Brand baked into strings ≠ brand referenced. A
   rebrand cannot propagate to existing decks without regeneration. Token-driven
   renderers re-theme everything for free.
3. **R4 conflict.** WYSIWYG-editing arbitrary HTML is either a code editor
   (consultants see code — forbidden) or a contenteditable that can emit anything
   (off-template — forbidden).
4. **R13 conflict.** Highlight + comment-to-AI needs stable block IDs and
   in-content range marks for *scoped* patches (memo §7). A slide-as-HTML-blob
   only supports coarse, slide-level diffs.

---

## What we reject, adopt, and leave open

### Reject — as the primary consistency mechanism

- HTML-chunks-in-JSON as canonical content (violates memo §2 / R6).
- Skill-prose + literal-styled templates as the design guarantee (advisory only).
- The PPTX/DOCX runtime import/export surface (S7) — violates R15 and Layer 6
  (no PPTX export, no runtime Office I/O).

### Adopt / validate — already consistent with our architecture

1. **Token source-of-truth** — their `design_systems.data` ≈ our brand-token
   file ([brand.example.yaml](../brand.example.yaml)). Same concept; the
   difference that matters is *where it binds*: we consume tokens **in renderers
   (enforced)**, they substitute **via prompt (advisory)**. Ours strictly
   dominates — no change needed, this validates the existing approach.
2. **Skills-as-generation-exemplars** — their SKILL templates are few-shot
   exemplars that cut drift at write time. This **feeds** our generation pipeline
   (outline → write → structure), it does not replace the schema. We already do
   this via the valid fixtures in [examples/](../examples/) (which also carries
   an `examples/invalid/` negative-fixture set for validation tests); the lesson
   is to invest in rich, example-heavy generation guidance *on top of*
   validation.

### Leave open — evaluate separately, NOT adopted here

- **CSS-variable-driven theming.** The `design-systems` skill *documents* that
  its "Tweaks" panel applies brand changes live via CSS custom properties (S4),
  which would make re-theming feel lossless — though the renderer only partially
  backs that claim today (S4-code). Regardless, it **conflicts with our committed
  renderer pattern** and must not be read as adopted. Today, block renderers
  consume brand tokens as **resolved JavaScript values** via `useBrandTokens()` +
  `resolveBrandToken()`, and the binding copy-pattern explicitly forbids inlining
  colors/CSS vars ([BLOCK_IMPLEMENTATION_GUIDE.md](BLOCK_IMPLEMENTATION_GUIDE.md)
  §4; [reference/primitives/README.md](../reference/primitives/README.md) point 2;
  [reference/callout/Callout.tsx](../reference/callout/Callout.tsx)). Switching to
  CSS-custom-property theming would touch `BrandProvider`, every block renderer,
  the PDF SSR render path, and the brand-token schema shape — a non-trivial change
  to a binding pattern, not a free win, and **not** "compatible with the schema"
  as-is. Whether live CSS-var theming beats the current resolved-value approach
  (e.g. for instant re-theme of existing decks) is a genuine design question.
  **Action: file a separate task/ADR to evaluate it against the committed
  renderer architecture before any code changes.** It is recorded here only as a
  prompt for that evaluation.

---

## The framing to remember

> **Their skills anchor the *generator*; our schema anchors the *artifact*.
> Anchoring the generator reduces drift; only anchoring the artifact eliminates
> it.**

For brand-critical consulting output we need the artifact anchored — typed
blocks + Zod + token-driven renderers. We use the exemplar idea to make
generation land closer to valid on the first try, and we treat live CSS-variable
theming as an open design question to evaluate against the committed renderer
pattern (see "Leave open"), not a concluded adoption. The
HTML-in-JSON-with-soft-guidelines model itself trades our structural guarantee
for statistical hope, and is not adopted.
