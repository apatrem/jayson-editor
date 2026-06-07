# Readiness Gate — UI & Export Summary

**Status:** draft spec (T-193); aligned with grilling 2026-06-07
**Companion to:** `docs/GENERATION_PIPELINE.md` §7, `CONTEXT.md`, `src/generation/readiness.ts`

The readiness gate converges every "needs a human" flag into one blockers list.
**Export is never locked** — blockers drive canvas watermarks, the checklist, and
an export-time summary popup.

---

## Data model

```typescript
interface ReadinessBlocker {
  kind: "data-not-confirmed" | "degraded-to-prose" | "layout-overflow"
      | "contradiction" | "missing-source-for-verify" | "size-exceeds-envelope";
  blockId: string;
  blockType: string;
  message: string;
}

// All flags cleared — checklist empty (informational; does not gate export)
allClear ⟺ blockers.length === 0

// Export always allowed; popup summarizes blockers when non-empty
canExport(doc) === true
```

Pure logic lives in `src/generation/readiness.ts` — no React imports.

---

## Three surfacing surfaces (GENERATION_PIPELINE §7)

1. **Canvas** — block watermarks on illustrative/degraded blocks; ⚠ badge; colored bar for overflow.
2. **Side panel** — when a flagged block is selected: what's wrong + primary fix action (e.g. "Mark data verified", "Pick source", "Restructure block"). Show **`sourceIntent`** when present.
3. **Document-level checklist** — persistent "⚠ N items need review" in the app chrome. Each line links to `blockId`; count decrements as resolved.

---

## Export summary popup

When `blockers.length > 0` at export time:

- **Primary:** **Review items** — dismiss popup and jump to checklist / first blocker.
- **Secondary:** **Export with flagged content** — proceed immediately (one click, no typed reason).

Watermarks in the exported PDF/HTML carry accountability to external recipients.

When `blockers.length === 0`, export proceeds without the popup.

---

## Resolution flows

| Blocker kind | Primary action |
|--------------|----------------|
| `data-not-confirmed` | Open data panel → enter/confirm data → provide `source` → "Mark verified" |
| `missing-source-for-verify` | Add `source.name` (and optional link) |
| `degraded-to-prose` | Replace with structured block or scoped section regeneration |
| `layout-overflow` | Accept auto-split slide or pick higher-capacity layout in editor |
| `contradiction` | Edit prose or dismiss with note |
| `size-exceeds-envelope` | Acknowledge perf risk; split deferred to v1.1 roadmap |

---

## Open items

1. Whether checklist lives in DocumentView only or also LibraryView for open tabs.
2. Deck-specific overflow UI vs report (auto-split preview).
3. `size-exceeds-envelope` threshold wiring to D-35 / D-39 benchmark output.
