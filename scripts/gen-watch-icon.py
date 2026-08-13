#!/usr/bin/env python3
"""Render the watchOS app icon: dark VISP wordmark on a light background.

App Review (guideline 4) rejected the black watch icon because it does not read
as circular against the watch face. watchOS crops the icon to a circle, so this
takes the wordmark out of assets/images/icon.png, drops the SMPTE bars (they sit
where the circle crops), and puts it on the same light blue the Android adaptive
icon already uses.

    python3 scripts/gen-watch-icon.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "apps" / "native"
SRC = NATIVE / "assets" / "images" / "icon.png"
OUT = NATIVE / "assets" / "images" / "watch-icon.png"
# @bacons/apple-targets regenerates this from OUT on prebuild; written here too
# so the checked-in target matches without a prebuild.
OUT_TARGET = (
    NATIVE
    / "targets/watch/Assets.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png"
)

SIZE = 1024
BG = (230, 244, 254)  # #E6F4FE, same as android.adaptiveIcon.backgroundColor
FG = (10, 10, 10)
WIDTH_RATIO = 0.78  # wordmark width vs icon width: corners still clear the circle


def wordmark(src: Image.Image) -> Image.Image:
    """Alpha mask of the white VISP glyphs, cropped to their bounding box."""
    w, h = src.size
    # The SMPTE bars live in the outer ~15% top and bottom; skip them so only
    # the white lettering survives the threshold.
    band = src.convert("RGB").crop((0, int(h * 0.15), w, int(h * 0.85)))
    mask = band.convert("L").point(lambda v: 255 if v > 128 else 0)
    return mask.crop(mask.getbbox())


def main() -> None:
    mark = wordmark(Image.open(SRC))
    target_w = int(SIZE * WIDTH_RATIO)
    target_h = round(mark.height * target_w / mark.width)
    mark = mark.resize((target_w, target_h), Image.LANCZOS)

    icon = Image.new("RGB", (SIZE, SIZE), BG)
    icon.paste(
        Image.new("RGB", mark.size, FG),
        ((SIZE - target_w) // 2, (SIZE - target_h) // 2),
        mark,
    )
    icon.save(OUT)
    icon.save(OUT_TARGET)
    print(f"wrote {OUT} and {OUT_TARGET}")


if __name__ == "__main__":
    main()
