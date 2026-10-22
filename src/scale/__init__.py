"""Scale Pocket for the web: serves the static app in ``web/`` on localhost."""

import argparse
import errno
import functools
import http.server
import webbrowser
from importlib.resources import files

WEB_ROOT = files("scale") / "web"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
    }

    def end_headers(self) -> None:
        # Local dev server: always serve the latest files.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        pass


def serve(host: str, port: int) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(Handler, directory=str(WEB_ROOT))
    try:
        return http.server.ThreadingHTTPServer((host, port), handler)
    except OSError as exc:
        if exc.errno != errno.EADDRINUSE:
            raise
        print(f"Port {port} is busy, picking a free one.")
        return http.server.ThreadingHTTPServer((host, 0), handler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Scale Pocket web app locally.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    args = parser.parse_args()

    server = serve(args.host, args.port)
    # Web MIDI needs a secure context; localhost counts, a LAN IP does not.
    url = f"http://localhost:{server.server_address[1]}/"
    print(f"Scale Pocket running at {url}  (Ctrl+C to stop)")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        server.server_close()
