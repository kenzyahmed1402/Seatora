import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GROQ_MODELS,
  createGroqClientForTest,
  fitMessages,
  fromGroqMessage,
  groqModelNames,
  setGroqClient,
  toGroqMessages,
} from "../services/groqClient.js";
import { toGeminiContents, setModelClient } from "../services/geminiClient.js";
import { modelChain, shutsProvider } from "../services/modelRouter.js";
import { classifyFailure, retryAfterMs } from "../services/modelFailures.js";

// A conversation as it's stored: Gemini's shape, each model turn marked with its provider
const stored = [
  { role: "user", parts: [{ text: "Sci-fi tonight?" }] },
  { role: "model", by: "gemini", parts: [{ functionCall: { name: "searchShowtimes", args: { genre: "Sci-Fi" } }, thoughtSignature: "sig" }] },
  { role: "user", parts: [{ functionResponse: { name: "searchShowtimes", response: { output: [{ showtime: "s1" }] } } }] },
  { role: "model", by: "gemini", parts: [{ text: "Orbit of Ashes at 20:00." }] },
  { role: "user", parts: [{ text: "Any comedy?" }] },
  { role: "model", by: "groq", parts: [{ functionCall: { id: "call_g1", name: "searchShowtimes", args: { genre: "Comedy" } } }] },
  { role: "user", parts: [{ functionResponse: { id: "call_g1", name: "searchShowtimes", response: { output: [] } } }] },
  { role: "model", by: "groq", parts: [{ text: "No comedies today." }] },
];

const declarations = [{ name: "searchShowtimes", description: "Find showtimes", parametersJsonSchema: { type: "object", properties: {} } }];

// A fake fetch that answers with `responses` in order and keeps the requests
const fakeFetch = (...responses) => {
  const requests = [];
  const fetchFn = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    const { status = 200, body, headers = {} } = responses.shift();
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  };
  return { fetchFn, requests };
};

const request = {
  model: "openai/gpt-oss-120b",
  systemInstruction: "You are Seatora.",
  contents: stored,
  functionDeclarations: declarations,
  timeoutMs: 5000,
  maxOutputTokens: 4096,
};

