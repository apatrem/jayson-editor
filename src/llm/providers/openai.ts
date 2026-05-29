import {
  LLMProviderError,
  type BaseLlmEndpoint,
  type LLMCachedContext,
  type LLMMessage,
  type LLMResponse,
  type Provider,
  type ProviderCallInput,
} from "../client";

interface OpenAIProviderOptions {
  key?: string;
  baseUrl?: (endpoint: BaseLlmEndpoint) => string | undefined;
}

interface OpenAIResponseBody {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export function createOpenAIProvider(
  options: OpenAIProviderOptions = {},
): Provider {
  const key = options.key ?? "openai";
  return {
    key,
    cacheCapability: "automatic",
    validateEndpoint: (endpoint) => {
      resolveBaseUrl(endpoint, options);
    },
    validateKeyFormat: (apiKey) => {
      if (apiKey.trim().length === 0) {
        throw new LLMProviderError("OpenAI API key is empty.", key);
      }
      if (key === "openai" && !apiKey.startsWith("sk-")) {
        throw new LLMProviderError("OpenAI API key must start with sk-.", key);
      }
    },
    call: async (input) => callOpenAICompatible(input, key, options),
  };
}

async function callOpenAICompatible(
  input: ProviderCallInput,
  providerKey: string,
  options: OpenAIProviderOptions,
): Promise<LLMResponse> {
  const baseUrl = resolveBaseUrl(input.endpoint, options);
  const body = buildOpenAIRequestBody(input);
  const response = await input.fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const raw = (await response.json()) as unknown;
  if (!response.ok) {
    throw new LLMProviderError(
      `${providerKey} request failed with HTTP ${response.status}.`,
      providerKey,
    );
  }

  const content = extractOpenAIContent(raw, providerKey);
  return {
    content,
    raw,
  };
}

function resolveBaseUrl(
  endpoint: BaseLlmEndpoint,
  options: OpenAIProviderOptions,
): string {
  const rawBaseUrl =
    options.baseUrl === undefined
      ? "https://api.openai.com/v1"
      : options.baseUrl(endpoint);
  if (rawBaseUrl === undefined || rawBaseUrl.trim().length === 0) {
    throw new LLMProviderError(
      `${endpoint.provider} endpoint requires baseUrl.`,
      endpoint.provider,
    );
  }
  return rawBaseUrl.replace(/\/+$/, "");
}

function buildOpenAIRequestBody(input: ProviderCallInput): Record<string, unknown> {
  const messages = toOpenAIMessages(
    input.request.systemPrompt,
    input.request.cachedContexts,
    input.request.messages,
  );
  const body: Record<string, unknown> = {
    model: input.endpoint.model,
    messages,
  };

  if (input.request.responseFormat === "json") {
    body.response_format = { type: "json_object" };
  }
  if (input.request.temperature !== undefined) {
    body.temperature = input.request.temperature;
  }
  if (input.request.maxTokens !== undefined) {
    body.max_tokens = input.request.maxTokens;
  }

  return body;
}

function toOpenAIMessages(
  systemPrompt: string | undefined,
  cachedContexts: LLMCachedContext[] | undefined,
  messages: LLMMessage[],
): Array<{ role: LLMMessage["role"]; content: string }> {
  const converted = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const prefix: Array<{ role: "system"; content: string }> = [];
  if (systemPrompt !== undefined && systemPrompt.length > 0) {
    prefix.push({ role: "system", content: systemPrompt });
  }
  for (const context of cachedContexts ?? []) {
    prefix.push({
      role: "system",
      content: `<${context.kind}>\n${context.content}\n</${context.kind}>`,
    });
  }
  return [...prefix, ...converted];
}

function extractOpenAIContent(raw: unknown, providerKey: string): string {
  const parsed = raw as OpenAIResponseBody;
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LLMProviderError(
      `${providerKey} response did not include message content.`,
      providerKey,
    );
  }
  return content;
}
