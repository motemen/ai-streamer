import { MockLanguageModelV1 } from "ai/test";
import { simulateReadableStream } from "ai/test";

export function createMockModel(responses: string[]) {
  return new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: responses.map((text) => ({
          type: "text-delta",
          textDelta: text,
        })).concat([{ 
          type: "finish", 
          finishReason: "stop",
          usage: {
            promptTokens: 10,
            completionTokens: 20,
          },
        }]),
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  });
}

export function createStreamingMockModel(chunks: string[]) {
  return new MockLanguageModelV1({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: chunks.map((text) => ({
          type: "text-delta",
          textDelta: text,
        })).concat([{ 
          type: "finish", 
          finishReason: "stop",
          usage: {
            promptTokens: 10,
            completionTokens: 20,
          },
        }]),
      }),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }),
  });
}