# Block Implementation Guide

**Purpose:** copy-pattern instructions for implementing Standard blocks using
the `defineBlock()` registry pattern. All 15 Standard blocks are implemented
and live under `src/blocks/<name>/`. This guide applies to adding new Standard
blocks or understanding the existing ones.

**Audience:** the developer (or LLM) implementing or modifying Standard blocks.

**Companion to:** `blocks.catalogue.yaml` (the setup-time spec for each Standard
block), `reference/callout/` (Standard block canonical scaffold), `reference/chart/`
(worked example for complex blocks with a data panel), `reference/authored-block/`
(Authored block canonical scaffold — see §8 for the full `defineAuthoredBlock` pattern).

> **Architecture note (ADR-0008):** as of M9a, every Standard block is a
> single-file manifest under `src/blocks/<name>/` using the `defineBlock()`
> factory. The old four-file split across `src/schema/blocks/`, `src/renderer/blocks/`,
> `src/editor/nodes/`, and `src/editor/mapping.ts` has been removed. The registry
> wires everything automatically — Editor.tsx, DocumentRenderer.tsx,
> mapping.ts, and src/schema/blocks/index.ts all derive from `loadAllBlocks()`/
> `loadAllSchemas()`.

> **ADR-0022 fixture note:** this guide still names the current pre-clean-break
> YAML fixture files in a few places. When the Document file clean break lands,
> retarget those examples to deterministic JSON fixtures; the block
> implementation pattern itself is unchanged.

---

## 1. The single-manifest pattern (mandatory for every Standard block)

Every Standard block ships as exactly three artifacts:

| Artifact | Path in repo | Purpose |
|---|---|---|
| `schema.ts` | `src/blocks/<name>/` | Pure Zod schema + TypeScript type + `schemaEntry`. No React/TipTap imports. |
| `index.tsx` | `src/blocks/<name>/` | Everything else: TipTap node, renderer, mapping helpers, `defineBlock()` default export. |
| `<name>.test.ts` | `tests/blocks/` | Five test layers (see §5) |

`defineBlock()` (from `src/blocks/defineBlock.ts`) returns a `BlockRegistryRecord`
consumed by two registries:

- **`src/blocks/schema-registry.ts`** — pure registry used by schema validation
  (`BlockSchema`, `Block` type). Imports from `schema.ts` only.
- **`src/blocks/runtime-registry.ts`** — full registry used by Editor.tsx,
  DocumentRenderer.tsx, and mapping.ts. Imports `defineBlock()` default exports.

Adding a block to `loadAllBlocks()` in `src/blocks/runtime-registry.ts` is the
**only manual registration step** — no changes to Editor.tsx, DocumentRenderer.tsx,
mapping.ts, or `src/schema/blocks/index.ts` are needed.

---

## 2. The implementation checklist (per Standard block)

### Step 1 — Read the spec
- Open `blocks.catalogue.yaml`, find the entry for your block.
- Note the `schema` (data shape), `appliesTo` (document/deck), `brandTokensUsed`,
  `llmUsage.when`/`avoid`.

### Step 2 — Write `src/blocks/<name>/schema.ts` (pure schema)
- Extend `BlockBaseSchema` (from `src/schema/blocks/block-base`) — gives you
  `id`, `type`, `note`.
- Add `type: z.literal("<block-id>")` as the discriminator.
- For each field in `blocks.catalogue.yaml`:
  - String → `z.string()` with appropriate min/max.
  - Enum → `z.enum([...])`.
  - Array → `z.array(...)` with `.min(N).max(M)` per the spec.
  - Nested object → inline schema with `.strict()`.
  - Rich-text → `ProseMirrorFragmentSchema`.
  - Asset path → `AssetPathSchema`.
- Add `.strict()` to the top-level object.
- Export the inferred type with `z.infer<typeof XxxBlockSchema>`.
- Export a `schemaEntry` constant (`satisfies { schemaName, schema, allowedAttrs, paletteLabel }`).
- **No React, TipTap, or renderer imports** — this file must stay pure (enforced by
  `tests/blocks/schema-purity.test.ts`).

### Step 3 — Write `src/blocks/<name>/index.tsx` (TipTap node + renderer + mapping)

Create the `defineBlock()` manifest. Follow `reference/callout/index.tsx` (simple)
or `reference/chart/index.tsx` (complex with data panel):

