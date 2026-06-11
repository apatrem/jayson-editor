# Grilling notes — editor v2 (sidebar, sections, drag-drop, numbering, page breaks, spacing)

Working notes for an in-flight `grill-with-docs` session. Captures decisions as
they settle so the conversation can be compacted without losing state. Fold into
ADRs / tasks/ once grilling completes, then delete this file.

## Heading numbering (explanation, asked by user)

`numbered` on the heading block is **stored but unused today** — no renderer or
utility computes/prepends a number ("1", "1.1", "2.1"); it only round-trips and
sets `data-numbered` on the HTML. No cross-block counter exists. (The divider
block's `numbering` is an unrelated free-text label.) Whether to implement
computed numbering is an OPEN question below (item 4).

## Resolved decisions

### Item 2 — Section titles are nav-only  [DECIDED]
- `section.title` is **not rendered** into the document or export. It is an
  organizational label (PowerPoint-style) shown only in the section sidebar.
- Visible on-page headers come from **heading blocks**, never section titles.
- Migration: convert each of the 4 templates' section titles into a heading
  block at the top of the section; keep `section.title` as the nav label.
- Removes the in-doc editable section-title input added in increment 1 (title
  editing moves to the sidebar). Recorded in CONTEXT.md ("Section", "Section
  title"; deferred "flattening" note updated).

### Item 1 — Section sidebar  [DECIDED: scope]
- Left sidebar, **foldable**, lists **sections only** (flat, by title).
- Drag to **reorder sections** (moves the whole section's blocks).
- Click to **jump** to the section.
- **Rename** the section title inline here (it's nav-only).
- Must also provide **create / delete (and likely merge)** sections — there is
  no section-creation mechanism in the editor today.
- ROADMAP / deferred: a two-level outline (sections + their headings for
  click-jump). Sections-only for now.

### Item 3 — Block drag-reorder  [DECIDED]
- **Scope:** reorder blocks **within AND across sections**.
- **Affordance:** a gutter **drag handle on block hover** (Notion-style grip);
  only the handle is `draggable` so text/cell selection in inline blocks is
  untouched. **All** block types get it (inline + panel alike).
- **Drop feedback:** a horizontal **insertion-line indicator** that snaps
  before/after the hovered block by pointer-Y midpoint, and **dropping into an
  empty section** is allowed (drop onto the section body, not just a block).
- **Schema safety (non-negotiable):** rewrite the drop handler so the insert
  position is **always clamped inside a section**; a drop that can't resolve to
  one is rejected (never land a block at top level — `document` is `section+`).
  A cross-section move is a guarded delete-from-source + insert-into-target
  transaction.
- **Composition with item 1:** the **sidebar owns section reorder**; the main
  surface has **block handles only** (no section drag handle in the body).
- **Reuse:** extend the dead `src/editor/extensions/DragReorder.ts` (keep its
  `dragstart`/`drop` DOM-event shape + the pure `reorderBlocks` helper), wire it
  into `createEditorExtensions()`, add the `[data-drag-handle]` gutter element to
  node views, and add tests (there are none today).
- **Persistence:** a move is a normal ProseMirror transaction → `fromPm` →
  DocModel positional round-trip, with standard undo. No new persistence work.

### Item 4 — Heading numbering  [DECIDED]
- **Implement** computed numbering (today `numbered` is stored-but-unused).
- **Scheme:** outline / **hierarchical**, level-aware — H1 = "1", child H2 =
  "1.1", H3 = "1.1.1". Deeper counters reset when a higher level increments.
- **Per-level format is configurable** (e.g. `1.1.1` vs `1.A.i` vs `1.A.1`).
  Per-level format enum: `decimal | upper-alpha | lower-alpha | upper-roman |
  lower-roman`. Separator fixed `"."` for now (all the user's examples are
  dot-joined; make it configurable only if asked).
  - **Storage:** brand-token **default** (new `numbering.levelFormats` house
    style, default all-`decimal` → "1.1.1") + optional **per-document override**
    in DocModel `meta`, edited via the item-6 document-meta popup. Override is
    stored only when it differs from the brand default.
- **Counter reset:** **continuous across the whole document** — numbering
  follows the heading outline and ignores section boundaries (consistent with
  item 2: sections are nav-only, headings do the chaptering).
- **`numbered: false` opt-out:** **skip entirely** — no number AND no increment;
  the next numbered heading continues as if it weren't there. A numbered child
  builds its prefix only from its numbered ancestors (an absent/unnumbered
  ancestor level is omitted from the prefix).
- **Compute + render:** a **JS pure function** maps the ordered headings → a
  formatted prefix string per heading id, applying all the rules above. Both the
  editor node view and the static/export renderer call it and render the prefix
  as a **non-editable marker** (like a list bullet). The number is a
  **projection — never stored** in the DocModel. Unit-test the util directly.

### Item 5 — Smart page-break insertion  [DECIDED]
- **Mechanism:** a per-block **`breakBefore`** flag on **BlockBase** (optional,
  follows the `note` precedent — add to base + each block's `allowedAttrs` +
  node-view round-trip). Toggled as **"Start on a new page"** in the item-3
  gutter-handle menu. The break belongs to the block that starts the new page;
  no marker block in the flow.
- **"Smart" baseline:** keep the existing auto-avoidance rules (keep heading
  with next, keep tables/charts/callouts/etc. together, don't split table rows).
  No fragile auto-insertion or approximate live page-boundary hints — the **Page
  view** toggle already shows exact breaks.
- **Edit-view marker:** in the continuous edit view, draw a subtle "Page break"
  rule above any block whose `breakBefore` is set (exact, since explicit).
- **Divider fate:** stop treating a document divider as a page break. In a
  document it now renders as a **visible brand-styled horizontal rule**; if its
  `label` is set, show it as a centered caption on the rule (so the panel fields
  aren't dead in docs). Divider stays the rich **deck** section-break unchanged.
- **Migration:** the 3 document templates/examples that use a divider purely as
  a page break (`templates/commercial-proposal.yaml` `app-divider`,
  `templates/standard-report.yaml`, `documents/teg-magallanes-wind-hub.yaml`) →
  replace each break-divider with `breakBefore: true` on the following block and
  remove the divider node (else a visible rule would appear where a clean break
  was wanted).
- `breakBefore` is per-instance layout metadata (only matters in Page view +
  PDF). Acceptable minimal explicit override per the cross-cutting note.

### Item 6 — Document block spacing + "Document settings" popup  [DECIDED]
- **Popup:** a new **"Document settings"** dialog (opened from a toolbar
  gear/menu) with two groups:
  - **Metadata** — curated editable `Meta` fields: client, project, docKind,
    sector, tags, language, status, confidentialityLevel, owner, reviewers.
    System fields (createdAt/updatedAt) read-only or hidden; brandRef kept out
    of the casual UI. (First meta-editing UI in the app.)
  - **Layout** — the block-spacing override (this item) + the item-4
    heading-numbering-format override.
- **Block spacing value:** a **multiple of `brand.spacing.unit`** (brand
  **default 3×**, matching today's `unit * 3`). Edited as a stepper/slider in
  relative terms — stays on the brand spacing scale (survives brand redesign,
  respects "visuals from brand tokens").
- **Storage (same pattern as item 4):** brand-token default + optional per-doc
  override in `meta`; stored only when it differs from the default. Proposed
  shape: a grouped optional `meta.layout = { blockSpacing?: <multiple>,
  numbering?: { levelFormats, separator? } }` — keeps layout overrides separate
  from semantic metadata.
- **Resolution:** the resolved gap (brand default ⊕ meta override) feeds BOTH
  the editor surface `--doc-block-gap` CSS var AND the export/Page CSS, so edit
  and print stay identical.

### Item 7 — Per-block spacing override  [DECIDED]
- **Mechanism:** an optional **`spaceBefore`** attr on **BlockBase** (brand-unit
  multiple, **min 0** so blocks can touch) — "the gap above this block",
  overriding the resolved document gap for that single gap. Consistent with the
  `breakBefore` precedent; **no spacer block** (rejected the marker-in-flow
  anti-pattern, same as page breaks).
- **Edge + resolution:** **`spaceBefore` only** (not `spaceAfter`). Each gap is
  owned by exactly one block (the lower one), so there's no neighbor-conflict
  rule. The override is **clearable** to re-inherit the document default.
- **Edit UX:** from the item-3 gutter-handle menu ("Spacing above").
- **Interaction with `breakBefore`:** if both are set, `spaceBefore` is inert in
  the paginated/Page view (block is at page top) but still applies in the
  continuous edit flow.

## Cross-cutting note  [→ ADR candidate]
Items 4–7 add **per-instance layout** to the canonical DocModel: `breakBefore`
and `spaceBefore` on BlockBase, and `meta.layout` (block spacing + numbering
format overrides). This is a real tension with the memo principle ("visuals come
from brand tokens; the DocModel is canonical/semantic"). The settled resolution:
- **Brand tokens hold the defaults** (numbering house style, block spacing).
- The DocModel carries only **minimal, explicit, enumerable per-instance
  overrides** — never free-form styling. Each is optional and omitted when it
  equals the default.
- Computed *outputs* (heading numbers) are **projections, never stored**.
This pattern (default-in-brand ⊕ optional-override-in-model, resolved at render
for both editor and export) is hard to reverse (canonical schema change) and
surprising to a future reader → **offer an ADR** capturing it before
implementing.

---

## Status: grilling COMPLETE (items 1–7 all decided)

### Implementation roadmap (suggested order; one commit per increment)
1. **Schema foundation** — add `breakBefore` + `spaceBefore` to BlockBase;
   `numbering.levelFormats` (+ separator) to brand tokens; `meta.layout`
   (blockSpacing multiple + numbering override) to MetaSchema. Update each
   block's `allowedAttrs` + node-view round-trip + closed-schema test.
2. **Heading numbering** (item 4) — pure compute util + editor/export render +
   tests.
3. **Drag-reorder** (item 3) — rewrite `DragReorder.ts` (within+cross-section,
   clamped-inside-section inserts, insertion-line indicator, empty-section
   drop), gutter handle UI on every block, wire into `createEditorExtensions`,
   tests.
4. **Page breaks** (item 5) — `breakBefore` toggle in handle menu + edit-view
   marker; repurpose document divider as a visible rule (label as caption);
   migrate the 3 templates.
5. **Document settings popup** (item 6) — dialog (Metadata + Layout), block
   spacing in brand-unit multiples, numbering-format editor; resolved gap →
   `--doc-block-gap` + export/Page CSS.
6. **Per-block spacing** (item 7) — "Spacing above" in the handle menu (depends
   on the spacing-resolution wiring from step 5).
7. **Section sidebar** (item 1) — foldable, sections-only, drag-reorder,
   click-jump, rename, create/delete; section-title migration from item 2.
8. **Section title nav-only migration** (item 2) — convert the 4 templates'
   section titles → heading blocks; stop rendering `section.title`; move title
   editing to the sidebar; remove the increment-1 in-doc title input.

Roadmap / deferred: two-level outline (sections + headings) in the sidebar;
configurable numbering separator; "keep with next/together" manual override.

(Fold into tasks/ + the ADR once implementation starts, then delete this
file.)
