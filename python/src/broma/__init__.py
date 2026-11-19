"""Broma SDK for Python: drive the Broma desktop app from a script.

The app runs a local API on 127.0.0.1 (Broma > API & MCP). Every call goes to one
of its tools - the same tools the Broma Agent and MCP clients use - and the app
applies the key's access (read only / ask in the app / full).

    from broma import Broma
    broma = Broma()  # BROMA_API_KEY from the environment
    profile = broma.profiles.list()[0]
    endpoint = broma.browser.start(profile["id"])
    # playwright: p.chromium.connect_over_cdp(endpoint.ws_endpoint)
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Union

__all__ = ["Broma", "BromaError", "BrowserEndpoint", "DEFAULT_PORT"]
__version__ = "0.1.0"

DEFAULT_PORT = 47821

Ids = Union[int, Iterable[int]]


class BromaError(Exception):
    """A call the app refused, or a tool that failed.

    status: HTTP status - 401 bad key, 402 plan without the API, 403 declined in
    the app, 404 unknown tool, 409 stopped or busy, 422 the tool failed.
    code: "key_invalid", "plan_required", "unknown_tool", "denied", "stopped",
    "error", "unreachable", ...
    """

    def __init__(self, message: str, status: int = 0, code: str = "", text: str = "", result: Any = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.text = text
        self.result = result


@dataclass
class BrowserEndpoint:
    profile_id: int
    name: str
    session_id: str
    #: Playwright connect_over_cdp, Puppeteer (pyppeteer) browserWSEndpoint.
    ws_endpoint: str
    http_endpoint: str
    #: Selenium: options.debugger_address = debugger_address.
    debugger_address: str


def _ids(value: Ids) -> List[int]:
    if isinstance(value, int):
        return [value]
    return list(value)


def _items(data: Any) -> Any:
    if isinstance(data, dict) and isinstance(data.get("items"), list):
        return data["items"]
    return data


class _Group:
    def __init__(self, client: "Broma"):
        self._c = client


class _Profiles(_Group):
    def list(self, **args: Any) -> List[Dict[str, Any]]:
        """Profiles, as list_profile filters them: query, filter, ids, limit, offset."""
        return _items(self._c.call("list_profile", args))

    def get(self, profile_id: int, **args: Any) -> Any:
        return self._c.call("get_profile", {"profile_id": profile_id, **args})

    def create(self, profiles: Union[Dict[str, Any], List[Dict[str, Any]]], **args: Any) -> Any:
        """create_profile: one dict per profile, e.g. [{"name": "Shop 1"}]."""
        if isinstance(profiles, dict):
            profiles = [profiles]
        return self._c.call("create_profile", {"profiles": profiles, **args})

    def update(self, profile_ids: Ids, **changes: Any) -> Any:
        return self._c.call("update_profile", {"profile_ids": _ids(profile_ids), **changes})

    def delete(self, profile_ids: Ids) -> Any:
        return self._c.call("delete_profile", {"profile_ids": _ids(profile_ids)})

    def launch(self, profile_ids: Ids) -> Any:
        """Open the browser windows, without a DevTools endpoint; see browser.start for one."""
        return self._c.call("launch_profile", {"profile_ids": _ids(profile_ids)})

    def stop(self, profile_ids: Ids) -> Any:
        return self._c.call("stop_profile", {"profile_ids": _ids(profile_ids)})

    def groups(self) -> List[Dict[str, Any]]:
        return _items(self._c.call("list_profile_group"))


class _Browser(_Group):
    def start(self, profile_id: int) -> BrowserEndpoint:
        """Open a profile's browser (or find it open) and get its Chrome DevTools endpoint.

        profile_id 0 is a clean temporary browser.
        """
        data = self._c.call("browser_endpoint", {"profile_id": profile_id})
        return BrowserEndpoint(
            profile_id=data.get("profile_id", profile_id),
            name=data.get("name", ""),
            session_id=data.get("session_id", ""),
            ws_endpoint=data.get("ws_endpoint", ""),
            http_endpoint=data.get("http_endpoint", ""),
            debugger_address=data.get("debugger_address", ""),
        )

    def stop(self, profile_id: int) -> Any:
        return self._c.call("stop_profile", {"profile_ids": [profile_id]})


class _Proxies(_Group):
    def list(self, **args: Any) -> List[Dict[str, Any]]:
        return _items(self._c.call("list_proxy", args))

    def add(self, lines: Union[str, Iterable[str]], **args: Any) -> Any:
        """One proxy per line: "host:port", "host:port:user:pass", "socks5://user:pass@host:port"."""
        if not isinstance(lines, str):
            lines = "\n".join(lines)
        return self._c.call("add_proxy", {"lines": lines, **args})

    def update(self, proxy_id: int, **changes: Any) -> Any:
        return self._c.call("update_proxy", {"proxy_id": proxy_id, **changes})

    def delete(self, proxy_ids: Ids) -> Any:
        return self._c.call("delete_proxy", {"proxy_ids": _ids(proxy_ids)})

    def check(self, **args: Any) -> Any:
        """check_proxy: proxy_ids=[...], profile_ids=[...] or lines="..."."""
        return self._c.call("check_proxy", args)


class _Flows(_Group):
    def list(self, **args: Any) -> List[Dict[str, Any]]:
        return _items(self._c.call("list_flow", args))

    def get(self, flow_id: int, **args: Any) -> Any:
        return self._c.call("get_flow", {"flow_id": flow_id, **args})

    def run(self, flow_id: int, profile_ids: Optional[Ids] = None, inputs: Optional[Dict[str, Any]] = None,
            name: Optional[str] = None) -> Any:
        """Run a flow once. Returns the job it started; see jobs.get for its results."""
        args: Dict[str, Any] = {"flow_id": flow_id}
        if profile_ids is not None:
            args["profile_ids"] = _ids(profile_ids)
        if inputs is not None:
            args["inputs"] = inputs
        if name:
            args["name"] = name
        return self._c.call("run_flow", args)


class _Jobs(_Group):
    def list(self, **args: Any) -> List[Dict[str, Any]]:
        return _items(self._c.call("list_job", args))

    def get(self, job_id: int, **args: Any) -> Any:
        """get_job: wait_seconds=... waits for the runs to finish, result_limit=... for the result rows."""
        return self._c.call("get_job", {"job_id": job_id, **args})

    def run(self, job_ids: Ids) -> Any:
        return self._c.call("run_job", {"job_ids": _ids(job_ids)})

    def stop(self, job_ids: Ids) -> Any:
        return self._c.call("stop_job", {"job_ids": _ids(job_ids)})


class _Data(_Group):
    def list(self, **args: Any) -> List[Dict[str, Any]]:
        return _items(self._c.call("list_data", args))


class Broma:
    """A client of the Broma app's local API.

    api_key defaults to BROMA_API_KEY; port to BROMA_API_PORT, then 47821.
    timeout is per call in seconds; None (the default) waits as long as it
    takes, since a call may wait for approval in the app.
    """

    def __init__(self, api_key: Optional[str] = None, port: Optional[int] = None,
                 base_url: Optional[str] = None, timeout: Optional[float] = None):
        self.api_key = api_key or os.environ.get("BROMA_API_KEY", "")
        if not self.api_key:
            raise BromaError("No API key: pass api_key= or set BROMA_API_KEY. Make one in Broma > API & MCP.",
                             code="key_required")
        if port is None:
            port = int(os.environ.get("BROMA_API_PORT") or DEFAULT_PORT)
        self.base_url = (base_url or f"http://127.0.0.1:{port}").rstrip("/")
        self.timeout = timeout
        self.profiles = _Profiles(self)
        self.browser = _Browser(self)
        self.proxies = _Proxies(self)
        self.flows = _Flows(self)
        self.jobs = _Jobs(self)
        self.data = _Data(self)

    def status(self) -> Dict[str, Any]:
        """The key, its access and the app's version."""
        return self._request("GET", "/api/v1/status")

    def tools(self) -> List[Dict[str, Any]]:
        """Every tool this key may call, with its JSON Schema."""
        return self._request("GET", "/api/v1/tools")["tools"]

    def call(self, name: str, args: Optional[Dict[str, Any]] = None) -> Any:
        """Call any tool by name: its JSON, or its text when it answers in words."""
        body = self._request("POST", "/api/v1/tools/" + urllib.parse.quote(name), args or {})
        if body.get("image"):
            return {"text": body.get("text", ""), "image": body["image"]}
        return body["data"] if "data" in body else body.get("text", "")

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
        # The API is on this machine: never send it through a proxy the
        # environment names.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(request, timeout=self.timeout) as response:
                return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read() or b"{}")
            except ValueError:
                body = {}
            error = body.get("error")
            if error:
                raise BromaError(error.get("message", ""), status=e.code, code=error.get("code", "")) from None
            raise BromaError(body.get("text") or f"HTTP {e.code}", status=e.code, code=body.get("status", "error"),
                             text=body.get("text", ""), result=body) from None
        except urllib.error.URLError as e:
            raise BromaError(f"Can't reach Broma at {self.base_url}: is the app open, signed in, with API & MCP "
                             f"turned on? ({e.reason})", code="unreachable") from None
