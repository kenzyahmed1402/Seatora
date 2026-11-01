// Why a call to the assistant's model failed, and what that means for the
// next try. Pure: it reads the error and nothing else, so it's tested
// without a network or a key.
//
// Kinds, in the order they're checked:
//   missing  the model name is unknown (404): another model may work
//   size     the request is too large: sending it again won't help
//   key      the key is missing, refused or has no access: no model on it will work
//   limit    quota or rate limit (429): wait, or use another model
//   slow     no answer in time (our own deadline, or 504)
//   busy     overloaded, unreachable or a 5xx: another model, or later
//   other    anything else: worth one try on another model
// Size comes before limit because a request too large for a quota names the
// quota, and waiting doesn't shrink it. Key comes before limit because a
// refused key's message can mention the free tier.

const has = (err, pattern) => pattern.test(String(err?.message ?? ""));

export const classifyFailure = (err) => {
  const status = Number(err?.status) || undefined;
  if (status === 404 || has(err, /\bNOT_FOUND\b|model .*not found|is not supported for generateContent/i)) return "missing";
  if (status === 413 || has(err, /too large|too long|context (length|window)|exceeds the (maximum|limit)|input token count/i)) {
    return "size";
  }
  if (status === 401 || status === 403 || has(err, /API key not valid|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|invalid api key/i)) {
    return "key";
  }
  if (status === 429 || status === 402 || has(err, /RESOURCE_EXHAUSTED|quota|rate limit|too many requests/i)) return "limit";
  if (err?.name === "AbortError" || err?.name === "TimeoutError" || status === 504 || has(err, /DEADLINE_EXCEEDED|deadline|timed? ?out|aborted/i)) {
    return "slow";
  }
  // No status at all is a network failure (refused, reset, DNS)
  if (!status || status >= 500 || has(err, /UNAVAILABLE|overloaded|high demand|try again later/i)) return "busy";
  return "other";
};

// A limit for the whole account rather than one model: out of credit, or
// billing turned off. Every model on that key will be refused too. Gemini's
// ordinary per-minute limit also says "check your plan and billing details",
// so "billing" alone doesn't count.
export const isAccountWide = (err) =>
  Number(err?.status) === 402 ||
  has(err, /credits? (are |is )?(depleted|exhausted)|out of credits?|insufficient (credit|balance|funds)|payment required|billing (is )?(not enabled|disabled)/i);

// How long the provider asked us to wait, in ms, if it said: Gemini puts
// "retryDelay": "46s" in its error and "retry in 46.8s" in the message.
// A transport can also set err.retryAfterMs from a Retry-After header.
export const retryAfterMs = (err) => {
  if (Number.isFinite(err?.retryAfterMs)) return err.retryAfterMs;
  const message = String(err?.message ?? "");
  const match = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) ?? message.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
};

// A daily quota, which won't come back within the hour
export const isDailyLimit = (err) => has(err, /PerDay|per day|daily/i);
