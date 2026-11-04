// The assistant's second provider: Groq, through its OpenAI-style chat API
// with plain fetch. Used when the Gemini models fail or are cooling down
// (see modelRouter.js). The conversation stays stored in Gemini's shape;
// this file converts it to Groq's messages and Groq's answer back, so
// nothing else needs to know which provider answered.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const MODEL_NAME = /^[\w.:/-]{1,100}$/;

// Groq's free tier allows 8K tokens per minute per model, counting the
// request and the longest allowed answer. Older turns are left out so a
// request stays near this size (the instructions and tools alone are about
// 1.5K), and answers are kept short.
export const GROQ_INPUT_TOKENS = 3500;
export const GROQ_MAX_OUTPUT_TOKENS = 1024;

// GROQ_MODELS (comma-separated), in the order they're tried
export const groqModelNames = () => {
  const names = (process.env.GROQ_MODELS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => MODEL_NAME.test(name));
  return names.length > 0 ? [...new Set(names)] : DEFAULT_GROQ_MODELS;
};

// A cheap size estimate: about 4 characters per token
export const estimateTokens = (value) => Math.ceil(JSON.stringify(value).length / 4);

// The stored conversation (Gemini's contents) as Groq messages. Tool calls
// and their results are paired by ID, or by position when Gemini gave none.
export const toGroqMessages = (systemInstruction, contents) => {
  const messages = [{ role: "system", content: systemInstruction }];
  let pendingIds = [];

  contents.forEach((turn, turnIndex) => {
    const parts = turn.parts ?? [];
    const calls = parts.filter((part) => part.functionCall).map((part) => part.functionCall);
    const results = parts.filter((part) => part.functionResponse).map((part) => part.functionResponse);
    const text = parts
      .filter((part) => typeof part.text === "string" && !part.thought)
      .map((part) => part.text)
      .join("\n");

    if (turn.role === "model") {
      pendingIds = calls.map((call, i) => call.id ?? `call_${turnIndex}_${i}`);
      messages.push({
        role: "assistant",
        content: text || null,
        ...(calls.length > 0 && {
          tool_calls: calls.map((call, i) => ({
            id: pendingIds[i],
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
          })),
        }),
      });
    } else if (results.length > 0) {
      results.forEach((result, i) => {
        messages.push({
          role: "tool",
          tool_call_id: result.id ?? pendingIds[i] ?? `call_${turnIndex}_${i}`,
          content: JSON.stringify(result.response ?? {}),
        });
      });
    } else {
      messages.push({ role: "user", content: text });
    }
  });
  return messages;
};

// Leaves out the oldest turns until the request fits `budget` tokens. A
// request always starts at a message from the customer, never at a tool
// result without its call, and the customer's newest message and everything
// after it are always kept.
export const fitMessages = (messages, tools, budget = GROQ_INPUT_TOKENS) => {
  const [system, ...rest] = messages;
  const fixed = estimateTokens(system) + estimateTokens(tools);
  const newest = rest.findLastIndex((message) => message.role === "user");
  let start = 0;
  const size = () => fixed + rest.slice(start).reduce((total, message) => total + estimateTokens(message), 0);
  while (start < newest && size() > budget) {
    start += 1;
    while (start < newest && rest[start].role !== "user") start += 1;
  }
  return [system, ...rest.slice(start)];
};

// Groq's answer as a Gemini turn, so the rest of the app reads it the same way
export const fromGroqMessage = (message) => {
  const calls = (message?.tool_calls ?? []).map((call) => {
    let args = {};
    try {
      args = JSON.parse(call.function?.arguments || "{}");
    } catch {
      // Arguments that aren't JSON: the tool refuses them and says why
    }
    return { id: call.id, name: call.function?.name, args };
  });
  const text = typeof message?.content === "string" ? message.content : "";
  const parts = [...(text ? [{ text }] : []), ...calls.map((call) => ({ functionCall: call }))];
  return {
    content: { role: "model", parts },
    functionCalls: calls,
    text: calls.length === 0 ? text : undefined,
  };
};

// An error with the HTTP status and Groq's wait hint, for modelFailures.js.
// Only Groq's own message: never the request or the key.
const groqError = async (response) => {
  let message = `Groq answered ${response.status}`;
  try {
    const body = await response.json();
    if (body?.error?.message) message = String(body.error.message).slice(0, 500);
  } catch {
    // Not JSON: keep the status
  }
  const err = new Error(message);
  err.status = response.status;
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) err.retryAfterMs = Math.ceil(retryAfter * 1000);
  return err;
};

const createGroqClient = (apiKey, fetchFn = fetch) => {
  const send = async (body, timeoutMs) => {
    const response = await fetchFn(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Only Groq's own address; a redirect would lead somewhere else
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw await groqError(response);
    const data = await response.json();
    // Some errors come back with status 200
    if (data?.error) throw Object.assign(new Error(String(data.error.message ?? "Groq error").slice(0, 500)), { status: 500 });
    return data;
  };

  return {
    generate: async ({ model, systemInstruction, contents, functionDeclarations, timeoutMs, maxOutputTokens }) => {
      const tools = functionDeclarations.map(({ name, description, parametersJsonSchema }) => ({
        type: "function",
        function: { name, description, parameters: parametersJsonSchema },
      }));
      const body = {
        model,
        messages: fitMessages(toGroqMessages(systemInstruction, contents), tools),
        tools,
        tool_choice: "auto",
        max_completion_tokens: Math.min(maxOutputTokens ?? GROQ_MAX_OUTPUT_TOKENS, GROQ_MAX_OUTPUT_TOKENS),
        // gpt-oss thinks before answering; its thinking counts against the limits
        ...(model.startsWith("openai/gpt-oss") && { reasoning_effort: "low" }),
      };
      let data;
      try {
        data = await send(body, timeoutMs);
      } catch (err) {
        // A model that doesn't take reasoning_effort: once more without it
        if (err.status !== 400 || !body.reasoning_effort || !/reasoning_effort/i.test(err.message)) throw err;
        delete body.reasoning_effort;
        data = await send(body, timeoutMs);
      }
      return fromGroqMessage(data?.choices?.[0]?.message);
    },
  };
};

let defaultClient;

// The client for GROQ_API_KEY, created on first use, or null without a key
export const getGroqClient = () => {
  if (!defaultClient && process.env.GROQ_API_KEY) {
    defaultClient = createGroqClient(process.env.GROQ_API_KEY);
  }
  return defaultClient ?? null;
};

// Replaces the client, so tests can use a fake. Not reachable from any request.
export const setGroqClient = (client) => {
  defaultClient = client;
};

// A real client with a fake fetch, for tests of the conversion and errors
export const createGroqClientForTest = createGroqClient;
