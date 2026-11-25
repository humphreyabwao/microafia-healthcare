"""Build smaller, content-addressed copies; preserve original image files.

Requires Pillow. Run from the repository root before updating asset references.
"""
from pathlib import Path
from PIL import Image, ImageOps
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "images" / "optimized"
DEST.mkdir(exist_ok=True)
manifest = {}
deduplicated = {}

for source in sorted((ROOT / "images").iterdir()):
    if source.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        continue
    digest = hashlib.sha256(source.read_bytes()).hexdigest()[:10]
    if digest in deduplicated:
        manifest[source.name] = deduplicated[digest]
        continue
    image = ImageOps.exif_transpose(Image.open(source))
    logo = source.name == "Logo.png"
    maximum = min(image.width, 320 if logo else 1440)
    widths = sorted(set([min(640, maximum), min(1024, maximum), maximum]))
    variants = []
    slug = re.sub(r"[^a-z0-9]+", "-", source.stem.lower()).strip("-")
    for width in widths:
        height = round(image.height * width / image.width)
        resized = image.resize((width, height), Image.Resampling.LANCZOS)
        output = DEST / f"{slug}-{digest}-{width}.webp"
        resized.save(output, "WEBP", quality=84, method=6, lossless=logo)
        variants.append({"src": output.relative_to(ROOT).as_posix(), "width": width,
                         "height": height, "bytes": output.stat().st_size})
    entry = {"originalBytes": source.stat().st_size, "variants": variants}
    manifest[source.name] = entry
    deduplicated[digest] = entry

logo = Image.open(ROOT / "images" / "Logo.png").convert("RGBA")
for size, name in [(64, "favicon.png"), (180, "apple-touch-icon.png")]:
    canvas = Image.new("RGBA", (size, size))
    mark = logo.copy()
    mark.thumbnail((size - 8, size - 8), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    canvas.save(DEST / name, optimize=True)

(DEST / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
before = sum(entry["originalBytes"] for entry in deduplicated.values())
after = sum(entry["variants"][-1]["bytes"] for entry in deduplicated.values())
print(f"Unique original images: {before:,} bytes; largest optimized copies: {after:,} bytes")
