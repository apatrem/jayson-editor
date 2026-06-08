# Library / Dashboard UI — Design Spec

**Purpose:** concrete design for the doc library — the daily entry point (D-27) where consultants browse their 500+ documents accumulating in the cloud-sync folder.

**Audience:** the developer implementing M4 (T-84).

**Companion to:** `docs/DECISIONS.md` (D-19, D-20, D-21, D-27), `docs/TYPES.md` §2 (Meta).

---

## Why this screen matters

After 12 months at 40 docs/month, the cloud-sync folder holds ~500 documents. The library is what makes that volume usable. Done well, it gets out of the consultant's way. Done poorly, it becomes the bottleneck before any editing happens.

---

## Wireframe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Library                                       [+ New from template] [⚙ Settings]│
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌────────────────────────────────────────────────────────┐ │
│ │ FILTERS      │ │ 🔍 Search by client, project, tag...                    │ │
│ │              │ ├────────────────────────────────────────────────────────┤ │
│ │ STATUS       │ │ ↕ Sort: Updated ▾    🔲 Grid    ☰ List                  │ │
│ │ ☑ Draft (12) │ ├────────────────────────────────────────────────────────┤ │
│ │ ☐ In review  │ │                                                          │ │
│ │ ☐ Sent (40)  │ │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │ │
│ │ ☐ Won (8)    │ │ │ Acme    │ │ Beta    │ │ Gamma   │ │ Delta   │         │ │
│ │ ☐ Lost (4)   │ │ │ Industr.│ │ Energy  │ │ Mobility│ │ Circular│         │ │
│ │ ☐ Archived   │ │ │         │ │         │ │         │ │         │         │ │
│ │              │ │ │ SMR ... │ │ Wind ...│ │ EV ...  │ │ Recyc...│         │ │
│ │ KIND         │ │ │ proposal│ │ report  │ │ proposal│ │ memo    │         │ │
│ │ ☑ Proposal   │ │ │ DRAFT   │ │ DRAFT   │ │ SENT    │ │ DRAFT   │         │ │
│ │ ☑ Report     │ │ │ Today   │ │ Yesterday│ Wed     │ │ 2 wks   │         │ │
│ │ ☐ Deck       │ │ └─────────┘ └─────────┘ └─────────┘ └─────────┘         │ │
│ │ ☐ Memo       │ │                                                          │ │
│ │              │ │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │ │
│ │ SECTOR       │ │ │ Epsilon │ │ Zeta    │ │ Eta     │ │ Theta   │         │ │
│ │ ☑ Energy (8) │ │ │ ...     │ │ ...     │ │ ...     │ │ ...     │         │ │
│ │ ☑ Mobility   │ │ └─────────┘ └─────────┘ └─────────┘ └─────────┘         │ │
│ │ ☐ Circular   │ │                                                          │ │
│ │ ☐ Other      │ │ Show more (16 of 524)                                    │ │
│ │              │ │                                                          │ │
│ │ LANGUAGE     │ │                                                          │ │
│ │ ☑ EN  ☐ FR   │ │                                                          │ │
│ │              │ │                                                          │ │
│ │ OWNER        │ │                                                          │ │
│ │ • Me (12)    │ │                                                          │ │
│ │ • All        │ │                                                          │ │
│ │              │ │                                                          │ │
│ │ [Reset]      │ │                                                          │ │
│ └──────────────┘ └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component breakdown

```
<LibraryView>                              // top-level — opens on app launch
  <LibraryHeader>
    <Title>Library</Title>
    <NewFromTemplateButton>                // launches scaffolding skill (v1.1+)
    <SettingsButton>
  </LibraryHeader>

  <LibraryLayout>
    <FilterSidebar>                        // ~240px wide, collapsible
      <FilterGroup label="Status" />
      <FilterGroup label="Kind" />
      <FilterGroup label="Sector" />
      <FilterGroup label="Language" />
      <FilterGroup label="Owner" />
      <ResetFiltersButton />
    </FilterSidebar>

    <LibraryMain>
      <SearchBar />
      <SortAndViewControls>                // sort dropdown + grid/list toggle
      <DocList>
        {filtered.map(doc => (
          <DocCard key={doc.path} doc={doc} onClick={...} />
        ))}
      </DocList>
      <Pagination />                       // "Show more" or numbered pages
    </LibraryMain>
  </LibraryLayout>
</LibraryView>

<DocCard>
  <CardThumbnail>                          // rendered first page (lazy)
  <CardClient>                             // doc.meta.client
  <CardProject>                            // doc.meta.project
  <CardMetaRow>
    <DocKindBadge kind={doc.meta.docKind} />
    <StatusBadge status={doc.meta.status} />
    <RelativeDate value={doc.meta.updatedAt} />
  </CardMetaRow>
  <CardActions>                            // appears on hover
    [Open] [Open as reviewer] [Duplicate] [Archive] [Show in folder]
  </CardActions>
</DocCard>
```