describe("groq client", () => {
  afterEach(() => {
    delete process.env.GROQ_MODELS;
    setGroqClient(null);
    setModelClient(null);
  });

  it("turns the stored conversation into Groq messages, pairing each tool call with its result", () => {
    const messages = toGroqMessages("You are Seatora.", stored);
    assert.deepEqual(
      messages.map((m) => m.role),
      ["system", "user", "assistant", "tool", "assistant", "user", "assistant", "tool", "assistant"]
    );
    const [, , geminiCall, geminiResult] = messages;
    assert.equal(geminiCall.tool_calls[0].function.name, "searchShowtimes");
    assert.equal(geminiCall.tool_calls[0].function.arguments, JSON.stringify({ genre: "Sci-Fi" }));
    assert.equal(geminiResult.tool_call_id, geminiCall.tool_calls[0].id);
    assert.equal(messages[7].tool_call_id, "call_g1");
    assert.equal(messages[8].content, "No comedies today.");
  });

  it("gives Gemini only its own tool calls, turns other providers' lookups into a note on their reply, and drops the provider mark", () => {
    const contents = toGeminiContents(stored);
    assert.equal(contents.length, 6);
    assert.ok(contents.every((turn) => !("by" in turn)));
    assert.equal(contents[1].parts[0].thoughtSignature, "sig");
    assert.equal(contents[4].parts[0].text, "Any comedy?");
    const groqReply = contents[5];
    assert.equal(groqReply.role, "model");
    assert.ok(groqReply.parts.every((part) => !part.functionCall));
    assert.equal(groqReply.parts[0].text, '(Looked up with searchShowtimes: {"output":[]})');
    assert.equal(groqReply.parts[1].text, "No comedies today.");
  });

  it("reads Groq's answer as a Gemini turn", () => {
    const answer = fromGroqMessage({
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "getAvailableSeats", arguments: '{"showtime":"s1"}' } }],
    });
    assert.deepEqual(answer.functionCalls, [{ id: "c1", name: "getAvailableSeats", args: { showtime: "s1" } }]);
    assert.deepEqual(answer.content.parts, [{ functionCall: { id: "c1", name: "getAvailableSeats", args: { showtime: "s1" } } }]);
    assert.equal(answer.text, undefined);

    assert.equal(fromGroqMessage({ content: "Hello!" }).text, "Hello!");
    // Arguments that aren't JSON become empty ones, which the tool then refuses
    assert.deepEqual(fromGroqMessage({ tool_calls: [{ id: "c2", function: { name: "x", arguments: "{oops" } }] }).functionCalls[0].args, {});
  });

  it("leaves out the oldest turns to stay within the token budget, starting at a customer message", () => {
    const old = Array.from({ length: 30 }, (_, i) => [
      { role: "user", content: `question ${i} ${"x".repeat(400)}` },
      { role: "assistant", content: `answer ${i} ${"y".repeat(400)}` },
    ]).flat();
    const messages = [{ role: "system", content: "rules" }, ...old, { role: "user", content: "newest" }];
    const fitted = fitMessages(messages, [], 2000);
    assert.ok(fitted.length < messages.length);
    assert.equal(fitted[0].role, "system");
    assert.equal(fitted[1].role, "user");
    assert.equal(fitted.at(-1).content, "newest");
    // The newest message is kept even when it alone is over budget
    assert.equal(fitMessages([{ role: "system", content: "s" }, { role: "user", content: "z".repeat(50000) }], [], 10).length, 2);
  });

  it("sends the tools, a short answer limit and low reasoning, without the key in the body", async () => {
    const { fetchFn, requests } = fakeFetch({ body: { choices: [{ message: { content: "Hi!" } }] } });
    const client = createGroqClientForTest("test-key", fetchFn);
    const answer = await client.generate(request);
    assert.equal(answer.text, "Hi!");
    const [{ url, init, body }] = requests;
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(init.headers.Authorization, "Bearer test-key");
    assert.equal(init.redirect, "error");
    assert.equal(body.max_completion_tokens, 1024);
    assert.equal(body.reasoning_effort, "low");
    assert.equal(body.tools[0].function.name, "searchShowtimes");
    assert.ok(!init.body.includes("test-key"));
  });

  it("turns Groq's errors into ones the failover understands", async () => {
    const rateLimited = fakeFetch({
      status: 429,
      headers: { "retry-after": "7" },
      body: { error: { message: "Rate limit reached for model on tokens per minute (TPM): Limit 8000. Please try again in 7.5s." } },
    });
    const err = await createGroqClientForTest("k", rateLimited.fetchFn).generate(request).catch((e) => e);
    assert.equal(err.status, 429);
    assert.equal(classifyFailure(err), "limit");
    assert.equal(retryAfterMs(err), 7000);

    const cases = [
      [401, "Invalid API Key", "key"],
      [413, "Request too large for model on tokens per minute (TPM)", "size"],
      [400, "Please reduce the length of the messages. context_length_exceeded", "size"],
      [404, "The model `x` does not exist or you do not have access to it.", "missing"],
      [503, "Service Unavailable", "busy"],
      [400, "Failed to call a function. tool_use_failed", "other"],
    ];
    for (const [status, message, kind] of cases) {
      const { fetchFn } = fakeFetch({ status, body: { error: { message } } });
      const failure = await createGroqClientForTest("k", fetchFn).generate(request).catch((e) => e);
      assert.equal(classifyFailure(failure), kind, message);
    }

    // An error inside a 200 answer is still an error
    const hidden = fakeFetch({ body: { error: { message: "upstream failed" } } });
    assert.equal(classifyFailure(await createGroqClientForTest("k", hidden.fetchFn).generate(request).catch((e) => e)), "busy");
  });

  it("names the tool the model must call, and drops that if the model refuses it", async () => {
    const forced = fakeFetch({ body: { choices: [{ message: { content: "Hi!" } }] } });
    await createGroqClientForTest("k", forced.fetchFn).generate({ ...request, requiredTool: "searchShowtimes" });
    assert.deepEqual(forced.requests[0].body.tool_choice, { type: "function", function: { name: "searchShowtimes" } });

    const free = fakeFetch({ body: { choices: [{ message: { content: "Hi!" } }] } });
    await createGroqClientForTest("k", free.fetchFn).generate(request);
    assert.equal(free.requests[0].body.tool_choice, "auto");

    const refused = fakeFetch(
      { status: 400, body: { error: { message: "tool_choice is not supported" } } },
      { body: { choices: [{ message: { content: "Hi!" } }] } }
    );
    await createGroqClientForTest("k", refused.fetchFn).generate({ ...request, requiredTool: "searchShowtimes" });
    assert.equal(refused.requests[1].body.tool_choice, "auto");
  });

  it("tries once more without reasoning_effort if the model refuses it", async () => {
    const { fetchFn, requests } = fakeFetch(
      { status: 400, body: { error: { message: "reasoning_effort is not supported with this model" } } },
      { body: { choices: [{ message: { content: "Hi!" } }] } }
    );
    assert.equal((await createGroqClientForTest("k", fetchFn).generate(request)).text, "Hi!");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].body.reasoning_effort, undefined);
  });

  it("puts Groq's models after Gemini's, only when Groq is set up, and reads GROQ_MODELS", () => {
    const fake = { generate: async () => {} };
    setModelClient(fake);
    assert.deepEqual(modelChain().map((entry) => entry.provider), ["gemini", "gemini"]);
    setGroqClient(fake);
    assert.deepEqual(modelChain().map((entry) => entry.id).slice(2), DEFAULT_GROQ_MODELS.map((model) => `groq:${model}`));
    process.env.GROQ_MODELS = " openai/gpt-oss-20b , bad name!, openai/gpt-oss-20b";
    assert.deepEqual(groqModelNames(), ["openai/gpt-oss-20b"]);
  });

  it("a refused key, an account out of credit or a request too large rules out the provider's other models", () => {
    assert.equal(shutsProvider("key", false), true);
    assert.equal(shutsProvider("size", false), true);
    assert.equal(shutsProvider("limit", true), true);
    assert.equal(shutsProvider("limit", false), false);
    assert.equal(shutsProvider("busy", false), false);
  });
});
