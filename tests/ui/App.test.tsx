import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { serializeDocModel } from "../../src/docmodel/serialize";
import type { BootStrategy } from "../../src/ui/router/boot";
import type { DocModel } from "../../src/schema/docmodel";

const welcomeBootStrategy: BootStrategy = {
  bootRoute: () => Promise.resolve({ kind: "welcome" }),
};

const doc: Extract<DocModel, { kind: "document" }> = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "App shell test",
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
          text: "Overview",
          numbered: false,
        },
      ],
    },
  ],
  comments: [],
};

describe("App shell", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the welcome state with an accessible Open Document button", () => {
    render(<App bootStrategy={welcomeBootStrategy} />);

    expect(screen.getByLabelText("Welcome")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Document" })).toBeTruthy();
  });

  it("switches to the document state after loading a document", async () => {
    const docYaml = serializeDocModel(doc);
    render(
      <App
        bootStrategy={welcomeBootStrategy}
        fileActions={{
          selectOpenPath: () => Promise.resolve("/Users/me/Documents/proposal.yaml"),
          readDocumentFile: vi.fn(() => Promise.resolve(docYaml)),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Document" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document shell")).toBeTruthy();
    });
    expect(screen.getAllByText("proposal.yaml").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Loaded document").getAttribute("data-document-kind")).toBe(
      "document",
    );
  });

  it("opens a multi-section document in the document editor", async () => {
    const multiSectionYaml = serializeDocModel({
      ...doc,
      sections: [
        doc.sections[0]!,
        {
          id: "section-2",
          title: "Second section",
          blocks: [
            {
              id: "heading-2",
              type: "heading",
              level: 2,
              text: "Second section",
              numbered: false,
            },
          ],
        },
      ],
    });

    render(
      <App
        bootStrategy={welcomeBootStrategy}
        fileActions={{
          selectOpenPath: () =>
            Promise.resolve("/Users/me/Documents/multi-section.yaml"),
          readDocumentFile: () => Promise.resolve(multiSectionYaml),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document view")).toBeTruthy();
      expect(screen.queryByText(/Multi-section documents aren't editable yet/u)).toBeNull();
    });
  });
});
