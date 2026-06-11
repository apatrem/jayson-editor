import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDocModelYaml } from "../../src/docmodel/serialize";
import { DocModelSchema, type DocModel } from "../../src/schema/docmodel";
import { renderM7SpikeHarness, sampleProposalPath } from "./m7-spike-harness";

// Format-agnostic: the harness baseline is still YAML (`type: callout`) while the
// save path now emits JSON (`"type": "callout"`). Matching both keeps the real
// before/after delta (1 → 2) intact during the YAML→JSON transition; a JSON-only
// regex would score the YAML baseline as 0 and collapse the assertion to ">0",
// which a pre-existing callout satisfies even if the insert never persisted.
function countCallouts(serialized: string): number {
  return serialized.match(/(?:"type"\s*:\s*"callout"|type:\s*"?callout"?)/gu)?.length ?? 0;
}

describe("M7 spike happy path", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.restoreAllMocks();
  });

  it("opens, inserts a block, saves, reopens, and exports through browser handoff", async () => {
    const harness = renderM7SpikeHarness();
    const baselineCallouts = countCallouts(harness.getCurrentYaml());

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Document shell")).toBeTruthy();
    });
    expect(harness.readYamlFile).toHaveBeenCalledWith(sampleProposalPath);
    // Section title is a nav-only label in the section sidebar (ADR-0018 item
    // 2), matched by its text rather than an input value.
    expect(screen.getAllByText("Executive summary").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Insert block" }));
    const calloutButton = await screen.findByRole("button", { name: /Callout/u });
    await waitFor(() => {
      expect(calloutButton.hasAttribute("disabled")).toBe(false);
    });
    fireEvent.click(calloutButton);

    await waitFor(() => {
      expect(screen.getByLabelText("Unsaved changes")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Save" }));
    await waitFor(
      () => {
        expect(countCallouts(harness.getCurrentYaml())).toBeGreaterThan(baselineCallouts);
      },
      { timeout: 4000 },
    );
    await waitFor(() => {
      expect(harness.writeYamlFile).toHaveBeenCalledWith(
        sampleProposalPath,
        expect.stringContaining('"type": "callout"'),
      );
    });

    const savedYaml = harness.getCurrentYaml();
    const parsedSavedDoc = parseDocModelYaml(savedYaml);
    expect(() => DocModelSchema.parse(parsedSavedDoc)).not.toThrow();
    const invalidSavedDoc = structuredClone(DocModelSchema.parse(parsedSavedDoc)) as Extract<
      DocModel,
      { kind: "document" }
    >;
    const firstCallout = invalidSavedDoc.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "callout");
    expect(firstCallout).toBeDefined();
    delete (firstCallout as { id?: string }).id;
    expect(() => DocModelSchema.parse(invalidSavedDoc)).toThrow();

    cleanup();
    const reopened = renderM7SpikeHarness({ initialYaml: savedYaml });
    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));
    await waitFor(() => {
      // Section title is a nav-only label in the section sidebar (ADR-0018
      // item 2), matched by its text rather than an input value.
      expect(screen.getAllByText("Executive summary").length).toBeGreaterThan(0);
    });
    expect(countCallouts(reopened.getCurrentYaml())).toBeGreaterThan(baselineCallouts);

    fireEvent.click(screen.getByRole("menuitem", { name: "Export PDF" }));
    await waitFor(() => {
      expect(reopened.exportPdf).toHaveBeenCalled();
    });
    expect(reopened.openPath).toHaveBeenCalledWith(reopened.getExportedPath());
    const exportedHtml = reopened.getExportedHtml();
    const svgPayloads = decodedSvgPayloads(exportedHtml);
    // Export now carries our own @page chrome (paged.js): A4 size + page-number
    // footer, so the printed PDF shows the title + page number, not Chrome's
    // date/file path (ADR-0017).
    expect(exportedHtml).toMatch(/@page\s*\{/u);
    expect(exportedHtml).toContain("counter(page)");
    expect(svgPayloads.filter((payload) => payload.includes("<svg")).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(exportedHtml).toContain('src="data:image/jpeg;base64,/9j/"');
    expect(exportedHtml).not.toContain("/docs/assets/");
    expect(exportedHtml).not.toContain("assets/team-meeting.jpg");
    // The trusted paged.js polyfill is inlined (one <script>); user content is
    // still escaped, never executed.
    expect(exportedHtml).toMatch(/<script>[\s\S]+<\/script>/u);
    expect(exportedHtml).toContain('data-block-type="callout"');
  });

  it("routes Export PDF to plugin:shell|open channel", async () => {
    const harness = renderM7SpikeHarness({ useRealOpenPath: true });

    fireEvent.click(screen.getByRole("menuitem", { name: "Open" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Document shell")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("menuitem", { name: "Export PDF" }));

    await waitFor(() => {
      expect(harness.exportPdf).toHaveBeenCalled();
    });
    expect(harness.openPath).not.toHaveBeenCalled();
    // Does NOT verify the Tauri regex; that's covered by tests/security/shell-config.test.ts.
    // Real-runtime verification requires a Rust integration test (deferred to M9 prep).
    expect(harness.invokeMock).toHaveBeenCalledWith(
      "plugin:shell|open",
      { path: harness.getExportedPath(), with: undefined },
      undefined,
    );
  });
});

function decodedSvgPayloads(html: string): string[] {
  return Array.from(html.matchAll(/data:image\/svg\+xml(?:;charset=utf-8)?,([^"]+)/giu), (match) =>
    decodeURIComponent(match[1] ?? ""),
  );
}
