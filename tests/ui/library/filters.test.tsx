import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { LibraryView } from "../../../src/ui/library/LibraryView";

const CLOUD_ROOT = "/Users/me/Library";

const makeMeta = (overrides: Record<string, unknown> = {}) => ({
  client: "Acme Corp",
  project: "Q1 Strategy",
  docKind: "proposal",
  sector: "energy",
  tags: ["strategy"],
  language: "en",
  status: "draft",
  archived: false,
  confidentialityLevel: "medium",
  owner: "user@example.com",
  reviewers: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
  brandRef: "$brand:default",
  ...overrides,
});

function makeJson(meta: Record<string, unknown> = {}) {
  const m = { ...makeMeta(), ...meta };
  return JSON.stringify({
    kind: "document",
    schemaVersion: "1.0.0",
    meta: m,
    sections: [{ id: "s1", title: "Overview", blocks: [] }],
  });
}

const acmeJson = makeJson({ client: "Acme Corp", project: "Q1 Strategy", docKind: "proposal", status: "draft", language: "en", updatedAt: "2026-05-20T00:00:00Z" });
const betaJson = makeJson({ client: "Beta Energy", project: "Wind Farm", docKind: "report", status: "sent", language: "fr", updatedAt: "2026-03-01T00:00:00Z" });

function makeMultiDeps() {
  const acmeDir = { name: "Acme", path: `${CLOUD_ROOT}/Acme`, is_dir: true };
  const acmeFile = { name: "proposal.json", path: `${CLOUD_ROOT}/Acme/proposal.json`, is_dir: false };
  const betaDir = { name: "Beta", path: `${CLOUD_ROOT}/Beta`, is_dir: true };
  const betaFile = { name: "report.json", path: `${CLOUD_ROOT}/Beta/report.json`, is_dir: false };

  return {
    readAppConfig: vi.fn(() => Promise.resolve({ paths: { cloudSyncRoot: CLOUD_ROOT } })),
    listDirectory: vi.fn((path: string) => {
      if (path === CLOUD_ROOT) return Promise.resolve([acmeDir, betaDir]);
      if (path === acmeDir.path) return Promise.resolve([acmeFile]);
      if (path === betaDir.path) return Promise.resolve([betaFile]);
      return Promise.resolve([]);
    }),
    readDocumentFile: vi.fn((path: string) => {
      if (path.includes("Acme")) return Promise.resolve(acmeJson);
      if (path.includes("Beta")) return Promise.resolve(betaJson);
      return Promise.resolve(acmeJson);
    }),
    writeDocumentFile: vi.fn(() => Promise.resolve()),
  };
}

function makeOnOpenDoc() {
  return vi.fn((_path: string) => Promise.resolve());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LibraryView — filter controls", () => {
  it("shows all entries by default (ownerMode: all, no filters active)", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });
    expect(screen.getByText("Beta Energy")).toBeTruthy();
  });

  it("filter sidebar is rendered with status checkboxes", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByLabelText("Library filters")).toBeTruthy();
    });
    expect(screen.getByRole("checkbox", { name: /draft/iu })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /sent/iu })).toBeTruthy();
  });

  it("checking a status filter shows only matching entries", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
      expect(screen.getByText("Beta Energy")).toBeTruthy();
    });

    // Check "sent" status — only Beta should match
    fireEvent.click(screen.getByRole("checkbox", { name: /sent/iu }));

    await waitFor(() => {
      expect(screen.queryByText("Acme Corp")).toBeNull();
    });
    expect(screen.getByText("Beta Energy")).toBeTruthy();
  });

  it("checking a kind filter hides non-matching entries", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });

    // Check "report" kind — only Beta matches
    fireEvent.click(screen.getByRole("checkbox", { name: /report/iu }));

    await waitFor(() => {
      expect(screen.queryByText("Acme Corp")).toBeNull();
    });
    expect(screen.getByText("Beta Energy")).toBeTruthy();
  });
});

describe("LibraryView — search", () => {
  it("renders a search input", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByRole("searchbox")).toBeTruthy();
    });
  });

  it("typing in search filters entries by client name", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Beta" } });

    await waitFor(() => {
      expect(screen.queryByText("Acme Corp")).toBeNull();
    });
    expect(screen.getByText("Beta Energy")).toBeTruthy();
  });

  it("search by project name also works", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Wind Farm" } });

    await waitFor(() => {
      expect(screen.queryByText("Acme Corp")).toBeNull();
    });
    expect(screen.getByText("Beta Energy")).toBeTruthy();
  });
});

describe("LibraryView — sort controls", () => {
  it("renders a sort select with expected options", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });

    const select = screen.getByRole("combobox");
    expect(select).toBeTruthy();
    expect(screen.getByRole("option", { name: /updated \(newest\)/iu })).toBeTruthy();
    expect(screen.getByRole("option", { name: /updated \(oldest\)/iu })).toBeTruthy();
    expect(screen.getByRole("option", { name: /client a/iu })).toBeTruthy();
    expect(screen.getByRole("option", { name: /created/iu })).toBeTruthy();
  });

  it("changing sort to 'updated-asc' puts oldest-updated entry first", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "updated-asc" } });

    await waitFor(() => {
      const texts = screen.getAllByRole("article").map((el) => el.textContent ?? "");
      // Beta (2026-03-01) should be first; Acme (2026-05-20) second
      expect(texts[0]).toContain("Beta Energy");
      expect(texts[1]).toContain("Acme Corp");
    });
  });

  it("Grid/List view toggle buttons exist and switch view", async () => {
    const deps = makeMultiDeps();
    render(createElement(LibraryView, { onOpenDoc: makeOnOpenDoc(), deps }));

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });

    const gridBtn = screen.getByRole("button", { name: "Grid view" });
    const listBtn = screen.getByRole("button", { name: "List view" });
    expect(gridBtn).toBeTruthy();
    expect(listBtn).toBeTruthy();

    fireEvent.click(listBtn);
    expect(listBtn.getAttribute("aria-pressed")).toBe("true");
    expect(gridBtn.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("LibraryView — reset filters", () => {
  it("reset filters button appears when no entries match and restores all entries", async () => {
    const deps = makeMultiDeps();
    render(
      createElement(LibraryView, {
        onOpenDoc: makeOnOpenDoc(),
        currentUserEmail: "user@example.com",
        deps,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
    });

    // Search for something that matches nothing
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzznomatch" } });

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /reset filters/iu }).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /reset filters/iu })[0]!);

    await waitFor(() => {
      expect(screen.getByText("Acme Corp")).toBeTruthy();
      expect(screen.getByText("Beta Energy")).toBeTruthy();
    });
  });
});
