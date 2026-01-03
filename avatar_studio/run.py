# built by gruesøme
# SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f2999e2373f

"""
gruesøme's avatar studio (Asset Edition) runner

Run (Windows):
  py run.py
Or:
  python run.py

Then open:
  http://127.0.0.1:8080/
"""

import argparse
import http.server
import os
import socketserver
import threading
import time
import webbrowser
from pathlib import Path

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent
    os.chdir(str(root))

    class Reuse(socketserver.TCPServer):
        allow_reuse_address = True

    class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            # Ensure the browser doesn't cache app.js / CSS / JSON during rapid iteration.
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            super().end_headers()

    httpd = Reuse((args.host, args.port), NoCacheHandler)

    url = f"http://{args.host}:{args.port}/index.html"

    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    print("gruesøme's avatar studio · Asset Edition v2.7")
    print("Serving:", root)
    print("URL:", url)
    print("Ctrl+C to stop.")

    if not args.no_browser:
        time.sleep(0.25)
        try:
            webbrowser.open(url, new=1, autoraise=True)
        except Exception:
            pass

    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.shutdown()
        httpd.server_close()

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
