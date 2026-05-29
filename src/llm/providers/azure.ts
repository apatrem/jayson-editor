import {
  NotImplementedError,
  type Provider,
} from "../client";

export function createAzureProvider(): Provider {
  return {
    key: "azure",
    cacheCapability: "automatic",
    validateKeyFormat: (apiKey) => {
      if (apiKey.trim().length === 0) {
        throw new NotImplementedError("Azure API key is empty.");
      }
    },
    call: () =>
      Promise.reject(
        new NotImplementedError(
          "Azure LLM adapter is registered but not implemented yet.",
        ),
      ),
  };
}
