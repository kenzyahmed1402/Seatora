import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { api } from "./helpers.js";

// The built web app may not exist when the tests run (CI builds it in
// another job), so a stand-in page and asset are made when needed
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const page = `${publicDir}/index.html`;
const asset = `${publicDir}/assets/test-asset-1a2b3c.js`;
let madePage = false;

describe("serving the web app's files", () => {
  before(() => {
    mkdirSync(`${publicDir}/assets`, { recursive: true });
    if (!existsSync(page)) {
      writeFileSync(page, "<!doctype html><title>Seatora</title>");
      madePage = true;
    }
    writeFileSync(asset, "export {};");
  });

  after(() => {
    rmSync(asset, { force: true });
    if (madePage) rmSync(page, { force: true });
  });

  it("always sends the page again, so a browser never keeps an old one after a deploy", async () => {
    const res = await api.get("/");
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], "no-cache");
    assert.equal(res.headers.etag, undefined);
    assert.equal(res.headers["last-modified"], undefined);
    // A browser asking "has it changed?" with an old copy gets the page in full
    const again = await api.get("/").set("If-None-Match", 'W/"3cb-1668f272800"').set("If-Modified-Since", new Date().toUTCString());
    assert.equal(again.status, 200);
  });

  it("lets browsers keep the hashed asset files for a year", async () => {
    const res = await api.get("/assets/test-asset-1a2b3c.js");
    assert.equal(res.status, 200);
    assert.equal(res.headers["cache-control"], "public, max-age=31536000, immutable");
  });
});
