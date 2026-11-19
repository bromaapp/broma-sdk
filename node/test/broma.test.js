// Runs the SDK against a stand-in for the app's local API, speaking the same
// wire format as broma-app/app/localapi/server.go.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

import { Broma, BromaError } from "../src/index.js";

const KEY = "broma_sk_test";
let server;
let baseUrl;
const seen = [];

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const send = (status, body) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== `Bearer ${KEY}`) {
        return send(401, { error: { code: "key_invalid", message: "This API key is not one of the signed-in account's keys." } });
      }
      const args = raw ? JSON.parse(raw) : undefined;
      seen.push({ method: req.method, url: req.url, args });
      if (req.url === "/api/v1/status") return send(200, { api_version: 1, app_version: "1.0.0", key: { id: 1, name: "t", mode: "full" } });
      if (req.url === "/api/v1/tools") return send(200, { tools: [{ name: "list_profile", risk: "read" }] });
      const name = req.url.replace("/api/v1/tools/", "");
      switch (name) {
        case "list_profile":
          return send(200, { status: "success", text: "", data: { total: 1, truncated: false, items: [{ id: 7, name: "Shop" }] } });
        case "browser_endpoint":
          return send(200, {
            status: "success",
            data: { profile_id: 7, name: "Shop", session_id: "s1", ws_endpoint: "ws://127.0.0.1:9222/devtools/browser/x", http_endpoint: "http://127.0.0.1:9222", debugger_address: "127.0.0.1:9222" },
          });
        case "delete_profile":
          return send(403, { status: "denied", text: 'denied: the user declined "Delete Shop".' });
        case "rename_flow":
          return send(200, { status: "success", text: "Renamed." });
      }
      return send(404, { error: { code: "unknown_tool", message: `unknown tool "${name}" for this key.` } });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("lists profiles and opens a browser for CDP", async () => {
  const broma = new Broma({ apiKey: KEY, baseUrl });
  assert.deepEqual(await broma.profiles.list({ query: "shop" }), [{ id: 7, name: "Shop" }]);
  assert.deepEqual(seen.at(-1), { method: "POST", url: "/api/v1/tools/list_profile", args: { query: "shop" } });

  const endpoint = await broma.browser.start(7);
  assert.equal(endpoint.wsEndpoint, "ws://127.0.0.1:9222/devtools/browser/x");
  assert.equal(endpoint.debuggerAddress, "127.0.0.1:9222");
  assert.deepEqual(seen.at(-1).args, { profile_id: 7 });
});

test("hands back a tool's words when it answers in words", async () => {
  const broma = new Broma({ apiKey: KEY, baseUrl });
  assert.equal(await broma.call("rename_flow", { flow_id: 1, name: "x" }), "Renamed.");
  assert.equal((await broma.status()).key.mode, "full");
  assert.equal((await broma.tools())[0].name, "list_profile");
});

test("throws what the app said", async () => {
  const broma = new Broma({ apiKey: KEY, baseUrl });
  await assert.rejects(broma.profiles.delete(7), (e) => e instanceof BromaError && e.status === 403 && e.code === "denied");
  await assert.rejects(broma.call("nope"), (e) => e.status === 404 && e.code === "unknown_tool");
  const wrong = new Broma({ apiKey: "broma_sk_wrong", baseUrl });
  await assert.rejects(wrong.status(), (e) => e.status === 401 && e.code === "key_invalid");
});

test("says the app is not running instead of a bare network error", async () => {
  const broma = new Broma({ apiKey: KEY, baseUrl: "http://127.0.0.1:1" });
  await assert.rejects(broma.status(), (e) => e.code === "unreachable" && /is the app open/.test(e.message));
});

test("needs a key", () => {
  const saved = process.env.BROMA_API_KEY;
  delete process.env.BROMA_API_KEY;
  try {
    assert.throws(() => new Broma(), (e) => e.code === "key_required");
  } finally {
    if (saved !== undefined) process.env.BROMA_API_KEY = saved;
  }
});
