"""警戒車建模腳本（列車最前端：排障器、探照燈、前方兩挺機槍、修軌材料）。

執行：
  blender -b --factory-startup -P tools/blender/guard_car.py

節點：MG_FL_* / MG_FR_*、Searchlight、Wheelset_*
尺寸須與 src/train/carModels.js 的 buildGuard 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, V, empty  # noqa: E402
from parts import Kit, FLOOR  # noqa: E402

LEN, W, H = 12.0, 3.0, 2.3
MG_X, MG_Y = LEN / 2 - 1.4, 2.35
HATCH_X = -1.5

kit = Kit('GuardCar')
k = kit
hull = kit.hull(length=LEN, w=W, h=H, front_door=False)
ROOF = hull.roof
ins = hull.inside


def plate(mb, quad, t, mi):
    """四點平板加厚度 t（沿法線往內），成為封閉六面體。"""
    a, b, c, d = [V(*p) for p in quad]
    n = (b - a).cross(d - a).normalized() * t
    v = [mb.bm.verts.new(p) for p in (a, b, c, d)] + [mb.bm.verts.new(p - n) for p in (a, b, c, d)]
    for idx in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
        mb.bm.faces.new([v[i] for i in idx]).material_index = mi


# ───────────────────────────── 車內 ─────────────────────────────
hull.lamps((-4.0, 0.5, 4.2))
hull.hatch(HATCH_X)
hull.wall_structure(skip=[(-0.8, 0.8)])
hull.voice_tube(drops=(3.6,))
hull.inner_slits((-4.2, 2.2))
hull.inner_ports((-3.0, 2.8))
hull.mg_post(MG_X)

# 前段瞭望／探照燈操作位：從天花板垂下的操作柱、手輪、電纜
SLX = LEN / 2 - 0.7
ins.cylinder((SLX, hull.ceil, 0), (SLX, FLOOR + 1.1, 0), 0.06, 12, k.IST)
ins.lathe((SLX, FLOOR + 1.35, 0), (1, 0, 0), [(-0.02, 0.22), (0.02, 0.22), (0.02, 0.19), (-0.02, 0.19)], 20, k.ST, closed=True)
for j in range(4):
    a = math.pi * j / 4
    ins.cylinder((SLX, FLOOR + 1.35 + math.cos(a) * 0.2, math.sin(a) * 0.2),
                 (SLX, FLOOR + 1.35 - math.cos(a) * 0.2, -math.sin(a) * 0.2), 0.012, 6, k.ST)
ins.box((SLX - 0.12, FLOOR + 1.6, 0), (0.18, 0.22, 0.16), k.IST)
ins.cylinder((SLX - 0.1, FLOOR + 1.75, 0.08), (SLX - 0.1, FLOOR + 1.9, 0.08), 0.015, 6, k.BLK)
ins.lathe((SLX - 0.1, FLOOR + 1.9, 0.08), (0, 1, 0), [(0, 0.03), (0.03, 0)], 8, k.BLK)
ins.cylinder((SLX, hull.ceil - 0.1, 0.06), (SLX - 1.2, hull.ceil - 0.1, 0.6), 0.02, 8, k.BLK)
# 瞭望台階（看前方觀察孔用）
ins.box((SLX - 0.9, FLOOR + 0.12, -0.6), (0.6, 0.24, 0.5), k.WOOD)
ins.box((SLX - 0.9, FLOOR + 0.12, 0.6), (0.6, 0.24, 0.5), k.WOOD)

# 修軌材料：左側鐵軌、右側枕木堆、道釘箱
for j in range(4):
    z = -(hull.hw_in - 0.06 - (j % 2) * 0.13)
    y = FLOOR + 0.05 + (j // 2) * 0.16
    x0, x1 = -4.6, 0.4 if j < 2 else -0.6
    xc, L = (x0 + x1) / 2, x1 - x0
    ins.box((xc, y, z), (L, 0.025, 0.12), k.ST)            # 軌底
    ins.box((xc, y + 0.065, z), (L, 0.1, 0.03), k.ST)      # 軌腰
    ins.box((xc, y + 0.13, z), (L, 0.04, 0.07), k.ST)      # 軌頭
for layer in range(4):
    for col in range(2):
        z = hull.hw_in - 0.12 - col * 0.22
        ins.box((-2.9, FLOOR + 0.09 + layer * 0.19, z), (2.6, 0.17, 0.2), k.WOOD)
ins.box((-1.25, FLOOR + 0.03, hull.hw_in - 0.23), (0.2, 0.06, 0.4), k.ST)
for z in (hull.hw_in - 0.05, hull.hw_in - 0.39):
    ins.box((-1.25, FLOOR + 0.4, z), (0.06, 0.8, 0.06), k.ST)
ins.box((1.35, FLOOR + 0.22, hull.on_wall(1, 0.4)), (0.6, 0.44, 0.4), k.WOOD)
ins.box((1.35, FLOOR + 0.45, hull.on_wall(1, 0.4)), (0.62, 0.03, 0.42), k.ST)
for j in range(10):
    ins.box((1.12 + (j % 5) * 0.11, FLOOR + 0.49, hull.hw_in - 0.12 - (j // 5) * 0.16), (0.02, 0.06, 0.02), k.ST)

# 工具架（左側牆）：鐵鎚、撬棍、扳手、鏟、十字鎬
TX0 = 2.6
ins.box((TX0, 2.05, hull.on_wall(-1, 0.03)), (1.5, 1.0, 0.03), k.WOOD)
zt = -(hull.hw_in - 0.07)
ins.cylinder((TX0 - 0.6, 1.65, zt), (TX0 - 0.6, 2.45, zt), 0.018, 8, k.WOOD)
ins.box((TX0 - 0.6, 2.47, zt), (0.2, 0.07, 0.07), k.ST)
ins.cylinder((TX0 - 0.35, 1.6, zt), (TX0 - 0.3, 2.5, zt), 0.016, 8, k.ST)
ins.box((TX0 - 0.31, 2.52, zt), (0.1, 0.03, 0.03), k.ST)
for j, L in enumerate((0.3, 0.38, 0.45)):
    x = TX0 - 0.05 + j * 0.13
    ins.box((x, 2.35 - L / 2, zt), (0.03, L, 0.015), k.ST)
    ins.box((x, 2.37, zt), (0.08, 0.05, 0.015), k.ST)
ins.cylinder((TX0 + 0.45, 1.75, zt), (TX0 + 0.45, 2.5, zt), 0.017, 8, k.WOOD)
ins.box((TX0 + 0.45, 1.62, zt), (0.22, 0.28, 0.02), k.ST)
ins.cylinder((TX0 + 0.68, 1.65, zt), (TX0 + 0.68, 2.4, zt), 0.018, 8, k.WOOD)
ins.box((TX0 + 0.68, 2.42, zt), (0.5, 0.05, 0.04), k.ST)

# 共用內裝
hull.seats((-4.9,), sides=(1,))
hull.locker(-5.3, -1)
hull.extinguisher(0.85, 1)
hull.first_aid(-0.95, -1)
hull.phone(3.5, 1, y=2.5)
hull.helmets(-5.3, 1, n=2)

# ───────────────────────────── 外部 ─────────────────────────────
det = hull.det
hull.side_details(doors=(0.0,), slits=(-4.2, -1.8, 2.2), ports=(-3.0, 2.8))
for side in (-1, 1):
    hull.mg_ring(MG_X, MG_Y, side)
hull.vents((-4.5,))
hull.lifting_rings()
hull.rivets(skip=[(-0.7, 0.7)])

# 前端板：觀察孔、牌號板、頭燈
XF = LEN / 2
for z in (-0.6, 0.6):
    det.box((XF + 0.005, 2.55, z), (0.02, 0.06, 0.4), k.BLK)
    det.box((XF + 0.05, 2.63, z), (0.1, 0.05, 0.55), k.A)
det.box((XF + 0.02, 1.85, 0), (0.03, 0.3, 0.7), k.A)
for z in (-1.1, 1.1):
    det.lathe((XF, 1.35, z), (1, 0, 0), [(0, 0.13), (0.1, 0.13), (0.12, 0.1), (0.12, 0)], 14, k.ST, cap0=False)
    det.lathe((XF + 0.121, 1.35, z), (1, 0, 0), [(0, 0.09), (0.005, 0)], 14, k.LMP)

# 排障器：V 形雙板＋橫條
TIP = XF + 1.25
BACK = XF + 0.3
cc = MeshBuilder()
for s in (-1, 1):
    quad = [(TIP, 0.18, 0), (BACK, 0.18, s * 1.45), (BACK, 1.0, s * 1.45), (TIP - 0.35, 0.95, 0)]
    if s > 0:
        quad = [quad[0], quad[3], quad[2], quad[1]]
    plate(cc, quad, 0.03, k.ST)
    for j in range(4):
        y = 0.32 + j * 0.17
        t = (y - 0.18) / 0.82
        xa = TIP - 0.35 * t
        cc.cylinder((xa + 0.03, y, 0), (BACK + 0.02, y, s * 1.47), 0.025, 6, k.ST)
cc.box((XF + 0.18, 0.6, 0), (0.3, 0.6, 2.9), k.ST)
cc.build('Cowcatcher', k.MATS, parent=kit.root, bevel=0.008)

# 探照燈：燈座（車頂）＋可轉動燈筒（Searchlight 節點）
det.box((XF - 0.7, ROOF + 0.12, 0), (0.6, 0.24, 0.6), k.A)
det.cylinder((XF - 0.7, ROOF + 0.24, 0), (XF - 0.7, ROOF + 0.3, 0), 0.28, 20, k.ST)
for z in (-0.38, 0.38):
    det.box((XF - 0.7, ROOF + 0.45, z), (0.12, 0.35, 0.05), k.ST)
hull.finish()

sl = empty('Searchlight', kit.root, (XF - 0.7, ROOF + 0.55, 0))
lamp = MeshBuilder()
lamp.lathe((-0.32, 0, 0), (1, 0, 0), [(0, 0.12), (0.08, 0.3), (0.5, 0.34), (0.56, 0.36), (0.6, 0.36), (0.6, 0.3)], 24, k.ST, cap0=True, cap1=False)
lamp.lathe((0.27, 0, 0), (1, 0, 0), [(0, 0.3), (0.005, 0)], 24, k.LMP)
lamp.box((-0.05, 0.38, 0), (0.08, 0.06, 0.06), k.ST)
lamp.cylinder((-0.36, 0.0, 0), (-0.55, 0.0, 0), 0.02, 6, k.ST)
for z in (-0.36, 0.36):
    lamp.cylinder((0, 0, z), (0, 0, z * 1.08), 0.05, 10, k.ST)
lamp.build('SearchlightLamp', k.MATS, parent=sl, bevel=0.006)

kit.running_gear(LEN)

# ───────────────────────────── 九二式重機槍（前方左右） ─────────────────────────────
kit.mg('FL', (MG_X, MG_Y, -W / 2), 35, 75, '警戒車 左前機槍')
kit.mg('FR', (MG_X, MG_Y, W / 2), -35, 75, '警戒車 右前機槍')

kit.export('guard_car', cam_target=(1.5, 1.8, 0), cam_pos=(13, 5.5, -11))
