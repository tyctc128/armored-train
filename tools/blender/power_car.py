"""電源車建模腳本：前段無線電／發電機室，後段敞頂迫砲座（九七式曲射歩兵砲）。

依照片：人字屋頂、屋頂上以絕緣子架設天線、側面一排小窗、發電機排氣煙囪、後端兩挺機槍與 30 cm 探照燈。
（迫砲座為遊戲虛構，保留。）

執行：
  blender -b --factory-startup -P tools/blender/power_car.py
  （加參數 -- interior 只渲染車內檢查圖到暫存資料夾，不輸出模型）

節點：MG_RL_* / MG_RR_*（後角機槍）、Mortar、Wheelset_*
尺寸須與 src/train/modelSpecs.js 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import MeshBuilder, script_args, render_preview, V  # noqa: E402
from parts import Kit, FLOOR, Y0, windows, window_row  # noqa: E402

NAME = 'power_car'
CN = '電源車'
LEN, W = 14.0, 3.1
HULL_LEN = 9.5
X0 = LEN / 2 - HULL_LEN / 2   # 車體中心 2.25
PIT_X0, PIT_X1 = -LEN / 2, LEN / 2 - HULL_LEN   # 迫砲座 -7.0 … -2.5
PIT_TOP = 2.6
MG_X, MG_Y = -LEN / 2 + 0.75, 2.25
MORTAR_X = -4.6
HATCH_X = LEN / 2 - 4.2
SCRATCH = os.environ.get('MODEL_SCRATCH', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'preview'))

kit = Kit('PowerCar')
k = kit
GABLE = 0.5   # 屋簷到屋脊的落差
hull = kit.hull(length=HULL_LEN, w=W, h=2.4, c=GABLE, x0=X0, gable=True)
ROOF = hull.roof


def roof_y(z):
    return ROOF - GABLE * abs(z) / (W / 2)

ins = hull.inside
R, L = 1, -1   # 右側牆、左側牆

# ───────────────────────────── 車內（無線電／發電機室） ─────────────────────────────
hull.lamps((-1.4, 2.4, 5.6))
hull.hatch(HATCH_X, z=-0.45)

# 發電機組（右側牆）：引擎、飛輪、發電機、排氣管
zg = hull.on_wall(R, 0.4)
ins.box((5.55, FLOOR + 0.08, zg), (2.1, 0.16, 0.42), k.ST)            # 底座
ins.box((5.75, FLOOR + 0.5, zg), (1.2, 0.68, 0.36), k.OLV)             # 引擎本體
ins.box((5.75, FLOOR + 0.9, zg), (1.0, 0.12, 0.3), k.ST)               # 汽缸蓋
for j in range(4):
    ins.cylinder((5.35 + j * 0.27, FLOOR + 0.96, zg - 0.08), (5.35 + j * 0.27, FLOOR + 1.04, zg - 0.08), 0.03, 8, k.CU)  # 火星塞
ins.cylinder((5.1, FLOOR + 0.45, zg), (5.0, FLOOR + 0.45, zg), 0.3, 24, k.ST)       # 飛輪
ins.cylinder((5.0, FLOOR + 0.45, zg), (4.45, FLOOR + 0.45, zg), 0.2, 20, k.GUN)     # 發電機
ins.lathe((4.45, FLOOR + 0.45, zg), (-1, 0, 0), [(0, 0.2), (0.08, 0.14), (0.1, 0)], 16, k.GUN)
ins.box((6.45, FLOOR + 0.55, zg), (0.18, 0.5, 0.34), k.ST)              # 散熱器
ins.cylinder((6.3, FLOOR + 0.85, hull.hw_in - 0.12), (6.3, hull.ceil, hull.hw_in - 0.12), 0.05, 12, k.ST)  # 排氣管
ins.box((5.2, 2.2, hull.on_wall(R, 0.12)), (0.36, 0.3, 0.12), k.IST)   # 引擎儀表
for dx in (-0.08, 0.08):
    ins.cylinder((5.2 + dx, 2.22, hull.hw_in - 0.12), (5.2 + dx, 2.22, hull.hw_in - 0.135), 0.05, 14, k.WHT)

# 蓄電池架（左側牆）
zb = hull.on_wall(L, 0.4)
for sh in range(2):
    y = FLOOR + 0.05 + sh * 0.65
    ins.box((5.4, y, zb), (1.6, 0.04, 0.4), k.IST)
    for j in range(5):
        ins.box((4.78 + j * 0.31, y + 0.2, zb), (0.26, 0.36, 0.3), k.BLK)
        for dz in (-0.07, 0.07):
            ins.cylinder((4.78 + j * 0.31, y + 0.38, zb + dz), (4.78 + j * 0.31, y + 0.42, zb + dz), 0.015, 6, k.CU)
for x in (4.6, 6.2):
    ins.box((x, FLOOR + 0.62, zb), (0.04, 1.24, 0.4), k.IST)

# 大型長距離無線電（左側牆，立櫃）
zr = hull.on_wall(L, 0.36)
ins.box((1.75, FLOOR + 0.75, zr), (0.95, 1.5, 0.36), k.IST)
zf = -(hull.hw_in - 0.365)
for j, (dx, dy) in enumerate([(-0.25, 1.2), (0.0, 1.2), (0.25, 1.2), (-0.25, 0.85), (0.25, 0.85)]):
    ins.lathe((1.75 + dx, FLOOR + dy, zf), (0, 0, 1), [(0, 0.07), (0.02, 0.07), (0.03, 0.05), (0.03, 0)], 14, k.BLK if j < 3 else k.WHT)
for dx in (-0.3, -0.1, 0.1, 0.3):
    ins.cylinder((1.75 + dx, FLOOR + 0.5, zf), (1.75 + dx, FLOOR + 0.5, zf + 0.04), 0.03, 10, k.BLK)
ins.box((1.75, FLOOR + 1.42, zf + 0.005), (0.85, 0.06, 0.01), k.BRS)    # 銘板
ins.cylinder((2.15, FLOOR + 1.5, -(hull.hw_in - 0.18)), (2.15, hull.ceil, -(hull.hw_in - 0.18)), 0.02, 8, k.BLK)  # 天線引入線

# 操作員桌（右側牆）與攜帶式短距離無線電、電鍵、耳機
zd = hull.on_wall(R, 0.42)
ins.box((1.8, FLOOR + 0.76, zd), (1.2, 0.05, 0.42), k.WOOD)
for x in (1.25, 2.35):
    ins.box((x, FLOOR + 0.38, zd), (0.05, 0.76, 0.38), k.WOOD)
ins.box((1.55, FLOOR + 0.97, zd), (0.45, 0.36, 0.3), k.OLV)             # 攜帶式無線電
ins.lathe((1.48, FLOOR + 1.05, hull.hw_in - 0.425), (0, 0, -1), [(0, 0.05), (0.02, 0.05), (0.02, 0)], 12, k.WHT)
ins.cylinder((1.65, FLOOR + 1.0, hull.hw_in - 0.425), (1.65, FLOOR + 1.0, hull.hw_in - 0.445), 0.025, 8, k.BLK)
ins.box((2.05, FLOOR + 0.8, zd - 0.05), (0.16, 0.03, 0.1), k.BRS)       # 電鍵
ins.lathe((2.25, FLOOR + 0.8, zd), (0, 1, 0), [(0, 0.05), (0.04, 0.05), (0.04, 0)], 12, k.BLK)  # 耳機
ins.box((2.0, FLOOR + 0.79, zd + 0.02), (0.3, 0.005, 0.22), k.WHT)      # 電報紙
ins.cylinder((1.8, FLOOR + 0.02, 0.95), (1.8, FLOOR + 0.45, 0.95), 0.03, 8, k.ST)  # 操作員圓凳
ins.cylinder((1.8, FLOOR + 0.45, 0.95), (1.8, FLOOR + 0.5, 0.95), 0.17, 16, k.WOOD)

# 配電盤（右側牆）
ins.box((3.35, 2.05, hull.on_wall(R, 0.08)), (0.75, 1.0, 0.08), k.IST)
zp = hull.hw_in - 0.085
for j in range(3):
    ins.lathe((3.1 + j * 0.25, 2.35, zp), (0, 0, -1), [(0, 0.06), (0.02, 0.06), (0.025, 0)], 14, k.WHT)
for j in range(4):
    ins.box((3.08 + j * 0.18, 1.85, zp - 0.03), (0.03, 0.12, 0.05), k.BLK)
ins.box((3.35, 1.62, zp), (0.6, 0.04, 0.02), k.BRS)
ins.cylinder((3.35, 2.55, zp - 0.02), (3.35, hull.ceil, zp - 0.02), 0.03, 8, k.BLK)

# 修軌器材（左側地板與右側工具架）
for j in range(3):
    ins.box((-1.25, FLOOR + 0.06 + j * 0.12, hull.on_wall(L, 0.36) + (j % 2) * 0.05), (2.0, 0.11, 0.08), k.ST)  # 短鋼軌
for j in range(2):
    ins.box((-1.25, FLOOR + 0.42 + j * 0.13, hull.on_wall(L, 0.3)), (2.0, 0.12, 0.22), k.WOOD)  # 枕木
ins.box((-1.25, FLOOR + 0.72, hull.on_wall(L, 0.3)), (2.0, 0.03, 0.06), k.CNV)  # 綁帶
ins.box((-1.1, 1.95, hull.on_wall(R, 0.03)), (1.1, 0.9, 0.03), k.WOOD)
for j in range(3):
    x = -1.5 + j * 0.3
    ins.cylinder((x, 1.55, hull.hw_in - 0.07), (x, 2.35, hull.hw_in - 0.07), 0.018, 8, k.WOOD)   # 柄
    ins.box((x, 2.4, hull.hw_in - 0.07), (0.16, 0.08, 0.07), k.ST)                                 # 大鎚／十字鎬頭
ins.cylinder((-0.65, 1.55, hull.hw_in - 0.08), (-0.65, 2.4, hull.hw_in - 0.08), 0.02, 8, k.ST)  # 撬棍
ins.box((-0.95, FLOOR + 0.18, hull.on_wall(R, 0.34)), (0.7, 0.36, 0.34), k.OLV)                  # 工具箱
ins.box((-0.95, FLOOR + 0.37, hull.on_wall(R, 0.34)), (0.72, 0.03, 0.36), k.ST)

hull.helmets(-2.1, L)
hull.first_aid(-0.7, L)
hull.extinguisher(3.95, R)
hull.elec_box(2.85, L)
for side in (L, R):
    hull.locker(6.65, side)
hull.wall_structure(skip=[(-2.3, -0.2), (1.2, 2.7), (2.9, 3.8), (4.4, 7.0)])
hull.voice_tube(drops=(1.2,))
hull.inner_slits((0.6,))

# ───────────────────────────── 外部 ─────────────────────────────
hull.side_details(doors=(0.0,), slits=(0.6, 4.0), ports=(5.2,))
hull.vents((1.5,))
hull.lifting_rings()
d = hull.det
# 一排小窗（附裝甲窗蓋）
windows(k, hull, window_row(hull, keep_clear=[(-0.75, 0.95), (3.65, 4.35), (4.85, 5.55)], spacing=0.9), (2.45,))
# 艙口座（人字屋頂上的平台）
d.box((HATCH_X, roof_y(0.95) + 0.06, -0.45), (0.95, 0.3, 0.95), k.A)
# 排氣煙囪（發電機，右側屋簷）
ez = 0.75
d.cylinder((6.3, roof_y(ez) - 0.05, ez), (6.3, ROOF + 0.75, ez), 0.08, 12, k.ST)
d.lathe((6.3, ROOF + 0.75, ez), (0, 1, 0), [(0, 0.15), (0.06, 0.15), (0.1, 0)], 12, k.ST)
d.lathe((6.3, roof_y(ez) - 0.02, ez), (0, 1, 0), [(0, 0.16), (0.08, 0.1), (0.08, 0)], 12, k.A)
d.cylinder((6.3, ROOF + 0.4, ez), (6.3 - 0.12, ROOF + 0.4, ez + 0.05), 0.015, 6, k.ST)
# 天線：屋頂兩側的絕緣子短柱，兩道天線沿屋頂架設，前端引入線
POST_XS = [X0 - 3.8 + j * 1.4 for j in range(7)]
for zp in (-0.95, 0.95):
    for x in POST_XS:
        y0 = roof_y(zp)
        d.cylinder((x, y0 - 0.03, zp), (x, y0 + 0.32, zp), 0.022, 8, k.ST)
        d.lathe((x, y0 + 0.32, zp), (0, 1, 0), [(0, 0.035), (0.03, 0.055), (0.06, 0.035), (0.09, 0.055), (0.12, 0.035), (0.14, 0)], 10, k.WHT)  # 礙子
    d.cylinder((POST_XS[0], roof_y(zp) + 0.43, zp), (POST_XS[-1], roof_y(zp) + 0.43, zp), 0.007, 4, k.CU)
LEAD_X = 2.15   # 引入線：接到車內左側的長距離無線電
d.cylinder((LEAD_X, roof_y(0.95) + 0.43, -0.95), (LEAD_X, roof_y(1.3) + 0.12, -1.3), 0.007, 4, k.CU)
d.lathe((LEAD_X, roof_y(1.3) - 0.02, -1.3), (0, 1, 0), [(0, 0.05), (0.1, 0.04), (0.14, 0)], 10, k.WHT)   # 引入礙子
# 30 cm 探照燈（車體後端屋脊上，照向後方）
SLX = PIT_X1 + 0.45
d.lathe((SLX, roof_y(0.3) - 0.03, 0), (0, 1, 0), [(0, 0.3), (0.08, 0.28), (0.1, 0.12), (0.4, 0.1), (0.42, 0)], 14, k.A)
for dz in (-0.24, 0.24):
    d.box((SLX, ROOF + 0.55, dz), (0.12, 0.35, 0.04), k.ST)                     # 叉架
d.lathe((SLX + 0.2, ROOF + 0.62, 0), (-1, 0, 0), [(0, 0.2), (0.05, 0.22), (0.45, 0.22), (0.5, 0.2)], 20, k.ST, cap0=True, cap1=False)
d.lathe((SLX - 0.29, ROOF + 0.62, 0), (-1, 0, 0), [(0, 0.17), (0.01, 0)], 20, k.LMP)                          # 燈面
for j in range(4):
    d.box((SLX - 0.31, ROOF + 0.5 + j * 0.08, 0), (0.02, 0.012, 0.36), k.ST)                                   # 百葉
d.cylinder((SLX + 0.2, ROOF + 0.62, -0.24), (SLX + 0.2, ROOF + 0.62, 0.24), 0.03, 8, k.ST)
d.lathe((SLX + 0.2, ROOF + 0.86, 0), (0, 1, 0), [(0, 0.06), (0.06, 0.06), (0.08, 0)], 10, k.ST)              # 散熱帽
d.cylinder((SLX + 0.3, ROOF + 0.55, 0.15), (SLX + 0.42, ROOF + 0.45, 0.25), 0.015, 6, k.WOOD)                 # 操作把手
hull.rivets(skip=[(-0.7, 0.7)])
hull.finish()

# ───────────────────────────── 迫砲座（敞頂） ─────────────────────────────
pit = MeshBuilder()
pl = PIT_X1 - PIT_X0
pc = (PIT_X0 + PIT_X1) / 2
pit.box((pc, FLOOR - 0.05, 0), (pl, 0.1, W - 0.16), k.WOOD)
pit.box((pc, Y0 + 0.08, 0), (pl, 0.16, W), k.A)
wall_h = PIT_TOP - Y0
for side in (L, R):
    # 外層裝甲、內層車內漆
    pit.box((pc, Y0 + wall_h / 2, side * (W / 2 - 0.025)), (pl, wall_h, 0.05), k.A)
    pit.box((pc, Y0 + wall_h / 2, side * (W / 2 - 0.065)), (pl, wall_h, 0.03), k.IN)
    pit.box((pc, PIT_TOP + 0.015, side * (W / 2 - 0.04)), (pl, 0.03, 0.1), k.ST)
    # 機槍座處加高的護板
    pit.box((MG_X, PIT_TOP + 0.17, side * (W / 2 - 0.04)), (1.3, 0.34, 0.08), k.A)
pit.box((PIT_X0 + 0.025, Y0 + wall_h / 2, 0), (0.05, wall_h, W), k.A)
pit.box((PIT_X0 + 0.065, Y0 + wall_h / 2, 0), (0.03, wall_h, W - 0.16), k.IN)
pit.box((PIT_X0 + 0.04, PIT_TOP + 0.015, 0), (0.1, 0.03, W), k.ST)
# 迫砲彈箱（開蓋，可見帶尾翅的 81mm 彈）
for x, z in ((-5.9, -1.0), (-5.9, 1.0), (-3.3, -1.0)):
    pit.box((x, FLOOR + 0.15, z), (0.55, 0.3, 0.38), k.WOOD)
    pit.box((x - 0.29, FLOOR + 0.42, z), (0.03, 0.3, 0.38), k.WOOD)  # 掀起的箱蓋
    for j in range(3):
        for i in range(2):
            px, pz = x - 0.15 + j * 0.15, z - 0.08 + i * 0.16
            pit.lathe((px, FLOOR + 0.3, pz), (0, 1, 0), [(0, 0.04), (0.12, 0.04), (0.18, 0.02), (0.2, 0)], 10, k.OLV)
# 備用槍管與工具
pit.box((-3.3, FLOOR + 0.12, 1.05), (0.8, 0.24, 0.3), k.OLV)
pit.cylinder((-2.9, FLOOR + 0.6, 1.33), (-2.9, FLOOR + 1.1, 1.33), 0.03, 8, k.ST)
pit.build('PitStructure', k.MATS, parent=kit.root, bevel=0.01)

pr = MeshBuilder()
for side in (L, R):
    zs = side * W / 2
    for j in range(int(pl / 0.12)):
        x = PIT_X0 + 0.1 + j * 0.12
        for y in (Y0 + 0.06, 2.0, PIT_TOP - 0.06):
            pr.rivet((x, y, zs), (0, 0, side))
    for x in (-6.0, -5.0, -4.0, -3.0):
        for j in range(12):
            pr.rivet((x, Y0 + 0.1 + j * 0.11, zs), (0, 0, side))
for j in range(21):
    z = -1.4 + 0.14 * j
    for y in (Y0 + 0.08, 2.0, PIT_TOP - 0.06):
        pr.rivet((PIT_X0, y, z), (-1, 0, 0))
pr.build('PitRivets', [k.M['armor']], parent=kit.root)

# ── 九七式曲射歩兵砲 ──
mo = MeshBuilder()
mo.box((0, 0.025, 0), (0.6, 0.05, 0.6), k.ST)                    # 底鈑
mo.box((0, 0.06, 0), (0.25, 0.04, 0.25), k.ST)
el = math.radians(60)
d = (-math.cos(el), math.sin(el), 0)                               # 砲口朝後
tl = 1.27
p0 = (0, 0.06, 0)
p1 = (p0[0] + d[0] * tl, p0[1] + d[1] * tl, 0)
mo.lathe(p0, d, [(0, 0.07), (0.08, 0.055), (tl, 0.05), (tl, 0.042), (tl - 0.05, 0.042)], 18, k.GUN, cap1=False)
mo.lathe(p0, d, [(tl - 0.05, 0.042), (tl - 0.05, 0)], 12, k.BLK)
mo.lathe(p0, d, [(tl - 0.06, 0.058), (tl, 0.058), (tl, 0.05), (tl - 0.06, 0.05)], 18, k.GUN, closed=True)  # 砲口環
s = 0.72
pa = (d[0] * s, 0.06 + d[1] * s, 0)                                 # 雙腳架連接處
mo.lathe(pa, d, [(-0.05, 0.075), (0.05, 0.075), (0.05, 0.05), (-0.05, 0.05)], 16, k.ST, closed=True)
for sz in (-1, 1):
    foot = (pa[0] - 0.35, 0.02, sz * 0.36)
    mo.cylinder(pa, foot, 0.02, 8, k.ST)
    mo.box((foot[0], 0.015, foot[2]), (0.1, 0.03, 0.08), k.ST)
mo.cylinder((pa[0] - 0.28, 0.12, -0.29), (pa[0] - 0.28, 0.12, 0.29), 0.012, 6, k.ST)  # 腳架橫桿
mo.cylinder((pa[0], pa[1] - 0.05, 0), (pa[0] - 0.12, 0.3, 0), 0.025, 8, k.ST)        # 高低螺桿
mo.cylinder((pa[0] - 0.12, 0.3, -0.06), (pa[0] - 0.12, 0.3, 0.06), 0.06, 12, k.ST)   # 手輪
mo.box((pa[0] + 0.02, pa[1] + 0.06, -0.14), (0.12, 0.1, 0.08), k.OLV)               # 瞄準具
mo.cylinder((pa[0] + 0.02, pa[1] + 0.12, -0.14), (pa[0] + 0.02, pa[1] + 0.2, -0.14), 0.02, 8, k.BLK)
mo.build('Mortar', k.MATS, parent=kit.root, loc=(MORTAR_X, FLOOR, 0), bevel=0.004)

kit.running_gear(LEN)

# ── 後角機槍（安裝在迫砲座護牆上） ──
hull_ring = MeshBuilder()
for side in (L, R):
    zs = side * W / 2
    hull_ring.lathe((MG_X, MG_Y, zs), (0, 0, side), [(-0.02, 0.56), (0.05, 0.56), (0.05, 0.47), (-0.02, 0.47)], 24, k.A, closed=True)
hull_ring.build('PitMgRings', k.MATS, parent=kit.root, bevel=0.01)
kit.mg('RL', (MG_X, MG_Y, -W / 2), 135, 70, f'{CN} 左後機槍')
kit.mg('RR', (MG_X, MG_Y, W / 2), -135, 70, f'{CN} 右後機槍')


def interior_renders():
    for x in (-1.5, 2.0, 5.5):
        light = bpy.data.lights.new('IL', 'POINT')
        light.energy = 180
        ob = bpy.data.objects.new('IL', light)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = V(x, 3.0, 0)
    render_preview(os.path.join(SCRATCH, f'{NAME}_in_front.png'), target=(6.5, 2.0, 0.0), cam_pos=(-2.2, 2.9, 0.2), lens=16)
    render_preview(os.path.join(SCRATCH, f'{NAME}_in_rear.png'), target=(-2.0, 2.0, 0.0), cam_pos=(6.6, 2.9, -0.2), lens=16)
    render_preview(os.path.join(SCRATCH, f'{NAME}_pit.png'), target=(-4.8, 1.6, 0), cam_pos=(-1.5, 5.8, 3.5), lens=24)


if 'interior' in script_args():
    interior_renders()
else:
    kit.export(NAME, cam_target=(-1.0, 2.4, 0), cam_pos=(-14, 7.0, -12))
