import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { LibraryView } from "../../../src/ui/library/LibraryView";

const CLOUD_ROOT = "/Users/me/Documents";

const sampleEntry = {
  name: "proposal.json",
  path: `${CLOUD_ROOT}/Acme/proposal.json`,
  is_dir: false,
};

const acmeDir = {
  name: "Acme",
  path: `${CLOUD_ROOT}/Acme`,
  is_dir: true,
};

const minimalMeta = JSON.stringify({
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme Corp",
    project: "Cloud Migration",
    docKind: "proposal",
    tags: [],
    language: "en",
    status: "draft",
    archived: false,
    confidentialityLevel: "medium",
    owner: "test@example.com",
    reviewers: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    brandRef: "$brand:default",
  },
  sections: [{ id: "s1", title: "Overview", blocks: [] }],
});

function makeOnOpenDoc() {
  return vi.fn((_path: string) => Promise.resolve());
}

function makeBaseDeps(overrides: Record<string, unknown> = {}) {
  return {
    readAppConfig: vi.fn(() =>
      Promise.resolve({ paths: { cloudSyncRoot: CLOUD_ROOT } }),
    ),
    listDirectory: vi.fn((path: string) => {
      if (path === CLOUD_ROOT) return Promise.resolve([acmeDir]);
      if (path === acmeDir.path) return Promise.resolve([sampleEntry]);
      return Promise.resolve([]);
    }),
    readDocumentFile: vi.fn(() => Promise.resolve(minimalMeta)),
    writeDocumentFile: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LibraryView — folder scan", () => {
  it("renders a card for each scanned doc", async () => {
    const deps = makeBaseDeps();
    render(
      createElement(LibraryView, {
        onOpenDoc: makeOnOpenDoc(),
        deps,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });
    expect(deps.readAppConfig).toHaveBeenCalled();
    expect(deps.listDirectory).toHaveBeenCalledWith(CLOUD_ROOT);
    expect(deps.readDocumentFile).toHaveBeenCalledWith(sampleEntry.path);
  });

  it("clicking a card calls onOpenDoc with the json path", async () => {
    const onOpenDoc = makeOnOpenDoc();
    const deps = makeBaseDeps();
    render(
      createElement(LibraryView, {
        onOpenDoc,
        deps,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Acme Corp/u }));

    await waitFor(() => {
      expect(onOpenDoc).toHaveBeenCalledWith(
        `${CLOUD_ROOT}/Acme/proposal.json`,
      );
    });
  });
});

describe("LibraryView — empty state", () => {
  it("shows empty state when no docs found", async () => {
    const deps = makeBaseDeps({
      listDirectory: vi.fn(() => Promise.resolve([])),
    });
    render(
      createElement(LibraryView, {
        onOpenDoc: makeOnOpenDoc(),
        deps,
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Empty library")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Use Sample Document" })).toBeTruthy();
  });

  it("Use Sample writes sample json then re-scans and shows card", async () => {
    let callCount = 0;
    const deps = makeBaseDeps({
      listDirectory: vi.fn((path: string) => {
        callCount++;
        if (callCount <= 1) return Promise.resolve([]);
        if (path === CLOUD_ROOT)
          return Promise.resolve([
            {
              name: "Sample Proposal.json",
              path: `${CLOUD_ROOT}/Sample Proposal.json`,
              is_dir: false,
            },
          ]);
        return Promise.resolve([]);
      }),
    });
    render(
      createElement(LibraryView, {
        onOpenDoc: makeOnOpenDoc(),
        deps,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Use Sample Document" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Use Sample Document" }));

    await waitFor(() => {
      expect(deps.writeDocumentFile).toHaveBeenCalledWith(
        `${CLOUD_ROOT}/Sample Proposal.json`,
        expect.stringContaining('"kind": "document"'),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });
  });
});