```typescript
import { defineBlock } from "../defineBlock";
// ... other imports

// TipTap node
export const XxxTipTapNode = Node.create({ name: "<block-id>", ... });

// Renderer
export const Xxx: FC<{ block: XxxBlock }> = ({ block }) => { ... };

// Mapping helpers
export function xxxBlockToProseMirror(block: XxxBlock): ProseMirrorNode { ... }
export function proseMirrorToXxxBlock(node: ProseMirrorNode): XxxBlock { ... }

// Registry manifest (default export)
export default defineBlock<XxxBlock>({
  schemaName: "<block-id>",
  schema: XxxBlockSchema,
  allowedAttrs: [...],
  paletteLabel: "...",
  tiptapNode: XxxTipTapNode,
  renderer: Xxx,
  toPm: xxxBlockToProseMirror,
  fromPm: proseMirrorToXxxBlock,
});
```

### Step 4 — Register in the runtime-registry

Open `src/blocks/runtime-registry.ts`. Add a single import and one entry:

```typescript
import xxxBlock from "./<name>";
// ...
export function loadAllBlocks(): readonly BlockRegistryRecord[] {
  return [
    // ... existing entries
    xxxBlock,
  ];
}
```

That's it. Editor.tsx, DocumentRenderer.tsx, mapping.ts, and
`src/schema/blocks/index.ts` all update automatically via the registry.

Also add the `schemaEntry` import to `src/blocks/schema-registry.ts`
(`loadAllSchemas()`) so schema-only validation covers the new block.

### Step 5 — Write the tests (`<name>.test.ts`)
- Five test layers per §5 below.

### Step 6 — Add a fixture entry to `examples/sample-proposal.yaml`
- If your block isn't yet exercised by the sample proposal, add a representative use.

### Step 7 — Add to the block palette
- The palette reads from the registry (`paletteLabel` + `llmUsage.when` from the catalogue).
  No manual step if the palette is already registry-driven; otherwise follow the
  `BlockPalette.tsx` pattern.

**Estimated effort per block: 4–6 hours** for simple blocks (prose, heading, image),
**8–12 hours** for complex blocks (chart, table, risk-matrix, roadmap).

---

## 3. Per-block notes (the harder ones)

Most blocks follow the callout pattern cleanly. These deserve specific attention:

### `chart` (block #5)
- The hardest block. Plan ≥ 12 hours.
- The renderer wraps ECharts directly. For the editor view, mount/dispose an
  ECharts instance inside the block node view; for the PDF export, pre-render
  to static SVG via ECharts's headless mode (no JS at PDF time).
- The data grid (D-24 side panel) is a separate React component (`src/blocks/chart/ChartDataPanel.tsx`) that mounts when a chart is selected.
- Excel-paste detection: in the data grid's paste handler, detect `\t`-separated (TSV) vs `,`-separated (CSV). For locale-dependent numbers (`1.234,56` vs `1,234.56`), defer to **O-05 open item** — ship with English-locale parsing only in v1.
- Brand integration: the chart's color palette comes from `brand.colors.chartPalette.qualitative` (or `.sequential` if `block.palette === "sequential"`).

### `table` (block #6)
- Cells are `ProseMirrorFragment` (rich text). The editor needs per-cell editable regions inside a `<table>` layout.
- TipTap's official `@tiptap/extension-table` does most of this, but it doesn't enforce a closed schema (it allows arbitrary HTML in cells). Wrap it with a custom node that constrains cell content to a single paragraph with marks-only.
- For PDF export: use CSS `break-inside: avoid` on `<tr>` to keep rows together; allow page breaks between rows.

### `risk-matrix` (block #11)
- Renders as a CSS Grid (2×2 or 3×3). Each risk is positioned by `x`/`y` coordinates.
- Editing UI: a small canvas where consultants click a cell to add a risk, then drag to reposition. Keep this in the side panel (consistent with the chart pattern from D-24).
- Severity color comes from `brand.colors.status.*`.

### `roadmap` (block #10)
- Effectively a custom Gantt renderer. Use the chart pattern — a side-panel data grid for workstreams + milestones, an ECharts custom-series renderer for visualization (ECharts supports Gantt-style via `custom` series).
- Date math: use `date-fns` for all date computations. ISO strings only on the wire.

### `team` (block #12)
- Photo paths are mostly `$brand:headshots.<name>` references resolved against the shared brand folder (D-21).
- Layout `"grid"`, `"hierarchical"`, `"list"` are visually distinct — each is its own renderer sub-component. Pick via `switch (block.layout)`.

