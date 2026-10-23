"""警戒車（領航・軌道管制車）建模腳本。

依《世界裝甲列車圖解百科》照片：以 Ta-I 型 30 噸礦車為底；前端上角兩座圓筒形機槍塔
（九二式重機槍，近距防禦），前端正中裝甲罩內有直徑 30 cm 探照燈，觀察孔有滑動閘板，
中置自動連結器；車內像小型指揮所，牆上裝電話、儀表，並載有修軌用的鐵軌與枕木。

執行：
  blender -b --factory-startup -P tools/blender/guard_car.py

節點：MG_FL_* / MG_FR_*（在前端兩座機槍塔內）、Searchlight、Wheelset_*
尺寸須與 src/train/carModels.js 的 buildGuard 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, V, empty  # noqa: E402
from parts import Kit, FLOOR  # noqa: E402

LEN, W, H = 12.0, 3.0, 2.3
HATCH_X = -1.5
# 前端上角的圓筒形機槍塔（中心、半徑、上緣）；機槍裝在塔壁，射界以左前／右前 35° 為中心
TW_X, TW_Z, TW_R = LEN / 2 - 0.62, 0.92, 0.6
MG_Y = 3.52  # 車頂（3.4 m）上方的塔身段
MG_DIR = math.radians(35)
MG_X = TW_X + math.cos(MG_DIR) * TW_R
MG_Z = TW_Z + math.sin(MG_DIR) * TW_R

kit = Kit('GuardCar')
k = kit
hull = kit.hull(length=LEN, w=W, h=H, front_door=False)
ROOF = hull.roof
ins = hull.inside


# ───────────────────────────── 車內 ─────────────────────────────
hull.lamps((-4.0, 0.5, 4.2))
hull.hatch(HATCH_X)
hull.wall_structure(skip=[(-0.8, 0.8)])
hull.voice_tube(drops=(3.6,))
hull.inner_slits((-4.2, 2.2))
hull.inner_ports((-3.0, 2.8))
hull.mg_post(TW_X - 0.6)

# 前端牆：探照燈操縱箱（手輪、開關）、兩側觀察窗內閘板、塔下踏台與握把
XF_IN = LEN / 2 - 0.1
ins.box((XF_IN - 0.12, FLOOR + 1.35, 0), (0.22, 0.42, 0.5), k.IST)
ins.lathe((XF_IN - 0.25, FLOOR + 1.35, 0), (-1, 0, 0), [(0, 0.16), (0.03, 0.16), (0.03, 0.13), (0, 0.13)], 20, k.ST, closed=True)
for j in range(3):
    a = math.pi * j / 3
    ins.cylinder((XF_IN - 0.26, FLOOR + 1.35 + math.cos(a) * 0.14, math.sin(a) * 0.14),
                 (XF_IN - 0.26, FLOOR + 1.35 - math.cos(a) * 0.14, -math.sin(a) * 0.14), 0.01, 6, k.ST)
for dz in (-0.16, 0.16):
    ins.box((XF_IN - 0.24, FLOOR + 1.6, dz), (0.05, 0.08, 0.06), k.BLK)
ins.cylinder((XF_IN - 0.1, FLOOR + 1.58, 0), (XF_IN - 0.1, hull.ceil - 0.1, 0), 0.02, 8, k.BLK)
for side in (-1, 1):
    # 機槍塔下的踏台（站上去操作塔內機槍）
    ins.box((TW_X - 0.05, FLOOR + 0.95, side * 0.95), (0.95, 0.08, 0.85), k.WOOD)
    for dx in (-0.4, 0.3):
        for dz in (0.6, 1.3):
            ins.box((TW_X + dx, FLOOR + 0.46, side * dz), (0.06, 0.92, 0.06), k.IST)
    for j, h in enumerate((0.32, 0.64)):
        ins.box((TW_X - 0.62 - (1 - j) * 0.28, FLOOR + h, side * 0.95), (0.28, 0.05, 0.6), k.WOOD)  # 踏階
    # 前端觀察窗（內側滑動閘板與把手）
    ins.box((XF_IN, 2.35, side * 0.45), (0.04, 0.32, 0.5), k.IST)
    ins.box((XF_IN - 0.02, 2.35, side * 0.45), (0.04, 0.08, 0.36), k.BLK)
    ins.box((XF_IN - 0.05, 2.28, side * 0.62), (0.04, 0.04, 0.08), k.ST)

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

# 小型指揮所：左牆兩具電話箱與儀表板、電池箱；右側觀察窗下長凳
for j, x in enumerate((3.6, 4.15)):
    hull.phone(x, -1, y=2.35)
ins.box((3.85, 2.75, hull.on_wall(-1, 0.04)), (1.1, 0.42, 0.04), k.WOOD)
for j in range(3):
    ins.cylinder((3.5 + j * 0.35, 2.78, -(hull.hw_in - 0.04)), (3.5 + j * 0.35, 2.78, -(hull.hw_in - 0.08)), 0.07, 14, k.IST)
    ins.cylinder((3.5 + j * 0.35, 2.78, -(hull.hw_in - 0.08)), (3.5 + j * 0.35, 2.78, -(hull.hw_in - 0.085)), 0.055, 14, k.WHT)
ins.box((3.9, FLOOR + 0.2, hull.on_wall(-1, 0.32)), (0.9, 0.4, 0.3), k.OLV)
for j in range(3):
    ins.box((3.6 + j * 0.3, FLOOR + 0.42, -(hull.hw_in - 0.17)), (0.05, 0.04, 0.05), k.BRS)
ins.box((3.8, FLOOR + 0.42, hull.on_wall(1, 0.4)), (1.6, 0.06, 0.4), k.WOOD)
ins.box((3.8, FLOOR + 0.2, hull.on_wall(1, 0.4)), (1.6, 0.4, 0.04), k.WOOD)

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
hull.vents((-4.5,))
hull.lifting_rings()
hull.rivets(skip=[(-0.7, 0.7)])

# 前端板：兩座圓筒形機槍塔、中央探照燈裝甲罩、觀察孔滑動閘板、號誌燈、踏板
XF = LEN / 2
tw = MeshBuilder()
for side in (-1, 1):
    zc = side * TW_Z
    top = ROOF + 0.55
    # 塔身：從車身上緣下方一路到車頂上方，圓頂邊緣倒角
    y0 = ROOF - 0.45
    tw.lathe((TW_X, y0, zc), (0, 1, 0), [(0, TW_R), (top - y0 - 0.08, TW_R), (top - y0, TW_R - 0.08), (top - y0, 0)], 32, k.A, cap0=False)
    # 塔頂小艙蓋與通風帽
    tw.cylinder((TW_X - 0.1, top, zc), (TW_X - 0.1, top + 0.05, zc), 0.26, 18, k.A)
    tw.cylinder((TW_X - 0.1, top + 0.05, zc + side * 0.2), (TW_X - 0.1, top + 0.08, zc + side * 0.2), 0.04, 8, k.ST)
    # 塔正面觀察孔與滑動閘板（閘板半開）
    fx = TW_X + TW_R
    sy = ROOF + 0.36
    tw.box((fx + 0.005, sy, zc + side * 0.18), (0.03, 0.06, 0.3), k.BLK)
    tw.box((fx + 0.03, sy, zc + side * 0.34), (0.03, 0.12, 0.3), k.A)
    tw.box((fx + 0.03, sy + 0.08, zc + side * 0.2), (0.03, 0.03, 0.5), k.ST)
    tw.box((fx + 0.03, sy - 0.08, zc + side * 0.2), (0.03, 0.03, 0.5), k.ST)
    # 塔身鉚釘帶
    for j in range(28):
        a = 2 * math.pi * j / 28
        for y in (ROOF + 0.05, ROOF + 0.47):
            tw.rivet((TW_X + math.cos(a) * TW_R, y, zc + math.sin(a) * TW_R), (math.cos(a), 0, math.sin(a)))
tw.build('MgTurrets', k.MATS, parent=kit.root, bevel=0.012)

# 探照燈裝甲罩（前端正中，直徑 30 cm 燈）
det.box((XF + 0.16, 2.72, 0), (0.32, 0.62, 0.74), k.A)
det.box((XF + 0.33, 2.98, 0), (0.06, 0.08, 0.82), k.A)  # 上緣遮簷
det.box((XF + 0.33, 2.46, 0), (0.06, 0.05, 0.78), k.ST)
for z in (-0.37, 0.37):
    det.box((XF + 0.33, 2.72, z), (0.06, 0.55, 0.05), k.ST)
for j in range(10):
    det.rivet((XF + 0.32, 2.45 + j * 0.06, -0.4), (1, 0, 0))
    det.rivet((XF + 0.32, 2.45 + j * 0.06, 0.4), (1, 0, 0))
# 前端觀察孔（滑動閘板）、號誌燈、牌號板
for side in (-1, 1):
    det.box((XF + 0.005, 2.35, side * 0.45), (0.02, 0.06, 0.32), k.BLK)
    det.box((XF + 0.03, 2.42, side * 0.52), (0.03, 0.1, 0.36), k.A)
    det.box((XF + 0.04, 2.48, side * 0.45), (0.02, 0.02, 0.62), k.ST)
det.lathe((XF, 1.95, -0.85), (1, 0, 0), [(0, 0.11), (0.12, 0.11), (0.14, 0.08), (0.14, 0)], 14, k.ST, cap0=False)
det.lathe((XF + 0.141, 1.95, -0.85), (1, 0, 0), [(0, 0.075), (0.004, 0)], 14, k.RED)
det.box((XF + 0.08, 2.12, -0.85), (0.12, 0.05, 0.05), k.ST)
det.box((XF + 0.02, 1.7, 0.55), (0.03, 0.28, 0.5), k.A)
for z in (-1.1, 1.1):
    det.lathe((XF, 1.35, z), (1, 0, 0), [(0, 0.1), (0.08, 0.1), (0.1, 0.08), (0.1, 0)], 14, k.ST, cap0=False)
    det.lathe((XF + 0.101, 1.35, z), (1, 0, 0), [(0, 0.07), (0.004, 0)], 14, k.LMP)
# 前端踏板與扶手、垂下的制動軟管
det.box((XF + 0.32, 0.55, 0), (0.28, 0.05, 2.7), k.WOOD)
for z in (-1.2, 1.2, 0.0):
    det.box((XF + 0.2, 0.75, z), (0.04, 0.4, 0.05), k.ST)
for z in (-1.3, 1.3):
    det.cylinder((XF + 0.08, 1.45, z), (XF + 0.08, 2.15, z), 0.02, 6, k.ST)
det.cylinder((XF + 0.2, 0.95, -0.35), (XF + 0.45, 0.62, -0.42), 0.035, 8, k.BLK)
det.cylinder((XF + 0.45, 0.62, -0.42), (XF + 0.5, 0.42, -0.38), 0.035, 8, k.BLK)
# 前端板鉚釘格
for j in range(14):
    for y in (1.6, 2.1, 2.95):
        det.rivet((XF, y, -1.3 + j * 0.2), (1, 0, 0))
hull.finish()

# 探照燈本體（可轉動節點，遊戲目前不使用）
sl = empty('Searchlight', kit.root, (XF + 0.2, 2.72, 0))
lamp = MeshBuilder()
lamp.lathe((-0.12, 0, 0), (1, 0, 0), [(0, 0.1), (0.05, 0.19), (0.2, 0.2), (0.24, 0.21), (0.26, 0.21), (0.26, 0.17)], 24, k.ST, cap0=True, cap1=False)
lamp.lathe((0.13, 0, 0), (1, 0, 0), [(0, 0.15), (0.004, 0)], 24, k.LMP)
for j in range(4):
    lamp.box((0.14, -0.12 + j * 0.08, 0), (0.01, 0.01, 0.3), k.ST)  # 防護格柵
lamp.build('SearchlightLamp', k.MATS, parent=sl, bevel=0.004)

kit.running_gear(LEN)

# ───────────────────────────── 九二式重機槍（前方左右） ─────────────────────────────
kit.mg('FL', (MG_X, MG_Y, -MG_Z), 35, 75, '警戒車 左前機槍', housing=0.2)
kit.mg('FR', (MG_X, MG_Y, MG_Z), -35, 75, '警戒車 右前機槍', housing=0.2)

kit.export('guard_car', cam_target=(1.5, 1.8, 0), cam_pos=(13, 5.5, -11))
