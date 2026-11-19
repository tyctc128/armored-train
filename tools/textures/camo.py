"""車身迷彩貼圖（手刷感）：遊戲載入後取代 .glb 內嵌的迷彩。

1934 年試驗運行時的塗裝（依當時照片與試驗影片）：橄欖底、深褐與淺土黃的大色塊，
加上黃赭色彎曲色帶（寬約 17 cm、大致垂直、間隔約 2 m，偶有彎鉤）。
影片是黑白的，顏色是套用當時日本陸軍車輛的通用配色（推測）。

與 tools/blender/common.py 的 camo_texture 版面相同（一張代表 4 m、四邊可平鋪、色帶位置一致），差別在：
- 解析度 2048（每公尺 512 像素）
- 色帶是刷子刷的：邊緣不整齊、寬度有變化、看得到筆觸、顏色較暗並有掉漆
- 色塊邊緣不規則；板縫只留淡淡的直縫，不再是整齊的方格
- 加上鉚釘列下方的鏽水痕、零星掉漆

用法：python tools/textures/camo.py
輸出：public/textures/camo_d.jpg
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'textures', 'camo_d.jpg')
N = 2048
PX = N / 4.0      # 每公尺像素


def noise(n, cells, rng, cells_y=None):
    """可平鋪的數值雜訊，0–1。cells_y 不同時可做出拉長的紋路。"""
    cy = cells_y or cells
    g = rng.random((cy, cells))

    def axis(c):
        xs = np.arange(n) / n * c
        i0 = np.floor(xs).astype(int) % c
        f = xs - np.floor(xs)
        return i0, (i0 + 1) % c, f * f * (3 - 2 * f)

    x0, x1, fx = axis(cells)
    y0, y1, fy = axis(cy)
    a = g[np.ix_(y0, x0)]
    b = g[np.ix_(y0, x1)]
    c = g[np.ix_(y1, x0)]
    d = g[np.ix_(y1, x1)]
    return (a * (1 - fx[None, :]) + b * fx[None, :]) * (1 - fy[:, None]) + (c * (1 - fx[None, :]) + d * fx[None, :]) * fy[:, None]


def fbm(n, base, octaves, rng):
    out = np.zeros((n, n))
    amp, total = 1.0, 0.0
    for k in range(octaves):
        out += noise(n, base * 2 ** k, rng) * amp
        total += amp
        amp *= 0.5
    return out / total


def srgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def mix(a, b, t):
    return a * (1 - t[:, :, None]) + b * t[:, :, None]


rng = np.random.default_rng(1934)
base = srgb('#4a4e35')
patch = srgb('#3a3324')
light = srgb('#646244')
stripe = srgb('#a8945c')       # 比先前暗、不那麼黃：日曬褪色的黃赭
primer = srgb('#3a2a20')       # 掉漆露出的底漆與鏽

rows = np.arange(N)
cols = np.arange(N)
m1 = fbm(N, 3, 4, rng)
ragged = fbm(N, 40, 3, rng) - 0.5          # 色塊邊緣的不規則
rgb = np.empty((N, N, 3))
rgb[:] = base
rgb = mix(rgb, patch[None, None, :], np.clip((m1 + ragged * 0.05 - 0.55) / 0.02, 0, 1) * 0.92)
rgb = mix(rgb, light[None, None, :], np.clip((0.42 - m1 - ragged * 0.05) / 0.02, 0, 1) * 0.88)

# ── 色帶：到中心線的距離場（像素）──
dist = np.full((N, N), 1e9)
half_w = 0.085 * PX


def paint_curve(xc, rows_sel, slope, scale=None):
    hw = np.sqrt(1 + slope ** 2)
    for i, (r, x) in enumerate(zip(rows_sel, xc)):
        d = np.abs(((cols - x + N / 2) % N) - N / 2) / hw[i]
        if scale is not None:
            d = d / max(scale[i], 0.05)
        dist[r] = np.minimum(dist[r], d)


t = rows / N * 2 * np.pi
lines = []
rng2 = np.random.default_rng(1934)     # 與 common.py 相同的亂數順序，色帶位置才一致
rng2.random((3, 3)); rng2.random((6, 6)); rng2.random((12, 12)); rng2.random((24, 24))
for x0 in (0.9, 2.9):
    a1, a2 = rng2.uniform(0.25, 0.45) * PX, rng2.uniform(0.08, 0.16) * PX
    p1, p2 = rng2.uniform(0, 6.28), rng2.uniform(0, 6.28)
    x = x0 * PX + a1 * np.sin(t + p1) + a2 * np.sin(2 * t + p2)
    dx = (a1 * np.cos(t + p1) + a2 * 2 * np.cos(2 * t + p2)) * 2 * np.pi / N
    paint_curve(x, rows, dx)
    lines.append(x)
for li, y0, span, sgn in ((0, 0.7, 1.1, 1), (1, 2.6, 0.9, -1)):     # 彎鉤
    r0 = int(y0 * PX)
    rr = np.arange(r0, r0 + int(0.9 * PX)) % N
    u = np.arange(len(rr)) / len(rr)
    x = lines[li][r0] + sgn * span * PX * np.sin(u * np.pi / 2) ** 1.5
    paint_curve(x, rr, np.gradient(x), scale=1 - 0.65 * u ** 2)

# 刷子：寬度沿途變化（±25%）、邊緣參差（±1.5 cm）、刷毛留下的條紋
width_var = 1 + (fbm(N, 5, 2, rng) - 0.5) * 0.5
edge = (fbm(N, 70, 3, rng) - 0.5) * 0.03 * PX + (noise(N, 300, rng) - 0.5) * 0.008 * PX
mask = np.clip((half_w * width_var + edge - dist) / 1.5, 0, 1)
bristle = noise(N, 420, rng, cells_y=14)                   # 沿垂直方向拉長的筆觸
cover = 0.82 + 0.18 * np.clip((bristle - 0.25) / 0.3, 0, 1)   # 刷得薄的地方透出底色
thin = np.clip((dist / (half_w * width_var + 1e-6) - 0.55) / 0.45, 0, 1)   # 靠邊緣較薄
cover *= 1 - 0.35 * thin * np.clip((bristle - 0.5) / 0.2, 0, 1)
tone = 0.9 + 0.2 * fbm(N, 9, 3, rng)                       # 色帶本身深淺不一
rgb = mix(rgb, stripe[None, None, :] * tone[:, :, None], mask * cover)

# ── 舊化 ──
grain = fbm(N, 64, 3, rng)
blot = fbm(N, 6, 3, rng)
rgb *= (0.86 + grain * 0.2 + (blot - 0.5) * 0.16)[:, :, None]
# 掉漆：零星小塊，露出底漆
chips = np.clip((fbm(N, 150, 2, rng) * 0.6 + fbm(N, 10, 2, rng) * 0.4 - 0.735) / 0.012, 0, 1)
rgb = mix(rgb, primer[None, None, :] * (0.8 + 0.4 * grain[:, :, None]), chips * 0.9)
# 直縫：每 2 m 一道淡縫（鋼板接縫），橫向只在每 2 m 留一道更淡的
for k in range(0, N, N // 2):
    rgb[:, k:k + 4] *= 0.62
    rgb[:, k + 4:k + 7] *= 1.07
    rgb[k:k + 3, :] *= 0.8
# 鏽水痕：從橫縫往下流，長短不一
src = np.clip((noise(N, 160, rng, cells_y=1) - 0.62) / 0.2, 0, 1)        # 每一欄有沒有鏽水
length = (0.25 + 0.75 * noise(N, 37, rng, cells_y=1)) * 0.9 * PX          # 流多長
for k in range(0, N, N // 2):
    yy = ((rows - k) % N)[:, None]
    run = np.clip(1 - yy / length, 0, 1) ** 1.5 * src
    run *= 0.55 + 0.45 * noise(N, 260, rng, cells_y=6)
    rgb = mix(rgb, srgb('#5a3620')[None, None, :], run * 0.7)
# 雨水流痕（垂直的明暗）
streak_v = noise(N, 190, rng, cells_y=2)
rgb *= (1 - 0.1 * np.clip((streak_v - 0.5) / 0.3, 0, 1))[:, :, None]

Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8)).save(OUT, quality=88)
print(OUT, os.path.getsize(OUT))
