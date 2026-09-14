import json
import threading
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from quotahush_server.providers._cache import TTLCache


class TTLCacheTests(unittest.TestCase):
    def test_coalesces_concurrent_fetches(self):
        cache = TTLCache(ttl_seconds=60)
        fetch_started = threading.Event()
        allow_fetch_to_finish = threading.Event()
        calls = 0

        def fetch():
            nonlocal calls
            calls += 1
            fetch_started.set()
            allow_fetch_to_finish.wait(timeout=2)
            return {"value": 42}

        results = []
        workers = [threading.Thread(target=lambda: results.append(cache.get(fetch))) for _ in range(3)]
        for worker in workers:
            worker.start()
        self.assertTrue(fetch_started.wait(timeout=1))
        time.sleep(0.05)
        allow_fetch_to_finish.set()
        for worker in workers:
            worker.join(timeout=2)

        self.assertEqual(calls, 1)
        self.assertEqual(results, [{"value": 42}] * 3)

    def test_returns_last_success_during_rate_limit(self):
        cache = TTLCache(ttl_seconds=10, default_backoff_seconds=300)
        responses = iter(
            [
                {"value": 42},
                {"error": "http_error", "message": "429 Too Many Requests"},
            ]
        )

        with patch("quotahush_server.providers._cache.time.monotonic") as clock:
            clock.side_effect = [0, 0, 0, 11, 11, 11]
            self.assertEqual(cache.get(lambda: next(responses)), {"value": 42})
            self.assertEqual(cache.get(lambda: next(responses)), {"value": 42})

    def test_honours_positive_retry_after(self):
        cache = TTLCache(ttl_seconds=10, default_backoff_seconds=300)
        response = {
            "error": "http_error",
            "message": "429 Too Many Requests",
            "retry_after": 900,
        }

        with patch("quotahush_server.providers._cache.time.monotonic") as clock:
            clock.side_effect = [0, 0, 20]
            self.assertEqual(cache.get(lambda: response), response)
            cooldown = cache.get(lambda: self.fail("must not fetch during cooldown"))

        self.assertEqual(cooldown["error"], "rate_limited")
        self.assertIn("880s", cooldown["message"])

    def test_does_not_cache_not_configured(self):
        cache = TTLCache(ttl_seconds=300)
        responses = iter(
            [
                {"error": "not_configured", "message": "Add an API key."},
                {"value": 42},
            ]
        )

        self.assertEqual(cache.get(lambda: next(responses))["error"], "not_configured")
        self.assertEqual(cache.get(lambda: next(responses)), {"value": 42})

    def test_persists_last_success_and_marks_stale_fallback(self):
        with TemporaryDirectory() as temporary_directory:
            storage_path = Path(temporary_directory) / "claude_usage.json"
            cache = TTLCache(
                ttl_seconds=300,
                storage_path=storage_path,
                include_metadata=True,
            )

            fresh = cache.get(lambda: {"five_hour": {"utilization": 12}})
            self.assertFalse(fresh["_cache"]["stale"])
            self.assertTrue(storage_path.exists())

            stored = json.loads(storage_path.read_text(encoding="utf-8"))
            stored["saved_at"] = time.time() - 600
            storage_path.write_text(json.dumps(stored), encoding="utf-8")

            reloaded = TTLCache(
                ttl_seconds=300,
                storage_path=storage_path,
                include_metadata=True,
            )
            stale = reloaded.get(
                lambda: {"error": "http_error", "message": "429 Too Many Requests"}
            )

            self.assertEqual(stale["five_hour"]["utilization"], 12)
            self.assertTrue(stale["_cache"]["stale"])


if __name__ == "__main__":
    unittest.main()
