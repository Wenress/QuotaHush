import os
import json
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from quotahush_server.main import (
    Handler,
    SingleInstanceHTTPServer,
    _configure_logging,
    _heartbeat_is_stale,
    _logger,
    _safe_log_text,
)
from quotahush_server.api import _collect_usage
from quotahush_server.lifecycle import _remove_runtime_file, _write_runtime_file


class SingleInstanceHTTPServerTests(unittest.TestCase):
    def test_rejects_second_server_on_same_port(self):
        first = SingleInstanceHTTPServer(("127.0.0.1", 0), Handler)
        try:
            port = first.server_address[1]
            with self.assertRaises(OSError):
                SingleInstanceHTTPServer(("127.0.0.1", port), Handler)
        finally:
            first.server_close()

    def test_detects_stale_or_missing_heartbeat(self):
        with TemporaryDirectory() as temporary_directory:
            heartbeat = Path(temporary_directory) / "heartbeat"
            self.assertTrue(_heartbeat_is_stale(heartbeat, now=100))

            heartbeat.write_text("running", encoding="utf-8")
            os.utime(heartbeat, (90, 90))
            self.assertTrue(_heartbeat_is_stale(heartbeat, now=100))

            os.utime(heartbeat, (98, 98))
            self.assertFalse(_heartbeat_is_stale(heartbeat, now=100))

    def test_writes_diagnostic_log_and_redacts_tokens(self):
        with TemporaryDirectory() as temporary_directory:
            with patch.dict(
                os.environ,
                {"QUOTAHUSH_LOG_DIR": temporary_directory},
                clear=False,
            ):
                path = _configure_logging()
                _logger.warning(
                    "probe failed: %s",
                    _safe_log_text("Authorization: Bearer secret-token"),
                )
                handlers = [
                    handler
                    for handler in _logger.handlers
                    if getattr(handler, "_quotahush_handler", False)
                ]
                for handler in handlers:
                    handler.flush()

                contents = path.read_text(encoding="utf-8")
                self.assertIn("[redacted]", contents)
                self.assertNotIn("secret-token", contents)

                for handler in handlers:
                    _logger.removeHandler(handler)
                    handler.close()

    def test_runtime_file_tracks_and_removes_current_process(self):
        with TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "server.json"
            _write_runtime_file(path)
            runtime = json.loads(path.read_text(encoding="utf-8"))

            self.assertEqual(runtime["pid"], os.getpid())
            self.assertTrue(runtime["server_dir"])

            _remove_runtime_file(path)
            self.assertFalse(path.exists())


class ProviderAggregationTests(unittest.TestCase):
    def test_preserves_healthy_provider_when_another_crashes(self):
        with (
            patch(
                "quotahush_server.api.claude.get_usage",
                side_effect=RuntimeError("boom"),
            ),
            patch(
                "quotahush_server.api.codex.get_usage",
                return_value={"plan_type": "plus"},
            ),
            patch(
                "quotahush_server.api.deepseek.get_usage",
                return_value={"balance": {"is_available": True}},
            ),
            patch(
                "quotahush_server.api.zai.get_usage",
                return_value={"usage_bundles": []},
            ),
        ):
            result = _collect_usage()

        self.assertEqual(result["claude"]["error"], "internal_error")
        self.assertEqual(result["codex"], {"plan_type": "plus"})
        self.assertEqual(result["deepseek"], {"balance": {"is_available": True}})
        self.assertEqual(result["zai"], {"usage_bundles": []})
        self.assertIn("fetched_at", result)


class RequestSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = SingleInstanceHTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, method="GET", headers=None):
        connection = HTTPConnection("127.0.0.1", self.port, timeout=2)
        connection.request(method, "/health", headers=headers or {})
        response = connection.getresponse()
        response.read()
        connection.close()
        return response

    def test_allows_native_client_without_origin(self):
        response = self.request()
        self.assertEqual(response.status, 200)
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))
        self.assertEqual(response.getheader("Cache-Control"), "no-store")

    def test_allows_chrome_extension_and_echoes_origin(self):
        origin = "chrome-extension://" + "a" * 32
        response = self.request(headers={"Origin": origin})
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), origin)

    def test_blocks_regular_web_page(self):
        response = self.request(headers={"Origin": "https://example.com"})
        self.assertEqual(response.status, 403)
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))

    def test_blocks_untrusted_host(self):
        response = self.request(headers={"Host": "attacker.example"})
        self.assertEqual(response.status, 403)


if __name__ == "__main__":
    unittest.main()
