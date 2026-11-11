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
// provider aren't sent as tool calls: what they looked up is added as a note
// to that provider's next reply, so Gemini still has the IDs and facts
// (e.g. a showtime's ID for proposeBooking). `by` itself is removed: Gemini
// refuses unknown fields.
const MAX_NOTE_CHARS = 6000;

const lookupNote = (calls, results) =>
  calls
    .map((call, i) => {
      const result = JSON.stringify(results[i]?.response ?? {});
      return `(Looked up with ${call.name}: ${result.length > MAX_NOTE_CHARS ? `${result.slice(0, MAX_NOTE_CHARS)}…` : result})`;
    })
    .join("\n");

export const toGeminiContents = (contents) => {
  const out = [];
  let notes = [];
  for (let i = 0; i < contents.length; i += 1) {
    const { by, ...turn } = contents[i];
    const calls = (turn.parts ?? []).filter((part) => part.functionCall).map((part) => part.functionCall);
    if (turn.role === "model" && by && by !== "gemini" && calls.length > 0) {
      const next = contents[i + 1];
      const results = (next?.parts ?? []).filter((part) => part.functionResponse).map((part) => part.functionResponse);
      if (results.length > 0) i += 1;
      notes.push(lookupNote(calls, results));
      continue;
    }
    if (turn.role === "model" && notes.length > 0) {
      out.push({ ...turn, parts: [{ text: notes.join("\n") }, ...(turn.parts ?? [])] });
      notes = [];
      continue;
    }
    out.push(turn);
  }
  if (notes.length > 0) out.push({ role: "model", parts: [{ text: notes.join("\n") }] });
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
    generate: async ({ model, systemInstruction, contents, functionDeclarations, timeoutMs, maxOutputTokens, requiredTool }) => {
      const response = await ai.models.generateContent({
        model,
        contents: toGeminiContents(contents),
        config: {
          systemInstruction,
          tools: [{ functionDeclarations }],
          ...(maxOutputTokens && { maxOutputTokens }),
          ...(model.startsWith("gemini-3") && { thinkingConfig: { thinkingLevel: "low" } }),
          // The model must call this tool now (see agentChat.js)
          ...(requiredTool && { toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [requiredTool] } } }),
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