### `diagram` (block #14)
- Mermaid source rendered via `@mermaid-js/mermaid` (or the official `mermaid` package, MIT).
- For PDF export: pre-render Mermaid to SVG at build time (Mermaid has a Node API). Do **not** call Mermaid during PDF rendering (it expects a browser DOM).
- Editor view: a side panel with a `<textarea>` for raw Mermaid source + a live-preview pane.

### `divider` (block #15)
- For `kind: "document"`: renders as a CSS `page-break-before: always`. No visible content.
- For `kind: "deck"`: becomes a full-screen divider slide using the `section-divider` slide layout (D-30). The block carries `label`, `subtitle`, `numbering`; the layout decides positioning.
- This block is *layout-affecting* in documents (forces a page break) — make sure the PDF export respects this.

---

## 4. Brand-token consumption pattern

Every block consumes brand tokens via two functions:

```typescript
import { useBrandTokens } from "../../brand-tokens/useBrandTokens";
import { resolveBrandToken } from "../../brand-tokens/resolve";

const MyBlock: React.FC<{ block: MyBlockType }> = ({ block }) => {
  const brand = useBrandTokens();

  // Direct values
  const baseSpacing = brand.spacing.unit;
  const bodyFont = brand.typography.fonts.body.family;

  // Token references (resolved via the helper)
  const primary = resolveBrandToken(brand, "colors.brand.primary");
  const surface = resolveBrandToken(brand, "colors.semantic.surfaceBackground");
  // `colors.semantic.surfaceBackground` is itself "neutral.200" — the helper
  // dereferences one level.

  // ...
};
```

**Rules:**
- Never hard-code a hex color, font-family string, or pixel value in a block component.
- Always go through `useBrandTokens()` — even for "I'll just hard-code white" cases.
- If you find yourself needing a value not in the brand tokens, **stop** and ask: is this a gap in `brand.example.yaml` that should be added, or is it block-internal logic (in which case derive it from existing tokens)?

---

## 5. The five test layers (per block)

Every block test file MUST have these five describe-blocks (use the callout test as a template):

### Layer 1 — Schema: valid fixtures
```typescript
describe("XxxBlockSchema — valid fixtures", () => {
  it("accepts a complete block with all fields", ...);
  it("accepts a block with only required fields", ...);
  it("applies defaults for omitted optional fields", ...);
});
```

### Layer 2 — Schema: invalid fixtures
```typescript
describe("XxxBlockSchema — invalid fixtures", () => {
  it("rejects an unknown enum value", ...);
  it("rejects a field exceeding maxLength", ...);
  it("rejects missing required fields", ...);
  it("rejects unknown keys (strict mode)", ...);
});
```

### Layer 3 — Renderer: HTML output
```typescript
describe("Xxx renderer", () => {
  it("renders a root element with data-block-id and data-block-type", ...);
  it("renders required fields", ...);
  it("omits optional fields when absent", ...);
  it("uses brand tokens (not hard-coded values)", ...);
  it("is deterministic (same input -> same output)", ...);
});
```

### Layer 4 — Mapping: round-trip
```typescript
describe("Xxx mapping (DocModel <-> ProseMirror)", () => {
  it("round-trips a minimal block losslessly", ...);
  it("round-trips a fully-populated block losslessly", ...);
});
```

### Layer 5 — Editor: TipTap commands
```typescript
describe("Xxx TipTap node", () => {
  it("registers an `insertXxx` command", ...);
  it("can modify block attrs via registered commands", ...);
});
```

**Why all five matter:** the four layers above the test correspond directly to acceptance criteria in `BUILD_BRIEF.md` (M1 schema, M2 renderer, M4 mapping). Skipping any layer means the corresponding milestone's acceptance test won't catch regressions in that block.

---

## 6. When you're done with a block

Before checking off a block as "complete":

- [ ] `src/blocks/<name>/schema.ts` and `src/blocks/<name>/index.tsx` exist.
- [ ] Block is registered in `loadAllBlocks()` (runtime-registry.ts) and `loadAllSchemas()` (schema-registry.ts).
- [ ] All five test layers pass.
- [ ] No hard-coded colors, fonts, or spacing in the renderer.
- [ ] No imports outside the project's allowed dependency list.
- [ ] An entry for the block exists in the editor's block palette.
- [ ] The block is exercised in `examples/sample-proposal.yaml` or `examples/sample-deck.yaml`.
- [ ] If the block is deck-applicable, it works inside the deck renderer's layout slots.

