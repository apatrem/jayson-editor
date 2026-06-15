import { describe, expect, it } from "vitest";
import type { LibraryEntry, LibraryFilterState } from "../../src/library/filter";
import {
  DEFAULT_LIBRARY_FILTER_STATE,
  applyFilters,
  applySort,
  toggleFilterValue,
} from "../../src/library/filter";
import type { Meta } from "../../src/schema/meta";

// ── Fixtures ──────────────────────────────────────────────────────────────

const CURRENT_USER = "me@example.com";

function makeMeta(overrides: Partial<Meta> = {}): Meta {
  return {
    client: "Acme Corp",
    project: "Q1 Strategy Review",
    docKind: "proposal",
    sector: "energy",
    tags: ["urgent", "strategy"],
    language: "en",
    status: "draft",
    archived: false,
    confidentialityLevel: "medium",
    owner: CURRENT_USER,
    reviewers: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    brandRef: "$brand:default",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  const meta = overrides.meta ?? makeMeta();
  return {
    path: `/docs/${meta.client.toLowerCase().replace(/\s+/g, "-")}`,
    jsonFilename: "document.yaml",
    meta,
    thumbnailUri: null,
    fileSize: 1024,
    fileMtime: Date.parse(meta.updatedAt),
    hasAssetIssues: false,
    hasUnsavedComments: false,
    ...overrides,
  };
}

function state(overrides: Partial<LibraryFilterState> = {}): LibraryFilterState {
  return { ...DEFAULT_LIBRARY_FILTER_STATE, ...overrides };
}

// ── DEFAULT_LIBRARY_FILTER_STATE ──────────────────────────────────────────

describe("DEFAULT_LIBRARY_FILTER_STATE", () => {
  it("seeds with sensible empty filters and 'me' ownership", () => {
    expect(DEFAULT_LIBRARY_FILTER_STATE).toEqual({
      search: "",
      status: null,
      docKind: null,
      sector: null,
      language: null,
      ownerMode: "me",
      showArchived: false,
      sort: "updated-desc",
      view: "grid",
    });
  });
});

// ── applyFilters: archived / null filters / search ────────────────────────

describe("applyFilters — archived handling", () => {
  it("excludes archived entries by default", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ archived: false, client: "Live" }) }),
      makeEntry({ meta: makeMeta({ archived: true, client: "Old" }) }),
    ];
    const result = applyFilters(entries, state(), CURRENT_USER);
    expect(result.map((e) => e.meta.client)).toEqual(["Live"]);
  });

  it("includes archived entries when showArchived is true", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ archived: false, client: "Live" }) }),
      makeEntry({ meta: makeMeta({ archived: true, client: "Old" }) }),
    ];
    const result = applyFilters(entries, state({ showArchived: true }), CURRENT_USER);
    expect(result.map((e) => e.meta.client).sort()).toEqual(["Live", "Old"]);
  });
});

describe("applyFilters — multi-select filters", () => {
  it("status null → includes all statuses", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ status: "draft" }) }),
      makeEntry({ meta: makeMeta({ status: "sent" }) }),
      makeEntry({ meta: makeMeta({ status: "won" }) }),
    ];
    expect(applyFilters(entries, state(), CURRENT_USER)).toHaveLength(3);
  });

  it("status filter matches only listed values", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ status: "draft", client: "A" }) }),
      makeEntry({ meta: makeMeta({ status: "sent", client: "B" }) }),
      makeEntry({ meta: makeMeta({ status: "won", client: "C" }) }),
    ];
    const result = applyFilters(
      entries,
      state({ status: ["draft", "won"] }),
      CURRENT_USER,
    );
    expect(result.map((e) => e.meta.client).sort()).toEqual(["A", "C"]);
  });

  it("docKind filter matches only listed kinds", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ docKind: "proposal", client: "A" }) }),
      makeEntry({ meta: makeMeta({ docKind: "report", client: "B" }) }),
    ];
    const result = applyFilters(
      entries,
      state({ docKind: ["proposal"] }),
      CURRENT_USER,
    );
    expect(result.map((e) => e.meta.client)).toEqual(["A"]);
  });

  it("sector filter excludes entries with undefined sector", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ sector: "energy", client: "A" }) }),
      makeEntry({ meta: makeMeta({ sector: undefined, client: "B" }) }),
    ];
    const result = applyFilters(
      entries,
      state({ sector: ["energy"] }),
      CURRENT_USER,
    );
    expect(result.map((e) => e.meta.client)).toEqual(["A"]);
  });

  it("language filter matches only listed languages", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ language: "en", client: "A" }) }),
      makeEntry({ meta: makeMeta({ language: "fr", client: "B" }) }),
    ];
    expect(
      applyFilters(entries, state({ language: ["fr"] }), CURRENT_USER).map(
        (e) => e.meta.client,
      ),
    ).toEqual(["B"]);
  });
});

