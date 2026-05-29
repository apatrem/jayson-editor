import { z } from "zod";
import { BlockPatchSchema } from "../schema/block-patch";
import type { LLMRequest, LLMResponse, ModelKind } from "./client";

export interface BatchedCommentRequest {
  model: ModelKind;
  systemPrompt: string;
  schemaContext: string;
  brandTokensContext: string;
  docContext: string;
  comments: BatchedComment[];
}

export interface BatchedComment {
  commentId: string;
  blockId: string;
  quotedText: string;
  thread: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export const BatchedCommentResponseSchema = z
  .object({
    results: z.array(
      z.discriminatedUnion("status", [
        z
          .object({
            status: z.literal("ok"),
            commentId: z.string(),
            patch: BlockPatchSchema,
          })
          .strict(),
        z
          .object({
            status: z.literal("failed"),
            commentId: z.string(),
            error: z.string(),
            rawOutput: z.string().optional(),
          })
          .strict(),
      ]),
    ),
  })
  .strict();

export type BatchedCommentResponse = z.infer<
  typeof BatchedCommentResponseSchema
>;

const RawBatchedCommentResponseSchema = z
  .object({
    results: z.array(
      z.discriminatedUnion("status", [
        z
          .object({
            status: z.literal("ok"),
            commentId: z.string(),
            patch: z.unknown(),
          })
          .strict(),
        z
          .object({
            status: z.literal("failed"),
            commentId: z.string(),
            error: z.string(),
            rawOutput: z.string().optional(),
          })
          .strict(),
      ]),
    ),
  })
  .strict();

type RawBatchedCommentResponse = z.infer<
  typeof RawBatchedCommentResponseSchema
>;
type RawBatchedCommentResult = RawBatchedCommentResponse["results"][number];

export interface BatchedCommentClient {
  call(modelKind: ModelKind, request: LLMRequest): Promise<LLMResponse>;
}

export interface BatchRetryOptions {
  maxPatchRetries?: number;
}

export class BatchedCommentResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchedCommentResponseError";
  }
}

export function buildBatchedCommentRequest(
  input: BatchedCommentRequest,
): BatchedCommentRequest {
  if (input.comments.length === 0) {
    throw new BatchedCommentResponseError(
      "Cannot build a batched comment request with no comments.",
    );
  }
  return {
    model: input.model,
    systemPrompt: input.systemPrompt,
    schemaContext: input.schemaContext,
    brandTokensContext: input.brandTokensContext,
    docContext: input.docContext,
    comments: input.comments.map((comment) => ({
      commentId: comment.commentId,
      blockId: comment.blockId,
      quotedText: comment.quotedText,
      thread: comment.thread.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
    })),
  };
}

export function toLLMRequest(batch: BatchedCommentRequest): LLMRequest {
  return {
    systemPrompt: batch.systemPrompt,
    cachedContexts: [
      { kind: "schemaContext", content: batch.schemaContext },
      { kind: "brandTokensContext", content: batch.brandTokensContext },
      { kind: "docContext", content: batch.docContext },
    ],
    messages: [
      {
        role: "user",
        content: JSON.stringify({ comments: batch.comments }, null, 2),
      },
    ],
    responseFormat: "json",
  };
}

export async function runBatchedCommentRequest(
  client: BatchedCommentClient,
  input: BatchedCommentRequest,
  options: BatchRetryOptions = {},
): Promise<BatchedCommentResponse> {
  const batch = buildBatchedCommentRequest(input);
  const response = await client.call(batch.model, toLLMRequest(batch));
  const rawResponse = parseRawBatchedCommentResponse(response.content);
  const results = await validateAndRetryResults(
    client,
    batch,
    rawResponse.results,
    options.maxPatchRetries ?? 2,
  );
  return { results };
}