When all 15 blocks have passed this checklist, **M1 schema-level acceptance is satisfied**.

---

## 7. Anti-patterns to avoid

These are mistakes that the callout reference does NOT make — don't introduce them in the other 14 blocks:

| Anti-pattern | Why it's wrong | Do this instead |
|---|---|---|
| Defining the block's data shape in the React component | Couples data to UI; can't be tested separately | Schema in `<name>.ts`, type-imported by the component |
| Hard-coding `#0B3D91` in the renderer | Breaks per-consultancy brand customization | `resolveBrandToken(brand, "colors.brand.primary")` |
| Storing the variant-to-style mapping in CSS | Can't be SSR'd; breaks PDF export | Put it in TypeScript, return inline styles |
| Putting the editing UI inside the renderer | Production styling and editing UX conflict | Renderer = `<Name>.tsx` (pure); editor = `<Name>Node.tsx` |
| Using `dangerouslySetInnerHTML` for prose | Bypasses ProseMirror; opens XSS | Use `<ProseRenderer fragment={...} />` |
| Allowing free-text in cells (e.g., table.row.cell as `string`) | Drift between editor's rich text and on-wire data | Use `ProseMirrorFragmentSchema` for any rich-text field |
| Skipping `.strict()` on the schema | Unknown keys silently accepted; drift hidden | Always `.strict()` |
| Defining `crypto.randomUUID()` calls during render | Non-deterministic rendering breaks PDF + tests | IDs generated only at block creation, never during render |

---

## 8. Authored blocks (Tier 3) — the `defineAuthoredBlock` pattern

Standard blocks (§1–§7 above) cover the 15 core blocks built by the development
team and reviewed via PR. **Authored blocks** are a separate tier that consultants
create in-document via the LLM-powered authoring panel and share peer-to-peer as
`.ts` file attachments. This section explains how to write, test, and reason about
the Authored block pattern.

> **See also:** `reference/authored-block/` for the canonical scaffold and
> `sector-risk-summary.ts` as a worked example.
> **ADR references:** ADR-0004 (three-tier library), ADR-0007 (capability
> restriction), ADR-0013 (declarative data), ADR-0005 (transport format),
> ADR-0011 (authoring UX).

---

### 8.1 What an Authored block is

An Authored block is a consultant-authored, peer-to-peer-shareable block that
extends the palette beyond the 15 Standard blocks. Unlike Standard and Brand
blocks, Authored blocks ship **without a human review gate** — the Rust AST lint
(at receive time) and the TypeScript capability ceiling are the only safety layers.

The tier comparison:

| Property | Standard (`defineBlock`) | Brand (setup-installed) | Authored (`defineAuthoredBlock`) |
|---|---|---|---|
| Author | Core developer | Ops team at setup | Consultant via in-app UI / LLM |
| Human review | ✅ PR review | ✅ Ops review | ❌ — Rust lint only |
| File format | `schema.ts` + `index.tsx` | Same as Standard | Single `.ts` file (data, not code) |
| Runtime model | App-bundled TS executed by the browser | Same as Standard | Manifest extracted from AST; runtime is **app-bundled code** |
| Capability ceiling | Full Standard capabilities | Full Standard capabilities | Restricted subset (ADR-0007): no atom nodes, no custom side panels, no ECharts/Mermaid |
| Registration | `loadAllBlocks()` in `runtime-registry.ts` | Same | `generated-blocks/active/` on disk |
| Transport | Committed to repo | Committed to repo | Shared as a `.ts` file attachment (ADR-0005) |

---

### 8.2 The declarative-data model (ADR-0013)

**An Authored block file is data, not executable code.** The runtime never
`eval`s or `import()`s it. Instead:

1. The Rust sidecar parses the file's AST at receive time.
2. It validates that every value inside `defineAuthoredBlock({...})` is
   statically evaluable — no function expressions, no arrow functions, no
   non-literal template strings, no JSX.
3. It extracts the manifest as a typed `AuthoredBlockManifest` (a plain
   JSON-equivalent value) and discards the rest.
4. The app's **built-in runtime expander** (in `src/blocks/authored/defineAuthoredBlock.ts`)
   consumes the manifest to build a TipTap node + form-based node view +
   React renderer + mapping — without ever running the Authored file's contents.

