import { z } from "zod";
import { defaultProviders } from "./providers";

const providerKeys = [
  "openai",
  "anthropic",
  "azure",
  "mistral",
  "openai-compatible",
  "local",
] as const;

type ProviderKeyTuple = readonly [string, ...string[]];

export const DEFAULT_PROVIDER_KEYS = providerKeys;

export function createLlmEndpointSchema<const Providers extends ProviderKeyTuple>(
  providers: Providers,
) {
  return z
    .object({
      provider: z.enum(providers),
      model: z.string().min(1),
      keychainEntry: z.string().min(1),
      baseUrl: z.string().url().optional(),
    })
    .strict();
}

export const LlmEndpointSchema = createLlmEndpointSchema(providerKeys);

export type LlmEndpoint = z.infer<typeof LlmEndpointSchema>;

export interface BaseLlmEndpoint {
  provider: string;
  model: string;
  keychainEntry: string;
  baseUrl?: string | undefined;
}

/**
 * `"fast"` — cheap/default model (comment-to-AI prose edits).
 * `"thinking"` — frontier model, per-comment thinking toggle.
 * `"codegen"` — frontier model, Authored-block generation + scaffold-mismatch
 *               regen (ADR-0012). Always frontier, no per-call toggle.
 */
export type ModelKind = "fast" | "thinking" | "codegen";
export type CacheCapability = "explicit" | "automatic" | "none";

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMCachedContext {
  kind: "schemaContext" | "brandTokensContext" | "docContext";
  content: string;
}

export interface LLMRequest {
  systemPrompt?: string;
  cachedContexts?: LLMCachedContext[];
  messages: LLMMessage[];
  responseFormat?: "text" | "json";
  jsonSchema?: unknown;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  raw: unknown;
}

export interface ProviderCallInput<
  Endpoint extends BaseLlmEndpoint = BaseLlmEndpoint,
> {
  endpoint: Endpoint;
  apiKey: string;
  request: LLMRequest;
  fetch: typeof fetch;
}

export interface Provider<Endpoint extends BaseLlmEndpoint = BaseLlmEndpoint> {
  key: string;
  cacheCapability: CacheCapability;
  call(input: ProviderCallInput<Endpoint>): Promise<LLMResponse>;
  validateKeyFormat(apiKey: string): void;
  validateEndpoint?(endpoint: Endpoint): void;
}

export interface AppConfigLlm<Endpoint extends BaseLlmEndpoint = LlmEndpoint> {
  llm: {
    fastModel: Endpoint;
    thinkingModel: Endpoint;
    /** Frontier model for Authored-block generation (ADR-0012). */
    codegenModel: Endpoint;
  };
}

export type SecretReader = (name: string) => Promise<string>;

export interface LLMClientOptions<
  Endpoint extends BaseLlmEndpoint = LlmEndpoint,
> {
  config: AppConfigLlm<Endpoint>;
  keychain?: SecretReader;
  providers?: Record<string, Provider<Endpoint>>;
  fetch?: typeof fetch;
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message);
    this.name = "LLMProviderError";
  }
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export class LLMClient<Endpoint extends BaseLlmEndpoint = LlmEndpoint> {
  private readonly config: AppConfigLlm<Endpoint>;
  private readonly keychain: SecretReader;
  private readonly providers: Record<string, Provider<Endpoint>>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LLMClientOptions<Endpoint>) {
    this.config = options.config;
    this.keychain = options.keychain ?? readTauriSecret;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.providers = {
      ...(defaultProviders as Record<string, Provider<Endpoint>>),
      ...(options.providers ?? {}),
    };
  }

  async call(modelKind: ModelKind, request: LLMRequest): Promise<LLMResponse> {
    const endpoint =
      modelKind === "fast"
        ? this.config.llm.fastModel
        : modelKind === "thinking"
          ? this.config.llm.thinkingModel
          : this.config.llm.codegenModel;
    const provider = this.providers[endpoint.provider];
    if (provider === undefined) {
      throw new LLMProviderError(
        `No LLM provider registered for "${endpoint.provider}".`,
        endpoint.provider,
      );
    }

    provider.validateEndpoint?.(endpoint);
    const apiKey = await this.keychain(endpoint.keychainEntry);
    provider.validateKeyFormat(apiKey);
    return provider.call({
      endpoint,
      apiKey,
      request,
      fetch: this.fetchImpl,
    });
  }
}

async function readTauriSecret(name: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("get_secret", { name });
}
