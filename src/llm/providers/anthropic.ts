import {
  LLMProviderError,
  type LLMCachedContext,
  type LLMMessage,
  type LLMResponse,
  type Provider,
  type ProviderCallInput,
} from "../client";

interface AnthropicResponseBody {
  content?: Array<{ type?: string; text?: string }>;
}

export function createAnthropicProvider(): Provider {
  return {
    key: "anthropic",
    cacheCapability: "explicit",
    validateKeyFormat: (apiKey) => {
      if (apiKey.trim().length === 0) {
        throw new LLMProviderError("Anthropic API key is empty.", "anthropic");
      }
    },
    call: callAnthropic,
  };
}

async function callAnthropic(input: ProviderCallInput): Promise<LLMResponse> {
  const body = buildAnthropicRequestBody(input);
  const response = await input.fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": input.apiKey,
    },
    body: JSON.stringify(body),
  });

  const raw = (await response.json()) as unknown;
  if (!response.ok) {
    throw new LLMProviderError(
      `Anthropic request failed with HTTP ${response.status}.`,
      "anthropic",
    );
  }

  return {
    content: extractAnthropicContent(raw),
    raw,
  };
}

function buildAnthropicRequestBody(
  input: ProviderCallInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.endpoint.model,
    max_tokens: input.request.maxTokens ?? 4096,
    messages: toAnthropicMessages(input.request.messages),
  };

  const system = toAnthropicSystemBlocks(
    input.request.systemPrompt,
    input.request.cachedContexts,
  );
  if (system.length > 0) {
    body.system = system;
  }
  if (input.request.temperature !== undefined) {
    body.temperature = input.request.temperature;
  }

  return body;
}

function toAnthropicSystemBlocks(
  systemPrompt: string | undefined,
  cachedContexts: LLMCachedContext[] | undefined,
): Array<{
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
}> {
  const blocks: Array<{
    type: "text";
    text: string;
    cache_control: { type: "ephemeral" };
  }> = [];
  if (systemPrompt !== undefined && systemPrompt.length > 0) {
    blocks.push(toCacheableTextBlock(systemPrompt));
  }
  for (const context of cachedContexts ?? []) {
    blocks.push(toCacheableTextBlock(formatCachedContext(context)));
  }
  return blocks;
}

function toCacheableTextBlock(text: string): {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
} {
  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}

function formatCachedContext(context: LLMCachedContext): string {
  return `<${context.kind}>\n${context.content}\n</${context.kind}>`;
}

function toAnthropicMessages(
  messages: LLMMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));
}

function extractAnthropicContent(raw: unknown): string {
  const content = (raw as AnthropicResponseBody).content?.find(
    (part) => part.type === "text" && typeof part.text === "string",
  )?.text;
  if (typeof content !== "string") {
    throw new LLMProviderError(
      "Anthropic response did not include text content.",
      "anthropic",
    );
  }
  return content;
}

