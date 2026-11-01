import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyFailure, isAccountWide, isDailyLimit, retryAfterMs } from "../services/modelFailures.js";
import { modelsToTry, noteFailure, noteSuccess, resetCooling, secondsUntilFree } from "../services/modelCooling.js";

// Errors shaped like the Gemini SDK's: the status, and the response body as
// the message
const apiError = (status, error) => Object.assign(new Error(JSON.stringify({ error })), { status });

// A free-tier rate limit, as Gemini sends it
const rateLimited = apiError(429, {
  code: 429,
  message:
    "You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: " +
    "generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5. Please retry in 46.834449138s.",
  status: "RESOURCE_EXHAUSTED",
  details: [
    { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] },
    { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "46s" },
  ],
});

describe("model failures", () => {
  it("classifies each kind from status codes and wording", () => {
    const cases = [
      [apiError(404, { status: "NOT_FOUND", message: "models/gemini-0 is not found" }), "missing"],
      [apiError(400, { status: "INVALID_ARGUMENT", message: "The input token count exceeds the maximum" }), "size"],
      [apiError(400, { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." }), "key"],
      [apiError(403, { status: "PERMISSION_DENIED", message: "denied" }), "key"],
      [rateLimited, "limit"],
      [apiError(503, { status: "UNAVAILABLE", message: "The model is overloaded" }), "busy"],
      [apiError(500, { status: "INTERNAL", message: "Internal error" }), "busy"],
      [apiError(504, { status: "DEADLINE_EXCEEDED", message: "Deadline expired" }), "slow"],
      [Object.assign(new Error("This operation was aborted"), { name: "AbortError" }), "slow"],
      [new Error("fetch failed"), "busy"],
      [apiError(400, { status: "INVALID_ARGUMENT", message: "Something new" }), "other"],
    ];
    for (const [err, kind] of cases) assert.equal(classifyFailure(err), kind, err.message);
  });

  it("checks size before limit, and a refused key before limit", () => {
    assert.equal(classifyFailure(apiError(429, { message: "Request too large for the tokens-per-minute quota" })), "size");
    assert.equal(classifyFailure(apiError(403, { message: "Free tier quota is not available for this key" })), "key");
  });

  it("reads how long to wait, and whether the limit is the account's or the day's", () => {
    assert.equal(retryAfterMs(rateLimited), 46000);
    assert.equal(retryAfterMs(new Error("Please retry in 2.5s.")), 2500);
    assert.equal(retryAfterMs(Object.assign(new Error("x"), { retryAfterMs: 1200 })), 1200);
    assert.equal(retryAfterMs(new Error("no hint")), undefined);
    assert.equal(isDailyLimit(rateLimited), false);
    assert.equal(isDailyLimit(apiError(429, { message: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" })), true);
    assert.equal(isAccountWide(apiError(429, { message: "Your prepayment credits are depleted" })), true);
    assert.equal(isAccountWide(apiError(402, { message: "x" })), true);
    // Every Gemini rate limit mentions billing; that alone isn't the account
    assert.equal(isAccountWide(rateLimited), false);
  });
});

describe("model cooling", () => {
  afterEach(resetCooling);
  const now = 1_000_000;

  it("skips a rate-limited model for as long as it asked", () => {
    noteFailure("a", "limit", rateLimited, now);
    assert.deepEqual(modelsToTry(["a", "b"], now + 1000), ["b"]);
    assert.deepEqual(modelsToTry(["a", "b"], now + 47000), ["a", "b"]);
  });

  it("an answer clears it, and failures that don't repeat aren't remembered", () => {
    noteFailure("a", "busy", new Error("x"), now);
    noteSuccess("a");
    noteFailure("b", "slow", new Error("x"), now);
    noteFailure("b", "key", new Error("x"), now);
    assert.deepEqual(modelsToTry(["a", "b"], now), ["a", "b"]);
  });

  it("when every model is cooling, still offers the one free soonest", () => {
    noteFailure("a", "limit", rateLimited, now);
    noteFailure("b", "busy", new Error("x"), now);
    assert.deepEqual(modelsToTry(["a", "b"], now + 1000), ["b"]);
    assert.equal(secondsUntilFree(["a", "b"], now + 1000), 14);
    assert.equal(secondsUntilFree(["a", "b"], now + 60000), undefined);
  });
});
