#!/usr/bin/env python3
"""Draws the app's original assets. Needs Pillow and numpy.

Usage: generate-assets.py <commons-dir>

<commons-dir> holds the CC0 sources listed in docs/credits.md:
  cake.jpg   "3rd birthday cake (Unsplash 10b8Lvvc-4g).jpg", 3840 px wide
  post.jpg   "Forest path at sunset (Unsplash).jpg"
  reel.jpg   "Misty path (Unsplash).jpg"
"""
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent
ICON = 96
SS = 4
UNIT = ICON * SS / 24


def canvas(size=ICON * SS):
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def stroke(draw, points, color='white', width=2.0):
    scaled = [(x * UNIT, y * UNIT) for x, y in points]
    w = width * UNIT
    draw.line(scaled, fill=color, width=round(w), joint='curve')
    for x, y in (scaled[0], scaled[-1]):
        draw.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill=color)


def arc(cx, cy, r, start, end, steps=48):
    return [
        (
            cx + r * math.cos(math.radians(start + (end - start) * i / steps)),
            cy + r * math.sin(math.radians(start + (end - start) * i / steps)),
        )
        for i in range(steps + 1)
    ]


def disc(draw, cx, cy, r, color):
    draw.ellipse(
        ((cx - r) * UNIT, (cy - r) * UNIT, (cx + r) * UNIT, (cy + r) * UNIT),
        fill=color,
    )


def box(draw, x0, y0, x1, y1, radius, color):
    draw.rounded_rectangle(
        (x0 * UNIT, y0 * UNIT, x1 * UNIT, y1 * UNIT),
        radius=radius * UNIT,
        fill=color,
    )


def save_icon(image, path, size=ICON):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.resize((size, size), Image.LANCZOS).save(path, optimize=True)


def chat_icons():
    def back(d):
        stroke(d, [(15, 5), (8, 12), (15, 19)], width=2.4)

    def plus(d):
        stroke(d, [(12, 5), (12, 19)], width=2.2)
        stroke(d, [(5, 12), (19, 12)], width=2.2)

    def mic(d):
        box(d, 8.5, 3, 15.5, 14.5, 3.5, 'white')
        stroke(d, arc(12, 11, 7, 0, 180), width=1.9)
        stroke(d, [(12, 18), (12, 21)], width=1.9)

    def reply(d):
        stroke(d, [(10, 5), (4, 11), (10, 17)], width=2.1)
        stroke(d, [(4, 11), (13, 11)] + arc(13, 17, 6, -90, 0), width=2.1)

    def copy(d):
        box(d, 9, 9, 20, 20, 2.5, 'white')
        box(d, 10.8, 10.8, 18.2, 18.2, 1.2, (0, 0, 0, 0))
        stroke(d, [(5, 15), (4, 14), (4, 5), (5, 4), (14, 4), (15, 5)], width=1.8)

    def trash(d):
        stroke(d, [(4, 7), (20, 7)], width=2)
        stroke(d, [(9.5, 7), (10, 4), (14, 4), (14.5, 7)], width=1.8)
        stroke(d, [(6.5, 7), (7.5, 20), (16.5, 20), (17.5, 7)], width=2)
        stroke(d, [(12, 11), (12, 16.5)], width=1.6)

    def send(d):
        stroke(d, [(12, 20), (12, 5)], width=2.4)
        stroke(d, [(6, 11), (12, 5), (18, 11)], width=2.4)

    def play(d):
        d.polygon(
            [(7 * UNIT, 4 * UNIT), (20 * UNIT, 12 * UNIT), (7 * UNIT, 20 * UNIT)],
            fill='white',
        )

    for draw_icon in (back, plus, mic, reply, copy, trash, send, play):
        image, draw = canvas()
        draw_icon(draw)
        save_icon(image, ASSETS / 'chat' / f'{draw_icon.__name__}.png')


def chat_pattern():
    image = Image.new('RGB', (736, 1139), (15, 22, 21))
    draw = ImageDraw.Draw(image)
    for row, y in enumerate(range(14, 1139, 28)):
        for x in range(14 + (row % 2) * 14, 736, 28):
            draw.ellipse((x - 1.5, y - 1.5, x + 1.5, y + 1.5), fill=(31, 42, 40))
    image.save(ASSETS / 'chat' / 'pattern.png', optimize=True)


