"""Check deployable HTML, SEO, local references and hosting configuration."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
from PIL import Image
import json
import re
import tomllib
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.tags = []
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attributes):
        self.tags.append((tag, dict(attributes)))


pages = list(ROOT.glob("*.html")) + list((ROOT / "admin").glob("*.html"))
issues = []
for path in pages:
    page = Page(path)
    public = path.parent == ROOT and path.name != "404.html"
    if public:
        assert sum(tag == "h1" for tag, _ in page.tags) == 1, path.name
        assert sum(tag == "meta" and a.get("name") == "description" for tag, a in page.tags) == 1, path.name
        assert sum(tag == "link" and a.get("rel") == "canonical" for tag, a in page.tags) == 1, path.name
    if path.parent.name == "admin":
        assert any(tag == "meta" and a.get("name") == "robots" and "noindex" in a.get("content", "") for tag, a in page.tags), path.name
        if path.name != "login.html":
            assert any(tag == "script" and "security.js" in a.get("src", "") for tag, a in page.tags), path.name
    for tag, attrs in page.tags:
        if tag == "script" and attrs.get("src"):
            assert "defer" in attrs or "async" in attrs, (path.name, attrs["src"])
        if tag == "img":
            assert attrs.get("width") and attrs.get("height"), (path.name, attrs.get("src"))
            assert "alt" in attrs, (path.name, attrs.get("src"))
        if tag == "a" and attrs.get("target") == "_blank":
            assert "noopener" in attrs.get("rel", ""), path.name
        for attribute in ("src", "href", "data-bg"):
            value = attrs.get(attribute, "")
            parsed = urlsplit(value)
            if not value or parsed.scheme or parsed.netloc:
                continue
            local = (ROOT / unquote(parsed.path.lstrip("/"))) if parsed.path.startswith("/") else (path.parent / unquote(parsed.path))
            if not parsed.path:
                local = path
            if local.is_dir():
                local /= "index.html"
            if not local.exists() and not local.suffix:
                local = local.with_suffix(".html")
            if not local.exists():
                issues.append(f"{path.relative_to(ROOT)}: missing {value}")
            elif tag == "a" and parsed.fragment and local.suffix == ".html":
                ids = {a.get("id") for _, a in Page(local).tags}
                if parsed.fragment not in ids:
                    issues.append(f"{path.relative_to(ROOT)}: missing anchor {value}")
    for block in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', path.read_text(encoding="utf-8"), re.S):
        json.loads(block)

for path in ROOT.glob("*.css"):
    for value in re.findall(r"url\(['\"]?([^)'\"]+)", path.read_text(encoding="utf-8")):
        if ":" not in value and not value.startswith("#"):
            assert (ROOT / unquote(value)).exists(), (path.name, value)
tomllib.loads((ROOT / "netlify.toml").read_text())
for filename in ("firebase.json", "vercel.json"):
    json.loads((ROOT / filename).read_text())
urls = ET.parse(ROOT / "sitemap.xml").getroot()
assert len(urls) == len([page for page in pages if page.parent == ROOT and page.name != "404.html"])
assert not issues, "\n".join(issues)
print(f"PASS: {len(pages)} pages: local links/anchors/assets, image sizes, deferred scripts, metadata, admin noindex and hosting config")
