import { isDailyLimit, retryAfterMs } from "./modelFailures.js";

// Models that just failed in a way that will repeat for a while (a rate
// limit, an overload), and until when, so the next messages go straight to
// another model instead of spending a request to learn the same thing. Kept
// in memory, so each running instance learns on its own; the assistant works
// the same with it empty, only with more failed calls.

const MINUTE = 60 * 1000;
// When a limit doesn't say how long to wait
const LIMIT_DEFAULT_MS = MINUTE;
const DAILY_LIMIT_MS = 60 * MINUTE;
const MAX_COOLING_MS = 60 * MINUTE;
const BUSY_MS = 15 * 1000;

const coolingUntil = new Map();

// Remembers a failure of `kind` (see modelFailures.js). Other kinds don't
// say anything about the next request.
export const noteFailure = (model, kind, err, now = Date.now()) => {
  let ms;
  if (kind === "limit") ms = retryAfterMs(err) ?? (isDailyLimit(err) ? DAILY_LIMIT_MS : LIMIT_DEFAULT_MS);
  else if (kind === "busy") ms = BUSY_MS;
  else return;
  const until = now + Math.min(ms, MAX_COOLING_MS);
  coolingUntil.set(model, Math.max(coolingUntil.get(model) ?? 0, until));
};

// A model that answered is fine again
export const noteSuccess = (model) => {
  coolingUntil.delete(model);
};

const cooling = (model, now) => (coolingUntil.get(model) ?? 0) > now;

// The models to try for a new message, in order, leaving out cooling ones.
// If every model is cooling, the one that's free soonest, so the assistant
// never refuses without trying.
export const modelsToTry = (models, now = Date.now()) => {
  const ready = models.filter((model) => !cooling(model, now));
  if (ready.length > 0 || models.length === 0) return ready;
  return [models.reduce((soonest, model) => (coolingUntil.get(model) < coolingUntil.get(soonest) ? model : soonest))];
};

// Seconds until the first of these models is free again, or undefined when
// none is cooling
export const secondsUntilFree = (models, now = Date.now()) => {
  const waits = models.filter((model) => cooling(model, now)).map((model) => coolingUntil.get(model) - now);
  return waits.length > 0 ? Math.ceil(Math.min(...waits) / 1000) : undefined;
};

// Forgets everything. For tests; not reachable from any request.
export const resetCooling = () => {
  coolingUntil.clear();
};