def avatar(name, background, foreground, shape):
    image, draw = canvas(320)
    draw.ellipse((0, 0, 319, 319), fill=background)
    if shape == 'peaks':
        draw.polygon([(40, 240), (130, 90), (195, 190), (225, 150), (285, 240)], fill=foreground)
    elif shape == 'rings':
        for r in (110, 72, 34):
            draw.ellipse((160 - r, 160 - r, 160 + r, 160 + r), outline=foreground, width=18)
    elif shape == 'bars':
        for i, h in enumerate((70, 130, 190, 110)):
            x = 72 + i * 48
            draw.rounded_rectangle((x, 160 - h / 2, x + 28, 160 + h / 2), 14, fill=foreground)
    image.resize((160, 160), Image.LANCZOS).save(ASSETS / 'chat' / name, optimize=True)


def cover_crop(image, width, height, focus_y=0.5):
    scale = max(width / image.width, height / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)), Image.LANCZOS
    )
    left = (resized.width - width) // 2
    top = round((resized.height - height) * focus_y)
    return resized.crop((left, top, left + width, top + height))


def chat_photos(commons):
    post = Image.open(commons / 'post.jpg').convert('RGB')
    cover_crop(post, 720, 612).save(ASSETS / 'chat' / 'photo-post.jpg', quality=84)
    reel = Image.open(commons / 'reel.jpg').convert('RGB')
    cover_crop(reel, 480, 870).save(ASSETS / 'chat' / 'photo-reel.jpg', quality=84)


CLOUD = (205, 214, 226, 255)
CLOUD_DARK = (150, 161, 178, 255)
SUN = (255, 196, 66, 255)
MOON = (232, 226, 200, 255)
WATER = (104, 190, 255, 255)
SNOW = (226, 240, 255, 255)
BOLT = (255, 214, 92, 255)


def cloud(d, color=CLOUD, dy=0.0):
    box(d, 3, 11 + dy, 21, 18 + dy, 3.5, color)
    disc(d, 9, 11 + dy, 4, color)
    disc(d, 14.5, 9.5 + dy, 5, color)


def sun(d, cx=12, cy=12, r=4.6):
    disc(d, cx, cy, r, SUN)
    for i in range(8):
        a = math.radians(i * 45)
        stroke(
            d,
            [
                (cx + (r + 2) * math.cos(a), cy + (r + 2) * math.sin(a)),
                (cx + (r + 4) * math.cos(a), cy + (r + 4) * math.sin(a)),
            ],
            color=SUN,
            width=1.5,
        )


def moon(d, cx=12, cy=12, r=7):
    layer, ld = canvas()
    disc(ld, cx, cy, r, MOON)
    disc(ld, cx + r * 0.55, cy - r * 0.4, r * 0.85, (0, 0, 0, 0))
    d._image.alpha_composite(layer)


def drops(d, xs, color=WATER):
    for x in xs:
        stroke(d, [(x + 0.8, 18.5), (x - 0.8, 21.5)], color=color, width=1.5)


def flakes(d, xs):
    for x in xs:
        disc(d, x, 20.5, 1.1, SNOW)


def lines(d, rows, color=CLOUD):
    for y, x0, x1 in rows:
        stroke(d, [(x0, y), (x1, y)], color=color, width=1.8)


def horizon_sun(d, arrow_up):
    sun_y = 15
    disc(d, 12, sun_y, 4.5, SUN)
    box(d, 0, sun_y, 24, 24, 0, (0, 0, 0, 0))
    lines(d, [(16.5, 3, 21)], color=SUN)
    tip, tail = (3, 8) if arrow_up else (8, 3)
    stroke(d, [(12, tail), (12, tip)], color=SNOW, width=1.6)
    stroke(d, [(9.5, tip + (2.5 if arrow_up else -2.5)), (12, tip), (14.5, tip + (2.5 if arrow_up else -2.5))], color=SNOW, width=1.6)


