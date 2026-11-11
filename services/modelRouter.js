import { getModelClient, modelNames as geminiModelNames } from "./geminiClient.js";
import { getGroqClient, groqModelNames } from "./groqClient.js";

// The models the assistant can use, in the order they're tried: Gemini's
// (GEMINI_MODEL, GEMINI_FALLBACK_MODEL), then Groq's (GROQ_MODELS) when
// GROQ_API_KEY is set. Each entry's id carries its provider
// ("gemini:gemini-3.5-flash"), which is what cooling and the logs use.
export const modelChain = () => {
  const chain = [];
  const gemini = getModelClient();
  if (gemini) {
    for (const model of geminiModelNames()) chain.push({ id: `gemini:${model}`, provider: "gemini", model, client: gemini });
  }
  const groq = getGroqClient();
  if (groq) {
    for (const model of groqModelNames()) chain.push({ id: `groq:${model}`, provider: "groq", model, client: groq });
  }
  return chain;
};

// What a failure means for the rest of a message (kinds: modelFailures.js).
// A refused key, an account out of credit, or a request too large for the
// provider's limits rules out that provider's other models too; anything
// else only rules out the model that failed.
export const shutsProvider = (kind, accountWide) => kind === "key" || kind === "size" || (kind === "limit" && accountWide);
