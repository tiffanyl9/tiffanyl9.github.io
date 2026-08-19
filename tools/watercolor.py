"""Turn a photograph into something that reads as a watercolour wash.

Real watercolour has a few signatures worth imitating, roughly in this order:
  - flat, simplified areas of colour rather than photographic detail
  - pigment pooling darker at the edges of a wet area
  - colour bleeding slightly past where it should stop
  - no true blacks; the paper limits how dark it gets
  - the paper's own tooth showing through, especially in light washes
"""
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from scipy.ndimage import gaussian_filter, median_filter, uniform_filter


def crop(img, box):
    return img.crop(box)


def simplify(img, median_size=9, passes=2, levels=12):
    """Flatten photographic detail into washes, keeping edges reasonably crisp."""
    a = np.asarray(img).astype(np.float32)
    for _ in range(passes):
        # median filtering per channel removes texture but preserves boundaries
        a = np.stack([median_filter(a[..., c], size=median_size) for c in range(3)], axis=-1)
    # quantise to a limited set of washes
    a = np.round(a / 255.0 * levels) / levels * 255.0
    return a


def edge_pigment(gray, strength=0.55, width=1.6):
    """Pigment gathers where a wash stops. Return a multiplicative darkening map."""
    gx = gaussian_filter(gray, width, order=(0, 1))
    gy = gaussian_filter(gray, width, order=(1, 0))
    mag = np.hypot(gx, gy)
    if mag.max() > 0:
        mag = mag / mag.max()
    mag = np.clip(mag * 2.4, 0, 1) ** 1.15
    mag = gaussian_filter(mag, 1.3)
    return 1.0 - strength * mag


def bleed(a, amount=0.5, scale=7.0, seed=3):
    """Push colour sideways along a smooth random field, so washes wander."""
    rng = np.random.default_rng(seed)
    h, w = a.shape[:2]
    dx = gaussian_filter(rng.normal(size=(h, w)), scale) * 220 * amount
    dy = gaussian_filter(rng.normal(size=(h, w)), scale) * 220 * amount
    ys, xs = np.mgrid[0:h, 0:w]
    sy = np.clip(ys + dy, 0, h - 1).astype(np.int32)
    sx = np.clip(xs + dx, 0, w - 1).astype(np.int32)
    return a[sy, sx]


def paper(h, w, seed=11):
    """A warm sheet with visible tooth and a few long fibres."""
    rng = np.random.default_rng(seed)
    fine = gaussian_filter(rng.normal(size=(h, w)), 0.7)
    fine /= (np.abs(fine).max() + 1e-6)
    coarse = gaussian_filter(rng.normal(size=(h, w)), 4.0)
    coarse /= (np.abs(coarse).max() + 1e-6)
    # faint horizontal laid lines, like cold-press paper
    fibres = gaussian_filter(rng.normal(size=(h, w)), (0.6, 9.0))
    fibres /= (np.abs(fibres).max() + 1e-6)
    tex = 0.30 * fine + 0.52 * coarse + 0.18 * fibres
    return tex


def granulate(a, tex, amount=0.10):
    """Pigment settles into the paper's hollows — strongest in the mid tones."""
    lum = a.mean(axis=2) / 255.0
    mask = (1.0 - np.abs(lum - 0.5) * 2.0)          # peaks in the mid tones
    mask = np.clip(mask, 0, 1)[..., None]
    return a * (1.0 + amount * tex[..., None] * mask)


def lift_and_warm(a, floor=26, warm=(1.030, 1.004, 0.968)):
    """No true blacks, and the whites take the paper's warmth."""
    a = floor + a * ((255.0 - floor) / 255.0)
    a = a * np.array(warm, dtype=np.float32)
    return a


PAPER_WHITE = np.array([249.0, 245.0, 236.0], dtype=np.float32)


def wash(a, amount=0.24, top_extra=0.14):
    """Dilute the pigment toward the paper, a touch more toward the top of the sheet,
    the way a wash thins out as the brush runs dry."""
    h = a.shape[0]
    ramp = np.linspace(top_extra, 0.0, h, dtype=np.float32)[:, None, None]
    k = np.clip(amount + ramp, 0, 1)
    return a * (1 - k) + PAPER_WHITE * k


def render(src, box, out, size, quality=84,
           median_size=9, passes=2, levels=12,
           edge=0.32, bleed_amt=0.34, tex_amount=0.22, grain=0.07,
           saturation=1.06, wash_amt=0.21, seed=3):
    img = Image.open(src).convert('RGB')
    img = crop(img, box)
    # work larger than final, then downsample — keeps the wash edges clean
    work = (size[0] * 2, size[1] * 2)
    img = img.resize(work, Image.LANCZOS)
    img = ImageEnhance.Color(img).enhance(saturation)

    a = simplify(img, median_size=median_size, passes=passes, levels=levels)
    a = bleed(a, amount=bleed_amt, seed=seed)

    gray = a.mean(axis=2) / 255.0
    a = a * edge_pigment(gray, strength=edge)[..., None]

    a = lift_and_warm(a)
    a = wash(a, amount=wash_amt)

    tex = paper(*a.shape[:2], seed=seed + 8)
    a = granulate(a, tex, amount=grain)
    # the sheet itself, strongest where the wash is thin
    lum = np.clip(a.mean(axis=2) / 255.0, 0, 1)[..., None]
    a = a * (1.0 + tex_amount * tex[..., None] * (0.35 + 0.65 * lum))

    a = np.clip(a, 0, 255).astype(np.uint8)
    result = Image.fromarray(a).filter(ImageFilter.SMOOTH).resize(size, Image.LANCZOS)
    result.save(out, quality=quality, optimize=True, progressive=True)
    return result
