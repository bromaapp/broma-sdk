# Broma SDK

Clients for the local API of the [Broma](https://bromaapp.com) desktop app (paid plans; Broma › Integrations › API keys):

- [`node/`](node) — `npm install https://github.com/bromaapp/broma-sdk/releases/download/v0.1.0/broma-sdk-0.1.0.tgz`
- [`python/`](python) — `pip install https://github.com/bromaapp/broma-sdk/releases/download/v0.1.0/broma_sdk-0.1.0-py3-none-any.whl`

Not on npm or PyPI yet; each [release](https://github.com/bromaapp/broma-sdk/releases) carries both packages.

Both are thin wrappers over three endpoints on `http://127.0.0.1:47821`: `GET /api/v1/status`, `GET /api/v1/tools`, `POST /api/v1/tools/{name}`. AI clients connect to the same tools over MCP at `/mcp`.

Tests: `cd node && npm test`, `cd python && python -m unittest discover -s tests`.

Docs: https://bromaapp.com/docs/api
