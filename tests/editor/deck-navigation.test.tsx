import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "../../src/editor/Editor";
import type { DocModel } from "../../src/schema/docmodel";

type Deck = Extract<DocModel, { kind: "deck" }>;

function makeDeck(slides: Deck["slides"], project = "Deck editor test"): Deck {
  return {
    kind: "deck",
    schemaVersion: "1.0.0",
    meta: {
      client: "Acme",
      project,
      docKind: "deck",
      tags: [],
      language: "en",
      status: "draft",
      archived: false,
      confidentialityLevel: "medium",
      owner: "owner@example.com",
      reviewers: [],
      createdAt: "2026-05-25T00:00:00Z",
      updatedAt: "2026-05-25T00:00:00Z",
      brandRef: "$brand:default",
    },
    slides,
    comments: [],
  };
}

const twoSlideDeck = makeDeck([
  { id: "slide-cover", layout: "cover", blocks: [] },
  {
    id: "slide-agenda",
    layout: "agenda",
    blocks: [
      {
        id: "agenda-heading",
        type: "heading",
        level: 1,
        text: "Agenda",
        numbered: false,
      },
    ],
  },
]);

describe("Editor deck navigation", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a vertical slide strip and switches the current-slide focus area", () => {
    render(<Editor docModel={twoSlideDeck} editable={false} />);

    expect(screen.getByLabelText("Slide navigation")).toBeTruthy();
    expect(
      screen
        .getByLabelText("Current slide")
        .getAttribute("data-current-slide-id"),
    ).toBe("slide-cover");
    expect(screen.getByText("Slide 1 of 2 · cover")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Slide 2 agenda" }));

    expect(
      screen
        .getByLabelText("Current slide")
        .getAttribute("data-current-slide-id"),
    ).toBe("slide-agenda");
    expect(screen.getByText("Slide 2 of 2 · agenda")).toBeTruthy();
  });

  it("resets to the first slide when the deck identity changes", () => {
    const { rerender } = render(<Editor docModel={twoSlideDeck} editable={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Slide 2 agenda" }));
    expect(
      screen
        .getByLabelText("Current slide")
        .getAttribute("data-current-slide-id"),
    ).toBe("slide-agenda");

    const otherDeck = makeDeck(
      [
        { id: "other-cover", layout: "cover", blocks: [] },
        { id: "other-quote", layout: "quote", blocks: [] },
        { id: "other-closing", layout: "closing", blocks: [] },
      ],
      "Other deck",
    );

    rerender(<Editor docModel={otherDeck} editable={false} />);

    expect(
      screen
        .getByLabelText("Current slide")
        .getAttribute("data-current-slide-id"),
    ).toBe("other-cover");
    expect(screen.getByText("Slide 1 of 3 · cover")).toBeTruthy();
  });

  it("clamps the focus area when the active deck shrinks past the current index", () => {
    const longDeck = makeDeck(
      [
        { id: "slide-1", layout: "cover", blocks: [] },
        { id: "slide-2", layout: "agenda", blocks: [] },
        { id: "slide-3", layout: "closing", blocks: [] },
      ],
      "Long deck",
    );

    const { rerender } = render(<Editor docModel={longDeck} editable={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Slide 3 closing" }));
    expect(
      screen
        .getByLabelText("Current slide")
        .getAttribute("data-current-slide-id"),
    ).toBe("slide-3");

    // Same deck identity (no reset effect) but slides shrunk under the index.
    longDeck.slides.pop();
    rerender(<Editor docModel={longDeck} editable={false} />);

    expect(
      screen
        .getByLabelText("Current slide")
        .getAttribute("data-current-slide-id"),
    ).toBe("slide-2");
    expect(screen.getByText("Slide 2 of 2 · agenda")).toBeTruthy();
  });

  it("forces read-only mode for decks even when editable=true is passed (M6 limitation)", () => {
    // Until a deck->DocModel round-trip exists (see docs/archive/BLOCKERS.md drift entry),
    // edits to a deck slide cannot be persisted back. Force read-only at the
    // Editor boundary so passing editable={true} can't silently lose input.
    render(<Editor docModel={twoSlideDeck} editable={true} />);

    const boldButton = screen.getByRole("button", { name: "Bold" });
    const italicButton = screen.getByRole("button", { name: "Italic" });

    expect((boldButton as HTMLButtonElement).disabled).toBe(true);
    expect((italicButton as HTMLButtonElement).disabled).toBe(true);
  });
});