## Data model

```typescript
// One entry per scanned doc folder under cloud-sync root.
interface LibraryEntry {
  // Identity
  path: string;                            // absolute folder path
  documentFilename: string;                // e.g. "proposal.json"

  // Indexed metadata (from doc's `meta` object; updated on file change)
  meta: Meta;                              // see TYPES.md §2

  // Render hints (computed, not in the Document file)
  thumbnailUri: string | null;             // lazy-generated PNG; null until rendered
  fileSize: number;                        // bytes; for "show large docs" filter
  fileMtime: number;                       // unix ms; for sort by "most recent"

  // Health
  hasAssetIssues: boolean;                 // T-87 — orphan/missing assets
  hasUnsavedComments: boolean;             // open AI proposals not yet handled
}

// In-memory index built from `list_directory` (recursive) at launch.
interface LibraryIndex {
  entries: LibraryEntry[];
  lastScanAt: number;
}

// Filter / search state.
interface LibraryFilterState {
  search: string;                          // matches client + project + tags
  status: Meta["status"][] | null;
  docKind: Meta["docKind"][] | null;
  sector: string[] | null;
  language: ("en" | "fr")[] | null;
  ownerMode: "me" | "all";
  showArchived: boolean;
  sort: "updated-desc" | "updated-asc" | "client-asc" | "created-desc";
  view: "grid" | "list";
}
```

## Index lifecycle

```
On app launch:
  1. Read AppConfig.paths.cloudSyncRoot
  2. Tauri `list_directory(root)` recursively (limit depth 4 — beyond that
     is unlikely to be docs)
  3. For each folder containing a document *.json file:
        a. Read the Document file (Tauri `read_document_file`)
        b. Parse the `meta` object and validate it against `MetaSchema`
        c. Create a LibraryEntry
  4. Cache the LibraryIndex in memory; render the library

On file change (watcher fires):
  - Re-read the changed Document file's `meta` object
  - Update the affected LibraryEntry in place
  - Re-sort if necessary (only if the sort key changed)

On manual refresh:
  - Repeat the launch scan
```

**Performance budget:** scanning 500 folders + parsing 500 `meta` objects should complete in **< 2s** on a typical laptop with cloud-synced storage. If full JSON parsing proves too slow on real libraries, index `meta` lazily on demand before introducing a second metadata store.

## Filter logic

All filters compose with AND between groups, OR within a group:

```typescript
function applyFilters(entries: LibraryEntry[], state: LibraryFilterState): LibraryEntry[] {
  return entries.filter(e => {
    if (!state.showArchived && e.meta.archived) return false;

    if (state.status && !state.status.includes(e.meta.status)) return false;
    if (state.docKind && !state.docKind.includes(e.meta.docKind)) return false;
    if (state.sector && (!e.meta.sector || !state.sector.includes(e.meta.sector))) return false;
    if (state.language && !state.language.includes(e.meta.language)) return false;
    if (state.ownerMode === "me" && e.meta.owner !== currentUser.email) return false;

    if (state.search) {
      const q = state.search.toLowerCase();
      const hit =
        e.meta.client.toLowerCase().includes(q) ||
        e.meta.project.toLowerCase().includes(q) ||
        e.meta.tags.some(t => t.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });
}
```

## Sort logic

```typescript
function applySort(entries: LibraryEntry[], sort: LibraryFilterState["sort"]): LibraryEntry[] {
  const copy = [...entries];
  switch (sort) {
    case "updated-desc":
      copy.sort((a, b) => Date.parse(b.meta.updatedAt) - Date.parse(a.meta.updatedAt));
      break;
    case "updated-asc":
      copy.sort((a, b) => Date.parse(a.meta.updatedAt) - Date.parse(b.meta.updatedAt));
      break;
    case "client-asc":
      copy.sort((a, b) => a.meta.client.localeCompare(b.meta.client));
      break;
    case "created-desc":
      copy.sort((a, b) => Date.parse(b.meta.createdAt) - Date.parse(a.meta.createdAt));
      break;
  }
  return copy;
}
```

## Card variants

### Grid view (default)
Cards in a 4-column responsive grid. ~240×180 each. Thumbnail at top, metadata below.

### List view
One-row-per-doc compact view. Columns: Thumbnail (small) · Client · Project · Kind · Status · Updated · Owner. Sortable by clicking column headers.

