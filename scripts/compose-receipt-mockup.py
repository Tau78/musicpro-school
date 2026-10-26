#!/usr/bin/env python3
"""Compose A4 fiscal receipt mockup PNG — MusicPro School brand (wrapSchoolEmail family).

All text rendered from TTF (Montserrat / optional Bebas Neue). No AI-generated text.
Does not touch production fiscal-receipt-pdf.ts.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1240, 1754

NAVY = (30, 58, 95)  # #1e3a5f
NAVY_DARK = (12, 24, 40)  # #0c1828
GOLD = (201, 162, 39)  # #c9a227
CREAM = (246, 243, 236)  # #f6f3ec
ROW_BG = (250, 248, 243)  # #faf8f3
TABLE_HEAD = (232, 222, 198)  # gold-tint header
INK = (26, 26, 26)  # #1a1a1a
MUTED = (107, 114, 128)  # #6b7280
MUTED_LIGHT = (122, 135, 150)  # footer secondary on navy
BOX_FILL = (255, 253, 248)

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "docs" / "assets" / "school" / "fonts"
LOGO_CANDIDATES = [
    ROOT / "musicpro" / "apps" / "web" / "public" / "images" / "receipt-assoc-logo.png",
    ROOT / "assets" / "music-pro-logo.png",
]
DEFAULT_OUT = (
    ROOT / "docs" / "assets" / "school" / "ricevute" / "MOCK-2026-10-26-quota.png"
)

FONT_BOLD = FONTS_DIR / "Montserrat-Bold.ttf"
FONT_EXTRABOLD = FONTS_DIR / "Montserrat-ExtraBold.ttf"
FONT_BEBAS = FONTS_DIR / "BebasNeue-Regular.ttf"

LOGO_HEADER_W = 400
MARGIN_X = 56
BOX_RADIUS = 9
BOX_OUTLINE = 2
COL_GAP = 18
SECTION_GAP = 20

# Near-black matte punch (opaque black background → transparent)
LUMA_PUNCH_MAX = 90
CHROMA_PUNCH_MAX = 40

FOOTER_H = 118


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
    """Uppercase word with extra letter-spacing; anchor mm = center on xy, lm = left middle."""
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
    """Low-luma, low-chroma pixels → fully transparent (keep red MUSIC, white PRO)."""
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
    """Lower = cleaner punch (fewer leftover near-black opaque pixels)."""
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
    """True if bottom band has almost no visible pixels (ASSOCIAZIONE was on black)."""
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
    """Punch at full res, resize, return (RGBA logo, draw ASSOCIAZIONE below)."""
    punched = load_best_logo_raw()
    need_assoc = assocszione_missing(punched)
    lw, lh = punched.size
    nh = int(round(lh * (target_w / lw)))
    logo = punched.resize((target_w, nh), Image.Resampling.LANCZOS)
    return logo, need_assoc


def paste_logo_rgba(canvas: Image.Image, logo: Image.Image, x: int, y_top: int) -> None:
    canvas.paste(logo, (x, y_top), logo)


def draw_riquadro(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int] = BOX_FILL,
    outline: tuple[int, int, int] = NAVY,
    width: int = BOX_OUTLINE,
) -> None:
    draw.rounded_rectangle(box, radius=BOX_RADIUS, fill=fill, outline=outline, width=width)


def draw_lines(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    lines: list[tuple[str, ImageFont.FreeTypeFont, tuple[int, int, int]]],
    line_gap: int,
) -> int:
    """Draw stacked lines; return y after last line."""
    for text, font, fill in lines:
        draw.text((x, y), text, font=font, fill=fill)
        y += int(text_h(draw, text, font)) + line_gap
    return y


def compose(out_path: Path) -> None:
    for p in (FONT_BOLD, FONT_EXTRABOLD):
        if not p.is_file():
            die(f"error: font mancante: {p}")

    logo_rgba, need_assoc = prepare_logo(LOGO_HEADER_W)
    logo_h = logo_rgba.size[1]

    f_assoc = load_font(FONT_BOLD, 13)
    f_school = load_font(FONT_BOLD, 20)
    assoc_h = 18 if need_assoc else 0
    header_pad_top = 22
    header_pad_bottom = 18
    header_h = header_pad_top + logo_h + header_pad_bottom
    if need_assoc:
        header_h += assoc_h + 4

    img = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(img)

    draw.rectangle((0, 0, W, header_h), fill=NAVY)
    logo_x = MARGIN_X
    paste_logo_rgba(img, logo_rgba, logo_x, header_pad_top)
    draw = ImageDraw.Draw(img)

    y_logo_bottom = header_pad_top + logo_h
    if need_assoc:
        draw_tracked(
            draw,
            (logo_x + LOGO_HEADER_W // 2, y_logo_bottom + 9),
            "ASSOCIAZIONE",
            f_assoc,
            (255, 255, 255),
            3.5,
            anchor="mm",
        )
        y_logo_bottom += assoc_h + 4

    draw_tracked(
        draw,
        (W - MARGIN_X, header_pad_top + logo_h // 2),
        "SCHOOL",
        f_school,
        GOLD,
        6.0,
        anchor="rm",
    )

    gold_y = header_h
    draw.rectangle((0, gold_y, W, gold_y + 3), fill=GOLD)

    content_top = gold_y + 3 + 22
    content_bottom = H - FOOTER_H - 28
    inner_w = W - 2 * MARGIN_X

    f_eyebrow = load_font(FONT_BOLD, 16)
    draw_tracked(
        draw,
        (W - MARGIN_X, content_top),
        "ANTEPRIMA",
        f_eyebrow,
        GOLD,
        4.0,
        anchor="rm",
    )
    y = content_top + 28

    left_w = int((inner_w - COL_GAP) * 0.44)
    right_w = inner_w - COL_GAP - left_w
    top_box_h = 248

    left_box = (MARGIN_X, y, MARGIN_X + left_w, y + top_box_h)
    right_box = (MARGIN_X + left_w + COL_GAP, y, W - MARGIN_X, y + top_box_h)
    draw_riquadro(draw, left_box)
    draw_riquadro(draw, right_box)

    pad = 18
    lx = left_box[0] + pad
    ly = left_box[1] + pad

    f_issuer_title = load_font(FONT_EXTRABOLD, 22)
    f_issuer = load_font(FONT_BOLD, 17)
    f_issuer_muted = load_font(FONT_BOLD, 16)

    draw_lines(
        draw,
        lx,
        ly,
        [
            ("Associazione Culturale M.P.", f_issuer_title, NAVY),
            ("Zona Loreto, 42 — 16042 Carasco (GE)", f_issuer, INK),
            ("P.IVA 02535720995 · C.F. 02535720995", f_issuer_muted, MUTED),
            ("Tel. 371 675 2550", f_issuer, INK),
            ("www.musicproeventi.it", f_issuer, NAVY),
        ],
        8,
    )

    rx = right_box[0] + pad
    ry = right_box[1] + pad
    f_rice_title = load_font(FONT_EXTRABOLD, 26)
    f_meta_val = load_font(FONT_BOLD, 18)
    f_label = load_font(FONT_BOLD, 14)
    f_name = load_font(FONT_EXTRABOLD, 24)
    f_small = load_font(FONT_BOLD, 16)
    f_pay = load_font(FONT_BOLD, 17)

    draw.text((rx, ry), "Ricevuta n. QU/12/2026", font=f_rice_title, fill=NAVY)
    ry += 34
    draw.text((rx, ry), "Data emissione", font=f_label, fill=MUTED)
    date_x = rx + text_w(draw, "Data emissione", f_label) + 10
    draw.text((date_x, ry), "20/10/2026", font=f_meta_val, fill=INK)
    ry += 30

    draw.text((rx, ry), "Spett.le", font=f_label, fill=MUTED)
    ry += 22
    draw.text((rx, ry), "Francesco Campailla", font=f_name, fill=INK)
    ry += 32
    draw.text((rx, ry), "C.F. CMPFNC85A01F205X", font=f_small, fill=INK)
    ry += 24
    draw.text((rx, ry), "francesco.campailla@email.it", font=f_small, fill=MUTED)
    ry += 28
    draw.text((rx, ry), "Pagamento: Contanti", font=f_pay, fill=INK)

    stamp = "Copia per il socio"
    f_stamp = load_font(FONT_BOLD, 13)
    stamp_w = text_w(draw, stamp, f_stamp) + 24
    stamp_h = 28
    stamp_x2 = right_box[2] - pad
    stamp_x1 = int(stamp_x2 - stamp_w)
    stamp_y1 = right_box[1] + pad
    draw.rounded_rectangle(
        (stamp_x1, stamp_y1, stamp_x2, stamp_y1 + stamp_h),
        radius=6,
        outline=GOLD,
        width=2,
        fill=ROW_BG,
    )
    sw = text_w(draw, stamp, f_stamp)
    draw.text(
        (stamp_x1 + (stamp_w - sw) / 2, stamp_y1 + 6),
        stamp,
        font=f_stamp,
        fill=MUTED,
    )

    y = y + top_box_h + SECTION_GAP

    bottom_h = 152
    table_bottom = content_bottom - bottom_h - SECTION_GAP
    table_box = (MARGIN_X, y, W - MARGIN_X, table_bottom)
    draw_riquadro(draw, table_box, fill=BOX_FILL)

    th_h = 42
    thead = (table_box[0] + BOX_OUTLINE, table_box[1] + BOX_OUTLINE, table_box[2] - BOX_OUTLINE, table_box[1] + th_h)
    draw.rounded_rectangle(
        (thead[0], thead[1], thead[2], thead[3] + BOX_RADIUS),
        radius=BOX_RADIUS,
        fill=TABLE_HEAD,
    )
    draw.rectangle((thead[0], thead[1] + BOX_RADIUS, thead[2], thead[3]), fill=TABLE_HEAD)

    f_th = load_font(FONT_BOLD, 15)
    ty = thead[1] + 12
    draw.text((thead[0] + pad, ty), "PRODOTTI E SERVIZI FORNITI", font=f_th, fill=NAVY)
    imp_label = "IMPORTO"
    imp_w = text_w(draw, imp_label, f_th)
    draw.text((thead[2] - pad - imp_w, ty), imp_label, font=f_th, fill=NAVY)

    mid_y = thead[3] + 2
    draw.line((table_box[0] + pad, mid_y + 36, table_box[2] - pad, mid_y + 36), fill=(210, 205, 195), width=1)

    f_td = load_font(FONT_BOLD, 20)
    row_y = mid_y + 14
    draw.text((thead[0] + pad, row_y), "Quota associativa 2026", font=f_td, fill=INK)
    amt = "80,00"
    amt_w = text_w(draw, amt, f_td)
    draw.text((thead[2] - pad - amt_w, row_y), amt, font=f_td, fill=INK)

    f_iva = load_font(FONT_BOLD, 14)
    iva = "IVA 0% · Art. 10 DPR 633/72 · esente"
    iva_y = table_box[3] - pad - 20
    draw.text((table_box[0] + pad, iva_y), iva, font=f_iva, fill=MUTED)

    y = table_box[3] + SECTION_GAP

    sig_box = (MARGIN_X, y, MARGIN_X + (inner_w - COL_GAP) // 2, y + bottom_h)
    tot_box = (sig_box[2] + COL_GAP, y, W - MARGIN_X, y + bottom_h)
    draw_riquadro(draw, sig_box)
    draw_riquadro(draw, tot_box)

    f_sig_label = load_font(FONT_BOLD, 15)
    draw.text((sig_box[0] + pad, sig_box[1] + pad), "FIRMA PER QUIETANZA", font=f_sig_label, fill=NAVY)

    sig_inner_top = sig_box[1] + pad + 28
    sig_inner = (
        sig_box[0] + pad,
        sig_inner_top,
        sig_box[2] - pad,
        sig_box[3] - pad,
    )
    draw.rounded_rectangle(sig_inner, radius=6, outline=(180, 175, 165), width=1, fill=CREAM)

    f_tot_label = load_font(FONT_BOLD, 16)
    tot_label = "TOTALE RICEVUTA"
    draw.text((tot_box[0] + pad, tot_box[1] + pad), tot_label, font=f_tot_label, fill=MUTED)

    total_str = "€ 80,00"
    if FONT_BEBAS.is_file():
        f_total = load_font(FONT_BEBAS, 64)
    else:
        f_total = load_font(FONT_EXTRABOLD, 52)
    total_w = text_w(draw, total_str, f_total)
    total_h = text_h(draw, total_str, f_total)
    tcx = tot_box[0] + (tot_box[2] - tot_box[0]) // 2
    tcy = tot_box[1] + (tot_box[3] - tot_box[1]) // 2 + 8
    draw.text((tcx - total_w / 2, tcy - total_h / 2), total_str, font=f_total, fill=NAVY)

    footer_y = H - FOOTER_H
    draw.rectangle((0, footer_y, W, H), fill=NAVY_DARK)

    f_foot = load_font(FONT_BOLD, 19)
    f_foot_sm = load_font(FONT_BOLD, 17)
    line1 = "Associazione Culturale M.P. · Zona Loreto 42, Carasco (GE) · www.musicproeventi.it"
    line2 = "Tel. 371 675 2550"

    l1_w = text_w(draw, line1, f_foot)
    l2_w = text_w(draw, line2, f_foot_sm)
    cy = footer_y + 28
    draw.text(((W - l1_w) / 2, cy), line1, font=f_foot, fill=(255, 255, 255))
    draw.text(((W - l2_w) / 2, cy + 28), line2, font=f_foot_sm, fill=MUTED_LIGHT)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG", optimize=True)
    print(f"wrote {out_path} ({W}×{H})")


def main() -> None:
    out = DEFAULT_OUT
    if len(sys.argv) > 1:
        out = Path(sys.argv[1]).expanduser().resolve()
    compose(out)


if __name__ == "__main__":
    main()
