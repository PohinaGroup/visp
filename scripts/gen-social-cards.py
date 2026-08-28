#!/usr/bin/env python3
"""Render the 1200x630 social cards in the VISP broadcast design language.

Every blog post needs a cover.png (src/lib/blog.tsx throws without one) and the
landing page needs an og-card. Both are the same drawing with a different
headline, so they are the same script.

Fonts come from the built web app, because that is the only place the real
Barlow / IBM Plex Mono files exist in this repo:

    cd apps/web && bun run build
    python3 scripts/gen-social-cards.py

Requires Pillow and fontTools (WOFF1 is zlib, so no brotli needed).
"""

from __future__ import annotations

import glob
import math
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
ASSETS = WEB / ".output" / "public" / "assets"
FONT_CACHE = ROOT / ".cache" / "social-card-fonts"

W, H = 1200, 630


# --- tokens ------------------------------------------------------------------
# The CSS is authored in oklch; converting here keeps one source of truth in
# src/index.css instead of a second hand-picked hex palette.


def oklch(light: float, chroma: float, hue_deg: float) -> tuple[int, int, int]:
    h = math.radians(hue_deg)
    a, b = chroma * math.cos(h), chroma * math.sin(h)
    l_ = (light + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (light - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (light - 0.0894841775 * a - 1.2914855480 * b) ** 3
    lin = (
        +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
    )

    def encode(c: float) -> int:
        c = max(0.0, min(1.0, c))
        srgb = 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
        return round(srgb * 255)

    return tuple(encode(c) for c in lin)


BACKGROUND = oklch(0.100, 0.012, 255)
FOREGROUND = oklch(0.950, 0.004, 250)
MUTED = oklch(0.700, 0.014, 252)
TALLY = oklch(0.630, 0.210, 27)
BORDER = tuple(round(b + (255 - b) * 0.12) for b in BACKGROUND)


# --- fonts -------------------------------------------------------------------

FONT_SOURCES = {
    "display": "barlow-condensed-latin-600-normal",
    "sans": "barlow-latin-400-normal",
    "mono": "ibm-plex-mono-latin-500-normal",
}


def ensure_fonts() -> dict[str, Path]:
    FONT_CACHE.mkdir(parents=True, exist_ok=True)
    paths = {}
    for name, stem in FONT_SOURCES.items():
        target = FONT_CACHE / f"{name}.ttf"
        if not target.exists():
            matches = glob.glob(str(ASSETS / f"{stem}-*.woff"))
            if not matches:
                raise SystemExit(
                    f"No {stem} woff in {ASSETS}. Run `bun run build` in apps/web first."
                )
            font = TTFont(matches[0])
            font.flavor = None
            font.save(target)
        paths[name] = target
    return paths


def tracked(draw: ImageDraw.ImageDraw, xy, text, font, fill, tracking=0.0):
    """PIL has no letter-spacing; the mono labels in this design need it."""
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += draw.textlength(char, font=font) + tracking
    return x


# --- the drawing -------------------------------------------------------------

CHAIN = [("SOURCE", "phone/browser"), ("RELAY", "visp"), ("DIRECT", "encode"), ("OUT", "twitch/kick")]


def render(headline: list[str], eyebrow: str, out: Path) -> None:
    fonts = ensure_fonts()
    display = ImageFont.truetype(str(fonts["display"]), 96)
    mono_sm = ImageFont.truetype(str(fonts["mono"]), 17)
    mono_xs = ImageFont.truetype(str(fonts["mono"]), 15)
    wordmark = ImageFont.truetype(str(fonts["display"]), 34)

    img = Image.new("RGB", (W, H), BACKGROUND)
    draw = ImageDraw.Draw(img)

    margin = 72

    # Wordmark + rule, mirroring the site header.
    tracked(draw, (margin, 54), "VISP", wordmark, FOREGROUND, tracking=9)
    draw.rectangle([margin, 112, W - margin, 112], fill=BORDER)

    tracked(draw, (margin, 146), eyebrow.upper(), mono_xs, MUTED, tracking=3.4)

    # Headline, uppercase condensed, tight leading like the h1.
    y = 196
    for line in headline:
        draw.text((margin, y), line.upper(), font=display, fill=FOREGROUND)
        y += 92

    # The signature signal chain. Inset past the margin so the widest end
    # labels (SOURCE, twitch/kick) still sit inside the type column.
    chain_y = 468
    inset = margin + 56
    draw.rectangle([inset, chain_y, W - inset, chain_y], fill=BORDER)
    span = W - inset * 2
    step = span / (len(CHAIN) - 1)
    for i, (tag, label) in enumerate(CHAIN):
        cx = inset + step * i
        draw.rectangle(
            [cx - 6, chain_y - 6, cx + 6, chain_y + 6],
            fill=BACKGROUND,
            outline=FOREGROUND,
            width=2,
        )
        tag_w = sum(draw.textlength(c, font=mono_sm) + 2.6 for c in tag) - 2.6
        tracked(draw, (cx - tag_w / 2, chain_y - 40), tag, mono_sm, FOREGROUND, tracking=2.6)
        label_w = draw.textlength(label, font=mono_xs)
        draw.text((cx - label_w / 2, chain_y + 20), label, font=mono_xs, fill=MUTED)

    # One packet in flight, the only saturated pixel on the card.
    packet_x = inset + step * 1.5
    draw.ellipse(
        [packet_x - 6, chain_y - 6, packet_x + 6, chain_y + 6], fill=TALLY
    )

    domain = "visp-stream.com"
    domain_w = sum(draw.textlength(c, font=mono_sm) + 2.0 for c in domain) - 2.0
    tracked(draw, (W - margin - domain_w, H - 66), domain, mono_sm, MUTED, tracking=2.0)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    print(f"wrote {out.relative_to(ROOT)}")


CARDS = [
    (WEB / "public" / "og-card.png", ["Go live from", "anywhere"], "IRL streaming — free during beta"),
    (
        WEB / "content" / "blog" / "irltoolkit-alternative" / "cover.png",
        ["The $129/mo", "tool, for free"],
        "Comparison",
    ),
    (
        WEB / "content" / "blog" / "stream-to-twitch-without-a-pc" / "cover.png",
        ["Stream to Twitch", "without a PC"],
        "Guide",
    ),
    (
        WEB / "content" / "blog" / "cheapest-irl-streaming-setup-2026" / "cover.png",
        ["The cheapest", "IRL setup in 2026"],
        "Comparison",
    ),
    (
        WEB / "content" / "blog" / "streamable-run-vs-visp" / "cover.png",
        ["Streamable.run", "vs VISP"],
        "Comparison",
    ),
    (
        WEB / "content" / "blog" / "irl-chat-bot-alerts-without-a-pc" / "cover.png",
        ["Tell chat", "you dropped"],
        "Guide",
    ),
]


if __name__ == "__main__":
    for path, headline, eyebrow in CARDS:
        render(headline, eyebrow, path)
