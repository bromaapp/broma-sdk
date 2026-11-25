# broma-sdk (Python)

Drive the [Broma](https://bromaapp.com) antidetect browser from Python: list and manage profiles, proxies and flows, run flows, and get a profile's Chrome DevTools endpoint for Playwright or Selenium. Standard library only.

Needs the Broma app open and signed in on the same computer, on a paid plan, with the local server turned on (**Integrations › API keys**). Make a key there.

Not on PyPI yet: install it from the [GitHub release](https://github.com/bromaapp/broma-sdk/releases).

```sh
pip install https://github.com/bromaapp/broma-sdk/releases/download/v0.1.0/broma_sdk-0.1.0-py3-none-any.whl playwright
```

```python
from broma import Broma
from playwright.sync_api import sync_playwright

broma = Broma()  # reads BROMA_API_KEY; or Broma(api_key=..., port=...)

profile = broma.profiles.list(query="shop")[0]
endpoint = broma.browser.start(profile["id"])
with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(endpoint.ws_endpoint)
    page = browser.contexts[0].new_page()
    page.goto("https://example.com")
```

Selenium: `options.debugger_address = endpoint.debugger_address`.

## API

| | |
|---|---|
| `profiles` | `list(**args)`, `get(id)`, `create(profiles)`, `update(ids, **changes)`, `delete(ids)`, `launch(ids)`, `stop(ids)`, `groups()` |
| `browser` | `start(profile_id)` → `BrowserEndpoint(ws_endpoint, http_endpoint, debugger_address, session_id)`, `stop(profile_id)` |
| `proxies` | `list(**args)`, `add(lines)`, `update(id, **changes)`, `delete(ids)`, `check(proxy_ids=[...])` |
| `flows` | `list(**args)`, `get(id)`, `run(id, profile_ids=..., inputs=...)` |
| `jobs` | `list(**args)`, `get(id, wait_seconds=...)`, `run(ids)`, `stop(ids)` |
| `data` | `list()` |
| `call(name, args)` | any tool by name; `tools()` lists them with their JSON Schema |

A failed call raises `BromaError` with `status` and `code`: 401 bad key, 402 plan without the API, 403 declined in the app, 404 unknown tool, 409 stopped or busy, 422 the tool failed.

With a key set to **Ask in the app**, a call that needs approval waits until you answer in Broma, so the default timeout is none.

Docs: https://bromaapp.com/docs/api