export function parseBatchedCommentResponse(
  content: string,
): BatchedCommentResponse {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced?.[1] ?? trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BatchedCommentResponseError(
      `Batched comment response was not valid JSON: ${message}`,
    );
  }

  const result = BatchedCommentResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new BatchedCommentResponseError(
      `Batched comment response failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

function parseRawBatchedCommentResponse(
  content: string,
): RawBatchedCommentResponse {
  const parsed = parseResponseJson(content);
  const result = RawBatchedCommentResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new BatchedCommentResponseError(
      `Batched comment response failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

async function validateAndRetryResults(
  client: BatchedCommentClient,
  batch: BatchedCommentRequest,
  results: RawBatchedCommentResult[],
  maxRetries: number,
): Promise<BatchedCommentResponse["results"]> {
  const validated: BatchedCommentResponse["results"] = [];
  for (const result of results) {
    if (result.status === "failed") {
      validated.push(result);
      continue;
    }

    const patchResult = BlockPatchSchema.safeParse(result.patch);
    if (patchResult.success) {
      validated.push({
        status: "ok",
        commentId: result.commentId,
        patch: patchResult.data,
      });
      continue;
    }

    validated.push(
      await retryInvalidPatch(
        client,
        batch,
        result.commentId,
        result.patch,
        formatPatchIssues(patchResult.error.issues),
        maxRetries,
      ),
    );
  }
  return validated;
}

async function retryInvalidPatch(
  client: BatchedCommentClient,
  batch: BatchedCommentRequest,
  commentId: string,
  rawPatch: unknown,
  validationError: string,
  maxRetries: number,
): Promise<BatchedCommentResponse["results"][number]> {
  let currentRawPatch = rawPatch;
  let currentValidationError = validationError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const retryBatch = buildRetryBatch(
      batch,
      commentId,
      currentRawPatch,
      currentValidationError,
      attempt,
    );
    const response = await client.call(retryBatch.model, toLLMRequest(retryBatch));
    const retryResponse = parseRawBatchedCommentResponse(response.content);
    const retryResult =
      retryResponse.results.find((result) => result.commentId === commentId) ??
      retryResponse.results[0];
    if (retryResult === undefined) {
      currentRawPatch = undefined;
      currentValidationError = "Retry response did not include a result.";
      continue;
    }
    if (retryResult.status === "failed") {
      return retryResult;
    }

    const parsedPatch = BlockPatchSchema.safeParse(retryResult.patch);
    if (parsedPatch.success) {
      return {
        status: "ok",
        commentId,
        patch: parsedPatch.data,
      };
    }

    currentRawPatch = retryResult.patch;
    currentValidationError = formatPatchIssues(parsedPatch.error.issues);
  }

  return {
    status: "failed",
    commentId,
    error: `Patch validation failed after ${maxRetries} retries: ${currentValidationError}`,
    rawOutput: stableRawOutput(currentRawPatch),
  };
}

function buildRetryBatch(
  batch: BatchedCommentRequest,
  commentId: string,
  rawPatch: unknown,
  validationError: string,
  attempt: number,
): BatchedCommentRequest {
  const comment = batch.comments.find(
    (candidate) => candidate.commentId === commentId,
  );
  if (comment === undefined) {
    throw new BatchedCommentResponseError(
      `Cannot retry missing comment '${commentId}'.`,
    );
  }
  return {
    ...batch,
    comments: [
      {
        ...comment,
        thread: [
          ...comment.thread,
          {
            role: "user",
            content:
              `Corrective retry ${attempt}: your previous patch failed validation.\n` +
              `Validation error: ${validationError}\n` +
              `Raw patch: ${stableRawOutput(rawPatch)}\n` +
              "Return exactly one valid BatchedCommentResponse result for this comment.",
          },
        ],
      },
    ],
  };
}

function parseResponseJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const jsonText = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(jsonText) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BatchedCommentResponseError(
      `Batched comment response was not valid JSON: ${message}`,
    );
  }
}

function formatPatchIssues(issues: z.ZodIssue[]): string {
  return issues
    .map((issue) => `${issue.path.join(".") || "<root>"} ${issue.message}`)
    .join("; ");
}

function stableRawOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}
