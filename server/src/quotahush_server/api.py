"""Local HTTP API and provider aggregation."""
from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from quotahush_server.diagnostics import _log_provider_result, _logger
from quotahush_server.providers import claude, codex, deepseek, zai
from quotahush_server.updater import get_update_status
from quotahush_server.version import __version__

HOST = "127.0.0.1"
PORT = int(os.environ.get("QUOTAHUSH_PORT", "8765"))
if not 1 <= PORT <= 65535:
    raise ValueError("QUOTAHUSH_PORT must be between 1 and 65535")
CHROME_EXTENSION_ID = re.compile(r"^[a-p]{32}$")

_executor = ThreadPoolExecutor(max_workers=4)


class SingleInstanceHTTPServer(ThreadingHTTPServer):
    # Disabling SO_REUSEADDR prevents multiple Windows processes from sharing the port.
    allow_reuse_address = False
    daemon_threads = True


def _allowed_host(value: str | None) -> bool:
    if not value:
        return False
    hostname = value.rsplit(":", 1)[0].lower()
    return hostname in {HOST, "localhost"}


def _allowed_origin(value: str | None) -> bool:
    if value is None:
        return True
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "chrome-extension"
        and parsed.hostname is not None
        and parsed.netloc == parsed.hostname
        and CHROME_EXTENSION_ID.fullmatch(parsed.hostname) is not None
        and parsed.path in {"", "/"}
        and not parsed.query
        and not parsed.fragment
    )


def _provider_result(name: str, future) -> dict:
    try:
        result = future.result()
        if not isinstance(result, dict):
            raise TypeError(f"provider returned {type(result).__name__}, expected dict")
    except Exception:
        _logger.exception("%s provider failed unexpectedly", name)
        result = {
            "error": "internal_error",
            "message": f"{name.capitalize()} provider failed unexpectedly; check the server log.",
        }
    _log_provider_result(name, result)
    return result


def _collect_usage() -> dict:
    futures = {
        "claude": _executor.submit(claude.get_usage),
        "codex": _executor.submit(codex.get_usage),
        "deepseek": _executor.submit(deepseek.get_usage),
        "zai": _executor.submit(zai.get_usage),
    }
    results = {
        name: _provider_result(name, future)
        for name, future in futures.items()
    }
    results["fetched_at"] = datetime.now(timezone.utc).isoformat()
    return results


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.headers.get("Origin")
        if origin and _allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def _request_allowed(self) -> bool:
        if _allowed_host(self.headers.get("Host")) and _allowed_origin(
            self.headers.get("Origin")
        ):
            return True
        _logger.warning(
            "blocked local API request host=%s origin=%s",
            self.headers.get("Host"),
            self.headers.get("Origin"),
        )
        self._send_json(403, {"error": "forbidden"})
        return False

    def do_OPTIONS(self):
        if not self._request_allowed():
            return
        self.send_response(204)
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self):
        if not self._request_allowed():
            return
        if self.path == "/usage":
            self._send_json(200, _collect_usage())
        elif self.path == "/health":
            self._send_json(
                200,
                {
                    "status": "ok",
                    "product": "QuotaHush",
                    "version": __version__,
                    "update": get_update_status(),
                },
            )
        else:
            self._send_json(404, {"error": "not_found"})
