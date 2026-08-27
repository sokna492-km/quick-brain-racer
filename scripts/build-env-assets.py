"""Build CC0 Poly Haven-derived WebP assets for the race renderer."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "tmp-assets"
BG = ROOT / "public" / "bg"
PROPS = ROOT / "public" / "props"


def to_webp(im: Image.Image, path: Path, size: tuple[int, int] | None = None, quality: int = 78) -> None:
    out = im.convert("RGBA")
    if size:
        out = out.resize(size, Image.Resampling.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, "WEBP", quality=quality, method=6)
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size} bytes)")


def crop_opaque(im: Image.Image, pad: int = 4) -> Image.Image:
    bbox = im.split()[-1].getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def fit_height(im: Image.Image, height: int) -> Image.Image:
    im = crop_opaque(im)
    ratio = height / im.height
    w = max(1, int(im.width * ratio))
    return im.resize((w, height), Image.Resampling.LANCZOS)


def make_bush_from_tree(tree: Image.Image) -> Image.Image:
    """Crop the canopy lower half into a bush-like sprite."""
    t = crop_opaque(tree)
    top = int(t.height * 0.35)
    bush = t.crop((0, top, t.width, t.height))
    # Flatten base slightly
    return fit_height(bush, 220)


def make_palm_from_jacaranda(src: Image.Image) -> Image.Image:
    """Stylize jacaranda into a taller palm-ish roadside silhouette."""
    im = fit_height(src, 420)
    # Stretch vertically a bit for palm feel
    return im.resize((max(1, int(im.width * 0.72)), 460), Image.Resampling.LANCZOS)


def make_simple_prop(kind: str, w: int, h: int) -> Image.Image:
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if kind == "lamp":
        d.rectangle((w * 0.45, h * 0.18, w * 0.55, h * 0.98), fill=(45, 45, 48, 255))
        d.ellipse((w * 0.28, h * 0.02, w * 0.72, h * 0.28), fill=(240, 210, 110, 255))
        d.ellipse((w * 0.34, h * 0.08, w * 0.66, h * 0.22), fill=(255, 245, 200, 220))
    elif kind == "sign":
        d.rectangle((w * 0.46, h * 0.35, w * 0.54, h * 0.98), fill=(70, 70, 72, 255))
        d.rounded_rectangle((w * 0.12, h * 0.05, w * 0.88, h * 0.42), radius=10, fill=(190, 50, 45, 255))
        d.text((w * 0.42, h * 0.12), "!", fill=(255, 255, 255, 255))
    elif kind == "pole":
        d.rectangle((w * 0.44, h * 0.05, w * 0.56, h * 0.98), fill=(90, 82, 70, 255))
        d.line((w * 0.5, h * 0.12, w * 0.92, h * 0.32), fill=(60, 55, 48, 255), width=max(2, w // 18))
        d.line((w * 0.5, h * 0.2, w * 0.08, h * 0.38), fill=(60, 55, 48, 255), width=max(2, w // 18))
    elif kind == "fence":
        for x in (0.15, 0.5, 0.85):
            d.rectangle((w * x - 4, h * 0.25, w * x + 4, h * 0.95), fill=(110, 90, 60, 255))
        d.rectangle((w * 0.05, h * 0.38, w * 0.95, h * 0.48), fill=(130, 105, 70, 255))
        d.rectangle((w * 0.05, h * 0.62, w * 0.95, h * 0.72), fill=(130, 105, 70, 255))
    elif kind == "house":
        d.rectangle((w * 0.12, h * 0.42, w * 0.88, h * 0.95), fill=(230, 210, 175, 255))
        d.polygon([(w * 0.08, h * 0.45), (w * 0.5, h * 0.1), (w * 0.92, h * 0.45)], fill=(175, 85, 55, 255))
        d.rectangle((w * 0.42, h * 0.62, w * 0.58, h * 0.95), fill=(90, 55, 30, 255))
        d.rectangle((w * 0.2, h * 0.55, w * 0.34, h * 0.68), fill=(120, 190, 220, 255))
        d.rectangle((w * 0.66, h * 0.55, w * 0.8, h * 0.68), fill=(120, 190, 220, 255))
    elif kind == "stall":
        d.rectangle((w * 0.1, h * 0.55, w * 0.9, h * 0.95), fill=(210, 160, 110, 255))
        d.polygon([(w * 0.05, h * 0.55), (w * 0.5, h * 0.2), (w * 0.95, h * 0.55)], fill=(200, 70, 55, 255))
        d.rectangle((w * 0.18, h * 0.62, w * 0.82, h * 0.78), fill=(250, 230, 180, 255))
    return im


def make_trees_far(pine: Image.Image, fir: Image.Image, grass: Image.Image) -> Image.Image:
    """Wide parallax strip of distant trees over soft grass."""
    W, H = 1536, 256
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    # Soft ground band
    ground = grass.resize((W, H), Image.Resampling.LANCZOS).convert("RGBA")
    ground = ImageEnhance.Brightness(ground).enhance(0.75)
    ground = ImageEnhance.Color(ground).enhance(0.85)
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    md.polygon([(0, H), (0, int(H * 0.55)), (W, int(H * 0.62)), (W, H)], fill=180)
    canvas = Image.composite(ground, canvas, mask)

    pines = [fit_height(pine, 210), fit_height(fir, 200), fit_height(pine, 175)]
    x = -40
    i = 0
    while x < W + 40:
        spr = pines[i % len(pines)].copy()
        # Distance desaturation / fade
        spr = ImageEnhance.Color(spr).enhance(0.55)
        spr = ImageEnhance.Brightness(spr).enhance(0.82)
        spr.putalpha(spr.split()[-1].point(lambda a: int(a * 0.88)))
        y = H - spr.height + 8 + (i % 3) * 4
        canvas.alpha_composite(spr, (int(x), int(y)))
        x += spr.width * 0.55
        i += 1

    canvas = canvas.filter(ImageFilter.GaussianBlur(radius=0.6))
    return canvas


def main() -> None:
    asphalt = Image.open(TMP / "asphalt.jpg")
    dirt = Image.open(TMP / "dirt.jpg")
    # Prefer leafy_grass if present; color-grade to lush green lawn
    grass_src = TMP / "leafy_grass.jpg"
    if not grass_src.exists():
        grass_src = TMP / "grass.jpg"
    grass_raw = Image.open(grass_src).convert("RGB")
    r, g, b = grass_raw.split()
    g = g.point(lambda v: min(255, int(v * 1.45 + 28)))
    r = r.point(lambda v: int(v * 0.55))
    b = b.point(lambda v: int(v * 0.45 + 20))
    grass = Image.merge("RGB", (r, g, b))
    grass = ImageEnhance.Color(grass).enhance(1.25)
    pine = Image.open(TMP / "pine_preview.png").convert("RGBA")
    fir = Image.open(TMP / "fir_preview.png").convert("RGBA")
    jacaranda = Image.open(TMP / "jacaranda_preview.png").convert("RGBA")
    rock = Image.open(TMP / "rock_preview.png").convert("RGBA")

    to_webp(asphalt, BG / "asphalt.webp", (512, 512), quality=72)
    to_webp(dirt, BG / "shoulder.webp", (512, 512), quality=72)
    to_webp(grass, BG / "grass.webp", (512, 512), quality=72)

    to_webp(fit_height(pine, 384), PROPS / "tree.webp", quality=80)
    to_webp(make_palm_from_jacaranda(jacaranda), PROPS / "palm.webp", quality=80)
    to_webp(make_bush_from_tree(fir), PROPS / "bush.webp", quality=80)
    to_webp(fit_height(rock, 160), PROPS / "rock.webp", quality=80)

    for kind, size in [
        ("lamp", (96, 220)),
        ("sign", (120, 200)),
        ("pole", (110, 240)),
        ("fence", (180, 120)),
        ("house", (220, 200)),
        ("stall", (200, 160)),
    ]:
        to_webp(make_simple_prop(kind, *size), PROPS / f"{kind}.webp", quality=82)

    to_webp(make_trees_far(pine, fir, grass), BG / "trees-far.webp", quality=75)
    print("done")


if __name__ == "__main__":
    main()
