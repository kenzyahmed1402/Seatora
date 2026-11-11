// Which deployment this page was built for, and whether the server has a
// newer one. A tab left open across a deploy keeps running the old code,
// which can miss new features (e.g. the assistant's showtime list); it
// reloads itself at the next safe moment instead.

declare const __APP_VERSION__: string;

const RELOADED_KEY = "seatora_reloaded_for";
let newerVersion: string | undefined;

// From each API response's X-App-Version header
export const noteServerVersion = (version: string | null) => {
  if (!version || version === "dev" || __APP_VERSION__ === "dev" || version === __APP_VERSION__) return;
  newerVersion = version;
};

// Reloads the page if the server has a newer version, at most once per
// version in this tab, so a mismatch can never cause a reload loop. Returns
// whether it reloads.
export const reloadIfOutdated = () => {
  if (!newerVersion) return false;
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === newerVersion) return false;
    sessionStorage.setItem(RELOADED_KEY, newerVersion);
  } catch {
    // No storage (e.g. a private window that blocks it): don't risk a loop
    return false;
  }
  window.location.reload();
  return true;
};