def weather_icons():
    def shifted_moon(d):
        moon(d, 16, 8, 6)

    def clear_day(d):
        sun(d)

    def partly_cloudy_day(d):
        sun(d, 16, 8, 3.8)
        cloud(d, dy=1.5)

    def cloudy(d):
        cloud(d, CLOUD_DARK, dy=-3)
        cloud(d, dy=1.5)

    def haze(d):
        sun(d, 12, 8, 3.4)
        lines(d, [(15, 4, 20), (18.5, 7, 17)])

    def fog(d):
        lines(d, [(8, 5, 19), (12, 3, 16), (16, 8, 21), (20, 5, 15)])

    def windy(d):
        stroke(d, [(3, 9), (15, 9)] + arc(15, 6, 3, 90, -120), color=CLOUD)
        stroke(d, [(3, 13), (19, 13)] + arc(19, 16, 3, -90, 120), color=CLOUD)
        stroke(d, [(3, 17), (10, 17)], color=CLOUD)

    def drizzle(d):
        cloud(d, dy=-2)
        drops(d, (9, 15))

    def rain(d):
        cloud(d, dy=-2)
        drops(d, (7.5, 12, 16.5))

    def heavy_rain(d):
        cloud(d, CLOUD_DARK, dy=-2)
        drops(d, (5.5, 9.5, 13.5, 17.5))

    def thunderstorm(d):
        cloud(d, CLOUD_DARK, dy=-3)
        d.polygon(
            [(c * UNIT, r * UNIT) for c, r in ((13.5, 13), (9, 19), (12, 19), (10.5, 23.5), (16, 17), (13, 17))],
            fill=BOLT,
        )

    def snow(d):
        cloud(d, dy=-2)
        flakes(d, (8, 12, 16))

    def heavy_snow(d):
        cloud(d, CLOUD_DARK, dy=-2)
        flakes(d, (6, 10, 14, 18))
        disc(d, 8, 22.8, 1, SNOW)
        disc(d, 16, 22.8, 1, SNOW)

    def sleet(d):
        cloud(d, dy=-2)
        drops(d, (8, 16))
        flakes(d, (12,))

    def clear_night(d):
        moon(d, 11, 12, 8)
        disc(d, 19, 6, 0.9, SNOW)
        disc(d, 20, 13, 0.7, SNOW)

    def partly_cloudy_night(d):
        shifted_moon(d)
        cloud(d, dy=1.5)

    def drizzle_night(d):
        shifted_moon(d)
        cloud(d, dy=-1)
        drops(d, (9, 15))

    def sunrise(d):
        horizon_sun(d, True)

    def sunset(d):
        horizon_sun(d, False)

    for draw_icon in (
        clear_day, partly_cloudy_day, cloudy, haze, fog, windy, drizzle, rain,
        heavy_rain, thunderstorm, snow, heavy_snow, sleet, clear_night,
        partly_cloudy_night, drizzle_night, sunrise, sunset,
    ):
        image, draw = canvas()
        draw._image = image
        draw_icon(draw)
        name = draw_icon.__name__.replace('_', '-')
        save_icon(image, ASSETS / 'weather' / f'{name}.png')

    image, draw = canvas()
    stroke(draw, arc(12, 12, 9, 0, 360), color=(255, 255, 255, 170), width=2)
    stroke(draw, [(12, 7), (12, 12), (16, 14)], color=(255, 255, 255, 170), width=2)
    save_icon(image, ASSETS / 'weather' / 'clock.png')

    image, draw = canvas()
    box(draw, 3, 5, 21, 21, 3, (255, 255, 255, 170))
    box(draw, 5, 10, 19, 19, 1.5, (0, 0, 0, 0))
    stroke(draw, [(8, 3), (8, 6)], color=(255, 255, 255, 170), width=2)
    stroke(draw, [(16, 3), (16, 6)], color=(255, 255, 255, 170), width=2)
    save_icon(image, ASSETS / 'weather' / 'calendar.png')


def foam():
    random.seed(7)
    size = 1536
    seam = round(size * 0.615)
    image = Image.new('RGB', (size, size), (250, 244, 228))
    draw = ImageDraw.Draw(image)

    for y in range(seam, size):
        k = (y - seam) / (size - seam)
        draw.line((0, y, size, y), fill=(int(238 - 14 * k), int(170 - 22 * k), int(24 + 4 * k)))

    def foam_bubble(x, y, r):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(236, 226, 200))
        draw.ellipse((x - r, y - r, x + r, y + r), outline=(255, 252, 244), width=max(2, round(r * 0.14)))

    for _ in range(1500):
        foam_bubble(random.uniform(0, size), random.uniform(0, seam - 20), random.uniform(3, 12))
    for _ in range(130):
        foam_bubble(random.uniform(0, size), random.uniform(0, seam - 60), random.uniform(14, 44))
    for _ in range(420):
        x = random.uniform(0, size)
        y = seam + random.gauss(-26, 22)
        draw.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(255, 250, 236))
        foam_bubble(x, y, random.uniform(3, 15))

    for _ in range(620):
        x, y, r = random.uniform(0, size), random.uniform(seam + 30, size), random.uniform(3, 20)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(246, 188, 42), outline=(190, 112, 12), width=max(2, round(r * 0.18)))
        h = r * 0.34
        draw.ellipse((x - h, y - r * 0.6, x + h, y - r * 0.6 + 2 * h), fill=(255, 244, 196))

    result = image.filter(ImageFilter.GaussianBlur(1.6)).resize((768, 768), Image.LANCZOS)
    pixels = np.asarray(result, dtype=np.float32)
    grain = np.random.default_rng(7).normal(0, 2.2, pixels.shape[:2])[..., None]
    Image.fromarray(np.clip(pixels + grain, 0, 255).astype(np.uint8)).save(ASSETS / 'foam.jpg', quality=88)


