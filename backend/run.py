#!/usr/bin/env python3
"""
Launcher script for Traffic Flow Analysis backend server
Phase 3.7: Video processing + Frame ingestion
"""

import os
import socket

from app import create_app


def _is_port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0

if __name__ == "__main__":
    # Render sets PORT env variable; locally default to 5000
    port = int(os.environ.get("PORT", 5000))
    # Bind to 0.0.0.0 in production so external traffic can reach the server
    host = os.environ.get("HOST", "127.0.0.1")

    if _is_port_in_use(host, port):
        print(f"Backend already running on http://{host}:{port}. Not starting a duplicate process.")
        raise SystemExit(0)

    app = create_app()
    app.run(debug=False, host=host, port=port, use_reloader=False)
