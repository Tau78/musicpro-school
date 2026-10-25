#!/usr/bin/env python3
"""Compose Instagram 9:16 stories for MusicPro School last-minute room slots.

Testo solo da TTF veri (Montserrat / Bebas Neue OFL) + args CLI.
Mai testo dal generatore di immagini, mai prezzi inventati.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
SAFE_X, SAFE_Y, SAFE_W, SAFE_H = 65, 269, 950, 979
SAFE_RIGHT = SAFE_X + SAFE_W
SAFE_BOTTOM = SAFE_Y + SAFE_H  # 1248 — sotto è UI storie
CTA_BASELINE_MAX = 1180
LOGO_MAX_W = 720
BG_OVERLAY_ALPHA = round(255 * 0.55)

NAVY_DARK = (12, 24, 40)  # #0c1828
NAVY = (30, 58, 95)  # #1e3a5f  CTA / brand
GOLD = (201, 162, 39)  # #c9a227
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

ROOM_ACCENT = {
    "Rossa": (178, 59, 62),  # #B23B3E
    "Verde": (56, 118, 75),  # #38764B
    "Arancio": (210, 118, 42),  # #D2762A
}

ITALIAN_WEEKDAYS = (
    "Lunedì",
    "Martedì",
    "Mercoledì",
    "Giovedì",
    "Venerdì",
    "Sabato",
    "Domenica",
)
ITALIAN_MONTHS = (
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre",
)

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "docs" / "assets" / "school" / "fonts"
OUT_DIR = ROOT / "docs" / "assets" / "school" / "storie-last-minute"
LOGO_PATH = ROOT / "assets" / "music-pro-logo.png"
SMOKE_OUT = OUT_DIR / "_smoke-layout.png"

FONT_BOLD = FONTS_DIR / "Montserrat-Bold.ttf"
FONT_EXTRABOLD = FONTS_DIR / "Montserrat-ExtraBold.ttf"
FONT_BEBAS = FONTS_DIR / "BebasNeue-Regular.ttf"


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
    missing = [p for p in (FONT_BOLD, FONT_EXTRABOLD) if not p.is_file()]
    if missing:
        names = ", ".join(str(p) for p in missing)
        die(
            "error: mancano i font OFL in docs/assets/school/fonts/ "
            f"({names}). Scaricali da GitHub google/fonts (raw), non da ~/Library/Fonts."
        )


def cover_crop(im: Image.Image, tw: int, th: int) -> Image.Image:
    """Scale to cover 9:16, crop center. Never stretch independently."""
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


def add_accent_glow(
    base: Image.Image,
    accent: tuple[int, int, int],
    center: tuple[int, int] = (540, 980),
    radius: int = 560,
    alpha: int = 88,
) -> Image.Image:
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = center
    draw.ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        fill=(*accent, alpha),
    )
    overlay = overlay.filter(ImageFilter.GaussianBlur(130))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def make_background(bg_path: Path | None, accent: tuple[int, int, int]) -> Image.Image:
    if bg_path is None:
        canvas = vertical_gradient(NAVY_DARK, NAVY).convert("RGBA")
        return add_accent_glow(canvas, accent)

    if not bg_path.is_file():
        die(f"error: --bg non trovato: {bg_path}")
    try:
        photo = Image.open(bg_path)
    except OSError as exc:
        die(f"error: --bg non apribile: {bg_path} ({exc})")
    covered = cover_crop(photo, W, H)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, BG_OVERLAY_ALPHA))
    return Image.alpha_composite(covered, overlay)


def logo_for_dark_bg(logo: Image.Image) -> Image.Image:
    """Near-black ink (es. «ASSOCIAZIONE») → bianco; rosso/bianco restano."""
    out = logo.copy()
    pixels = out.load()
    width, height = out.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < 16:
                continue
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            chroma = max(r, g, b) - min(r, g, b)
            # Solo inchiostro neutro (ASSOCIAZIONE), non il rosso MUSIC.
            if lum < 90 and chroma < 40:
                pixels[x, y] = (255, 255, 255, a)
    return out


def fit_logo(max_width: int = LOGO_MAX_W) -> Image.Image:
    if not LOGO_PATH.is_file():
        die(f"error: logo mancante: {LOGO_PATH}")
    logo = Image.open(LOGO_PATH).convert("RGBA")
    lw, lh = logo.size
    if lw < 1 or lh < 1:
        die("error: logo illeggibile")
    if lw > max_width:
        nh = max(1, round(lh * max_width / lw))
        logo = logo.resize((max_width, nh), Image.Resampling.LANCZOS)
    return logo_for_dark_bg(logo)


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
    # ellipsis if leftover words didn't fit
    joined = " ".join(lines)
    leftover = text[len(joined) :].strip()
    if leftover and lines:
        ell = lines[-1].rstrip() + "…"
        while text_size(dummy, ell, font)[0] > max_width and len(ell) > 2:
            ell = ell[:-2] + "…"
        lines[-1] = ell
    return lines[:max_lines]


def draw_tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    tracking: float = 6,
    anchor: str = "mt",
    stroke_width: int = 0,
    stroke_fill: tuple[int, int, int] | None = None,
) -> tuple[int, int]:
    """Draw uppercase kicker with letter-spacing. Returns (width, height)."""
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


def format_it_date(iso: str) -> str:
    try:
        day = datetime.strptime(iso, "%Y-%m-%d")
    except ValueError:
        die(f"error: --date deve essere YYYY-MM-DD (es. 2026-10-25), ricevuto: {iso}")
    return f"{ITALIAN_WEEKDAYS[day.weekday()]} {day.day} {ITALIAN_MONTHS[day.month - 1]}"


def parse_hhmm(value: str, flag: str) -> tuple[int, int]:
    parts = value.split(":")
    if len(parts) != 2:
        die(f"error: {flag} deve essere HH:MM (es. 20:00), ricevuto: {value}")
    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        die(f"error: {flag} deve essere HH:MM (es. 20:00), ricevuto: {value}")
    # 24:00 = mezzanotte (fine fascia 22–24).
    if hour == 24 and minute == 0:
        return 24, 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        die(f"error: {flag} orario non valido: {value}")
    return hour, minute


def hour_token(hhmm: str, flag: str) -> str:
    hour, _minute = parse_hhmm(hhmm, flag)
    return f"{hour:02d}"


def format_price(value: float) -> str:
    if value < 0:
        die("error: --price non può essere negativo")
    if abs(value - round(value)) < 1e-9:
        number = str(int(round(value)))
    else:
        number = f"{value:.2f}".replace(".", ",")
    return f"da {number} €"


def default_filename(
    sala: str,
    iso_date: str,
    start: str,
    end: str,
    phase: str,
    draft: bool,
) -> str:
    sh = hour_token(start, "--start")
    eh = hour_token(end, "--end")
    name = f"LM-{iso_date}-{sala}-{sh}-{eh}-{phase}"
    if draft:
        name += "-bozza"
    return name + ".png"


def apply_draft_watermark(base: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", (W * 2, H * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    font = load_font(FONT_EXTRABOLD, 110)
    for y in range(80, H * 2, 320):
        for x in range(40, W * 2, 560):
            draw.text((x, y), "BOZZA", font=font, fill=(255, 255, 255, 42))
    rotated = layer.rotate(28, resample=Image.Resampling.BICUBIC, expand=False)
    cx = (rotated.size[0] - W) // 2
    cy = (rotated.size[1] - H) // 2
    cropped = rotated.crop((cx, cy, cx + W, cy + H))
    return Image.alpha_composite(base.convert("RGBA"), cropped)


def draw_cta_pill(
    canvas: Image.Image,
    text: str,
    baseline_y: int,
) -> None:
    """Navy pill, testo bianco. Baseline del testo ≤ CTA_BASELINE_MAX."""
    draw = ImageDraw.Draw(canvas)
    font = fit_font(FONT_BOLD, text, 34, SAFE_W - 80, min_size=22)
    tw, th = text_size(draw, text, font)
    pad_x, pad_y = 36, 18
    pill_w = tw + pad_x * 2
    pill_h = th + pad_y * 2
    baseline = min(baseline_y, CTA_BASELINE_MAX)
    # textbbox origin with anchor ls (left-baseline): top ≈ baseline - ascent
    # place pill so the text sits on `baseline`
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


def paste_logo(canvas: Image.Image, y: int) -> int:
    logo = fit_logo()
    lw, lh = logo.size
    x = SAFE_X + (SAFE_W - lw) // 2
    canvas.alpha_composite(logo, (x, y))
    return y + lh


def compose_smoke() -> Image.Image:
    require_fonts()
    canvas = vertical_gradient(NAVY_DARK, NAVY).convert("RGBA")
    # tre glow deboli sui colori sala, senza slot reale
    for accent, center in (
        (ROOM_ACCENT["Rossa"], (280, 1500)),
        (ROOM_ACCENT["Verde"], (540, 900)),
        (ROOM_ACCENT["Arancio"], (820, 1500)),
    ):
        canvas = add_accent_glow(canvas, accent, center=center, radius=380, alpha=70)

    draw = ImageDraw.Draw(canvas)
    draw.rectangle(
        (SAFE_X, SAFE_Y, SAFE_RIGHT, SAFE_BOTTOM),
        outline=GOLD,
        width=3,
    )

    y = paste_logo(canvas, SAFE_Y + 12) + 48

    swatch_w, swatch_h = 200, 88
    gap = 24
    total = 3 * swatch_w + 2 * gap
    sx = SAFE_X + (SAFE_W - total) // 2
    swatch_font = load_font(FONT_BOLD, 26)
    for i, (name, color) in enumerate(ROOM_ACCENT.items()):
        left = sx + i * (swatch_w + gap)
        draw.rounded_rectangle(
            (left, y, left + swatch_w, y + swatch_h),
            radius=18,
            fill=color,
        )
        draw.text(
            (left + swatch_w / 2, y + swatch_h / 2),
            name,
            font=swatch_font,
            fill=WHITE,
            anchor="mm",
        )

    y += swatch_h + 64
    label = "BOZZA LAYOUT · MusicPro"
    font = fit_font(FONT_EXTRABOLD, label, 42, SAFE_W - 20)
    draw_shadow_text(
        draw,
        (SAFE_X + SAFE_W / 2, y),
        label,
        font,
        GOLD,
        anchor="mt",
    )
    return canvas


def _kicker_font_and_tracking(text: str) -> tuple[ImageFont.FreeTypeFont, float]:
    path = FONT_BEBAS if FONT_BEBAS.is_file() else FONT_EXTRABOLD
    size = 72
    tracking = 8.0 if path == FONT_BEBAS else 2.0
    while size >= 36:
        font = load_font(path, size)
        widths = [font.getlength(ch) for ch in text]
        total = sum(widths) + tracking * max(0, len(text) - 1)
        if total <= SAFE_W:
            return font, tracking
        if tracking > 0:
            tracking = max(0.0, tracking - 1)
            continue
        size -= 4
        tracking = 8.0 if path == FONT_BEBAS else 2.0
    return load_font(path, 36), 0.0


def compose_story(args: argparse.Namespace) -> Image.Image:
    require_fonts()
    accent = ROOM_ACCENT[args.sala]
    bg = Path(args.bg).expanduser().resolve() if args.bg else None
    canvas = make_background(bg, accent)
    draw = ImageDraw.Draw(canvas)

    y = paste_logo(canvas, SAFE_Y + 8) + 28

    bar_h = 8
    draw.rounded_rectangle(
        (SAFE_X, y, SAFE_RIGHT, y + bar_h),
        radius=4,
        fill=accent,
    )
    y += bar_h + 36

    cx = SAFE_X + SAFE_W / 2
    main_lines = 0

    if args.phase == "chiuso":
        title = "Slot occupato"
        title_font = fit_font(FONT_EXTRABOLD, title, 86, SAFE_W)
        draw_shadow_text(draw, (cx, y), title, title_font, WHITE, anchor="mt")
        _tw, th = text_size(draw, title, title_font)
        y += th + 18
        main_lines += 1

        sub = "a presto"
        sub_font = load_font(FONT_BOLD, 48)
        draw_shadow_text(draw, (cx, y), sub, sub_font, GOLD, anchor="mt")
        _tw, th = text_size(draw, sub, sub_font)
        y += th + 20
        main_lines += 1

        if args.subtitle:
            body_font = load_font(FONT_BOLD, 32)
            for line in wrap_text(args.subtitle, body_font, SAFE_W, max_lines=2):
                if main_lines >= 5:
                    break
                draw_shadow_text(draw, (cx, y), line, body_font, WHITE, anchor="mt")
                _tw, th = text_size(draw, line, body_font)
                y += th + 10
                main_lines += 1
        return canvas

    kicker = (args.kicker or "LAST MINUTE").strip().upper()
    kf, tracking = _kicker_font_and_tracking(kicker)
    _kw, kh = draw_tracked(
        draw,
        (cx, y),
        kicker,
        kf,
        GOLD,
        tracking=tracking,
        anchor="mt",
        stroke_width=1,
        stroke_fill=BLACK,
    )
    y += kh + 22
    main_lines += 1

    sala_line = getattr(args, "sala_label", None) or f"Sala {args.sala}"
    sala_font = fit_font(FONT_EXTRABOLD, sala_line, 96, SAFE_W)
    # Fill bianco: l'accento sala sta sulla barra (Verde su foto 4:3 non si legge).
    draw_shadow_text(
        draw,
        (cx, y),
        sala_line,
        sala_font,
        WHITE,
        anchor="mt",
        stroke_width=4,
        stroke_fill=accent,
    )
    _tw, th = text_size(draw, sala_line, sala_font)
    y += th + 18
    main_lines += 1

    when = getattr(args, "when_label", None)
    if not when:
        date_label = format_it_date(args.date)
        time_label = f"{args.start}–{args.end}"
        when = f"{date_label} · {time_label}"
    when_font = fit_font(FONT_BOLD, when, 40, SAFE_W, min_size=26)
    draw_shadow_text(draw, (cx, y), when, when_font, WHITE, anchor="mt")
    _tw, th = text_size(draw, when, when_font)
    y += th + 16
    main_lines += 1

    # Prezzo prima del subtitle: è la riga che deve restare visibile.
    if args.phase == "prezzo" and main_lines < 5:
        price_text = getattr(args, "price_label", None) or format_price(args.price)
        price_font = fit_font(FONT_EXTRABOLD, price_text, 128, SAFE_W, min_size=48)
        draw_shadow_text(draw, (cx, y), price_text, price_font, WHITE, anchor="mt")
        _tw, th = text_size(draw, price_text, price_font)
        y += th + 8
        main_lines += 1

    extra_bits: list[str] = []
    if args.duration:
        extra_bits.append(args.duration)
    if args.subtitle:
        extra_bits.append(args.subtitle)
    if extra_bits and main_lines < 5:
        body_font = load_font(FONT_BOLD, 30)
        remaining = 5 - main_lines
        extra = " · ".join(extra_bits)
        for line in wrap_text(extra, body_font, SAFE_W, max_lines=remaining):
            draw_shadow_text(draw, (cx, y), line, body_font, GOLD, anchor="mt")
            _tw, th = text_size(draw, line, body_font)
            y += th + 10
            main_lines += 1

    cta = (args.cta or "Prenota su MusicPro").strip()
    baseline = min(max(y + 64, 1040), CTA_BASELINE_MAX)
    draw_cta_pill(canvas, cta, baseline)
    return canvas


def _slot_rows_from_args(args: argparse.Namespace) -> list[tuple[str, str, str]]:
    """[(sala, fascia, 'da N €'), ...] — solo da --slot, niente inventati."""
    rows: list[tuple[str, str, str]] = []
    for raw in getattr(args, "slots", None) or []:
        parts = [p.strip() for p in str(raw).split(",")]
        if len(parts) != 4:
            die(f"error: --slot deve essere Sala,HH:MM,HH:MM,prezzo (ricevuto: {raw})")
        sala, start, end, price_raw = parts
        if sala not in ROOM_ACCENT:
            die(f"error: --slot sala sconosciuta: {sala}")
        sh, _ = parse_hhmm(start, "--slot start")
        eh, _ = parse_hhmm(end, "--slot end")
        try:
            price = float(price_raw.replace(",", "."))
        except ValueError:
            die(f"error: --slot prezzo non numerico: {price_raw}")
        fascia = f"{sh:02d}–{eh:02d}"
        rows.append((sala, fascia, format_price(price)))
    if not rows:
        die("error: --digest richiede almeno un --slot Sala,inizio,fine,prezzo")
    return rows


DIGEST_BG = ROOT / "docs" / "assets" / "school" / "lm-digest-bg.jpg"


def _left_scrim(base: Image.Image) -> Image.Image:
    """Più scuro a sinistra (testo), kit visibile a destra."""
    scrim = Image.new("L", (W, H))
    px = scrim.load()
    for x in range(W):
        t = x / max(W - 1, 1)
        a = int(210 * (1.0 - min(1.0, t * 1.15) ** 1.35))
        for y in range(H):
            px[x, y] = a
    overlay = Image.new("RGBA", (W, H), (*NAVY_DARK, 255))
    overlay.putalpha(scrim)
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def _fit_line_width(path: Path, text: str, max_w: int, start: int, min_size: int = 48) -> ImageFont.FreeTypeFont:
    dummy = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    size = start
    while size > min_size:
        font = load_font(path, size)
        if text_size(dummy, text, font)[0] <= max_w:
            return font
        size -= 4
    return load_font(path, min_size)


def compose_digest(args: argparse.Namespace) -> Image.Image:
    """Poster 9:16: LAST MINUTE enorme, scena sala, card slot. Niente logo."""
    require_fonts()
    rows = _slot_rows_from_args(args)
    bg_path = Path(args.bg).expanduser() if args.bg else DIGEST_BG
    if bg_path.is_file():
        canvas = cover_crop(Image.open(bg_path), W, H)
        canvas = _left_scrim(canvas)
    else:
        canvas = vertical_gradient(NAVY_DARK, NAVY).convert("RGBA")
        canvas = add_accent_glow(canvas, GOLD, center=(200, 420), radius=520, alpha=70)

    draw = ImageDraw.Draw(canvas)
    x0 = SAFE_X
    y = 252
    max_w = SAFE_W
    kicker = (args.kicker or "LAST MINUTE").strip().upper()
    words = kicker.split()
    line1 = words[0] if words else "LAST"
    line2 = " ".join(words[1:]) if len(words) > 1 else ""
    title_path = FONT_BEBAS if FONT_BEBAS.is_file() else FONT_EXTRABOLD

    f1 = _fit_line_width(title_path, line1, max_w + 40, 250)
    draw.text((x0 - 4, y), line1, font=f1, fill=GOLD, anchor="lt", stroke_width=2, stroke_fill=BLACK)
    _w, h1 = text_size(draw, line1, f1)
    y += h1 - 18
    if line2:
        f2 = _fit_line_width(title_path, line2, max_w + 40, 250)
        draw.text((x0 - 4, y), line2, font=f2, fill=WHITE, anchor="lt", stroke_width=2, stroke_fill=BLACK)
        _w, h2 = text_size(draw, line2, f2)
        y += h2 + 8
    draw.rectangle((x0, y, x0 + 160, y + 6), fill=GOLD)
    y += 28

    lead = (
        args.subtitle
        or "Approfitta del LAST MINUTE per prenotare alcuni slot della sala prove."
    )
    body_font = load_font(FONT_BOLD, 30)
    for line in wrap_text(lead, body_font, 620, max_lines=4):
        draw_shadow_text(draw, (x0, y), line, body_font, WHITE, anchor="lt", stroke_width=2)
        _tw, th = text_size(draw, line, body_font)
        y += th + 6
    y += 22

    app_line = "IN APP MUSICPRO SCHOOL"
    app_font = load_font(FONT_EXTRABOLD, 26)
    tw, th = text_size(draw, app_line, app_font)
    pad_x, pad_y = 22, 14
    pill = (x0, y, x0 + tw + pad_x * 2, y + th + pad_y * 2)
    draw.rounded_rectangle(pill, radius=28, fill=GOLD)
    draw.text(
        (x0 + pad_x, y + pad_y + th / 2 - 2),
        app_line,
        font=app_font,
        fill=NAVY_DARK,
        anchor="lm",
    )
    y += th + pad_y * 2 + 14

    or_font = load_font(FONT_BOLD, 24)
    draw.text((x0, y), "o sul sito", font=or_font, fill=GOLD, anchor="lt")
    _tw, th = text_size(draw, "o sul sito", or_font)
    y += th + 6
    site = (getattr(args, "site", None) or "school.musicproeventi.it/prenotazioni").strip()
    site_font = load_font(FONT_BOLD, 24)
    draw_shadow_text(draw, (x0, y), site, site_font, WHITE, anchor="lt", stroke_width=1)
    _tw, th = text_size(draw, site, site_font)
    y += th + 28

    if args.date:
        day_label = format_it_date(args.date).upper()
        day_font = load_font(FONT_EXTRABOLD, 22)
        draw.text((x0, y), day_label, font=day_font, fill=GOLD, anchor="lt")
        _tw, th = text_size(draw, day_label, day_font)
        y += th + 16

    # Basso: griglia che riempie fino a quasi il fondo (lascia chrome IG).
    by_sala: dict[str, list[tuple[str, str]]] = {}
    for sala, fascia, price_text in rows:
        by_sala.setdefault(sala, []).append((fascia, price_text))
    salas = list(by_sala.keys())
    floor = 1728
    card_top = y
    gap = 18
    n_cols = max(len(salas), 1)
    col_w = (SAFE_W - gap * (n_cols - 1)) // n_cols
    header_h = 56
    name_font = load_font(FONT_EXTRABOLD, 26)
    title_path = FONT_BEBAS if FONT_BEBAS.is_file() else FONT_EXTRABOLD
    # Pannello unico dietro le card: riempie il vuoto del pavimento.
    draw.rounded_rectangle(
        (x0 - 8, card_top - 12, SAFE_RIGHT + 8, floor + 8),
        radius=28,
        fill=(6, 12, 22, 236),
    )
    for i, sala in enumerate(salas):
        items = by_sala[sala]
        left = x0 + i * (col_w + gap)
        right = left + col_w
        accent = ROOM_ACCENT[sala]
        draw.rounded_rectangle((left, card_top, right, floor), radius=24, fill=(10, 18, 32))
        draw.rounded_rectangle((left, card_top, right, card_top + header_h), radius=24, fill=accent)
        draw.rectangle((left, card_top + 22, right, card_top + header_h), fill=accent)
        draw.text(
            ((left + right) / 2, card_top + header_h / 2),
            sala.upper(),
            font=name_font,
            fill=WHITE,
            anchor="mm",
        )
        n = max(len(items), 1)
        body_top = card_top + header_h
        cell_h = (floor - body_top) / n
        for j, (fascia, price_text) in enumerate(items):
            cy = body_top + j * cell_h
            if j > 0:
                draw.line((left + 24, cy, right - 24, cy), fill=(255, 255, 255, 36), width=2)
            time_font = _fit_line_width(title_path, fascia, col_w - 36, 92, min_size=40)
            price_font = load_font(FONT_EXTRABOLD, 32)
            mid = cy + cell_h / 2
            draw.text(((left + right) / 2, mid - 18), fascia, font=time_font, fill=WHITE, anchor="mm")
            draw.text(((left + right) / 2, mid + 42), price_text, font=price_font, fill=GOLD, anchor="mm")

    return canvas


def save_rgb(canvas: Image.Image, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgb = canvas.convert("RGB")
    suffix = dest.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        rgb.save(dest, format="JPEG", quality=92, optimize=True, subsampling=0)
    else:
        rgb.save(dest, format="PNG", optimize=True)
    print(str(dest))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compose storie Instagram 1080×1920 last-minute sale MusicPro School.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "esempi:\n"
            "  python3 scripts/compose-last-minute-story.py --smoke\n"
            "  python3 scripts/compose-last-minute-story.py \\\n"
            "    --sala Verde --date 2026-10-25 --start 20:00 --end 22:00 \\\n"
            "    --phase urgenza --draft\n"
            "  python3 scripts/compose-last-minute-story.py \\\n"
            "    --sala Rossa --date 2026-10-25 --start 20:00 --end 22:00 \\\n"
            "    --phase prezzo --price 35 --publish\n"
        ),
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Canvas layout (safe-area, logo, swatch sale). Non è uno slot reale.",
    )
    parser.add_argument("--sala", choices=tuple(ROOM_ACCENT.keys()))
    parser.add_argument("--date", help="YYYY-MM-DD")
    parser.add_argument("--start", "--from", dest="start", help="HH:MM")
    parser.add_argument("--end", "--to", dest="end", help="HH:MM")
    parser.add_argument("--phase", choices=("urgenza", "prezzo", "chiuso"))
    parser.add_argument(
        "--price",
        "--importo",
        dest="price",
        type=float,
        help="Importo finale slot (obbligatorio se --phase prezzo)",
    )
    parser.add_argument(
        "--duration",
        "--durata",
        dest="duration",
        help="Etichetta durata, solo se passata (es. \"2 ore\")",
    )
    parser.add_argument("--kicker", help="Default: LAST MINUTE")
    parser.add_argument("--cta", help="Default: Prenota su MusicPro")
    parser.add_argument("--subtitle", help="Solo se passato; mai inventato")
    parser.add_argument(
        "--bg",
        "--foto",
        dest="bg",
        help="Foto full-bleed, cover-crop 9:16 centrato",
    )
    parser.add_argument("--out", help="Path file di output (png/jpg)")
    parser.add_argument(
        "--digest",
        action="store_true",
        help="Una storia: LAST MINUTE + copy + elenco slot. Niente logo.",
    )
    parser.add_argument(
        "--variant",
        choices=("manifesto", "compatta"),
        default="manifesto",
        help="Solo con --digest",
    )
    parser.add_argument(
        "--slot",
        action="append",
        dest="slots",
        help="Ripetibile: Sala,HH:MM,HH:MM,prezzo  es. Rossa,20:00,22:00,16",
    )
    parser.add_argument(
        "--site",
        default="school.musicproeventi.it/prenotazioni",
        help="URL bruciato in grafica (digest)",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--draft", action="store_true", help="Watermark BOZZA (default)")
    mode.add_argument("--publish", action="store_true", help="Senza watermark")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    draft = not args.publish  # prima release: default bozza

    if args.digest:
        if not args.date:
            die("error: --digest richiede --date")
        canvas = compose_digest(args)
        if draft:
            canvas = apply_draft_watermark(canvas)
        if args.out:
            dest = Path(args.out).expanduser().resolve()
        else:
            OUT_DIR.mkdir(parents=True, exist_ok=True)
            suffix = "-bozza" if draft else ""
            dest = OUT_DIR / f"LM-{args.date}-digest-{args.variant}{suffix}.png"
        save_rgb(canvas, dest)
        return 0

    if args.smoke:
        canvas = compose_smoke()
        if draft:
            canvas = apply_draft_watermark(canvas)
        dest = Path(args.out).expanduser().resolve() if args.out else SMOKE_OUT
        save_rgb(canvas, dest)
        # Varianti layout con placeholder, nessuno slot reale.
        for phase in ("urgenza", "prezzo", "chiuso"):
            ph = argparse.Namespace(
                sala="Verde",
                sala_label="Sala [NOME]",
                date=None,
                start=None,
                end=None,
                when_label="[giorno] · [ora inizio–fine]",
                phase=phase,
                price=None,
                price_label="da XX €" if phase == "prezzo" else None,
                duration="[durata]" if phase == "prezzo" else None,
                kicker="LAST MINUTE",
                cta="Prenota su MusicPro",
                subtitle=None,
                bg=None,
            )
            frame = compose_story(ph)
            frame = apply_draft_watermark(frame)
            save_rgb(frame, OUT_DIR / f"_smoke-{phase}.png")
        return 0

    missing = [name for name in ("sala", "date", "start", "end", "phase") if getattr(args, name) is None]
    if missing:
        flags = ", ".join(f"--{n}" for n in missing)
        die(f"error: argomenti obbligatori mancanti: {flags} (oppure usa --smoke)")

    parse_hhmm(args.start, "--start")
    parse_hhmm(args.end, "--end")
    format_it_date(args.date)  # valida

    if args.phase == "prezzo" and args.price is None:
        die(
            "error: --phase prezzo richiede --price (importo finale dello slot). "
            "Non invento il prezzo.",
            code=2,
        )

    canvas = compose_story(args)
    if draft:
        canvas = apply_draft_watermark(canvas)

    if args.out:
        dest = Path(args.out).expanduser().resolve()
    else:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        dest = OUT_DIR / default_filename(
            args.sala, args.date, args.start, args.end, args.phase, draft
        )
    save_rgb(canvas, dest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
