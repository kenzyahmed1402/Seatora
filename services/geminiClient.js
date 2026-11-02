import { GoogleGenAI } from "@google/genai";

// The models behind the assistant: Gemini, through Google's SDK. A message
// uses GEMINI_MODEL, or GEMINI_FALLBACK_MODEL when the first fails or is
// cooling down after a rate limit (see agentChat.js).
export const DEFAULT_MODEL = "gemini-3.5-flash";
export const DEFAULT_FALLBACK_MODEL = "gemini-3.8-flash";

export const modelNames = () => [
  ...new Set([process.env.GEMINI_MODEL || DEFAULT_MODEL, process.env.GEMINI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL]),
];

// The stored conversation as Gemini takes it. Each stored model turn says
// which provider wrote it (`by`, see agentChat.js). Gemini 3 signs its own
// tool calls and may refuse unsigned ones, so tool calls written by another
// provider, and their results, are left out; that provider's replies are
// kept as text. `by` itself is removed: Gemini refuses unknown fields.
export const toGeminiContents = (contents) => {
  const out = [];
  for (let i = 0; i < contents.length; i += 1) {
    const { by, ...turn } = contents[i];
    const foreignCalls = turn.role === "model" && by && by !== "gemini" && turn.parts?.some((part) => part.functionCall);
    if (foreignCalls) {
      // Skip the results that answer these calls too
      if (contents[i + 1]?.parts?.some((part) => part.functionResponse)) i += 1;
      continue;
    }
    out.push(turn);
  }
  return out;
};

// One model call: the conversation so far and the tools it may ask for.
// Returns the model's turn as it should be stored (`content`), the tool calls
// it asks for and its text.
// Gemini 3 models think before answering, by default at length. Choosing
// tools and answering briefly needs little of it, and it makes each call much
// faster. timeoutMs is also Google's own deadline for the call. The SDK
// doesn't retry by itself; agentChat.js decides what to try next.
const createGeminiClient = (apiKey) => {
  const ai = new GoogleGenAI({ apiKey });
  return {
    generate: async ({ model, systemInstruction, contents, functionDeclarations, timeoutMs, maxOutputTokens }) => {
      const response = await ai.models.generateContent({
        model,
        contents: toGeminiContents(contents),
        config: {
          systemInstruction,
          tools: [{ functionDeclarations }],
          ...(maxOutputTokens && { maxOutputTokens }),
          ...(model.startsWith("gemini-3") && { thinkingConfig: { thinkingLevel: "low" } }),
          httpOptions: { timeout: timeoutMs },
        },
      });
      const functionCalls = response.functionCalls ?? [];
      return {
        content: response.candidates?.[0]?.content,
        functionCalls,
        // Read only without tool calls: the SDK warns when text is read
        // from a turn that also has tool calls
        text: functionCalls.length === 0 ? response.text : undefined,
      };
    },
  };
};

let defaultClient;

// The client for GEMINI_API_KEY, created on first use, or null without a key
export const getModelClient = () => {
  if (!defaultClient && process.env.GEMINI_API_KEY) {
    defaultClient = createGeminiClient(process.env.GEMINI_API_KEY);
  }
  return defaultClient ?? null;
};

// Replaces the client, so tests can use a fake model. Not reachable from any
// request.
export const setModelClient = (client) => {
  defaultClient = client;
};
