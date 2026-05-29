import {
  LLMProviderError,
  type LLMCachedContext,
  type LLMMessage,
  type LLMResponse,
  type Provider,
  type ProviderCallInput,
} from "../client";

interface MistralResponseBody {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export function createMistralProvider(): Provider {
  return {
    key: "mistral",
    cacheCapability: "explicit",
    validateKeyFormat: (apiKey) => {
      if (apiKey.trim().length === 0) {
        throw new LLMProviderError("Mistral API key is empty.", "mistral");
      }
    },
    call: callMistral,
  };
}

async function callMistral(input: ProviderCallInput): Promise<LLMResponse> {
  const body = buildMistralRequestBody(input);
  const response = await input.fetch(
    "https://api.mistral.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  );

  const raw = (await response.json()) as unknown;
  if (!response.ok) {
    throw new LLMProviderError(
      `Mistral request failed with HTTP ${response.status}.`,
      "mistral",
    );
  }

  return {
    content: extractMistralContent(raw),
    raw,
  };
}

function buildMistralRequestBody(
  input: ProviderCallInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.endpoint.model,
    messages: toMistralMessages(
      input.request.systemPrompt,
      input.request.cachedContexts,
      input.request.messages,
    ),
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

function toMistralMessages(
  systemPrompt: string | undefined,
  cachedContexts: LLMCachedContext[] | undefined,
  messages: LLMMessage[],
): Array<{
  role: LLMMessage["role"];
  content: string;
  cache_control?: { type: "ephemeral" };
}> {
  const converted = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const cacheablePrefix: Array<{
    role: "system";
    content: string;
    cache_control: { type: "ephemeral" };
  }> = [];
  if (systemPrompt !== undefined && systemPrompt.length > 0) {
    cacheablePrefix.push(toCacheableSystemMessage(systemPrompt));
  }
  for (const context of cachedContexts ?? []) {
    cacheablePrefix.push(toCacheableSystemMessage(formatCachedContext(context)));
  }
  return [...cacheablePrefix, ...converted];
}

function toCacheableSystemMessage(content: string): {
  role: "system";
  content: string;
  cache_control: { type: "ephemeral" };
} {
  return {
    role: "system",
    content,
    cache_control: { type: "ephemeral" },
  };
}

function formatCachedContext(context: LLMCachedContext): string {
  return `<${context.kind}>\n${context.content}\n</${context.kind}>`;
}

function extractMistralContent(raw: unknown): string {
  const content = (raw as MistralResponseBody).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LLMProviderError(
      "Mistral response did not include message content.",
      "mistral",
    );
  }
  return content;
}
