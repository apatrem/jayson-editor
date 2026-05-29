import {
  LLMProviderError,
  type BaseLlmEndpoint,
  type LLMMessage,
  type LLMResponse,
  type Provider,
  type ProviderCallInput,
} from "../client";

interface LocalResponseBody {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export function createLocalProvider(): Provider {
  return {
    key: "local",
    cacheCapability: "none",
    validateEndpoint: (endpoint: BaseLlmEndpoint) => {
      if (endpoint.baseUrl === undefined || endpoint.baseUrl.length === 0) {
        throw new LLMProviderError(
          "Local LLM endpoint requires baseUrl.",
          "local",
        );
      }
    },
    validateKeyFormat: () => undefined,
    call: callLocal,
  };
}

async function callLocal(input: ProviderCallInput): Promise<LLMResponse> {
  const baseUrl = input.endpoint.baseUrl;
  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new LLMProviderError("Local LLM endpoint requires baseUrl.", "local");
  }

  const response = await input.fetch(
    `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: input.endpoint.model,
        messages: toLocalMessages(
          input.request.systemPrompt,
          input.request.messages,
        ),
      }),
    },
  );

  const raw = (await response.json()) as unknown;
  if (!response.ok) {
    throw new LLMProviderError(
      `Local LLM request failed with HTTP ${response.status}.`,
      "local",
    );
  }

  return {
    content: extractLocalContent(raw),
    raw,
  };
}

function toLocalMessages(
  systemPrompt: string | undefined,
  messages: LLMMessage[],
): Array<{ role: LLMMessage["role"]; content: string }> {
  const converted = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  if (systemPrompt === undefined || systemPrompt.length === 0) {
    return converted;
  }
  return [{ role: "system", content: systemPrompt }, ...converted];
}

function extractLocalContent(raw: unknown): string {
  const content = (raw as LocalResponseBody).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LLMProviderError(
      "Local LLM response did not include message content.",
      "local",
    );
  }
  return content;
}
