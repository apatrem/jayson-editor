import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_SYNC_ROOT,
  makeM8Harness,
  sampleProposalYaml,
  singleSectionYaml,
} from "./m8-harness";

describe("M8 happy path", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.restoreAllMocks();
  });

  it("(a)(b) first-launch folder picker → choose folder → routes to library", async () => {
    makeM8Harness({
      bootStrategy: {
        bootRoute: () =>
          Promise.resolve({ kind: "folder-picker", reason: "first-launch" }),
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Folder picker")).toBeTruthy();
    });
    expect(
      screen.getByText("Choose where your documents are saved"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Choose Folder…" }));

    // After selectFolder + writeAppConfig, dispatch back-to-library → Library renders
    await waitFor(() => {
      expect(screen.getByLabelText("Library")).toBeTruthy();
    });
  });

  it("(c)(d) library opens empty then shows a card after Use Sample", async () => {
    const harness = makeM8Harness();

    await waitFor(() => {
      expect(screen.getByLabelText("Library")).toBeTruthy();
    });

    // (c) empty state
    expect(screen.getByText("Use Sample Document")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use Sample Document" }));

    // (d) after writing, re-scan shows "Acme Industrial" card (from sample meta.client)
    await waitFor(() => {
      expect(screen.getByText("Acme Industrial")).toBeTruthy();
    });
    // writeYamlFile should have been called with the sample YAML
    expect(harness.writeYamlFile).toHaveBeenCalledWith(
      `${CLOUD_SYNC_ROOT}/Sample Proposal.yaml`,
      expect.stringContaining("kind: document"),
    );
  });

  it("(e) Create from Template writes YAML and navigates to DocumentView", async () => {
    const harness = makeM8Harness({
      // Start with sample already present so library shows loaded state
      initialFiles: [[`${CLOUD_SYNC_ROOT}/Sample Proposal.yaml`, sampleProposalYaml]],
    });

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial")).toBeTruthy();
    });

    // Open the Create from Template modal
    fireEvent.click(screen.getByRole("button", { name: "+ New from template" }));
    expect(screen.getByRole("dialog", { name: "Create from template" })).toBeTruthy();

    // Pick commercial proposal (first radio) and enter a name
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.change(screen.getByLabelText("Document name"), {
      target: { value: "Acme Q3 Proposal" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create document" }));

    await waitFor(() => {
      // Template was written to the filesystem
      expect(harness.files.has(`${CLOUD_SYNC_ROOT}/Acme Q3 Proposal.yaml`)).toBe(true);
    });

    // App navigated to DocumentView after onConfirm
    await waitFor(() => {
      expect(screen.getByLabelText("Document view")).toBeTruthy();
    });
  });

  it("(f) library pre-seeded with 2 documents shows 2 cards; clicking one opens DocumentView", async () => {
    // Docs must be in separate subdirectories so buildLibraryIndex creates one entry per dir
    makeM8Harness({
      initialFiles: [
        [`${CLOUD_SYNC_ROOT}/doc-a/Sample Proposal.yaml`, sampleProposalYaml],
        [`${CLOUD_SYNC_ROOT}/doc-b/Single Section.yaml`, singleSectionYaml],
      ],
    });

    await waitFor(() => {
      // Both cards visible (their meta.client is "Acme Industrial" in both fixtures)
      expect(screen.getAllByText("Acme Industrial").length).toBeGreaterThanOrEqual(2);
    });

    // The main DocCard button has no explicit aria-label; its accessible name
    // is derived from inner text (client + project). "Open as reviewer" etc. don't match.
    const cardButtons = screen.getAllByRole("button", { name: /Acme Industrial/u });
    expect(cardButtons.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(cardButtons[0]!);

    await waitFor(() => {
      expect(screen.getByLabelText("Document view")).toBeTruthy();
    });
  });

  it("(g) single-section document: edit → autosave preserves content", async () => {
    const harness = makeM8Harness({
      initialFiles: [
        [`${CLOUD_SYNC_ROOT}/Single Section.yaml`, singleSectionYaml],
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial")).toBeTruthy();
    });

    // Open the single-section doc via the main DocCard button (contains client name)
    fireEvent.click(screen.getByRole("button", { name: /Acme Industrial/u }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document view")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));
    const calloutBtn = await screen.findByRole("button", { name: /Callout/u });
    await waitFor(() => {
      expect(calloutBtn.hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(calloutBtn);

    // Dirty indicator appears
    await waitFor(() => {
      expect(screen.getByLabelText("Unsaved changes")).toBeTruthy();
    });

    // Explicit save
    fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));
    await waitFor(
      () => {
        expect(harness.writeYamlFile).toHaveBeenCalledWith(
          `${CLOUD_SYNC_ROOT}/Single Section.yaml`,
          expect.stringContaining('"type": "callout"'),
        );
      },
      { timeout: 5000 },
    );
  });

  it("(h) BlockPalette shows 15 default blocks plus injected generated block", async () => {
    const generatedBlock = {
      id: "custom-chart",
      name: "Custom Chart",
      when: "Specialized chart for Acme.",
      command: "insertGenerated_custom-chart",
      generated: true as const,
    };

    makeM8Harness({
      initialFiles: [
        [`${CLOUD_SYNC_ROOT}/Single Section.yaml`, singleSectionYaml],
      ],
      loadGeneratedBlocks: (_root: string) =>
        Promise.resolve([generatedBlock]),
    });

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Acme Industrial/u }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document view")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Block palette")).toBeTruthy();
    });

    // Default blocks present
    expect(screen.getByText("Prose")).toBeTruthy();
    expect(screen.getByText("Callout")).toBeTruthy();

    // Generated block present
    await waitFor(() => {
      expect(screen.getByText("Custom Chart (generated)")).toBeTruthy();
    });
  });

  it("(i) Export PDF works end-to-end from DocumentView", async () => {
    const harness = makeM8Harness({
      initialFiles: [
        [`${CLOUD_SYNC_ROOT}/Single Section.yaml`, singleSectionYaml],
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Acme Industrial/u }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document view")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Export PDF" }));

    await waitFor(() => {
      expect(harness.exportPdf).toHaveBeenCalled();
    });

    expect(harness.openPath).toHaveBeenCalledWith(harness.getExportedPath());
    // Export carries our own @page chrome and inlines the trusted paged.js
    // polyfill so the standalone HTML paginates itself (ADR-0017).
    expect(harness.getExportedHtml()).toMatch(/@page\s*\{/u);
    expect(harness.getExportedHtml()).toContain("counter(page)");
    expect(harness.getExportedHtml()).toMatch(/<script>[\s\S]+<\/script>/u);
  });
});
