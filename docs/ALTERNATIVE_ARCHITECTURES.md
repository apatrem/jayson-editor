# Alternative architectures — HTML-canonical options vs. the typed DocModel

**Date:** 2026-06-19
**Status:** Informational options analysis. **No decision is made here.** The typed
DocModel ([DOCUMENT_SYSTEM_ARCHITECTURE.md](DOCUMENT_SYSTEM_ARCHITECTURE.md),
ADR-0022) remains the committed baseline. This note records two HTML-canonical
alternatives that the BuilderIO `agent-native` study
([PRIOR_ART_AGENT_NATIVE_SLIDES.md](PRIOR_ART_AGENT_NATIVE_SLIDES.md)) raised,
so a future fork/redesign decision starts from an honest written comparison
rather than from scratch.

> **These are viable alternatives, not strawmen.** Variant B in particular is a
> defensible architecture for this product. The deciding axis is **comment-to-AI**
> (the stated core workflow, D-03 / memo §7), and secondarily re-theming and
> brand-consistency guarantees. Read this alongside the prior-art note's source
> table (citations `S1`–`S9`, pinned to agent-native `bb38b6f`).

---

## The three architectures

### Variant A — Pure HTML-blob (agent-native style)

The rendered, styled HTML string **is** the canonical artifact. No schema, no
typed model. Editing mutates the HTML directly; comments are markers in (or
text-snapshots against) that HTML.

```
 LLM (skills) ─► markdown ─► LLM applies brand ─► styled HTML string ═══► CANONICAL
                                                        │  (stored as opaque text)
                                  user ──► in-place contentEditable
                                                        │
                                        comment anchors = marker spans in HTML
                                          (or quotedText snapshot) — fragile
                                                        │
                                                  PDF = print the HTML
```

### Variant B — Thin-spine hybrid (the recommended middle, if forking)

Still HTML-canonical and still in-place editing — but the markdown→HTML step is
**deterministic** (templates + brand CSS, not LLM-styled), and every block-level
chunk carries a **stable `data-block-id`**. Comments live in a side-table keyed
by that id. This is the *minimum* structure that rescues comment-to-AI and
re-theming without a full typed schema.

```
 LLM (skills) ─► markdown ─► DETERMINISTIC renderer (+ brand CSS) ─► HTML w/ stable
                                          │                          data-block-id  ═══► CANONICAL
                                          │                               │
                                          │                     side-table: comments
                                          │                     { blockId, quotedText, … }
                                  user ──► in-place contentEditable        │
                                          │                               │
                                  block move/add = HTML rewrite           │
                                          │                               ▼
                                  PDF = print the HTML        comment-to-AI scoped by blockId
```

### Variant C — Typed DocModel (current committed baseline)

The schema-validated JSON DocModel is canonical; HTML is a render output. TipTap
maps to typed block nodes losslessly; comments anchor to first-class block IDs.

```
 LLM (skills) ─► markdown ─► structuring ─► typed DocModel (JSON, Zod-validated) ═══► CANONICAL
                                                  │   ▲
                                TipTap node per   │   │ lossless mapping (both ways)
                                block type        ▼   │
                                  user ──► WYSIWYG editor (typed block ops, grid placement)
                                                  │
                              comments anchored to stable blockId (first-class, survive export)
                                                  │
                            per-block renderers ─► HTML ─► PDF (Playwright, one engine)
```

---

## The minimal spine for comment anchoring (Variant B)

The goal: anchors that survive **save/reload, in-place edits, and agent
regeneration** — without paying for a full typed schema. The smallest thing that
works:

1. **Stable block IDs in the HTML.** The deterministic markdown→HTML renderer
   wraps each block-level chunk in a container carrying `data-block-id="<uuid>"`.
   Block content stays HTML (no per-block typed schema) — the id is the *only*
   structure added.
2. **ID stability across regeneration.** When the agent regenerates or rewrites a
   section, the renderer **re-emits the same `data-block-id` for unchanged
   blocks** (diff by position/content) and mints new ids only for genuinely new
   blocks. This is the property that makes anchors survive an agent edit — the
   single hardest part, and the reason the id must come from the renderer, not be
   sprinkled in by the editor.
3. **Comments in a side-table, not inline.** A comment record lives outside the
   HTML (mirrors memo §7):

   ```
   Comment {
     id, blockId,                         // primary anchor — survives serialization
     quotedText,                          // snapshot of the highlighted text
     offset?: { from, to },               // best-effort sub-block range
     status, thread[], createdAt, updatedAt
   }
   ```

   Keeping comments out of the HTML means editing the slide never corrupts a
   marker, and the canonical artifact stays clean.
4. **Resolution order on load / after edit:** (a) exact `blockId` → (b)
   `quotedText` within that block → (c) `quotedText` document-wide → (d) **orphan**
   — flag for the user instead of silently mis-anchoring.
5. **AI scope = the block subtree.** A comment's AI edit is scoped to its
   `data-block-id` subtree: send that block's HTML + the instruction, receive new
   HTML for *that block*, splice it back by id. Cleaner than the pure-blob "guess
   a subtree" because the boundary is explicit.

