import { describe, expect, it } from "vitest";
import { parseDocModelYaml, serializeDocModel } from "../src/docmodel/serialize";
import { DocModelSchema, type DocModel } from "../src/schema/docmodel";

const docWithComments: DocModel = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "Comment roundtrip",
    docKind: "proposal",
    tags: [],
    language: "en",
    status: "in-review",
    archived: false,
    confidentialityLevel: "medium",
    owner: "jane@example.com",
    reviewers: ["reviewer@example.com"],
    createdAt: "2026-05-25T12:00:00Z",
    updatedAt: "2026-05-25T12:00:00Z",
    brandRef: "$brand:default",
  },
  sections: [
    {
      id: "section-1",
      title: "Executive summary",
      blocks: [
        {
          id: "block-a",
          type: "prose",
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Old sentence" }],
              },
            ],
          },
          align: "left",
        },
      ],
    },
  ],
  comments: [
    {
      id: "comment-a",
      blockId: "block-a",
      range: { from: 0, to: 12 },
      quotedText: "Old sentence",
      status: "open",
      thread: [
        {
          kind: "instruction",
          author: "Jane Consultant",
          authorEmail: "jane@example.com",
          authorRole: "consultant",
          text: "Make this clearer.",
          createdAt: "2026-05-25T12:01:00Z",
        },
        {
          kind: "ai-proposal",
          patch: {
            op: "replace",
            blockId: "block-a",
            block: {
              id: "block-a",
              type: "prose",
              content: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Clearer sentence" }],
                  },
                ],
              },
              align: "left",
            },
          },
          createdAt: "2026-05-25T12:02:00Z",
        },
      ],
      createdAt: "2026-05-25T12:01:00Z",
      updatedAt: "2026-05-25T12:02:00Z",
    },
  ],
};

describe("comments YAML round-trip", () => {
  it("preserves comments and block anchors byte-stably after reload", () => {
    const firstYaml = serializeDocModel(docWithComments);
    const reloaded = DocModelSchema.parse(parseDocModelYaml(firstYaml));
    const secondYaml = serializeDocModel(reloaded);
    const secondReload = DocModelSchema.parse(parseDocModelYaml(secondYaml));

    expect(reloaded.comments).toEqual(docWithComments.comments);
    expect(reloaded.comments[0]?.blockId).toBe("block-a");
    expect(secondReload.comments).toEqual(docWithComments.comments);
    expect(serializeDocModel(secondReload)).toBe(secondYaml);
  });
});