### Thumbnail generation
Thumbnails are rendered lazily — on first display of a card, the system:
1. Loads the doc's first section's rendered HTML.
2. Uses a 240×180 viewport screenshot via the same Playwright pipeline as PDF export.
3. Caches the PNG at `<doc-folder>/.thumbnail.png` (gitignored / cloudsync-ignored via a sidecar `.docsysignore` file).
4. Future renders show the cached PNG.

**Cache invalidation:** thumbnail is regenerated when the doc's `meta.updatedAt` changes (cheaper than diffing the whole doc).

## Keyboard shortcuts

| Key | Action |
|---|---|
| `cmd/ctrl+f` | Focus search box |
| `cmd/ctrl+n` | New from template (v1.1+) |
| `cmd/ctrl+o` | Open from disk (escape hatch) |
| `j` / `↓` | Next card |
| `k` / `↑` | Previous card |
| `enter` | Open the focused card |
| `r` | Open the focused card as reviewer |
| `cmd/ctrl+r` | Refresh library scan |
| `g` then `g` | Jump to top |
| `g` then `e` | Jump to end |

## Empty states

**No docs in cloud-sync root yet:**
```
┌────────────────────────────────────┐
│       Your library is empty.       │
│                                    │
│ Create your first document via     │
│ /generate-proposal (Claude Code).  │
│                                    │
│   [Open the scaffolding skill]     │
│   [Or open from disk]              │
└────────────────────────────────────┘
```

**All docs filtered out:**
```
┌────────────────────────────────────┐
│  No docs match your filters.       │
│                                    │
│      [Reset filters]               │
└────────────────────────────────────┘
```

## Health indicators on cards

Show small badges on cards when the doc has issues:

| Badge | Meaning | Action when clicked |
|---|---|---|
| 🔴 N comments | Open AI proposals not yet handled | Opens doc directly into review panel |
| ⚠ Asset issues | Missing or orphaned assets (T-87) | Opens doc with asset-linter banner active |
| 🔒 High confid. | `confidentialityLevel: "high"` | Visual indicator only |
| 📤 Awaiting send | Status is `draft` but `updatedAt > 2 weeks ago` | Reminder to send or archive |

## Performance considerations

- **Initial scan:** target < 2s for 500 docs. If scan exceeds 5s, show a progress indicator.
- **Filter / sort:** synchronous in-memory; should be < 50ms for 1000 entries.
- **Thumbnail lazy-load:** use `IntersectionObserver` to only render thumbnails as cards scroll into view.
- **Search debounce:** 200ms after last keystroke.

## What this design deliberately doesn't include

- **Tags as folders.** Tags are flat, not hierarchical. No nested tag tree.
- **Drag-to-reorder.** Sort is determined by sort dropdown, not by manual drag.
- **A "kanban" view.** The status filter is sufficient.
- **Per-doc permissions.** Single-user-per-machine (D-23) means everything in the library is the consultant's own. Reviewer mode is opt-in, not gated.
- **Cloud sync provider integrations.** The library reads the local mirror — sync conflicts are the provider's job.
- **Real-time updates while another instance edits the same doc.** Real-time collab is v2.

## File locations

| Component | File |
|---|---|
| `LibraryView` | `src/library/LibraryView.tsx` |
| `LibraryHeader` | `src/library/LibraryHeader.tsx` |
| `FilterSidebar` | `src/library/FilterSidebar.tsx` |
| `SearchBar` | `src/library/SearchBar.tsx` |
| `DocList` | `src/library/DocList.tsx` |
| `DocCard` | `src/library/DocCard.tsx` |
| Index logic | `src/library/index-builder.ts` |
| Filter logic | `src/library/filter.ts` |
| Thumbnail generation | `src/library/thumbnail.ts` |

## Acceptance checklist (per T-84)

- [ ] App opens to the library on launch (or to a "no docs yet" state if empty).
- [ ] Cloud-sync root scanned recursively; doc folders identified by presence of a document `*.json`.
- [ ] Filter sidebar with all five filter groups (status / kind / sector / language / owner).
- [ ] Search matches client + project + tags.
- [ ] Sort dropdown with four orderings.
- [ ] Grid + list view toggle.
- [ ] Cards open the doc on click; "Open as reviewer" works from card actions (D-26).
- [ ] "Open from disk" escape hatch always available in the header.
- [ ] Refresh button rescans the cloud-sync root.
- [ ] Lazy-loaded thumbnails (no jank on initial render).
- [ ] Empty states render correctly (no docs / no matches).
- [ ] Performance budget met: 500-doc index in < 2s on a typical laptop.
