import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FC } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { serializeDocModel } from "../../src/docmodel/serialize";
import type { DocModel } from "../../src/schema/docmodel";
import type { DocumentViewProps } from "../../src/ui/views/DocumentView";

const doc: Extract<DocModel, { kind: "document" }> = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "Error boundary test",
    docKind: "proposal",
    tags: [],
    language: "en",
    status: "draft",
    archived: false,
    confidentialityLevel: "medium",
    owner: "owner@example.com",
    reviewers: [],
    createdAt: "2026-05-26T00:00:00Z",
    updatedAt: "2026-05-26T00:00:00Z",
    brandRef: "$brand:default",
  },
  sections: [
    {
      id: "section-1",
      title: "Overview",
      blocks: [
        {
          id: "heading-1",
          type: "heading",
          level: 1,
          text: "Boundary heading",
          numbered: false,
        },
      ],
    },
  ],
  comments: [],
};

const ThrowingDocumentView: FC<DocumentViewProps> = () => {
  throw new Error("boom");
};

const SlowDocumentView: FC<DocumentViewProps> = () => {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 75) {
    // Burn enough time to exceed the per-block budget, but stay inside the document mount budget.
  }
  return <div>Slow document view</div>;
};

describe("AppErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the recovery panel when the document view throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <App
        initialDocument={{ path: "/Users/me/Documents/broken.yaml", doc }}
        DocumentViewComponent={ThrowingDocumentView}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain(
      "Document failed to render",
    );
    expect(screen.getByRole("button", { name: "Try reopen" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Back to welcome screen" }),
    ).toBeTruthy();
  });

  it("reopens the current path from the recovery panel", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const readDocumentFile = vi.fn(() => Promise.resolve(serializeDocModel(doc)));
    render(
      <App
        initialDocument={{ path: "/Users/me/Documents/broken.yaml", doc }}
        DocumentViewComponent={ThrowingDocumentView}
        fileActions={{ readDocumentFile }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try reopen" }));

    await waitFor(() => {
      expect(readDocumentFile).toHaveBeenCalledWith(
        "/Users/me/Documents/broken.yaml",
      );
    });
  });

  it("returns to the welcome state from the recovery panel", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <App
        initialDocument={{ path: "/Users/me/Documents/broken.yaml", doc }}
        DocumentViewComponent={ThrowingDocumentView}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Back to welcome screen" }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Welcome")).toBeTruthy();
    });
  });

  it("does not apply the per-block budget to the whole document view", () => {
    render(
      <App
        initialDocument={{ path: "/Users/me/Documents/slow.yaml", doc }}
        DocumentViewComponent={SlowDocumentView}
      />,
    );

    expect(screen.getByText("Slow document view")).toBeTruthy();
    expect(
      screen.queryByText("This block exceeded the render time budget."),
    ).toBeNull();
  });

  it("shows the watchdog placeholder when document rendering exceeds budget", async () => {
    render(
      <App
        initialDocument={{ path: "/Users/me/Documents/slow.yaml", doc }}
        DocumentViewComponent={SlowDocumentView}
        documentWatchdogBudgetMs={1}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("This block exceeded the render time budget."),
      ).toBeTruthy();
    });
  });
});
