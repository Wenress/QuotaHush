"""Executable entry point for the local QuotaHush server."""
from __future__ import annotations

# Re-exports preserve compatibility for existing imports while implementation
# lives in modules grouped by responsibility.
from quotahush_server.api import Handler, SingleInstanceHTTPServer
from quotahush_server.diagnostics import _configure_logging, _logger, _safe_log_text
from quotahush_server.lifecycle import _heartbeat_is_stale, run


def main() -> None:
    run()


if __name__ == "__main__":
    main()
