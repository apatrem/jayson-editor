/**
 * Tests for the AuthoringPanel component (T-172, ADR-0011).
 *
 * Covers:
 *   - Basic structure: description, slug, displayName fields, preview pane.
 *   - Slug-to-displayName auto-sync (stops auto-syncing once user edits displayName).
 *   - Generate button: disabled without description, calls onGenerate when enabled.
 *   - Cancel / Close buttons call onClose.
 *   - Preview pane: shows placeholder when no previewNode; shows content when provided.
 *   - Preview watchdog: catches render errors (simulated via a throwing component).
 *   - Generating state: button shows "Generating…" and is disabled.
 *   - DocumentView opens AuthoringPanel when the Create button is clicked.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthoringPanel } from "../../../src/ui/authoring/AuthoringPanel";
import {
  DocumentView,
  type EditorSurfaceProps,
} from "../../../src/ui/views/DocumentView";
import type { DocumentModel } from "../../../src/renderer/DocumentRenderer";
import { BrandProvider } from "../../../src/brand-tokens/BrandProvider";
import { defaultBrand } from "../../../src/brand/defaultBrand";
import type { FC } from "react";

afterEach(() => {
  cleanup();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const minDoc: DocumentModel = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "Test",
    docKind: "proposal",
    tags: [],
    language: "en",
    status: "draft",
    archived: false,
    confidentialityLevel: "medium",
    owner: "owner@example.com",
    reviewers: [],
    createdAt: "2026-05-27T00:00:00Z",
    updatedAt: "2026-05-27T00:00:00Z",
    brandRef: "$brand:default",
  },
  sections: [
    {
      id: "s1",
      title: "Intro",
      blocks: [
        { id: "b1", type: "heading", level: 1, text: "Hello", numbered: false },
      ],
    },
  ],
  comments: [],
};

/** Minimal editor stub for DocumentView integration tests. */
const FakeEditor: FC<EditorSurfaceProps> = ({ onAddBlock }) => (
  <div>
    editor
    <button type="button" aria-label="Insert block" onClick={() => onAddBlock?.()}>
      + Add block
    </button>
  </div>
);

// ─── AuthoringPanel unit tests ─────────────────────────────────────────────────

