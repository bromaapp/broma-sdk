# broma-sdk (Node.js)

Drive the [Broma](https://bromaapp.com) antidetect browser from Node.js: list and manage profiles, proxies and flows, run flows, and get a profile's Chrome DevTools endpoint for Puppeteer or Playwright.

Needs the Broma app open and signed in on the same computer, on a paid plan, with **API & MCP** turned on. Make a key there.

Not on npm yet: install it from the [GitHub release](https://github.com/supsquad/broma-sdk/releases).

```sh
npm install https://github.com/supsquad/broma-sdk/releases/download/v0.1.0/broma-sdk-0.1.0.tgz puppeteer-core
```

```js
import { Broma } from "broma-sdk";
import puppeteer from "puppeteer-core";

const broma = new Broma(); // reads BROMA_API_KEY; or new Broma({ apiKey, port })

const [profile] = await broma.profiles.list({ query: "shop" });
const { wsEndpoint } = await broma.browser.start(profile.id);
const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint, defaultViewport: null });
const page = await browser.newPage();
await page.goto("https://example.com");
```

Playwright: `chromium.connectOverCDP(wsEndpoint)`.

## API

| | |
|---|---|
| `profiles` | `list(args)`, `get(id)`, `create(profiles)`, `update(ids, changes)`, `delete(ids)`, `launch(ids)`, `stop(ids)`, `groups()` |
| `browser` | `start(profileId)` → `{ wsEndpoint, httpEndpoint, debuggerAddress, sessionId }`, `stop(profileId)` |
| `proxies` | `list(args)`, `add(lines)`, `update(id, changes)`, `delete(ids)`, `check({ proxy_ids })` |
| `flows` | `list(args)`, `get(id)`, `run(id, { profileIds, inputs })` |
| `jobs` | `list(args)`, `get(id, { wait_seconds })`, `run(ids)`, `stop(ids)` |
| `data` | `list()` |
| `call(name, args)` | any tool by name; `tools()` lists them with their JSON Schema |

A failed call throws `BromaError` with `status` and `code`: 401 bad key, 402 plan without the API, 403 declined in the app, 404 unknown tool, 409 stopped or busy, 422 the tool failed.

With a key set to **Ask in the app**, a call that needs approval (deleting, running a flow, driving a signed-in browser) waits until you answer in Broma, so the default timeout is none.

Docs: https://bromaapp.com/docs/api
