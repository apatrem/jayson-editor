import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type FC } from "react";
import type { Editor as CoreEditor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentView } from "../../../src/ui/views/DocumentView";
import type { CommentSelectionBubbleProps } from "../../../src/comments/CommentSelectionBubble";
import { getCommentSelection } from "../../../src/editor/comment-selection";
import type { DocModel } from "../../../src/schema/docmodel";

vi.mock("echarts", () => ({
  init: () => ({ setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() }),
}));

const doc: Extract<DocModel, { kind: "document" }> = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "Comment authoring test",
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
          id: "prose-1",
          type: "prose",
          align: "left",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Original prose content" }],
              },
            ],
          },
        },
      ],
    },
  ],
  comments: [],
};

// Test double for the floating bubble: same bubble → draft path as the real
// CommentSelectionBubble, minus the TipTap BubbleMenu (tippy) which can't mount in
// happy-dom. This is the CommentBubbleComponent injection seam the production code
// exposes so the authoring wiring is exercisable. It captures the live editor so the
// test can drive a real selection.
let capturedEditor: CoreEditor | null = null;
const bubbleLifecycle = { mounts: 0, unmounts: 0, lastEnabled: undefined as boolean | undefined };

const TestBubble: FC<CommentSelectionBubbleProps> = ({
  editor,
  onAddComment,
  enabled,
}) => {
  bubbleLifecycle.lastEnabled = enabled;
  useEffect(() => {
    capturedEditor = editor as unknown as CoreEditor;
  }, [editor]);
  useEffect(() => {
    bubbleLifecycle.mounts += 1;
    return () => {
      bubbleLifecycle.unmounts += 1;
    };
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        const selection = getCommentSelection(editor);
        if (selection !== null) {
          onAddComment(selection);
        }
      }}
    >
      open-comment-draft
    </button>
  );
};

function proseTextStart(editor: CoreEditor): number {
  let paragraphPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (paragraphPos === -1 && node.type.name === "paragraph") {
      paragraphPos = pos;
    }
  });
  // +1 steps past the paragraph's opening token into its text content. (Comment
  // marks attach to prose text; heading nodes restrict marks, so prose is the
  // realistic comment target.)
  return paragraphPos + 1;
}

describe("DocumentView comment authoring", () => {
  afterEach(() => {
    cleanup();
    capturedEditor = null;
    bubbleLifecycle.mounts = 0;
    bubbleLifecycle.unmounts = 0;
    bubbleLifecycle.lastEnabled = undefined;
    vi.restoreAllMocks();
  });

  it("highlights the captured range and persists the comment even if the selection moved", async () => {
    const onDocumentChange = vi.fn();

    render(
      <DocumentView
        path="/Users/me/Documents/proposal.yaml"
        initialDoc={doc}
        autosaveDebounceMs={1}
        onDocumentChange={onDocumentChange}
        CommentBubbleComponent={TestBubble}
      />,
    );

    // The bubble renders only once the real editor is mounted with a view.
    await screen.findByText("open-comment-draft");
    await waitFor(() => {
      expect(capturedEditor).not.toBeNull();
    });
    const editor = capturedEditor!;

    // Select a 5-char range inside the prose text, then open the draft for it.
    const from = proseTextStart(editor);
    const to = from + 5;
    editor.commands.setTextSelection({ from, to });
    const capturedText = editor.state.doc.textBetween(from, to, " ");
    expect(capturedText.length).toBe(5);

    fireEvent.click(screen.getByText("open-comment-draft"));
    const instruction = await screen.findByLabelText("AI instruction");

    // Move the editor's live selection away while the draft is open — the mark must
    // still land on the captured range, not the current cursor (P2a).
    editor.commands.setTextSelection(from);

    fireEvent.change(instruction, { target: { value: "Tighten this heading." } });
    fireEvent.click(screen.getByRole("button", { name: "Create comment" }));

    // The highlight wraps exactly the captured text…
    await waitFor(() => {
      const mark = editor.view.dom.querySelector("mark[data-comment-id]");
      expect(mark).not.toBeNull();
      expect(mark!.textContent).toBe(capturedText);
    });

    // …and the comment was added to the document.
    await waitFor(() => {
      expect(onDocumentChange).toHaveBeenCalled();
    });
    const lastDoc = onDocumentChange.mock.calls.at(-1)?.[0] as Extract<
      DocModel,
      { kind: "document" }
    >;
    expect(lastDoc.comments).toHaveLength(1);
    expect(lastDoc.comments[0]?.blockId).toBe("prose-1");
    const firstEntry = lastDoc.comments[0]?.thread[0];
    expect(firstEntry?.kind).toBe("instruction");
    if (firstEntry?.kind === "instruction") {
      expect(firstEntry.text).toBe("Tighten this heading.");
    }
  });

  it("keeps the bubble mounted when a draft opens — it is hidden via `enabled`, not unmounted", async () => {
    render(
      <DocumentView
        path="/Users/me/Documents/proposal.yaml"
        initialDoc={doc}
        CommentBubbleComponent={TestBubble}
      />,
    );

    await screen.findByText("open-comment-draft");
    await waitFor(() => {
      expect(capturedEditor).not.toBeNull();
    });
    expect(bubbleLifecycle.mounts).toBe(1);
    expect(bubbleLifecycle.unmounts).toBe(0);
    expect(bubbleLifecycle.lastEnabled).toBe(true);

    const editor = capturedEditor!;
    const from = proseTextStart(editor);
    editor.commands.setTextSelection({ from, to: from + 5 });
    fireEvent.click(screen.getByText("open-comment-draft"));
    await screen.findByLabelText("AI instruction");

    // Regression: opening the draft must NOT unmount the bubble. The real
    // BubbleMenu relocates its node out of React's tree, so an unmount here
    // crashes the document view ("Document failed to render"). The bubble is
    // suppressed by flipping `enabled` to false instead.
    expect(bubbleLifecycle.unmounts).toBe(0);
    expect(bubbleLifecycle.mounts).toBe(1);
    expect(bubbleLifecycle.lastEnabled).toBe(false);
  });
});
