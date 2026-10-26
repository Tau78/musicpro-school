#!/usr/bin/env python3
"""Compose Instagram 9:16 app-launch story for MusicPro School.

Testo solo da TTF (Montserrat / Bebas Neue). Navy + gold + white — no coral LM.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H = 1080, 1920
SAFE_X, SAFE_Y, SAFE_W, SAFE_H = 65, 269, 950, 979
SAFE_RIGHT = SAFE_X + SAFE_W
SAFE_BOTTOM = SAFE_Y + SAFE_H  # 1248
CTA_BASELINE_MAX = 1180
ICON_SIZE = 168
MOCKUP_PATH_REL = Path("assets/mockups/musicpro-school-mockup-final.png")
ICON_PATH_REL = Path("musicpro/apps/mobile/assets/icon.png")

NAVY_DARK = (12, 24, 40)  # #0c1828
NAVY = (30, 58, 95)  # #1e3a5f
GOLD = (201, 162, 39)  # #c9a227
CREAM = (248, 244, 236)
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "docs" / "assets" / "school" / "fonts"
OUT_DIR = ROOT / "docs" / "assets" / "school" / "storie-app"
DEFAULT_OUT = OUT_DIR / "APP-2026-10-26-lancio.png"
MOCKUP_PATH = ROOT / MOCKUP_PATH_REL
ICON_PATH = ROOT / ICON_PATH_REL

FONT_BOLD = FONTS_DIR / "Montserrat-Bold.ttf"
FONT_EXTRABOLD = FONTS_DIR / "Montserrat-ExtraBold.ttf"
FONT_BEBAS = FONTS_DIR / "BebasNeue-Regular.ttf"

# Copy fissa — non inventare altre righe
EYEBROW = "MUSICPRO SCHOOL"
TITLE = "L'APP È QUI"
BODY = "Prenota la sala dallo smartphone"
GOLD_LINE = "Presto anche per gli allievi"
CTA_LABEL = "Scaricala dagli store"
STORES_LINE = "App Store  ·  Play Store"


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def load_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(path), size=size)
    except OSError as exc:
        die(f"error: font non caricabile: {path} ({exc})")
        raise


def require_fonts() -> None:
    missing = [
        p
        for p in (FONT_BOLD, FONT_EXTRABOLD, FONT_BEBAS)
        if not p.is_file()
    ]
    if missing:
        names = ", ".join(str(p) for p in missing)
        die(f"error: mancano i font in docs/assets/school/fonts/ ({names})")


def cover_crop(im: Image.Image, tw: int, th: int) -> Image.Image:
    """Scale to cover, crop center. Never stretch independently."""
    src = im.convert("RGBA")
    sw, sh = src.size
    if sw < 1 or sh < 1:
        die("error: --bg immagine vuota o illeggibile")
    scale = max(tw / sw, th / sh)
    nw = max(1, round(sw * scale))
    nh = max(1, round(sh * scale))
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def vertical_gradient(c1: tuple[int, int, int], c2: tuple[int, int, int]) -> Image.Image:
    top = Image.new("RGB", (W, H), c1)
    bot = Image.new("RGB", (W, H), c2)
    mask = Image.linear_gradient("L").resize((W, H))
    return Image.composite(bot, top, mask)


def add_gold_glow(base: Image.Image, alpha: int = 55) -> Image.Image:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.ellipse((120, 720, 960, 1560), fill=(*GOLD, alpha))
    overlay = overlay.filter(ImageFilter.GaussianBlur(120))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def make_background(bg_path: Path | None) -> tuple[Image.Image, str]:
    """Returns (canvas RGBA, 'photo' | 'gradient')."""
    if bg_path is not None and bg_path.is_file():
        try:
            photo = Image.open(bg_path)
        except OSError as exc:
            die(f"error: --bg non apribile: {bg_path} ({exc})")
        covered = cover_crop(photo, W, H)
        # Scuro in cima (testo), più aperto in basso (telefono in sala).
        fade = ImageOps.invert(Image.linear_gradient("L").resize((W, H)))
        alpha = fade.point(lambda p: int(36 + (200 - 36) * (p / 255)))
        overlay = Image.new("RGBA", (W, H), (*NAVY_DARK, 255))
        overlay.putalpha(alpha)
        canvas = Image.alpha_composite(covered, overlay)
        return canvas, "photo"

    canvas = vertical_gradient(NAVY_DARK, NAVY).convert("RGBA")
    canvas = add_gold_glow(canvas)
    return canvas, "gradient"


def text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def fit_font(
    path: Path,
    text: str,
    start: int,
    max_width: int,
    min_size: int = 22,
) -> ImageFont.FreeTypeFont:
    dummy = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    size = start
    while size > min_size:
        font = load_font(path, size)
        width, _ = text_size(dummy, text, font)
        if width <= max_width:
            return font
        size -= 2
    return load_font(path, min_size)


def wrap_text(
    text: str,
    font: ImageFont.FreeTypeFont,
    max_width: int,
    max_lines: int = 2,
) -> list[str]:
    words = text.split()
    if not words:
        return []
    dummy = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    lines: list[str] = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        width, _ = text_size(dummy, trial, font)
        if width <= max_width:
            current = trial
            continue
        if current:
            lines.append(current)
        current = word
        if len(lines) >= max_lines:
            break
    if current and len(lines) < max_lines:
        lines.append(current)
    elif current and lines:
        lines[-1] = current
    return lines[:max_lines]


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    tracking: float = 5,
    anchor: str = "mt",
    stroke_width: int = 0,
    stroke_fill: tuple[int, int, int] | None = None,
) -> tuple[int, int]:
    if not text:
        return 0, 0
    widths = [font.getlength(ch) for ch in text]
    total = sum(widths) + tracking * max(0, len(text) - 1)
    dummy_h = draw.textbbox((0, 0), text, font=font)
    height = dummy_h[3] - dummy_h[1]
    x, y = xy
    if "m" in anchor:
        x = x - total / 2
    elif "r" in anchor:
        x = x - total
    for ch, cw in zip(text, widths):
        kwargs: dict = {"font": font, "fill": fill, "anchor": "lt"}
        if stroke_width:
            kwargs["stroke_width"] = stroke_width
            kwargs["stroke_fill"] = stroke_fill or BLACK
        draw.text((x, y), ch, **kwargs)
        x += cw + tracking
    return int(total), int(height)


def draw_shadow_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    anchor: str = "mt",
    stroke_width: int = 3,
    stroke_fill: tuple[int, int, int] = BLACK,
) -> tuple[int, int]:
    draw.text(
        xy,
        text,
        font=font,
        fill=fill,
        anchor=anchor,
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )
    bbox = draw.textbbox(xy, text, font=font, anchor=anchor)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def eyebrow_font_and_tracking(text: str) -> tuple[ImageFont.FreeTypeFont, float]:
    size = 34
    tracking = 7.0
    while size >= 22:
        font = load_font(FONT_EXTRABOLD, size)
        widths = [font.getlength(ch) for ch in text]
        total = sum(widths) + tracking * max(0, len(text) - 1)
        if total <= SAFE_W:
            return font, tracking
        if tracking > 2:
            tracking -= 0.5
            continue
        size -= 2
        tracking = 7.0
    return load_font(FONT_EXTRABOLD, 22), 2.0


def rounded_icon(size: int = ICON_SIZE) -> Image.Image:
    if not ICON_PATH.is_file():
        die(f"error: icona app mancante: {ICON_PATH}")
    icon = Image.open(ICON_PATH).convert("RGBA")
    icon = icon.resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1),
        radius=max(24, size // 6),
        fill=255,
    )
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(icon, (0, 0))
    out.putalpha(mask)
    return out


def paste_app_icon(canvas: Image.Image, y: int) -> int:
    icon = rounded_icon(ICON_SIZE)
    x = (W - ICON_SIZE) // 2
    # ombra morbida
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (x + 6, y + 10, x + ICON_SIZE + 6, y + ICON_SIZE + 10),
        radius=max(24, ICON_SIZE // 6),
        fill=(0, 0, 0, 90),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(icon, (x, y))
    return y + ICON_SIZE


def draw_cta_pill(
    canvas: Image.Image,
    text: str,
    baseline_y: int,
) -> int:
    """Navy pill, white label. Returns actual baseline used."""
    draw = ImageDraw.Draw(canvas)
    font = fit_font(FONT_BOLD, text, 34, SAFE_W - 80, min_size=22)
    tw, th = text_size(draw, text, font)
    pad_x, pad_y = 36, 18
    pill_w = tw + pad_x * 2
    pill_h = th + pad_y * 2
    baseline = min(baseline_y, CTA_BASELINE_MAX)
    dummy_bbox = draw.textbbox((0, 0), text, font=font, anchor="ls")
    ascent = -dummy_bbox[1]
    text_top = baseline - ascent
    pill_top = text_top - pad_y
    pill_bottom = pill_top + pill_h
    if pill_bottom > SAFE_BOTTOM - 8:
        shift = pill_bottom - (SAFE_BOTTOM - 8)
        pill_top -= shift
        baseline -= shift
    left = SAFE_X + (SAFE_W - pill_w) // 2
    draw.rounded_rectangle(
        (left, pill_top, left + pill_w, pill_top + pill_h),
        radius=pill_h // 2,
        fill=NAVY,
    )
    draw.text(
        (left + pill_w / 2, baseline),
        text,
        font=font,
        fill=WHITE,
        anchor="ms",
    )
    return baseline


def paste_phone_mockup(canvas: Image.Image, top_y: int) -> None:
    """Bottom phone mockup if it fits without squashing."""
    if not MOCKUP_PATH.is_file():
        return
    mock = Image.open(MOCKUP_PATH).convert("RGBA")
    mw, mh = mock.size
    if mw < 1 or mh < 1:
        return
    max_w = 620
    max_h = H - top_y - 24
    if max_h < 120:
        return
    scale = min(max_w / mw, max_h / mh)
    if scale <= 0:
        return
    nw = max(1, round(mw * scale))
    nh = max(1, round(mh * scale))
    if nh < 80:
        return
    mock = mock.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (W - nw) // 2
    y = H - nh - 16
    if y < top_y:
        y = top_y
    canvas.alpha_composite(mock, (x, y))


def compose_launch(bg_path: Path | None, include_mockup: bool = True) -> tuple[Image.Image, str]:
    require_fonts()
    canvas, bg_kind = make_background(bg_path)
    draw = ImageDraw.Draw(canvas)
    cx = SAFE_X + SAFE_W / 2

    y = paste_app_icon(canvas, SAFE_Y + 4) + 22

    ef, tracking = eyebrow_font_and_tracking(EYEBROW)
    _ew, eh = draw_tracked(
        draw,
        (cx, y),
        EYEBROW,
        ef,
        GOLD,
        tracking=tracking,
        anchor="mt",
        stroke_width=1,
        stroke_fill=BLACK,
    )
    y += eh + 18

    title_font = fit_font(FONT_BEBAS, TITLE, 168, SAFE_W + 20, min_size=96)
    title_lines = wrap_text(TITLE, title_font, SAFE_W, max_lines=2)
    for line in title_lines:
        line_font = fit_font(FONT_BEBAS, line, 168, SAFE_W + 20, min_size=96)
        draw_shadow_text(
            draw,
            (cx, y),
            line,
            line_font,
            WHITE,
            anchor="mt",
            stroke_width=4,
            stroke_fill=NAVY_DARK,
        )
        _tw, th = text_size(draw, line, line_font)
        y += th + 4
    y += 16

    body_font = fit_font(FONT_BOLD, BODY, 44, SAFE_W, min_size=28)
    draw_shadow_text(draw, (cx, y), BODY, body_font, CREAM, anchor="mt", stroke_width=2)
    _tw, th = text_size(draw, BODY, body_font)
    y += th + 14

    gold_font = fit_font(FONT_BOLD, GOLD_LINE, 38, SAFE_W, min_size=26)
    draw_shadow_text(draw, (cx, y), GOLD_LINE, gold_font, GOLD, anchor="mt", stroke_width=2)
    _tw, th = text_size(draw, GOLD_LINE, gold_font)
    y += th + 28

    baseline = min(y + 44, 980)
    baseline = draw_cta_pill(canvas, CTA_LABEL, baseline)
    draw = ImageDraw.Draw(canvas)

    stores_font = load_font(FONT_BOLD, 24)
    stores_y = baseline + 42
    if stores_y > SAFE_BOTTOM - 12:
        stores_y = SAFE_BOTTOM - 12
    draw_shadow_text(
        draw,
        (cx, stores_y),
        STORES_LINE,
        stores_font,
        WHITE,
        anchor="mt",
        stroke_width=1,
        stroke_fill=BLACK,
    )
    _sw, sh = text_size(draw, STORES_LINE, stores_font)
    content_bottom = stores_y + sh

    # Mockup 3 schermi solo sul fallback gradiente (la foto ha già il telefono).
    if include_mockup and bg_kind == "gradient" and content_bottom < SAFE_BOTTOM - 40:
        paste_phone_mockup(canvas, max(SAFE_BOTTOM - 20, content_bottom + 24))

    return canvas, bg_kind


def compose_smoke() -> Image.Image:
    canvas, _ = compose_launch(None, include_mockup=False)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle(
        (SAFE_X, SAFE_Y, SAFE_RIGHT, SAFE_BOTTOM),
        outline=GOLD,
        width=2,
    )
    return canvas


def save_rgb(canvas: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgb = canvas.convert("RGB")
    rgb.save(dest, format="PNG", optimize=True)
    print(str(dest))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compose storia Instagram 1080×1920 lancio app MusicPro School.",
    )
    parser.add_argument(
        "--bg",
        help="Foto full-bleed (cover crop). Se assente o mancante: gradiente navy.",
    )
    parser.add_argument(
        "--out",
        help=f"Output PNG (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help=f"Scrive {OUT_DIR.name}/_smoke-app-launch.png (safe area).",
    )
    parser.add_argument(
        "--no-mockup",
        action="store_true",
        help="Non compone il mockup telefono.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.smoke:
        canvas = compose_smoke()
        dest = OUT_DIR / "_smoke-app-launch.png"
        save_rgb(canvas, dest)
        return 0

    bg_path = Path(args.bg).expanduser().resolve() if args.bg else None
    default_bg = OUT_DIR / "APP-2026-10-26-lancio-bg.png"
    if bg_path is None and default_bg.is_file():
        bg_path = default_bg

    canvas, bg_kind = compose_launch(bg_path, include_mockup=not args.no_mockup)

    if args.out:
        dest = Path(args.out).expanduser().resolve()
    else:
        dest = DEFAULT_OUT

    save_rgb(canvas, dest)
    print(f"bg: {bg_kind}", file=sys.stderr)
    print(f"size: {dest.stat().st_size} bytes; canvas {W}x{H}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