The `.ts` extension is a serialisation convenience (diffable, emailable,
type-checkable at generation time) — not an indication of runtime execution.

---

### 8.3 The capability restriction (ADR-0007)

Because the runtime expander is fixed app-bundled code, what an Authored block
*can* express is the union of what `defineAuthoredBlock()` accepts:

| Capability | Authored |
|---|---|
| Rich-text content area (`content: "rich-text"`) | ✅ |
| Static attrs: `string`, `enum`, `number`, `bool` | ✅ |
| Repeated-item list attrs | ✅ |
| Brand-token consumption via `{ $token: "..." }` | ✅ |
| Attr references in the template via `{ $ref: "fieldId" }` | ✅ |
| Atom node with JSON payload | ❌ — type error |
| Custom side panel | ❌ — type error |
| ECharts / Mermaid embed | ❌ — type error |
| Function values anywhere in the manifest | ❌ — AST lint failure at receive time |

The capability ceiling is enforced at two independent layers:

1. **TypeScript compile time** — `AuthoredBlockManifest` has no field that
   accepts a TipTap `Node`, `ComponentType`, or function. Forbidden patterns
   are type errors, not lint warnings.
2. **Rust AST validator at receive time** — scans the literal AST for any
   non-literal node and quarantines the block if found.

---

### 8.4 Writing an Authored block

Copy `reference/authored-block/sector-risk-summary.ts` as a starting point.
The minimum structure is:

```typescript
// Authored block manifests may import ONLY:
//   - defineAuthoredBlock (this helper)
//   - brand-token type aliases  (ColorToken, AttrRef)
// No React, no TipTap, no echarts, no fs, no fetch.
import { defineAuthoredBlock } from "../../src/blocks/authored/defineAuthoredBlock";

export default defineAuthoredBlock({
  // ── Identity ──────────────────────────────────────────────────────────────
  slug: "my-block",            // kebab-case; unique per sender email
  title: "My Block",           // displayed in the "Add block" dialog
  paletteLabel: "My Block",    // ≤ 24 chars, palette chip label
  content: "rich-text",        // "rich-text" | "none"

  // ── Attrs ─────────────────────────────────────────────────────────────────
  // Order here = top-to-bottom order in the auto-generated form panel.
  attrs: [
    { kind: "string",  fieldId: "title",  label: "Title",  maxLength: 80 },
    { kind: "enum",    fieldId: "status", label: "Status",
      options: [{ value: "draft", label: "Draft" }, { value: "final", label: "Final" }],
      defaultValue: "draft" },
    { kind: "number",  fieldId: "score",  label: "Score",  min: 0, max: 100, defaultValue: 0 },
    { kind: "bool",    fieldId: "pinned", label: "Pinned", defaultValue: false },
    {
      kind: "repeated-item", fieldId: "items", label: "Items",
      itemFields: [
        { kind: "string", fieldId: "name", label: "Name", maxLength: 60 },
      ],
    },
  ],

  // ── Renderer template ──────────────────────────────────────────────────────
  // Pure data — no JSX, no functions.
  // AttrRef: { $ref: "fieldId" } resolves to the attr's runtime value.
  // ColorToken: { $token: "colors.brand.primary" } resolves via brand tokens.
  template: {
    kind: "column",
    gap: 2,
    children: [
      {
        kind: "box",
        padding: 3,
        background: { $token: "colors.semantic.surfaceBackground" },
        children: [
          { kind: "heading", level: 2, text: { $ref: "title" } },
          { kind: "badge",   text: { $ref: "status" } },
        ],
      },
      { kind: "rich-text-slot" },   // ← ProseMirror editable area
    ],
  },
});
```

#### Available render nodes

| Kind | Key fields | Notes |
|---|---|---|
| `text` | `value: string \| AttrRef`, `color?: ColorToken` | Inline text |
| `heading` | `level: 1–4`, `text: string \| AttrRef` | Section heading |
| `box` | `padding?`, `background?: ColorToken`, `borderRadius?`, `children` | Block container |
| `row` | `gap?`, `align?`, `children` | Horizontal flex |
| `column` | `gap?`, `children` | Vertical flex |
| `badge` | `text: string \| AttrRef`, `background?: ColorToken`, `foreground?: ColorToken` | Chip/label |
| `rich-text-slot` | — | ProseMirror editable area (at most once; only when `content: "rich-text"`) |
| `for-each` | `fieldId: string`, `item: RenderNode` | Repeats per `repeated-item` entry |