**What this spine buys vs. the pure blob:** block-level anchoring is robust
(survives edits and regeneration); scoping is explicit; the artifact stays clean.
**What it still cannot do (vs. typed DocModel):** sub-block (phrase-level) ranges
remain offset-based and can drift on edit — precision is *block-robust,
sub-block best-effort*. For batch markup of a whole draft this is good enough for
block-level comments and slightly flaky for surgical phrase-level edits — better
than Variant A, not as solid as Variant C's ProseMirror marks.

**Cost:** roughly the stable-ID + side-table layer only — on the order of ~30% of
the typed-model's comment/editor machinery, and it skips the DocModel⇄editor
losslessness mapping and per-block Zod entirely.

---

## In-place `contentEditable`: how it works and its limits (Variants A & B)

Editing mutates the **rendered DOM** directly, then re-serializes it (this is the
live agent-native path — prior-art note `S8`):

- **Text edits — low loss.** Double-click a block → `contentEditable="true"` on
  the real styled element → edit in place → save the whole region's `innerHTML`
  (layout, inline styles, fonts, images intact). For the common case (fix copy),
  the design survives essentially untouched.

**Limits — these are inherent to editing an HTML string, not bugs:**

- **Moving or reordering a block means rewriting HTML, not a structured op.**
  There is no "move block N to position M" operation, because there is no block
  array — there is a DOM/string. Reordering = detach the subtree, reinsert it
  elsewhere, re-serialize the whole slide/section HTML. This is fragile wherever
  layout is positional: two-column flex rows, grid placement, sibling spacing,
  and any inline styles that assumed a position can break. (Contrast Variant C,
  where reorder is an array swap and the renderer redraws correctly.)
- **Adding a block is an HTML splice.** Inserting a palette/agent block means
  splicing an HTML chunk into the blob at a position; it must match the
  surrounding wrapper/structure conventions or it renders off. Again: no typed
  insert, just string surgery.
- **Paste injects stray markup.** Raw `contentEditable` lets pasted spans/inline
  styles in; no schema *rejects* them. Localized to the edited block, but it
  persists.
- **Slow drift.** Repeated edits accrete markup cruft over time — the classic
  reason raw HTML editing ages badly (slower than full-document contenteditable
  because edits are scoped to one block).
- **No grid guarantee.** Free-form placement unless grid constraints are enforced
  by hand in CSS; nothing structurally prevents off-template layout.

Net: in-place editing is great for **text**, workable-but-manual for **block
structure**, and unenforced for **brand**. The block-move-rewrites-HTML
limitation is the one most likely to bite a slide product, where layout changes
are routine.

---

## Pros & cons vs. the current architecture

| Dimension | A — Pure HTML-blob | B — Thin-spine hybrid | C — Typed DocModel (current) |
|---|---|---|---|
| **Build cost** | lowest | low–moderate | highest |
| **Canonical artifact** | styled HTML string | HTML + stable block IDs | typed JSON DocModel |
| **Text edit fidelity** | high (in-place) | high (in-place) | high |
| **Block move / reorder** | HTML rewrite (fragile) | HTML rewrite (fragile) | array op + redraw (clean) |
| **Block add from library / grid** | string splice; no grid guarantee | string splice; no grid guarantee | typed insert; grid-enforced |
| **Comment-to-AI robustness** | weak (markers/snapshot, agent regen breaks them) | **good at block level**, best-effort sub-block | **strong** (ProseMirror marks, survive export) |
| **Brand consistency** | not guaranteed (LLM-styled) | consistent if renderer is deterministic; not *rejected* | **guaranteed** (schema + token renderers) |
| **Re-theming existing docs** | no (baked literals) | yes, if deterministic-render path | yes (swap tokens, re-render) |
| **Output / PDF** | simple (print HTML) | simple (print HTML) | render then print (Playwright) |
| **Validation / reject off-brand** | none | none (IDs only) | schema-validated |
| **Longevity / maintainability** | drifts; hand-rolled anchors | moderate | durable; portable, queryable file |
| **Deployment fit (Tauri local)** | needs rework if forking their SaaS stack | fits | fits (current) |

---

## The deciding axis

The cheap wins of the HTML-canonical models (fast build, low-loss text editing,
simple PDF) are mostly **orthogonal** to the one real risk: **comment-to-AI
anchoring**. You can keep the speed *without* taking the anchoring problem by
adding the thin spine (Variant B). So the honest decision reduces to:

- If comment-to-AI can be **block-level and occasionally-flaky** → Variant B is a
  legitimate, much-cheaper alternative to the current design, and worth a serious
  look before committing further to C.
- If comment-to-AI must be **precise, surgical, batch-grade** (as D-03 states) →
  the typed model's marks earn their cost, and C remains the right call.
- Variant A (pure blob) is only defensible if comment-to-AI is demoted to
  lightweight annotation, and if re-theming and brand-guarantee are non-goals.

**Cross-references:** [PRIOR_ART_AGENT_NATIVE_SLIDES.md](PRIOR_ART_AGENT_NATIVE_SLIDES.md)
(evidence + `S1`–`S9`), [DOCUMENT_SYSTEM_ARCHITECTURE.md](DOCUMENT_SYSTEM_ARCHITECTURE.md)
(§2, §7, R5/R13), [ADR-0022](adr/0022-json-docmodel-supersedes-yaml.md),
[T-216](../tasks/T-216-evaluate-css-variable-theming.md) (the related CSS-var
theming question).
