#!/usr/bin/env python3
"""Compose A4 PRINT-LIGHT notula didattica mockup PNG — MusicPro School.

No filled header/footer bands (unlike fiscal receipt mockup). Does not touch payroll-pdf.ts.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1240, 1754

NAVY = (30, 58, 95)  # #1e3a5f
GOLD = (201, 162, 39)  # #c9a227
PAPER = (253, 252, 249)  # #fdfcf9 — almost white
INK = (26, 26, 26)
MUTED = (107, 114, 128)
RULE = (210, 200, 180)
HAIRLINE_GOLD = GOLD

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "docs" / "assets" / "school" / "fonts"
LOGO_CANDIDATES = [
    ROOT / "musicpro" / "apps" / "web" / "public" / "images" / "receipt-assoc-logo.png",
    ROOT / "assets" / "music-pro-logo.png",
]
DEFAULT_OUT = (
    ROOT / "docs" / "assets" / "school" / "notule" / "MOCK-2026-10-27-notula.png"
)

FONT_BOLD = FONTS_DIR / "Montserrat-Bold.ttf"
FONT_EXTRABOLD = FONTS_DIR / "Montserrat-ExtraBold.ttf"

MARGIN_X = 56
MARGIN_Y = 48
BOX_RADIUS = 9
BOX_OUTLINE = 2
LOGO_W = 300
LOGO_BOX_PAD = 16

LUMA_PUNCH_MAX = 90
CHROMA_PUNCH_MAX = 40
LUMA_WHITE_RECOLOR_MIN = 200


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


def recolor_near_white_to_navy(logo: Image.Image) -> Image.Image:
    """Near-white low-chroma pixels (e.g. PRO on punched logo) → navy for paper."""
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
            if lum > LUMA_WHITE_RECOLOR_MIN and chroma < CHROMA_PUNCH_MAX:
                pixels[x, y] = (*NAVY, a)
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
        punched = recolor_near_white_to_navy(punch_near_black(Image.open(path)))
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


def draw_outlined_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int] = PAPER,
) -> None:
    draw.rounded_rectangle(box, radius=BOX_RADIUS, fill=fill, outline=NAVY, width=BOX_OUTLINE)


def compose(out_path: Path) -> None:
    for p in (FONT_BOLD, FONT_EXTRABOLD):
        if not p.is_file():
            die(f"error: font mancante: {p}")

    logo_rgba, need_assoc = prepare_logo(LOGO_W)
    logo_h = logo_rgba.size[1]

    f_assoc = load_font(FONT_BOLD, 12)
    f_school = load_font(FONT_BOLD, 18)
    assoc_band = 16 if need_assoc else 0
    school_band = 22
    logo_inner_h = logo_h + (assoc_band + 4 if need_assoc else 0) + school_band + 4
    logo_box_w = LOGO_W + 2 * LOGO_BOX_PAD
    logo_box_h = logo_inner_h + 2 * LOGO_BOX_PAD

    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)

    f_eyebrow = load_font(FONT_BOLD, 14)
    draw_tracked(
        draw,
        (W - MARGIN_X, MARGIN_Y),
        "ANTEPRIMA",
        f_eyebrow,
        GOLD,
        3.5,
        anchor="rm",
    )

    logo_box_x1 = MARGIN_X
    logo_box_y1 = MARGIN_Y + 8
    logo_box_x2 = logo_box_x1 + logo_box_w
    logo_box_y2 = logo_box_y1 + logo_box_h
    draw_outlined_box(draw, (logo_box_x1, logo_box_y1, logo_box_x2, logo_box_y2))

    logo_x = logo_box_x1 + LOGO_BOX_PAD
    logo_y = logo_box_y1 + LOGO_BOX_PAD
    logo_cx = logo_x + LOGO_W // 2
    img.paste(logo_rgba, (logo_x, logo_y), logo_rgba)
    draw = ImageDraw.Draw(img)

    y_after_logo = logo_y + logo_h
    if need_assoc:
        draw_tracked(
            draw,
            (logo_cx, y_after_logo + 8),
            "ASSOCIAZIONE",
            f_assoc,
            NAVY,
            3.0,
            anchor="mm",
        )
        y_after_logo += assoc_band + 4

    draw_tracked(
        draw,
        (logo_cx, y_after_logo + 11),
        "SCHOOL",
        f_school,
        GOLD,
        5.0,
        anchor="mm",
    )

    issuer_gap = 22
    issuer_x1 = logo_box_x2 + issuer_gap
    issuer_y1 = logo_box_y1
    issuer_x2 = W - MARGIN_X
    issuer_y2 = logo_box_y2
    draw_outlined_box(draw, (issuer_x1, issuer_y1, issuer_x2, issuer_y2))

    pad = 16
    ix = issuer_x1 + pad
    iy = issuer_y1 + pad
    f_issuer_title = load_font(FONT_EXTRABOLD, 20)
    f_issuer = load_font(FONT_BOLD, 15)
    f_issuer_sm = load_font(FONT_BOLD, 14)

    issuer_lines = [
        ("Associazione Culturale M.P.", f_issuer_title, NAVY),
        ("Zona Loreto, 42 — 16042 Carasco (GE)", f_issuer, INK),
        ("P.IVA 02535720995 - C.F. 02535720995", f_issuer_sm, MUTED),
        ("Tel. 371 675 2550 · www.musicproeventi.it", f_issuer, INK),
    ]
    for text, font, fill in issuer_lines:
        draw.text((ix, iy), text, font=font, fill=fill)
        iy += int(text_h(draw, text, font)) + 7

    y = max(logo_box_y2, issuer_y2) + 32

    f_title = load_font(FONT_EXTRABOLD, 34)
    draw.text((MARGIN_X, y), "Notula didattica", font=f_title, fill=NAVY)
    y += int(text_h(draw, "Notula didattica", f_title)) + 14

    f_meta_label = load_font(FONT_BOLD, 15)
    f_meta_val = load_font(FONT_BOLD, 17)
    f_teacher = load_font(FONT_EXTRABOLD, 22)

    draw.text((MARGIN_X, y), "Periodo:", font=f_meta_label, fill=MUTED)
    px = MARGIN_X + text_w(draw, "Periodo:", f_meta_label) + 10
    draw.text((px, y - 1), "ottobre 2026", font=f_meta_val, fill=INK)
    y += 28

    draw.text((MARGIN_X, y), "Docente:", font=f_meta_label, fill=MUTED)
    dx = MARGIN_X + text_w(draw, "Docente:", f_meta_label) + 10
    draw.text((dx, y - 2), "Elena Rossi", font=f_teacher, fill=INK)
    y += 40

    table_x1 = MARGIN_X
    table_x2 = W - MARGIN_X
    row_h = 44
    thead_h = 38
    n_rows = 3
    table_y1 = y
    table_y2 = table_y1 + thead_h + n_rows * row_h + 12
    draw_outlined_box(draw, (table_x1, table_y1, table_x2, table_y2))

    f_th = load_font(FONT_BOLD, 14)
    col_pad = 16
    inner_x1 = table_x1 + BOX_OUTLINE + col_pad
    inner_x2 = table_x2 - BOX_OUTLINE - col_pad

    data_w = 118
    voce_w = 148
    importo_w = 108
    desc_x = inner_x1 + data_w + voce_w + 12
    imp_x = inner_x2 - importo_w

    ty = table_y1 + 10
    draw.text((inner_x1, ty), "DATA", font=f_th, fill=NAVY)
    draw.text((inner_x1 + data_w, ty), "VOCE", font=f_th, fill=NAVY)
    draw.text((desc_x, ty), "DESCRIZIONE", font=f_th, fill=NAVY)
    draw.text((imp_x, ty), "IMPORTO", font=f_th, fill=NAVY)

    head_rule_y = table_y1 + thead_h
    draw.line((table_x1 + col_pad, head_rule_y, table_x2 - col_pad, head_rule_y), fill=HAIRLINE_GOLD, width=2)

    rows = [
        ("07/10/2026", "Insegnamento", "Chitarra — corso base", "120,00"),
        ("14/10/2026", "Insegnamento", "Chitarra — corso base", "120,00"),
        ("21/10/2026", "Coordinamento", "Coordinamento didattico", "40,00"),
    ]
    f_td = load_font(FONT_BOLD, 16)
    f_td_muted = load_font(FONT_BOLD, 15)

    for i, (date, voce, desc, amount) in enumerate(rows):
        ry = head_rule_y + 8 + i * row_h
        draw.text((inner_x1, ry), date, font=f_td, fill=INK)
        draw.text((inner_x1 + data_w, ry), voce, font=f_td_muted, fill=INK)
        draw.text((desc_x, ry), desc, font=f_td, fill=INK)
        aw = text_w(draw, amount, f_td)
        draw.text((inner_x2 - aw, ry), amount, font=f_td, fill=INK)
        if i < n_rows - 1:
            sep_y = ry + row_h - 6
            draw.line((table_x1 + col_pad, sep_y, table_x2 - col_pad, sep_y), fill=RULE, width=1)

    y = table_y2 + 24
    bottom_h = 200
    gap = 20
    inner_w = W - 2 * MARGIN_X
    half_w = (inner_w - gap) // 2

    riep_x1 = MARGIN_X
    riep_x2 = MARGIN_X + half_w
    riep_y1 = y
    riep_y2 = y + bottom_h
    draw_outlined_box(draw, (riep_x1, riep_y1, riep_x2, riep_y2))

    f_box_title = load_font(FONT_BOLD, 15)
    draw.text((riep_x1 + pad, riep_y1 + pad), "Riepilogo", font=f_box_title, fill=NAVY)

    f_line = load_font(FONT_BOLD, 16)
    f_netto = load_font(FONT_EXTRABOLD, 18)
    summary = [
        ("Lordo", "280,00", False),
        ("Anticipi", "0,00", False),
        ("Riporto", "0,00", False),
        ("Ritenuta", "56,00", False),
        ("Netto", "224,00", True),
    ]
    sy = riep_y1 + pad + 28
    label_x = riep_x1 + pad
    val_x2 = riep_x2 - pad
    for label, val, bold in summary:
        font = f_netto if bold else f_line
        draw.text((label_x, sy), f"{label}", font=font, fill=NAVY if bold else MUTED)
        vw = text_w(draw, val, font)
        draw.text((val_x2 - vw, sy), val, font=font, fill=INK if bold else INK)
        sy += 30

    sig_x1 = riep_x2 + gap
    sig_x2 = W - MARGIN_X
    sig_y1 = y
    sig_y2 = y + bottom_h
    draw_outlined_box(draw, (sig_x1, sig_y1, sig_x2, sig_y2))

    draw.text((sig_x1 + pad, sig_y1 + pad), "Firma docente", font=f_box_title, fill=NAVY)
    sig_inner = (sig_x1 + pad, sig_y1 + pad + 32, sig_x2 - pad, sig_y2 - pad)
    draw.rounded_rectangle(sig_inner, radius=6, outline=RULE, width=1, fill=PAPER)

    y = sig_y2 + 22
    f_inv = load_font(FONT_BOLD, 15)
    draw.text((MARGIN_X, y), "Fattura: non allegata", font=f_inv, fill=MUTED)

    footer_text = "Documento generato automaticamente dal sistema MusicPro School."
    f_foot = load_font(FONT_BOLD, 13)
    foot_y = H - MARGIN_Y - 8
    rule_y = foot_y - 18
    draw.line((MARGIN_X, rule_y, W - MARGIN_X, rule_y), fill=RULE, width=1)
    draw.text((MARGIN_X, foot_y), footer_text, font=f_foot, fill=MUTED)

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