def wax_top(x):
    points = [
        (1100, 840), (1180, 835), (1230, 850), (1270, 880), (1305, 898),
        (1340, 902), (1375, 875), (1410, 858), (1460, 862), (1600, 880),
    ]
    xs, ys = zip(*points)
    return np.interp(x, xs, ys)


def cake(commons):
    source = np.asarray(Image.open(commons / 'cake.jpg').convert('RGB'), dtype=np.float32)
    height, width, _ = source.shape
    background = source[60:140].mean(axis=(0, 1))
    yy, xx = np.mgrid[0:height, 0:width]
    in_glow = ((xx - 1300) / 240.0) ** 2 + ((yy - 700) / 340.0) ** 2 < 1
    above_wax = yy < wax_top(xx) - 3
    mask = Image.fromarray(((in_glow & above_wax) * 255).astype(np.uint8))
    mask = np.asarray(mask.filter(ImageFilter.GaussianBlur(4)), dtype=np.float32)[..., None] / 255
    noise = np.random.default_rng(3).normal(0, 1.1, source.shape[:2])[..., None]
    source = source * (1 - mask) + (background + noise) * mask

    crop_left, crop_width = 130, 2350
    pad = round(crop_width * 1043 / 730) - height
    top = background + np.random.default_rng(4).normal(0, 1.1, (pad, crop_width, 1))
    full = np.concatenate([top, source[:, crop_left:crop_left + crop_width]], axis=0)
    image = Image.fromarray(np.clip(full, 0, 255).astype(np.uint8))
    image.resize((730, 1043), Image.LANCZOS).save(ASSETS / 'candle' / 'cake.jpg', quality=88)


def wave_scenes(commons):
    width, height = 1206, 2622
    photo = cover_crop(Image.open(commons / 'reel.jpg').convert('RGB'), width, height, 0.5)
    shade = Image.new('RGB', (width, height), (10, 26, 34))
    scene = Image.blend(photo, shade, 0.34)
    (ASSETS / 'scenes').mkdir(exist_ok=True)
    scene.save(ASSETS / 'scenes' / 'misty-path.jpg', quality=86)

    island = ImageDraw.Draw(atlas_panel := scene.copy())
    pill_w, pill_h = 0.312 * width, 0.0408 * height
    island.rounded_rectangle(
        (width / 2 - pill_w / 2, 0.0376 * height - pill_h / 2, width / 2 + pill_w / 2, 0.0376 * height + pill_h / 2),
        pill_h / 2,
        fill=(0, 0, 0),
    )
    atlas = Image.new('RGB', (width * 3, height))
    atlas.paste(atlas_panel, (0, 0))
    atlas.paste(atlas_panel.filter(ImageFilter.GaussianBlur(22)), (width, 0))
    atlas.paste(atlas_panel.filter(ImageFilter.GaussianBlur(60)), (width * 2, 0))
    atlas.resize((2412, 1748), Image.LANCZOS).save(ASSETS / 'wave' / 'scene-atlas.jpg', quality=84)

    swing = Image.open(ASSETS / 'cracks' / 'swing.jpg').convert('RGB')
    dusk = swing.crop((820, 0, 1498, 1473)).resize((width, height), Image.LANCZOS)
    dusk.save(ASSETS / 'wave' / 'dusk.jpg', quality=86)


def main():
    commons = Path(sys.argv[1])
    chat_icons()
    chat_pattern()
    avatar('avatar-peaks.png', (34, 92, 84), (222, 240, 226), 'peaks')
    avatar('avatar-rings.png', (64, 58, 110), (236, 230, 250), 'rings')
    avatar('avatar-bars.png', (150, 104, 32), (255, 240, 212), 'bars')
    chat_photos(commons)
    weather_icons()
    foam()
    cake(commons)
    wave_scenes(commons)


if __name__ == '__main__':
    main()
