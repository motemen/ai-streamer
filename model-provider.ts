import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { createProviderRegistry, LanguageModelV1 } from "ai";

const providerRegistry = createProviderRegistry({
  openai,
  google,
  anthropic,
});

export function getLanguageModel(modelId: string): LanguageModelV1 {
  return providerRegistry.languageModel(modelId);
}
