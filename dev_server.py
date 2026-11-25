"""Serve the site locally with the clean HTML URLs used by hosting."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent


class CleanURLHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        self.send_header('Cache-Control', 'no-store')
        if urlsplit(self.path).path.startswith('/admin'):
            self.send_header('X-Robots-Tag', 'noindex, nofollow, noarchive')
        super().end_headers()

    def send_head(self):
        try:
            relative = Path(self.translate_path(self.path)).resolve().relative_to(ROOT)
        except ValueError:
            self.send_error(404)
            return None
        blocked = {'functions', 'scripts', 'tests', 'node_modules', '__pycache__'}
        if (any(part.startswith('.') or part.lower() in blocked for part in relative.parts)
                or relative.suffix.lower() in {'.rules', '.py', '.md', '.log'}
                or relative.name in {'firebase.json', 'vercel.json', 'netlify.toml', 'package.json', 'package-lock.json'}):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def translate_path(self, path):
        resolved = super().translate_path(path)
        if not Path(resolved).exists() and not Path(resolved).suffix:
            clean_path = urlsplit(path).path.rstrip("/")
            html_file = super().translate_path(clean_path + ".html")
            if Path(html_file).is_file():
                return html_file
        return resolved


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    handler = partial(CleanURLHandler, directory=str(Path(__file__).resolve().parent))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Microafia Health: http://localhost:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
