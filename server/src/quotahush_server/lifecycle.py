"""Server process lifecycle, compatibility heartbeat, and runtime metadata."""
from __future__ import annotations

import json
import os
import sys
import threading
import time
from pathlib import Path

from quotahush_server.api import (
    HOST,
    PORT,
    Handler,
    SingleInstanceHTTPServer,
    _collect_usage,
)
from quotahush_server.diagnostics import _configure_logging, _logger
from quotahush_server.updater import start_auto_update_thread

SELF_POLL_SECONDS = 600
HEARTBEAT_MAX_AGE_SECONDS = 5


def _heartbeat_is_stale(path: Path, now: float | None = None) -> bool:
    try:
        modified_at = path.stat().st_mtime
    except OSError:
        return True
    return (time.time() if now is None else now) - modified_at > HEARTBEAT_MAX_AGE_SECONDS


def _heartbeat_watchdog(server: SingleInstanceHTTPServer, path: Path) -> None:
    while True:
        time.sleep(2)
        if _heartbeat_is_stale(path):
            server.shutdown()
            return


def _runtime_path() -> Path:
    configured = os.environ.get("QUOTAHUSH_RUNTIME_FILE")
    if configured:
        return Path(configured)
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "QuotaHush" / "server.json"
    return Path.home() / ".local" / "state" / "quotahush" / "server.json"


def _server_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def _write_runtime_file(path: Path) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with temporary.open("w", encoding="utf-8") as runtime_file:
            json.dump(
                {"pid": os.getpid(), "server_dir": str(_server_dir())},
                runtime_file,
            )
        temporary.replace(path)
    except OSError:
        try:
            temporary.unlink(missing_ok=True)
        except OSError:
            pass
        _logger.exception("failed to write runtime file %s", path)


def _remove_runtime_file(path: Path) -> None:
    try:
        with path.open("r", encoding="utf-8") as runtime_file:
            runtime = json.load(runtime_file)
        if runtime.get("pid") == os.getpid():
            path.unlink(missing_ok=True)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return


def _self_poll_loop() -> None:
    while True:
        time.sleep(SELF_POLL_SECONDS)
        try:
            _collect_usage()
        except Exception:
            _logger.exception("self-poll failed")


def run() -> None:
    log_path = _configure_logging()
    _logger.info("starting QuotaHush server log=%s", log_path)
    try:
        server = SingleInstanceHTTPServer((HOST, PORT), Handler)
    except OSError:
        _logger.exception("failed to bind http://%s:%s", HOST, PORT)
        raise

    runtime_path = _runtime_path()
    _write_runtime_file(runtime_path)
    print(f"quotahush-server listening on http://{HOST}:{PORT}", file=sys.stderr)
    _logger.info("listening on http://%s:%s", HOST, PORT)
    threading.Thread(target=_self_poll_loop, daemon=True).start()
    start_auto_update_thread()
    heartbeat_path = os.environ.get("QUOTAHUSH_HEARTBEAT_PATH")
    if heartbeat_path:
        threading.Thread(
            target=_heartbeat_watchdog,
            args=(server, Path(heartbeat_path)),
            daemon=True,
        ).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        _logger.info("stopping QuotaHush server")
        server.shutdown()
        server.server_close()
        _remove_runtime_file(runtime_path)
