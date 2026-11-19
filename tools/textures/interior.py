"""車內牆面貼圖：刷白漆的鉚接鋼板。

試驗影片中車內牆面漆成白色或淺色，看得到鉚釘。這張貼圖畫的是：每 1 m 一道直縫、縫兩側各一列鉚釘、
腰線高度一道橫縫；漆面泛黃不均、有刷痕；鉚釘與接縫滲出鏽水，往下流成褐色水痕；零星掉漆與擦痕。
整體接近白色，由材質原本的顏色去染（遊戲端相乘）。

一張代表 4 m，四邊可平鋪。
用法：python tools/textures/interior.py
輸出：public/textures/interior_d.jpg
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'textures', 'interior_d.jpg')
N = 2048
PX = N / 4.0


def noise(n, cells, rng, cells_y=None):
    cy = cells_y or cells
    g = rng.random((cy, cells))

    def axis(c):
        xs = np.arange(n) / n * c
        i0 = np.floor(xs).astype(int) % c
        f = xs - np.floor(xs)
        return i0, (i0 + 1) % c, f * f * (3 - 2 * f)

    x0, x1, fx = axis(cells)
    y0, y1, fy = axis(cy)
    return ((g[np.ix_(y0, x0)] * (1 - fx[None, :]) + g[np.ix_(y0, x1)] * fx[None, :]) * (1 - fy[:, None])
            + (g[np.ix_(y1, x0)] * (1 - fx[None, :]) + g[np.ix_(y1, x1)] * fx[None, :]) * fy[:, None])


def fbm(n, base, octaves, rng):
    out = np.zeros((n, n))
    amp, total = 1.0, 0.0
    for k in range(octaves):
        out += noise(n, base * 2 ** k, rng) * amp
        total += amp
        amp *= 0.5
    return out / total


def mix(a, b, t):
    return a * (1 - t[:, :, None]) + b * t[:, :, None]


rng = np.random.default_rng(94)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float64)
rgb = np.ones((N, N, 3))
# 漆面：泛黃不均、垂直刷痕、細顆粒
yellow = fbm(N, 4, 3, rng)
rgb *= 1 - 0.1 * yellow[:, :, None] * np.array([0.0, 0.35, 1.0])[None, None, :]
rgb *= (0.9 + 0.1 * noise(N, 380, rng, cells_y=10))[:, :, None]
rgb *= (0.93 + 0.1 * fbm(N, 48, 3, rng))[:, :, None]

rust = np.array([0.42, 0.25, 0.14])
seam_x = np.arange(0, N, N // 4)          # 每 1 m 一道直縫
seam_y = np.array([int(N * 0.55)])        # 腰線高度的橫縫
# 接縫
for k in seam_x:
    d = np.abs(((xx - k + N / 2) % N) - N / 2)
    rgb *= (1 - 0.45 * np.clip(1 - d / 2.5, 0, 1))[:, :, None]
    rgb *= (1 + 0.06 * np.clip(1 - np.abs(d - 4) / 2, 0, 1))[:, :, None]
for k in seam_y:
    d = np.abs(((yy - k + N / 2) % N) - N / 2)
    rgb *= (1 - 0.4 * np.clip(1 - d / 2.5, 0, 1))[:, :, None]

# 鉚釘：縫兩側各一列，間距 9 cm；橫縫上下各一列
rivets = []
pitch = 0.09 * PX
for k in seam_x:
    for off in (-0.04 * PX, 0.04 * PX):
        for j in range(int(N / pitch)):
            rivets.append((k + off, j * pitch + pitch / 2))
for k in seam_y:
    for off in (-0.04 * PX, 0.04 * PX):
        for j in range(int(N / pitch)):
            rivets.append((j * pitch + pitch / 2, k + off))
R = 0.011 * PX        # 鉚釘頭半徑約 1.1 cm
shade = np.zeros((N, N))
rustmask = np.zeros((N, N))
drip_src = np.zeros(N)
rr = np.random.default_rng(7)
for cx, cy in rivets:
    x0, x1 = int(cx - 3 * R), int(cx + 3 * R) + 1
    y0, y1 = int(cy - 3 * R), int(cy + 3 * R) + 1
    xs = np.arange(x0, x1) % N
    ys = np.arange(y0, y1) % N
    dx = (np.arange(x0, x1) - cx)[None, :]
    dy = (np.arange(y0, y1) - cy)[:, None]
    d = np.sqrt(dx ** 2 + dy ** 2)
    dome = np.clip(1 - d / R, 0, 1)
    # 圓頭鉚釘：上緣受光、下緣陰影（燈在上方）
    lit = dome * (-dy / R) * 0.22 + np.clip(1 - np.abs(d - R * 1.15) / (R * 0.5), 0, 1) * np.clip(dy / R, 0, 1) * -0.3
    shade[np.ix_(ys, xs)] += lit
    amt = rr.random()
    if amt > 0.55:      # 約半數鉚釘周圍有鏽
        rustmask[np.ix_(ys, xs)] = np.maximum(rustmask[np.ix_(ys, xs)], np.clip(1 - d / (R * (1.5 + amt)), 0, 1) * (amt - 0.4))
        if amt > 0.8:
            drip_src[int(cx) % N] = max(drip_src[int(cx) % N], amt)
rgb *= (1 + shade)[:, :, None]
rgb = mix(rgb, rust[None, None, :], np.clip(rustmask * 1.2 * (0.5 + fbm(N, 120, 2, rng)), 0, 0.8))

# 鏽水往下流：從橫縫與部分鉚釘出發，長短不一
col_noise = noise(N, 230, rng, cells_y=1)[0]
length = (0.15 + 0.85 * noise(N, 41, rng, cells_y=1)[0]) * 0.8 * PX
src = np.clip((col_noise - 0.66) / 0.15, 0, 1)
for k in list(seam_y) + [0]:
    d = (yy - k) % N
    run = np.clip(1 - d / length[None, :], 0, 1) ** 1.6 * src[None, :]
    run *= 0.5 + 0.5 * noise(N, 300, rng, cells_y=5)
    rgb = mix(rgb, rust[None, None, :] * 1.15, run * 0.42)
# 水漬：大片淡淡的垂流
stain = np.clip((noise(N, 22, rng, cells_y=2) - 0.55) / 0.3, 0, 1) * (0.5 + 0.5 * fbm(N, 30, 2, rng))
rgb *= 1 - 0.14 * stain[:, :, None] * np.array([0.6, 0.85, 1.2])[None, None, :]
# 擦痕與掉漆（露出深色底漆）
scuff = np.clip((fbm(N, 200, 2, rng) * 0.55 + fbm(N, 9, 2, rng) * 0.45 - 0.745) / 0.012, 0, 1)
rgb = mix(rgb, np.array([0.4, 0.33, 0.27])[None, None, :], scuff * 0.6)

Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(OUT, quality=88)
print(OUT, os.path.getsize(OUT), 'mean', rgb.mean(axis=(0, 1)).round(3))
