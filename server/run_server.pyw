"""Source entry point for the local QuotaHush server."""
from __future__ import annotations

import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVER_DIR / "src"))

from quotahush_server.main import main


if __name__ == "__main__":
    main()
