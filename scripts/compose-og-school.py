#!/usr/bin/env python3
"""Compose Open Graph 1200×630 — MusicPro School (school.musicproeventi.it).

Text only from TTF (Montserrat / Bebas Neue). Navy + gold + cream. No AI text.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

NAVY = (30, 58, 95)  # #1e3a5f
GOLD = (201, 162, 39)  # #c9a227
CREAM = (246, 243, 236)  # #f6f3ec
WHITE = (255, 255, 255)

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "docs" / "assets" / "school" / "fonts"
LOGO_CANDIDATES = [
    ROOT / "musicpro" / "apps" / "web" / "public" / "images" / "receipt-assoc-logo.png",
    ROOT / "assets" / "music-pro-logo.png",
]

OUT_PATHS = [
    ROOT / "docs" / "assets" / "school" / "og" / "og-school-1200x630.png",
    ROOT / "musicpro" / "apps" / "web" / "public" / "images" / "og-school.png",
]

FONT_BOLD = FONTS_DIR / "Montserrat-Bold.ttf"
FONT_EXTRABOLD = FONTS_DIR / "Montserrat-ExtraBold.ttf"
FONT_BEBAS = FONTS_DIR / "BebasNeue-Regular.ttf"

LOGO_W = 480
HAIRLINE_H = 2

LUMA_PUNCH_MAX = 90
CHROMA_PUNCH_MAX = 40

LINE_TITLE = "MusicPro School"
LINE_SUB = "Associazione MusicPro"
LINE_URL = "school.musicproeventi.it"


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def load_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(path), size=size)
    except OSError as exc:
        die(f"error: font non caricabile: {path} ({exc})")
        raise


def text_w(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> float:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def text_h(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> float:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[3] - bbox[1]


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    tracking_px: float,
    anchor: str = "mm",
) -> None:
    upper = text.upper()
    chars = list(upper)
    if not chars:
        return
    widths = [text_w(draw, c, font) for c in chars]
    total = sum(widths) + tracking_px * (len(chars) - 1)
    x0, y0 = xy
    th = text_h(draw, upper, font)
    if anchor == "mm":
        x = x0 - total / 2
        y = y0 - th / 2
    elif anchor == "lm":
        x = x0
        y = y0 - th / 2
    elif anchor == "rm":
        x = x0 - total
        y = y0 - th / 2
    else:
        x, y = x0, y0
    for i, ch in enumerate(chars):
        draw.text((x, y), ch, font=font, fill=fill)
        x += widths[i] + tracking_px


def punch_near_black(logo: Image.Image) -> Image.Image:
    out = logo.convert("RGBA")
    pixels = out.load()
    width, height = out.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            chroma = max(r, g, b) - min(r, g, b)
            if lum < LUMA_PUNCH_MAX and chroma < CHROMA_PUNCH_MAX:
                pixels[x, y] = (0, 0, 0, 0)
    return out


def punch_dirt_score(logo: Image.Image) -> int:
    score = 0
    pixels = logo.load()
    width, height = logo.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            chroma = max(r, g, b) - min(r, g, b)
            if lum < LUMA_PUNCH_MAX and chroma < CHROMA_PUNCH_MAX:
                score += 1
    return score


def assocszione_missing(punched: Image.Image) -> bool:
    w, h = punched.size
    y0 = int(h * 0.72)
    visible = 0
    pixels = punched.load()
    for y in range(y0, h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 32:
                continue
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if lum > 140 or r > 160 and r > g + 30:
                visible += 1
    return visible < 80


def load_best_logo_raw() -> Image.Image:
    best: Image.Image | None = None
    best_score = 10**9
    for path in LOGO_CANDIDATES:
        if not path.is_file():
            continue
        punched = punch_near_black(Image.open(path))
        score = punch_dirt_score(punched)
        if score < best_score:
            best_score = score
            best = punched
    if best is None:
        die(f"error: nessun logo tra: {', '.join(str(p) for p in LOGO_CANDIDATES)}")
    return best


def prepare_logo(target_w: int) -> tuple[Image.Image, bool]:
    punched = load_best_logo_raw()
    need_assoc = assocszione_missing(punched)
    lw, lh = punched.size
    nh = int(round(lh * (target_w / lw)))
    logo = punched.resize((target_w, nh), Image.Resampling.LANCZOS)
    return logo, need_assoc


def paste_logo_rgba(canvas: Image.Image, logo: Image.Image, x: int, y_top: int) -> None:
    canvas.paste(logo, (x, y_top), logo)


def compose() -> Image.Image:
    for p in (FONT_BOLD, FONT_EXTRABOLD):
        if not p.is_file():
            die(f"error: font mancante: {p}")

    logo_rgba, need_assoc = prepare_logo(LOGO_W)
    logo_h = logo_rgba.size[1]

    f_assoc = load_font(FONT_BOLD, 15)
    f_school_tag = load_font(FONT_BOLD, 22)
    f_title = load_font(FONT_EXTRABOLD, 52)
    f_sub = load_font(FONT_BOLD, 28)
    f_url = load_font(FONT_BOLD, 22)

    dummy = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    assoc_track_h = 20 if need_assoc else 0
    school_tag_h = int(text_h(dummy, "SCHOOL", f_school_tag)) + 8
    title_h = int(text_h(dummy, LINE_TITLE, f_title))
    sub_h = int(text_h(dummy, LINE_SUB, f_sub))
    url_h = int(text_h(dummy, LINE_URL, f_url))

    gap_logo_assoc = 6 if need_assoc else 0
    gap_assoc_school = 10
    gap_school_hair = 22
    gap_hair_title = 28
    gap_title_sub = 12
    gap_sub_url = 10

    block_h = (
        logo_h
        + gap_logo_assoc
        + assoc_track_h
        + gap_assoc_school
        + school_tag_h
        + gap_school_hair
        + HAIRLINE_H
        + gap_hair_title
        + title_h
        + gap_title_sub
        + sub_h
        + gap_sub_url
        + url_h
    )

    y = (H - block_h) // 2
    cx = W // 2

    img = Image.new("RGB", (W, H), NAVY)
    paste_logo_rgba(img, logo_rgba, cx - LOGO_W // 2, y)
    y += logo_h

    draw = ImageDraw.Draw(img)

    if need_assoc:
        y += gap_logo_assoc
        draw_tracked(
            draw,
            (cx, y + assoc_track_h // 2),
            "ASSOCIAZIONE",
            f_assoc,
            WHITE,
            4.0,
            anchor="mm",
        )
        y += assoc_track_h

    y += gap_assoc_school
    draw_tracked(
        draw,
        (cx, y + school_tag_h // 2),
        "SCHOOL",
        f_school_tag,
        GOLD,
        7.0,
        anchor="mm",
    )
    y += school_tag_h

    y += gap_school_hair
    hair_w = 520
    draw.rectangle((cx - hair_w // 2, y, cx + hair_w // 2, y + HAIRLINE_H), fill=GOLD)
    y += HAIRLINE_H + gap_hair_title

    draw.text((cx, y), LINE_TITLE, font=f_title, fill=CREAM, anchor="mt")
    y += title_h + gap_title_sub

    draw.text((cx, y), LINE_SUB, font=f_sub, fill=WHITE, anchor="mt")
    y += sub_h + gap_sub_url

    draw.text((cx, y), LINE_URL, font=f_url, fill=GOLD, anchor="mt")

    return img


def main() -> None:
    img = compose()
    if img.size != (W, H):
        die(f"error: dimensioni {img.size}, atteso {(W, H)}")
    for out_path in OUT_PATHS:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_path, "PNG", optimize=True)
        print(f"wrote {out_path} ({W}×{H})")


if __name__ == "__main__":
    main()