---

### 8.5 The generate → share → receive lifecycle

Authored blocks are not written directly — the LLM authoring panel generates
them from a consultant's description. The lifecycle:

1. **Generate** — consultant describes the block; the LLM (using the system
   prompt in `src/llm/generate-authored-block.ts`) generates a `.ts` file
   matching the manifest schema. The app runs advisory lint; on pass the block
   is previewed in-document.
2. **Share** — consultant shares the `.ts` attachment via the OS share sheet
   (or clipboard fallback). The `stampSender` function writes the sender's
   email into the manifest header before sharing (ADR-0005).
3. **Receive** — recipient drags the `.ts` onto the app window. The receive
   pipeline (`receiveAuthoredBlock` in `src/ipc/authored-block.ts`):
   a. Checks the scaffold version. Mismatch → quarantine with a
      `scaffold-version-mismatch` violation; "Regenerate against current
      scaffold" is the offered action.
   b. Runs the Rust AST lint (A001–A013 rules). Failure → quarantine with a
      `.violations.json` sidecar surfaced in the `QuarantinePanel`.
   c. Passes → installs to `generated-blocks/active/<slug>.tsx`.
   d. Writes a `.manifest.json` sidecar alongside the installed file.
4. **Activate** — the runtime registry discovers files in `generated-blocks/active/`
   and registers them in the block palette (via `buildAuthoredRenderer`).
5. **Archive / delete** — lifecycle managed via IPC commands
   (`archiveAuthoredBlock`, `restoreAuthoredBlock`, `permanentlyDeleteAuthoredBlock`).

---

### 8.6 Writing tests for an Authored block

Copy `reference/authored-block/sector-risk-summary.test.ts` as a starting
point. Authored block tests have four layers (not five — there is no TipTap
layer, since TipTap integration is handled by the runtime expander, not the
manifest):

| Layer | What to test |
|---|---|
| **1. Manifest shape** | `defineAuthoredBlock()` returns a value; slug/title/paletteLabel are correct types and values. |
| **2. Attrs** | Each field definition has the right `kind`, `fieldId`, and `label`; enums have non-empty `options`. |
| **3. Template structure** | The render tree is well-formed — all nodes have a `kind`, `rich-text-slot` appears at most once, `for-each` nodes reference a valid `fieldId`. |
| **4. Manifest header (receive-time)** | Parsed header has the right `slug` and `sender` fields; `isScaffoldCompatible` returns true for the current `APP_SCAFFOLD_VERSION`. |

---

### 8.7 Common mistakes to avoid in Authored blocks

| Mistake | Why it's rejected | Correct approach |
|---|---|---|
| Importing React, TipTap, or echarts | Forbidden import list in the Rust AST lint | Import only `defineAuthoredBlock` and brand-token type aliases |
| Using a function or arrow function as a value | AST validator rejects non-literal nodes | Use `{ $ref: "fieldId" }` or `{ $token: "..." }` for dynamic values |
| More than one `rich-text-slot` | Runtime expander only supports one editable region | At most one `rich-text-slot` per template |
| Omitting the manifest header | `receiveAuthoredBlock` needs header for slug/sender | Let the LLM generation pipeline stamp the header; don't strip it |
| Hardcoding a hex color in the template | Breaks brand customization | Use `{ $token: "colors.brand.primary" }` from the brand-token system |
| Adding top-level statements beyond the default export | AST lint rejects files with extra top-level code | One default export, one optional narrow import — nothing else |
| Trying to use a `template: () => ...` function | Manifest values must be literals | Describe the layout declaratively using render nodes |

---

### 8.8 Block guide summary (all three tiers)

| Task | Standard (`defineBlock`) | Brand (setup-installed) | Authored (`defineAuthoredBlock`) |
|---|---|---|---|
| Canonical reference | `reference/callout/` | `reference/callout/` + `starter/brand.example.yaml` | `reference/authored-block/` |
| File(s) to create | `schema.ts` + `index.tsx` + `<name>.test.ts` | Same | One `.ts` file + `<slug>.test.ts` |
| Register in | `runtime-registry.ts` (`loadAllBlocks`) | Same | Drop in `generated-blocks/active/` |
| Test layers | 5 (schema valid/invalid, renderer, mapping, TipTap) | 5 | 4 (manifest, attrs, template, header) |
| Review gate | Human PR | Ops team | Rust AST lint (automated) |
