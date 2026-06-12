import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderM7SpikeHarness,
  sampleProposalJson,
  singleSectionProposalDoc,
} from "./m7-spike-harness";

describe("M7 spike error paths", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.restoreAllMocks();
  });

  it("shows an error when opening a missing file", async () => {
    renderM7SpikeHarness({
      readDocumentFile: () => Promise.reject(new Error("file not found")),
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("file not found");
    });
  });

  it("shows an error when opening malformed YAML", async () => {
    renderM7SpikeHarness({
      readDocumentFile: () => Promise.resolve("kind: ["),
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent?.length ?? 0).toBeGreaterThan(0);
    });
  });

  it("shows an error when saving fails", async () => {
    renderM7SpikeHarness({
      initialDocument: {
        path: "/Users/me/Documents/sample-proposal.json",
        doc: singleSectionProposalDoc,
      },
      writeDocumentFile: () => Promise.reject(new Error("write failed")),
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));

    await waitFor(() => {
      // Multiple alert nodes coexist when watchdog placeholder + App-level error are both visible; getByText scopes the query to the specific message.
      expect(screen.getByText("write failed")).toBeTruthy();
    });
  });

  it("opens the real multi-section sample proposal in the editor", async () => {
    renderM7SpikeHarness({
      initialJson: sampleProposalJson,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document view")).toBeTruthy();
      expect(screen.queryByText(/Multi-section documents aren't editable yet/u)).toBeNull();
    });
  });
});
