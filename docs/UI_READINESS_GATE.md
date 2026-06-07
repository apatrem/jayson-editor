# Readiness Gate — UI & Export Lock

**Status:** draft spec (T-193)
**Companion to:** `docs/GENERATION_PIPELINE.md` §7, `src/generation/readiness.ts`

The readiness gate converges every "needs a human" flag into one blockers list.
**Export (PDF/HTML) is locked while `blockers.length > 0`.**

---

## Data model

```typescript
interface ReadinessBlocker {
  kind: "data-not-confirmed" | "degraded-to-prose" | "layout-overflow"
      | "contradiction" | "missing-source-for-verify";
  blockId: string;
  blockType: string;
  message: string;
}

shippable ⟺ blockers.length === 0  // see canExport(doc)
```

Pure logic lives in `src/generation/readiness.ts` — no React imports.

---

## Three surfacing surfaces (GENERATION_PIPELINE §7)

1. **Canvas** — watermark/hatch on illustrative data blocks; ⚠ badge on flagged blocks; colored bar for overflow/degraded.
2. **Side panel** — when a flagged block is selected: what's wrong + primary fix action (e.g. "Mark data verified", "Pick source", "Restructure block").
3. **Document-level checklist** — persistent "⚠ N items need review" in the app chrome (DocumentView or library header when doc open). Each line links to `blockId`; count decrements as resolved.

---

## Export lock

- **File → Export PDF** disabled when `!canExport(doc)`; tooltip explains blocker count.
- **Export anyway** escape hatch: modal requiring typed reason string; reason appended to doc `meta` audit log (field TBD in T-192) — never silent bypass.

---

## Resolution flows

| Blocker kind | Primary action |
|--------------|----------------|
| `data-not-confirmed` | Open data panel → enter/confirm data → provide `source` → "Mark verified" |
| `missing-source-for-verify` | Add `source.name` (and optional link) |
| `degraded-to-prose` | Re-run structuring or manually replace with structured block |
| `layout-overflow` | Accept auto-split slide or pick higher-capacity layout |
| `contradiction` | Edit prose or dismiss with note |

---

## Open items

1. Audit log field on `Meta` for export-anyway reasons.
2. Whether checklist lives in DocumentView only or also LibraryView for open tabs.
3. Deck-specific overflow UI vs report (auto-split preview).
