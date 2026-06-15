import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { CreateFromTemplateModal } from "../../../src/ui/library/CreateFromTemplateModal";

const CLOUD_ROOT = "/Users/me/Documents";

function makeOnConfirm() {
  return vi.fn((_path: string) => Promise.resolve());
}

function makeOnCancel() {
  return vi.fn();
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateFromTemplateModal — template listing", () => {
  it("renders all 4 templates", () => {
    render(
      createElement(CreateFromTemplateModal, {
        cloudSyncRoot: CLOUD_ROOT,
        onConfirm: makeOnConfirm(),
        onCancel: makeOnCancel(),
      }),
    );

    expect(screen.getByText("Commercial Proposal")).toBeTruthy();
    expect(screen.getByText("Commercial Proposal (Deck)")).toBeTruthy();
    expect(screen.getByText("Standard Report")).toBeTruthy();
    expect(screen.getByText("Standard Report (Deck)")).toBeTruthy();
  });

  it("Cancel button calls onCancel", () => {
    const onCancel = makeOnCancel();
    render(
      createElement(CreateFromTemplateModal, {
        cloudSyncRoot: CLOUD_ROOT,
        onConfirm: makeOnConfirm(),
        onCancel,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Close button calls onCancel", () => {
    const onCancel = makeOnCancel();
    render(
      createElement(CreateFromTemplateModal, {
        cloudSyncRoot: CLOUD_ROOT,
        onConfirm: makeOnConfirm(),
        onCancel,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("CreateFromTemplateModal — pick + name + confirm", () => {
  it("confirm button is disabled until template and name are provided", () => {
    render(
      createElement(CreateFromTemplateModal, {
        cloudSyncRoot: CLOUD_ROOT,
        onConfirm: makeOnConfirm(),
        onCancel: makeOnCancel(),
      }),
    );

    const confirmBtn = screen.getByRole("button", { name: "Create document" });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);
  });

  it("pick template + enter name → confirm writes JSON to cloud root and calls onConfirm", async () => {
    const onConfirm = makeOnConfirm();
    const writeDocumentFile = vi.fn(() => Promise.resolve());

    render(
      createElement(CreateFromTemplateModal, {
        cloudSyncRoot: CLOUD_ROOT,
        onConfirm,
        onCancel: makeOnCancel(),
        deps: { writeDocumentFile },
      }),
    );

    // index 0 = Commercial Proposal (non-deck)
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.change(screen.getByLabelText("Document name"), {
      target: { value: "Acme Proposal" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create document" }));

    await waitFor(() => {
      expect(writeDocumentFile).toHaveBeenCalledWith(
        `${CLOUD_ROOT}/Acme Proposal.json`,
        expect.stringContaining("[REPLACE:"),
      );
    });

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(`${CLOUD_ROOT}/Acme Proposal.json`);
    });
  });

  it("appends .json suffix if name already has it", async () => {
    const writeDocumentFile = vi.fn(() => Promise.resolve());
    const onConfirm = makeOnConfirm();

    render(
      createElement(CreateFromTemplateModal, {
        cloudSyncRoot: CLOUD_ROOT,
        onConfirm,
        onCancel: makeOnCancel(),
        deps: { writeDocumentFile },
      }),
    );

    // index 2 = Standard Report (non-deck)
    fireEvent.click(screen.getAllByRole("radio")[2]!);
    fireEvent.change(screen.getByLabelText("Document name"), {
      target: { value: "My Report.json" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create document" }));

    await waitFor(() => {
      expect(writeDocumentFile).toHaveBeenCalledWith(
        `${CLOUD_ROOT}/My Report.json`,
        expect.stringContaining("[REPLACE:"),
      );
    });
  });

  it("routes to DocumentView after creation — onConfirm receives the json path", async () => {
    const writeDocumentFile = vi.fn(() => Promise.resolve());
    const onConfirm = makeOnConfirm();

    render(
      createElement(CreateFromTemplateModal, {
        cloudSyncRoot: CLOUD_ROOT,
        onConfirm,
        onCancel: makeOnCancel(),
        deps: { writeDocumentFile },
      }),
    );

    // index 3 = Standard Report (Deck)
    fireEvent.click(screen.getAllByRole("radio")[3]!);
    fireEvent.change(screen.getByLabelText("Document name"), {
      target: { value: "Board Readout" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create document" }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(`${CLOUD_ROOT}/Board Readout.json`);
    });
  });
});
