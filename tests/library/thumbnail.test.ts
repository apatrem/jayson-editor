import { describe, expect, it } from "vitest";
import {
  THUMBNAIL_FILENAME,
  shouldRegenerateThumbnail,
  thumbnailPath,
  thumbnailUri,
} from "../../src/library/thumbnail";
import type { LibraryEntry } from "../../src/library/filter";

const ENTRY: LibraryEntry = {
  path: "/library/acme-q1",
  jsonFilename: "doc.yaml",
  meta: {
    client: "Acme",
    project: "Q1",
    docKind: "proposal",
    tags: [],
    language: "en",
    status: "draft",
    archived: false,
    confidentialityLevel: "medium",
    owner: "me@example.com",
    reviewers: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    brandRef: "$brand:default",
  },
  thumbnailUri: null,
  fileSize: 1024,
  fileMtime: 1_000_000,
  hasAssetIssues: false,
  hasUnsavedComments: false,
};

describe("thumbnailPath", () => {
  it("joins entry.path with the canonical thumbnail filename", () => {
    expect(thumbnailPath(ENTRY)).toBe(`/library/acme-q1/${THUMBNAIL_FILENAME}`);
  });

  it("only requires the path field (Pick contract)", () => {
    // Compile-time assurance via the Pick<LibraryEntry, "path"> signature —
    // this test exercises the run-time behavior with a minimal shape.
    expect(thumbnailPath({ path: "/r" })).toBe(`/r/${THUMBNAIL_FILENAME}`);
  });
});

describe("thumbnailUri", () => {
  it("returns the stored thumbnailUri when present", () => {
    const entry: LibraryEntry = { ...ENTRY, thumbnailUri: "tauri://thumb/abc.png" };
    expect(thumbnailUri(entry)).toBe("tauri://thumb/abc.png");
  });

  it("falls back to thumbnailPath when thumbnailUri is null", () => {
    expect(thumbnailUri(ENTRY)).toBe(`/library/acme-q1/${THUMBNAIL_FILENAME}`);
  });
});

describe("shouldRegenerateThumbnail", () => {
  it("regenerates when thumbnailUri is null (never generated)", () => {
    expect(
      shouldRegenerateThumbnail({ thumbnailUri: null, fileMtime: 100 }, 200),
    ).toBe(true);
  });

  it("regenerates when cachedMtimeMs is null (no cache)", () => {
    expect(
      shouldRegenerateThumbnail(
        { thumbnailUri: "tauri://thumb/x.png", fileMtime: 100 },
        null,
      ),
    ).toBe(true);
  });

  it("regenerates when cachedMtimeMs is older than fileMtime (stale)", () => {
    expect(
      shouldRegenerateThumbnail(
        { thumbnailUri: "tauri://thumb/x.png", fileMtime: 200 },
        100,
      ),
    ).toBe(true);
  });

  it("skips regeneration when cachedMtimeMs equals fileMtime (current)", () => {
    expect(
      shouldRegenerateThumbnail(
        { thumbnailUri: "tauri://thumb/x.png", fileMtime: 100 },
        100,
      ),
    ).toBe(false);
  });

  it("skips regeneration when cachedMtimeMs is newer than fileMtime", () => {
    expect(
      shouldRegenerateThumbnail(
        { thumbnailUri: "tauri://thumb/x.png", fileMtime: 100 },
        200,
      ),
    ).toBe(false);
  });
});
