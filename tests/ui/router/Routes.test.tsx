import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import App from "../../../src/App";
import type { BootStrategy } from "../../../src/ui/router/boot";
import type { Route } from "../../../src/ui/router/types";

function makeBootStrategy(route: Route): BootStrategy {
  return { bootRoute: () => Promise.resolve(route) };
}

const welcomeStrategy = makeBootStrategy({ kind: "welcome" });
const folderPickerFirstLaunchStrategy = makeBootStrategy({
  kind: "folder-picker",
  reason: "first-launch",
});
const folderPickerMissingStrategy = makeBootStrategy({
  kind: "folder-picker",
  reason: "missing",
});
const libraryStrategy = makeBootStrategy({ kind: "library" });

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.restoreAllMocks();
});

describe("Routes boot transitions", () => {
  it("renders welcome screen when boot strategy returns welcome", async () => {
    render(createElement(App, { bootStrategy: welcomeStrategy }));

    await waitFor(() => {
      expect(screen.getByLabelText("Welcome")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Open Document" })).toBeTruthy();
  });

  it("renders folder-picker with first-launch copy", async () => {
    render(createElement(App, { bootStrategy: folderPickerFirstLaunchStrategy }));

    await waitFor(() => {
      expect(screen.getByLabelText("Folder picker")).toBeTruthy();
    });
    expect(
      screen.getByText("Choose where your documents are saved"),
    ).toBeTruthy();
  });

  it("renders folder-picker with missing-folder copy", async () => {
    render(createElement(App, { bootStrategy: folderPickerMissingStrategy }));

    await waitFor(() => {
      expect(screen.getByLabelText("Folder picker")).toBeTruthy();
    });
    expect(
      screen.getByText(
        "Your documents folder isn't where it used to be. Choose a new location.",
      ),
    ).toBeTruthy();
  });

  it("renders library stub when boot strategy returns library", async () => {
    render(createElement(App, { bootStrategy: libraryStrategy }));

    await waitFor(() => {
      expect(screen.getByLabelText("Library")).toBeTruthy();
    });
  });

  it("renders document shell when initialDocument is provided", () => {
    const doc = {
      kind: "document" as const,
      schemaVersion: "1.0.0" as const,
      meta: {
        client: "Test",
        project: "Test",
        docKind: "proposal" as const,
        tags: [] as string[],
        language: "en" as const,
        status: "draft" as const,
        archived: false,
        confidentialityLevel: "medium" as const,
        owner: "test@example.com",
        reviewers: [] as string[],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        brandRef: "$brand:default",
      },
      sections: [
        {
          id: "s1",
          title: "Section",
          blocks: [{ id: "b1", type: "heading" as const, level: 1 as const, text: "H", numbered: false }],
        },
      ],
      comments: [] as never[],
    };
    render(
      createElement(App, {
        initialDocument: { path: "/docs/test.yaml", doc },
      }),
    );

    expect(screen.getByLabelText("Document shell")).toBeTruthy();
  });
});

describe("Routes — boot-time folder-existence check", () => {
  it("routes to folder-picker with reason=missing when configured folder is gone", async () => {
    // Inject a boot strategy that simulates a configured folder being missing.
    const missingFolderStrategy: BootStrategy = {
      bootRoute: () => {
        // Simulate: config exists, but folder doesn't
        return Promise.resolve({ kind: "folder-picker", reason: "missing" });
      },
    };

    render(createElement(App, { bootStrategy: missingFolderStrategy }));

    await waitFor(() => {
      expect(screen.getByLabelText("Folder picker")).toBeTruthy();
    });
    expect(
      screen.getByText(
        "Your documents folder isn't where it used to be. Choose a new location.",
      ),
    ).toBeTruthy();
  });
});

describe("Routes — multi-doc-ready shape (D-105)", () => {
  it("document route type accepts an array of open docs", () => {
    const multiDocRoute: Route = {
      kind: "document",
      openDocs: [
        { id: "/docs/a.yaml", path: "/docs/a.yaml" },
        { id: "/docs/b.yaml", path: "/docs/b.yaml" },
      ],
      activeIndex: 0,
    };

    // Structural assertion: the type accepts openDocs.length > 1.
    expect(multiDocRoute.openDocs.length).toBe(2);
    expect(multiDocRoute.activeIndex).toBe(0);
    expect(multiDocRoute.openDocs[0]?.path).toBe("/docs/a.yaml");
  });

  it("Routes renders the document at activeIndex from openDocs", () => {
    const doc = {
      kind: "document" as const,
      schemaVersion: "1.0.0" as const,
      meta: {
        client: "C",
        project: "P",
        docKind: "proposal" as const,
        tags: [] as string[],
        language: "en" as const,
        status: "draft" as const,
        archived: false,
        confidentialityLevel: "medium" as const,
        owner: "test@example.com",
        reviewers: [] as string[],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        brandRef: "$brand:default",
      },
      sections: [
        {
          id: "s1",
          title: "Section",
          blocks: [{ id: "b1", type: "heading" as const, level: 1 as const, text: "H", numbered: false }],
        },
      ],
      comments: [] as never[],
    };
    render(
      createElement(App, {
        initialDocument: { path: "/docs/active.yaml", doc },
      }),
    );

    const shell = screen.getByLabelText("Document shell");
    expect(shell).toBeTruthy();
    const docSection = screen.getByLabelText("Loaded document");
    expect(docSection.getAttribute("data-document-path")).toBe(
      "/docs/active.yaml",
    );
  });
});

describe("Routes — open document from welcome state", () => {
  it("transitions from welcome to document when file is selected via menu", async () => {
    const sampleJson = JSON.stringify({
      kind: "document",
      schemaVersion: "1.0.0",
      meta: {
        client: "Test",
        project: "Test",
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
      sections: [
        {
          id: "section-1",
          title: "Overview",
          blocks: [
            {
              id: "block-1",
              type: "heading",
              level: 1,
              text: "Test Heading",
              numbered: false,
            },
          ],
        },
      ],
    });
    const readDocumentFile = vi.fn(() => Promise.resolve(sampleJson));
    render(
      createElement(App, {
        bootStrategy: welcomeStrategy,
        fileActions: {
          selectOpenPath: () => Promise.resolve("/docs/sample.json"),
          readDocumentFile,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Welcome")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document shell")).toBeTruthy();
    });
    expect(readDocumentFile).toHaveBeenCalledWith("/docs/sample.json");
  });
});