describe("applyFilters — ownerMode", () => {
  it("'me' includes only entries owned by currentUserEmail", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ owner: CURRENT_USER, client: "Mine" }) }),
      makeEntry({ meta: makeMeta({ owner: "other@example.com", client: "Theirs" }) }),
    ];
    expect(
      applyFilters(entries, state(), CURRENT_USER).map((e) => e.meta.client),
    ).toEqual(["Mine"]);
  });

  it("'all' includes entries regardless of owner", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ owner: CURRENT_USER, client: "Mine" }) }),
      makeEntry({ meta: makeMeta({ owner: "other@example.com", client: "Theirs" }) }),
    ];
    expect(
      applyFilters(entries, state({ ownerMode: "all" }), CURRENT_USER).map(
        (e) => e.meta.client,
      ).sort(),
    ).toEqual(["Mine", "Theirs"]);
  });
});

describe("applyFilters — search", () => {
  it("empty search returns all entries (after other filters)", () => {
    const entries = [makeEntry(), makeEntry({ meta: makeMeta({ client: "B" }) })];
    expect(applyFilters(entries, state({ search: "" }), CURRENT_USER)).toHaveLength(2);
  });

  it("matches against client name (case-insensitive)", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ client: "Acme Corp" }) }),
      makeEntry({ meta: makeMeta({ client: "Beta Inc" }) }),
    ];
    const result = applyFilters(entries, state({ search: "ACME" }), CURRENT_USER);
    expect(result.map((e) => e.meta.client)).toEqual(["Acme Corp"]);
  });

  it("matches against project name", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ project: "Strategy Review" }) }),
      makeEntry({ meta: makeMeta({ project: "Audit Report", client: "B" }) }),
    ];
    const result = applyFilters(entries, state({ search: "audit" }), CURRENT_USER);
    expect(result.map((e) => e.meta.client)).toEqual(["B"]);
  });

  it("matches against any tag (case-insensitive)", () => {
    const entries = [
      makeEntry({ meta: makeMeta({ tags: ["URGENT", "fy26"], client: "A" }) }),
      makeEntry({ meta: makeMeta({ tags: ["low-priority"], client: "B" }) }),
    ];
    const result = applyFilters(entries, state({ search: "urgent" }), CURRENT_USER);
    expect(result.map((e) => e.meta.client)).toEqual(["A"]);
  });

  it("excludes entries with no match in client/project/tags", () => {
    const entries = [makeEntry({ meta: makeMeta({ client: "Acme", project: "Q1", tags: [] }) })];
    expect(
      applyFilters(entries, state({ search: "nope" }), CURRENT_USER),
    ).toEqual([]);
  });

  it("trims whitespace in the search query", () => {
    const entries = [makeEntry({ meta: makeMeta({ client: "Acme Corp" }) })];
    expect(
      applyFilters(entries, state({ search: "  acme  " }), CURRENT_USER),
    ).toHaveLength(1);
  });
});

// ── applySort ─────────────────────────────────────────────────────────────

describe("applySort", () => {
  const a = makeEntry({
    meta: makeMeta({
      client: "Alpha",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    }),
  });
  const b = makeEntry({
    meta: makeMeta({
      client: "Beta",
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    }),
  });
  const c = makeEntry({
    meta: makeMeta({
      client: "Charlie",
      createdAt: "2025-12-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    }),
  });

  it("updated-desc puts most recently updated first", () => {
    expect(applySort([a, b, c], "updated-desc").map((e) => e.meta.client)).toEqual([
      "Beta",
      "Charlie",
      "Alpha",
    ]);
  });

  it("updated-asc puts least recently updated first", () => {
    expect(applySort([a, b, c], "updated-asc").map((e) => e.meta.client)).toEqual([
      "Alpha",
      "Charlie",
      "Beta",
    ]);
  });

  it("client-asc sorts alphabetically by client name", () => {
    expect(applySort([c, a, b], "client-asc").map((e) => e.meta.client)).toEqual([
      "Alpha",
      "Beta",
      "Charlie",
    ]);
  });

  it("created-desc puts most recently created first", () => {
    expect(applySort([a, b, c], "created-desc").map((e) => e.meta.client)).toEqual([
      "Beta",
      "Alpha",
      "Charlie",
    ]);
  });

  it("does not mutate the input array", () => {
    const original = [a, b, c];
    const snapshot = [...original];
    applySort(original, "client-asc");
    expect(original).toEqual(snapshot);
  });
});

// ── toggleFilterValue ─────────────────────────────────────────────────────

describe("toggleFilterValue", () => {
  it("null + check returns new singleton array", () => {
    expect(toggleFilterValue(null, "draft", true)).toEqual(["draft"]);
  });

  it("null + uncheck stays null", () => {
    expect(toggleFilterValue(null, "draft", false)).toBeNull();
  });

  it("array + check (new value) appends", () => {
    expect(toggleFilterValue(["draft"], "sent", true)).toEqual(["draft", "sent"]);
  });

  it("array + check (existing value) is a no-op (returns same reference shape)", () => {
    const input = ["draft", "sent"];
    const result = toggleFilterValue(input, "draft", true);
    expect(result).toEqual(["draft", "sent"]);
  });

  it("array + uncheck (existing value) removes it", () => {
    expect(toggleFilterValue(["draft", "sent"], "draft", false)).toEqual(["sent"]);
  });

  it("array + uncheck (last remaining value) collapses to null", () => {
    expect(toggleFilterValue(["draft"], "draft", false)).toBeNull();
  });

  it("array + uncheck (value not present) is a no-op", () => {
    expect(toggleFilterValue(["draft"], "sent", false)).toEqual(["draft"]);
  });
});
