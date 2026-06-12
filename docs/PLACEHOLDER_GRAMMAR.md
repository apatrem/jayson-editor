# Placeholder Grammar — Inter-Pass Contract

**Status:** draft spec (T-190); implements GENERATION_PIPELINE.md §2
**Companion to:** `blocks.catalogue.yaml`, `docs/GENERATION_PIPELINE.md`, `src/generation/placeholder.ts`

Placeholders carry **non-prose block intent** between the writing pass (markdown)
and the structuring pass (JSON DocModel). Prose blocks never use placeholders —
they are plain markdown paragraphs/lists.

---

## 1. Surface syntax

`draft.md` may open with YAML frontmatter (`title`, `client`, `createdAt`) — authoritative
for structuring metadata; not part of the placeholder grammar. See `GENERATION_PIPELINE.md` §4.

A placeholder is a single line (or standalone block) matching:

```
[[block: <kind-hint> | intent: "<intent-text>" | id: <local-id>]]
```

### Fields

| Field | Required | Direction | Rules |
|-------|----------|-----------|-------|
| `kind-hint` | No (writing pass) | Up | Lowercase kebab-case catalogue name **or empty**. A hint only — structuring may override per `avoid:` rules. |
| `intent-text` | Yes | Up + down | Natural-language description of what the block should convey. Double-quoted; `\"` and `\\` escapes allowed inside quotes. Max 500 chars. |
| `local-id` | Yes | Up + down | `[a-z][a-z0-9-]{0,31}` — stable handle for cross-references in prose ("see chart `revenue-trend`"). |

### Kind-hint omission (writer output)

When the writer has no structural preference:

```
[[block: | intent: "Quarterly revenue trend 2022–2025" | id: revenue-trend]]
```

When the writer suggests a kind:

```
[[block: chart | intent: "Quarterly revenue trend 2022–2025" | id: revenue-trend]]
```

### Down-conversion (`toPlaceholder`)

Always emits the **resolved** block type as `kind-hint` (never empty):

```
[[block: chart | intent: "Revenue trend — bar chart of FY22–FY25 with €M axis" | id: revenue-trend]]
```

Intent text is **derived** from current block fields (see §4) — never read from a stored `description` field.

---

## 2. Placement rules (markdown)

1. A placeholder occupies its **own paragraph** — no inline placeholders mid-sentence.
2. Blank lines before and after are optional but recommended for human/LLM visibility.
3. Placeholders must not appear inside fenced code blocks, blockquotes used for quotes, or HTML comments.
4. Prose may reference a placeholder by backtick-wrapped id: `` see `revenue-trend` ``.

**Invalid (reject at import lint):**

```markdown
Revenue grew — [[block: chart | intent: "…" | id: x]] — sharply.
```

---

## 3. Re-anchoring when `local-id` is lost

External refinement (consultant LLM, manual edit) may delete or rename ids. Before structuring, run **import lint** then **re-anchor**:

### Step A — Parse all well-formed placeholders

Collect set `P = { (id, intent, kind-hint?) }`.

### Step B — Detect collisions

- Duplicate ids → **hard error** (Moment 1 halt).
- Duplicate intent text across different ids → **warning flag** (Moment 2); keep first id.

### Step C — Re-anchor orphans

For each placeholder line that matches the grammar except `id:` is missing or invalid:

1. Require a valid `intent:` field.
2. Mint a new id: slugify first 4 words of intent + `-` + 4-char hash of full intent (deterministic).
3. Log the remint in structuring diagnostics.

### Step D — Match prose backtick references

Scan prose for `` `local-id` `` patterns. If id not in `P` but exactly one placeholder intent contains the referenced concept (Levenshtein ≤ 3 on slugified intent, or shared rare token), suggest relink — **flag for human review**, do not auto-merge silently.

### Step E — Unmatched placeholders

Placeholder with empty intent → **hard error**. Placeholder with intent but unresolvable kind at structuring → degrade to `prose` block + `degradedBlock` flag (GENERATION_PIPELINE §4).

---

## 4. `toPlaceholder` derivation rules (per block type)

Down-conversion is **deterministic, no LLM**. Implement in `src/generation/placeholder.ts`.

| Block type | Intent derived from |
|------------|---------------------|
| `chart` | `title` + `chartType` + series names + optional `axes.xTitle`/`yTitle` + optional `takeaway` |
| `table` | caption (if any) + column headers |
| `kpi-cards` | each card `label: value` joined |
| `timeline` | phase labels (+ optional phase subtitles) |
| `roadmap` | lane labels + item/phase labels |
| `callout` | variant + optional title + plain text from `body` fragment |
| `prose` | *No placeholder* — markdown paragraph(s) |
| `bullet-list` / `numbered-list` | *No placeholder* — native markdown lists |
| `heading` | *No placeholder* — markdown headings |
| `image` | alt text + caption |
| `diagram` | optional `title` + optional `caption` |
| `team` | member names |
| `risk-matrix` | axis labels |
| `divider` | *No placeholder* — `---` horizontal rule |

> **No-title blocks (design note).** `timeline`, `roadmap`, `team`, and
> `risk-matrix` have **no title field** in their schemas — by design, their
> heading is a separate adjacent `heading` block, not an in-block field. Earlier
> revisions of this table derived intent from a non-existent `title`/`section
> title`; the rows above are corrected to derive only from fields these blocks
> actually expose (`src/blocks/<type>/schema.ts`). `diagram` derives from
> `title` + `caption` (the schema has no `description`). `toPlaceholder` reads
> these **current** fields only — never `sourceIntent`.

**Callout example:** variant `warning`, title "Risk", body "Supply chain exposure in Q3" →

```
[[block: callout | intent: "Warning callout: Risk — Supply chain exposure in Q3" | id: q3-supply-risk]]
```

**Chart example:**

```
[[block: chart | intent: "Revenue trend (bar): FY22–FY25 series Revenue €M — takeaway: growth accelerated in FY25" | id: revenue-trend]]
```

---

## 5. Import-time contract lint (pre-structuring)

Run on markdown entering Pass 2 (including externally refined drafts):

| Check | Severity |
|-------|----------|
| Placeholder regex parseable | Error |
| Unique `local-id` | Error |
| `intent` non-empty | Error |
| Standalone paragraph placement | Error |
| Placeholder inside code fence | Error |
| Unknown `kind-hint` (not in catalogue) | Warning — treat as empty hint |
| Count placeholders vs expected outline slots | Warning |

Return `{ ok: boolean, errors: LintMessage[], warnings: LintMessage[] }`.

---

## 6. Test invariants

1. **Parse round-trip:** `format(parse(p)) === normalize(p)` for normalized placeholder strings.
2. **Structure stub round-trip (per block):** `toPlaceholder(structure(placeholder)) ≈ placeholder` — semantic equality on intent (normalized whitespace) and same id/kind.
3. **Golden fixtures:** `tests/generation/fixtures/placeholders/*.md` for valid/invalid external-refinement samples.

---

## 7. Writer skill instructions (one-liner)

> Keep every `[[block: … | intent: "…" | id: …]]` marker intact on its own line; edit the prose freely.

---

## 8. Open items

1. Slugify/hash algorithm for reminted ids — finalize in T-191 implementation.
2. Whether `sourceIntent` (write-once original writer intent) is persisted on blocks — optional per GENERATION_PIPELINE §2; schema in T-192.