describe("AuthoringPanel", () => {
  describe("structure", () => {
    it("renders the panel with the dialog role and accessible label", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} />);
      expect(screen.getByRole("dialog", { name: /create new authored block/i })).toBeTruthy();
    });

    it("renders description textarea", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} />);
      expect(screen.getByLabelText(/describe the block/i)).toBeTruthy();
    });

    it("renders slug input", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} />);
      expect(screen.getByLabelText(/slug/i)).toBeTruthy();
    });

    it("renders display name input", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} />);
      expect(screen.getByLabelText(/display name/i)).toBeTruthy();
    });

    it("renders the preview pane region", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} />);
      expect(screen.getByLabelText(/block preview/i)).toBeTruthy();
    });
  });

  describe("slug → displayName auto-sync", () => {
    it("auto-populates displayName from slug (title-case)", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/slug/i), {
        target: { value: "competitive-matrix" },
      });
      // The displayName input should now show the title-cased value.
      expect(screen.getByDisplayValue("Competitive Matrix")).toBeTruthy();
    });

    it("stops auto-syncing displayName once user manually edits it", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/display name/i), {
        target: { value: "My Custom Name" },
      });
      fireEvent.change(screen.getByLabelText(/slug/i), {
        target: { value: "competitive-matrix" },
      });
      // displayName should remain the user-edited value.
      expect(screen.getByDisplayValue("My Custom Name")).toBeTruthy();
    });
  });

  describe("Generate button", () => {
    it("is disabled when description is empty", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} onGenerate={vi.fn()} />);
      const btn = screen.getByRole("button", { name: /^generate$/i });
      expect(btn.hasAttribute("disabled")).toBe(true);
    });

    it("is enabled once description has content", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} onGenerate={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/describe the block/i), {
        target: { value: "A competitive landscape matrix" },
      });
      const btn = screen.getByRole("button", { name: /^generate$/i });
      expect(btn.hasAttribute("disabled")).toBe(false);
    });

    it("calls onGenerate with description, slug, and displayName", () => {
      const onGenerate = vi.fn();
      render(
        <AuthoringPanel docContext={minDoc} onClose={vi.fn()} onGenerate={onGenerate} />,
      );
      fireEvent.change(screen.getByLabelText(/describe the block/i), {
        target: { value: "A competitive landscape matrix" },
      });
      fireEvent.change(screen.getByLabelText(/slug/i), {
        target: { value: "competitive-matrix" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^generate$/i }));
      expect(onGenerate).toHaveBeenCalledWith({
        description: "A competitive landscape matrix",
        slug: "competitive-matrix",
        displayName: "Competitive Matrix",
      });
    });
  });

  describe("Cancel / Close", () => {
    it("clicking Cancel calls onClose", () => {
      const onClose = vi.fn();
      render(<AuthoringPanel docContext={minDoc} onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("clicking the ✕ close button calls onClose", () => {
      const onClose = vi.fn();
      render(<AuthoringPanel docContext={minDoc} onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: /close authoring panel/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("preview pane", () => {
    it("shows a placeholder when no previewNode is supplied", () => {
      render(<AuthoringPanel docContext={minDoc} onClose={vi.fn()} />);
      expect(
        screen.getByText(/describe a block and click generate/i),
      ).toBeTruthy();
    });

    it("shows the provided previewNode", () => {
      render(
        <AuthoringPanel
          docContext={minDoc}
          onClose={vi.fn()}
          previewNode={<p>preview content here</p>}
        />,
      );
      expect(screen.getByText("preview content here")).toBeTruthy();
    });

    it("shows 'Generating…' placeholder while generating prop is true", () => {
      render(
        <AuthoringPanel docContext={minDoc} onClose={vi.fn()} generating={true} />,
      );
      // Use selector:"p" to find the preview placeholder <p>, not the button.
      expect(screen.getByText("Generating…", { selector: "p" })).toBeTruthy();
    });

    it("watchdog catches a preview node that throws during render", () => {
      const ThrowingComponent = (): never => {
        throw new Error("render crash");
      };
      // Suppress React's error boundary console noise for this test.
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      // RenderFailedPlaceholder uses useBrandTokens() so a BrandProvider is required.
      render(
        <BrandProvider tokens={defaultBrand}>
          <AuthoringPanel
            docContext={minDoc}
            onClose={vi.fn()}
            previewNode={<ThrowingComponent />}
          />
        </BrandProvider>,
      );
      // The panel itself is still visible — the error was caught by the watchdog,
      // not propagated to the AuthoringPanel boundary.
      expect(
        screen.getByRole("dialog", { name: /create new authored block/i }),
      ).toBeTruthy();
      // The watchdog shows a RenderFailedPlaceholder (role="alert") in the preview pane.
      expect(screen.getByRole("alert")).toBeTruthy();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("Generating state", () => {
    it("disables the Generate button while generating is true", () => {
      render(
        <AuthoringPanel
          docContext={minDoc}
          onClose={vi.fn()}
          onGenerate={vi.fn()}
          generating={true}
        />,
      );
      // Fill description so we know the disable is from generating, not empty description.
      fireEvent.change(screen.getByLabelText(/describe the block/i), {
        target: { value: "Something" },
      });
      const btn = screen.getByRole("button", { name: /generating…/i });
      expect(btn.hasAttribute("disabled")).toBe(true);
    });
  });

  describe("LLM availability (ADR-0019)", () => {
    it("disables Generate and shows a finish-setup hint when llmAvailable is false", () => {
      render(
        <AuthoringPanel
          docContext={minDoc}
          onClose={vi.fn()}
          onGenerate={vi.fn()}
          llmAvailable={false}
        />,
      );
      // Even with a description, Generate stays disabled when LLM isn't set up.
      fireEvent.change(screen.getByLabelText(/describe the block/i), {
        target: { value: "A competitive landscape matrix" },
      });
      const btn = screen.getByRole("button", { name: /^generate$/i });
      expect(btn.hasAttribute("disabled")).toBe(true);
      expect(btn.getAttribute("title")).toMatch(/finish llm setup/i);
      expect(screen.getByText(/finish llm setup to enable/i)).toBeTruthy();
    });

    it("shows no hint and allows Generate when llmAvailable is true", () => {
      render(
        <AuthoringPanel
          docContext={minDoc}
          onClose={vi.fn()}
          onGenerate={vi.fn()}
          llmAvailable={true}
        />,
      );
      fireEvent.change(screen.getByLabelText(/describe the block/i), {
        target: { value: "A competitive landscape matrix" },
      });
      expect(screen.queryByText(/finish llm setup to enable/i)).toBeNull();
      expect(
        screen.getByRole("button", { name: /^generate$/i }).hasAttribute("disabled"),
      ).toBe(false);
    });
  });
});

// ─── DocumentView integration ─────────────────────────────────────────────────

describe("DocumentView — opens AuthoringPanel on Create", () => {
  it("renders the AuthoringPanel after clicking Create new Authored block", () => {
    render(
      <DocumentView
        path="/doc.yaml"
        initialDoc={minDoc}
        EditorComponent={FakeEditor}
      />,
    );
    // Open the block palette first.
    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));
    // Click the Create new Authored block trigger.
    fireEvent.click(
      screen.getByRole("button", { name: /create new authored block/i }),
    );
    // The AuthoringPanel should now be visible.
    expect(
      screen.getByRole("dialog", { name: /create new authored block/i }),
    ).toBeTruthy();
  });

  it("closes the AuthoringPanel when Cancel is clicked", () => {
    render(
      <DocumentView
        path="/doc.yaml"
        initialDoc={minDoc}
        EditorComponent={FakeEditor}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));
    fireEvent.click(
      screen.getByRole("button", { name: /create new authored block/i }),
    );
    expect(
      screen.getByRole("dialog", { name: /create new authored block/i }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(
      screen.queryByRole("dialog", { name: /create new authored block/i }),
    ).toBeNull();
  });

  it("enables Generate (no finish-setup hint) when a callLlm is supplied", () => {
    render(
      <DocumentView
        path="/doc.yaml"
        initialDoc={minDoc}
        EditorComponent={FakeEditor}
        callLlm={() => Promise.resolve({ content: "// block", raw: {} })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));
    fireEvent.click(
      screen.getByRole("button", { name: /create new authored block/i }),
    );
    fireEvent.change(screen.getByLabelText(/describe the block/i), {
      target: { value: "A competitive landscape matrix" },
    });
    expect(screen.queryByText(/finish llm setup to enable/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /^generate$/i }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("disables Generate with a finish-setup hint when no callLlm is supplied", () => {
    render(
      <DocumentView path="/doc.yaml" initialDoc={minDoc} EditorComponent={FakeEditor} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));
    fireEvent.click(
      screen.getByRole("button", { name: /create new authored block/i }),
    );
    fireEvent.change(screen.getByLabelText(/describe the block/i), {
      target: { value: "A competitive landscape matrix" },
    });
    expect(screen.getByText(/finish llm setup to enable/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /^generate$/i }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
