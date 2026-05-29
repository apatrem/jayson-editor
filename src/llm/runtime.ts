import {
  LLMClient,
  type LLMClientOptions,
  type LLMRequest,
  type LLMResponse,
  type ModelKind,
} from "./client";
import type { BatchedCommentClient } from "./batch-comments";
import type { InstallAppConfig } from "../schema/install-config";

/**
 * Runtime LLM facade. There is no cost ledger, no cost sink, and no spend cap
 * (ADR-0019) — this is a thin wrapper over `LLMClient` that names the two app
 * consumers. It is only constructed when a full config with an `llm` block is
 * available (see `loadRuntimeConfig`).
 */
export interface RuntimeLlm {
  /**
   * Authored-block generation always uses the frontier codegen model (ADR-0012).
   * Declared as an arrow-fn property (not a method) so callers can pass it
   * unbound without tripping `@typescript-eslint/unbound-method`.
   */
  callForCodegen: (request: LLMRequest) => Promise<LLMResponse>;
  /** Comment-to-AI: routes each batch to the chosen model kind (fast/thinking, D-11). */
  commentClient: BatchedCommentClient;
}

export function createRuntimeLlm(
  config: InstallAppConfig,
  overrides: Omit<LLMClientOptions, "config"> = {},
): RuntimeLlm {
  const client = new LLMClient({ config: { llm: config.llm }, ...overrides });
  return {
    callForCodegen: (request) => client.call("codegen", request),
    commentClient: {
      call: (modelKind: ModelKind, request: LLMRequest) =>
        client.call(modelKind, request),
    },
  };
}
