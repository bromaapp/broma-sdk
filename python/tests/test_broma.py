"""Runs the SDK against a stand-in for the app's local API, speaking the same
wire format as broma-app/app/localapi/server.go."""

import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from broma import Broma, BromaError  # noqa: E402

KEY = "broma_sk_test"
SEEN = []


class FakeApp(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_any(self):
        if self.headers.get("Authorization") != f"Bearer {KEY}":
            return self.send(401, {"error": {"code": "key_invalid", "message": "This API key is not one of the account's keys."}})
        length = int(self.headers.get("Content-Length") or 0)
        args = json.loads(self.rfile.read(length)) if length else None
        SEEN.append((self.command, self.path, args))
        if self.path == "/api/v1/status":
            return self.send(200, {"api_version": 1, "app_version": "1.0.0", "key": {"id": 1, "name": "t", "mode": "full"}})
        if self.path == "/api/v1/tools":
            return self.send(200, {"tools": [{"name": "list_profile", "risk": "read"}]})
        name = self.path.replace("/api/v1/tools/", "")
        if name == "list_profile":
            return self.send(200, {"status": "success", "text": "", "data": {"total": 1, "truncated": False, "items": [{"id": 7, "name": "Shop"}]}})
        if name == "browser_endpoint":
            return self.send(200, {"status": "success", "data": {
                "profile_id": 7, "name": "Shop", "session_id": "s1",
                "ws_endpoint": "ws://127.0.0.1:9222/devtools/browser/x",
                "http_endpoint": "http://127.0.0.1:9222", "debugger_address": "127.0.0.1:9222"}})
        if name == "delete_profile":
            return self.send(403, {"status": "denied", "text": "denied: the user declined it."})
        if name == "rename_flow":
            return self.send(200, {"status": "success", "text": "Renamed."})
        return self.send(404, {"error": {"code": "unknown_tool", "message": f'unknown tool "{name}" for this key.'}})

    do_GET = handle_any
    do_POST = handle_any


class BromaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), FakeApp)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def client(self, key=KEY):
        return Broma(api_key=key, base_url=self.base)

    def test_lists_profiles_and_opens_a_browser_for_cdp(self):
        broma = self.client()
        self.assertEqual(broma.profiles.list(query="shop"), [{"id": 7, "name": "Shop"}])
        self.assertEqual(SEEN[-1], ("POST", "/api/v1/tools/list_profile", {"query": "shop"}))
        endpoint = broma.browser.start(7)
        self.assertEqual(endpoint.ws_endpoint, "ws://127.0.0.1:9222/devtools/browser/x")
        self.assertEqual(endpoint.debugger_address, "127.0.0.1:9222")
        self.assertEqual(SEEN[-1][2], {"profile_id": 7})

    def test_words_and_status(self):
        broma = self.client()
        self.assertEqual(broma.call("rename_flow", {"flow_id": 1, "name": "x"}), "Renamed.")
        self.assertEqual(broma.status()["key"]["mode"], "full")
        self.assertEqual(broma.tools()[0]["name"], "list_profile")

    def test_throws_what_the_app_said(self):
        broma = self.client()
        with self.assertRaises(BromaError) as caught:
            broma.profiles.delete(7)
        self.assertEqual((caught.exception.status, caught.exception.code), (403, "denied"))
        with self.assertRaises(BromaError) as caught:
            broma.call("nope")
        self.assertEqual((caught.exception.status, caught.exception.code), (404, "unknown_tool"))
        with self.assertRaises(BromaError) as caught:
            self.client("broma_sk_wrong").status()
        self.assertEqual((caught.exception.status, caught.exception.code), (401, "key_invalid"))

    def test_says_the_app_is_not_running(self):
        broma = Broma(api_key=KEY, base_url="http://127.0.0.1:1")
        with self.assertRaises(BromaError) as caught:
            broma.status()
        self.assertEqual(caught.exception.code, "unreachable")

    def test_needs_a_key(self):
        saved = os.environ.pop("BROMA_API_KEY", None)
        try:
            with self.assertRaises(BromaError):
                Broma()
        finally:
            if saved is not None:
                os.environ["BROMA_API_KEY"] = saved


if __name__ == "__main__":
    unittest.main()
