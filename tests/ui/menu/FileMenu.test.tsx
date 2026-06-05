import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../../src/App";
import { serializeDocModel } from "../../../src/docmodel/serialize";
import type { BootStrategy } from "../../../src/ui/router/boot";
import type { DocModel } from "../../../src/schema/docmodel";

const welcomeBootStrategy: BootStrategy = {
  bootRoute: () => Promise.resolve({ kind: "welcome" }),
};

const doc: Extract<DocModel, { kind: "document" }> = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "File menu test",
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
          text: "Menu heading",
          numbered: false,
        },
      ],
    },
  ],
  comments: [],
};

describe("FileMenu", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens a YAML document via dialog path and read_yaml_file", async () => {
    const readYamlFile = vi.fn(() => Promise.resolve(serializeDocModel(doc)));

    render(
      <App
        bootStrategy={welcomeBootStrategy}
        fileActions={{
          selectOpenPath: () => Promise.resolve("/Users/me/Documents/menu.yaml"),
          readYamlFile,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document shell")).toBeTruthy();
    });
    expect(readYamlFile).toHaveBeenCalledWith("/Users/me/Documents/menu.yaml");
  });

  it("saves the active document to its current path", async () => {
    const writeYamlFile = vi.fn(() => Promise.resolve());
    render(
      <App
        initialDocument={{ path: "/Users/me/Documents/menu.yaml", doc }}
        fileActions={{ writeYamlFile }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));

    await waitFor(() => {
      expect(writeYamlFile).toHaveBeenCalledWith(
        "/Users/me/Documents/menu.yaml",
        expect.stringContaining("Menu heading"),
      );
      expect(screen.getByRole("status").textContent).toBe("Saved.");
    });
  });

  it("save-as writes to the chosen path and switches the active path", async () => {
    const writeYamlFile = vi.fn(() => Promise.resolve());
    render(
      <App
        initialDocument={{ path: "/Users/me/Documents/menu.yaml", doc }}
        fileActions={{
          writeYamlFile,
          selectSavePath: () => Promise.resolve("/Users/me/Documents/menu-copy.yaml"),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Save As" }));

    await waitFor(() => {
      expect(writeYamlFile).toHaveBeenCalledWith(
        "/Users/me/Documents/menu-copy.yaml",
        expect.stringContaining("Menu heading"),
      );
    });
    // findAllByText retries: the header re-render that swaps in the new
    // filename is a separate state update from the writeYamlFile call gated
    // above, so a synchronous getAllByText here races it under CI load.
    expect((await screen.findAllByText("menu-copy.yaml")).length).toBeGreaterThan(0);
  });

  it("save-as warns when saving outside the configured library folder", async () => {
    const writeYamlFile = vi.fn(() => Promise.resolve());
    render(
      <App
        initialDocument={{ path: "/Users/me/Library/menu.yaml", doc }}
        fileActions={{
          libraryRoot: "/Users/me/Library/",
          writeYamlFile,
          selectSavePath: () => Promise.resolve("/Users/me/Desktop/menu-copy.yaml"),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Save As" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain(
        "outside your library folder",
      );
    });
  });

  it("exports PDF through HTML render, export_pdf IPC, and shell.open", async () => {
    const exportPdf = vi.fn(() =>
      Promise.resolve({
        kind: "browser_handoff" as const,
        path: "/tmp/docsystem-export/id/menu.html",
      }),
    );
    const openPath = vi.fn(() => Promise.resolve());
    const renderHtmlForExport = vi.fn(() => Promise.resolve("<!doctype html>"));
    render(
      <App
        initialDocument={{ path: "/Users/me/Documents/menu.yaml", doc }}
        fileActions={{ exportPdf, openPath, renderHtmlForExport }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Export PDF" }));

    await waitFor(() => {
      expect(exportPdf).toHaveBeenCalledWith({
        html: "<!doctype html>",
        suggestedName: "menu.pdf",
      });
    });
    expect(openPath).toHaveBeenCalledWith("/tmp/docsystem-export/id/menu.html");
    expect(screen.getByRole("status").textContent).toContain("Opened in your browser");
  });

  it("Import block… calls importAuthoredBlock with the chosen path and shows success", async () => {
    const importAuthoredBlock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        installedPath: "/cloud/generated-blocks/active/my-block.tsx",
        violations: [],
      }),
    );
    render(
      <App
        bootStrategy={welcomeBootStrategy}
        fileActions={{
          // selectImportPath is the injectable for the .tsx file picker dialog
          selectImportPath: () => Promise.resolve("/cloud/blocks/my-block.tsx"),
          importAuthoredBlock,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Import block…" }));

    await waitFor(() => {
      expect(importAuthoredBlock).toHaveBeenCalledWith("/cloud/blocks/my-block.tsx");
    });
    expect(screen.getByRole("status").textContent).toContain("Block installed");
  });

  it("Import block… shows error message when lint fails", async () => {
    const importAuthoredBlock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        installedPath: "/cloud/generated-blocks/quarantine/bad-block.tsx",
        violations: [
          { rule: "A002-no-extra-imports", message: "import from 'react' is not on the Authored allow-list", line: 10, column: 0 },
        ],
      }),
    );
    render(
      <App
        bootStrategy={welcomeBootStrategy}
        fileActions={{
          selectImportPath: () => Promise.resolve("/cloud/blocks/bad-block.tsx"),
          importAuthoredBlock,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Import block…" }));

    await waitFor(() => {
      expect(importAuthoredBlock).toHaveBeenCalledWith("/cloud/blocks/bad-block.tsx");
    });
    expect(screen.getByRole("alert").textContent).toContain("quarantined");
  });
});
