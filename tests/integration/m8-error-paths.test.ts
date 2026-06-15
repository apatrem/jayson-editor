import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_SYNC_ROOT,
  makeM8Harness,
  sampleProposalJson,
  singleSectionJson,
} from "./m8-harness";

describe("M8 error paths", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.restoreAllMocks();
  });

  it("folder picker cancellation keeps the user on the folder picker screen", async () => {
    makeM8Harness({
      bootStrategy: {
        bootRoute: () =>
          Promise.resolve({ kind: "folder-picker", reason: "first-launch" }),
      },
      selectFolder: () => Promise.resolve(null),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Folder picker")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Folder…" }));

    // Still on folder picker — no navigation occurred
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByLabelText("Folder picker")).toBeTruthy();
    expect(screen.queryByLabelText("Library")).toBeNull();
  });

  it("config write failure shows an error on the folder picker screen", async () => {
    makeM8Harness({
      bootStrategy: {
        bootRoute: () =>
          Promise.resolve({ kind: "folder-picker", reason: "first-launch" }),
      },
      writeAppConfigFn: () =>
        Promise.reject(new Error("config write failed")),
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Folder picker")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose Folder…" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "config write failed",
      );
    });
    expect(screen.getByLabelText("Folder picker")).toBeTruthy();
  });

  it("library scan failure shows an error alert", async () => {
    const harness = makeM8Harness();
    harness.listDirectory.mockRejectedValue(new Error("permission denied"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("permission denied");
    });
  });

  it("library scan against a missing folder shows an error state", async () => {
    // Reuse makeM8Harness but with a readAppConfig that returns a bad path,
    // causing listDirectory to error on first scan.
    const harness = makeM8Harness({
      cloudSyncRoot: "/nonexistent/path",
    });

    // Override listDirectory to simulate a "no such directory" error
    harness.listDirectory.mockRejectedValue(new Error("no such file or directory"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("Create from Template write failure shows an error in the modal", async () => {
    const harness = makeM8Harness({
      initialFiles: [
        [`${CLOUD_SYNC_ROOT}/Sample Proposal.json`, sampleProposalJson],
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("Acme Industrial")).toBeTruthy();
    });

    // Make the next writeDocumentFile call fail
    harness.writeDocumentFile.mockRejectedValueOnce(new Error("disk full"));

    fireEvent.click(screen.getByRole("button", { name: "+ New from template" }));
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.change(screen.getByLabelText("Document name"), {
      target: { value: "Error Doc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create document" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("disk full");
    });
    // Modal stays open on error
    expect(screen.getByRole("dialog", { name: "Create from template" })).toBeTruthy();
  });

  it("generated-blocks load failure degrades palette to defaults only", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    makeM8Harness({
      initialFiles: [
        [`${CLOUD_SYNC_ROOT}/Single Section.json`, singleSectionJson],
      ],
      loadGeneratedBlocks: () => Promise.reject(new Error("blocks unavailable")),
    });

    // Navigate to DocumentView by clicking the doc card
    await waitFor(() => {
      expect(screen.getByText("Acme Industrial")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Acme Industrial/u }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document view")).toBeTruthy();
    });

    await waitFor(() => expect(consoleError).toHaveBeenCalled());

    // Open palette — only defaults, no "(generated)" blocks
    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Block palette")).toBeTruthy();
    });
    expect(screen.queryAllByText(/ \(generated\)$/u)).toHaveLength(0);
    expect(screen.getByText("Prose")).toBeTruthy();
  });
});
