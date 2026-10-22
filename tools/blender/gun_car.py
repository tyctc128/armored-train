"""火砲車（甲／乙）建模腳本。

執行：
  blender -b --factory-startup -P tools/blender/gun_car.py -- A
  （參數 A＝火砲車甲，B＝火砲車乙，含砲塔座）

輸出：
  public/models/gun_car_<a|b>.glb   遊戲載入用
  assets/blender/gun_car_<a|b>.blend 可在 Blender 開啟修改
  docs/preview/gun_car_<a|b>.png     預覽圖

節點命名（遊戲以名稱抓取，修改模型時請保留）：
  Turret → Elev → Recoil → Muzzle；Turret → Sight
  MG_L_Base → MG_L_Yaw → MG_L_Pitch → MG_L_Muzzle / MG_L_Sight（右側為 MG_R_*）
  Wheelset_*（自訂屬性 radius）
尺寸必須與 src/train/carModels.js 的 buildGunCar 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    PROJECT, MeshBuilder, empty, reset_scene, script_args, camo_texture, paint_texture,
    wood_texture, material, export_glb, save_blend, render_preview,
)

VARIANT = (script_args() or ['A'])[0].upper()
HIGH = VARIANT == 'B'
NAME = f'gun_car_{VARIANT.lower()}'

# 與遊戲一致的尺寸（遊戲座標，公尺）
LEN, W, H, C = 16.0, 3.1, 2.3, 0.55
Y0, WALL, FLOOR, DOOR = 1.1, 0.08, 1.3, 0.45
ROOF = Y0 + H
TX = 3.6
TURRET_Y = ROOF + (0.8 if HIGH else 0.0)
RING_R, BODY_H = 1.55, 1.15
PIVOT = (RING_R * 0.3, 0.22 + BODY_H * 0.55, 0.0)
BARREL_LEN = 4.4
MG_X, MG_Y = -4.6, 2.3
HATCH_X = -1.6
HATCH_Z = -0.5  # 艙口偏左，讓走道保持暢通

reset_scene()
TEX = os.path.join(PROJECT, 'assets', 'textures')
camo = camo_texture(TEX)
M_ARMOR = material('Armor', image=camo, rough=0.78, metal=0.25)
M_INNER = material('InteriorPaint', image=paint_texture(TEX, '#a9ab95', 'interior_paint'), rough=0.85)
M_WOOD = material('Wood', image=wood_texture(TEX), rough=0.9)
M_STEEL = material('DarkSteel', '#2f2e2a', rough=0.5, metal=0.8)
M_GUN = material('GunMetal', '#3b3d33', rough=0.45, metal=0.7)
M_BLACK = material('Slit', '#0a0a09', rough=0.9)
M_BRASS = material('Brass', '#b08d4a', rough=0.35, metal=0.9)
M_LAMP = material('Lamp', '#fff1c8', rough=0.4, emission='#ffd890')
M_WHEEL = material('Wheel', '#2a2725', rough=0.55, metal=0.75)
M_ISTEEL = material('InteriorSteel', '#7a7b6c', rough=0.6, metal=0.3)
M_RED = material('Red', '#8e2a22', rough=0.5)
M_WHITE = material('Paper', '#d9d4c3', rough=0.9)
M_OLIVE = material('Olive', '#5f5f3c', rough=0.75)
M_CANVAS = material('Canvas', '#7a6a48', rough=1.0)
HULL_MATS = [M_ARMOR, M_INNER, M_WOOD, M_STEEL, M_BLACK, M_BRASS, M_LAMP, M_ISTEEL, M_RED, M_WHITE, M_OLIVE, M_CANVAS]
A, IN, WOOD, ST, BLK, BRS, LMP, IST, RED, WHT, OLV, CNV = range(12)

root = empty('GunCarB' if HIGH else 'GunCarA')


def profile(inset=0.0):
    hw = W / 2 - inset
    top = H - inset
    ch = C - inset * 0.4
    return [(-hw, inset), (hw, inset), (hw, top - ch), (hw - ch, top), (-hw + ch, top), (-hw, top - ch)]


# ───────────────────────────── 車體外殼（空心、單面） ─────────────────────────────
shell = MeshBuilder()
bm = shell.bm
outer = profile()
inner = profile(WALL)
from common import V  # noqa: E402


def ring(prof, x):
    return [bm.verts.new(V(x, Y0 + y, z)) for z, y in prof]


o0, o1 = ring(outer, -LEN / 2), ring(outer, LEN / 2)
i0, i1 = ring(inner, -LEN / 2), ring(inner, LEN / 2)
n = len(outer)
for k in range(n):
    j = (k + 1) % n
    bm.faces.new([o0[k], o0[j], o1[j], o1[k]]).material_index = A
    bm.faces.new([i0[k], i1[k], i1[j], i0[j]]).material_index = IN
    bm.faces.new([o1[k], o1[j], i1[j], i1[k]]).material_index = A
    bm.faces.new([o0[k], i0[k], i0[j], o0[j]]).material_index = A
shell.build('HullShell', HULL_MATS, parent=root, bevel=0.03)

# ───────────────────────────── 車內：隔板、地板、內裝 ─────────────────────────────
inside = MeshBuilder()
hw_in = W / 2 - WALL
top_in = H - WALL
ch_in = C - WALL * 0.4
door_top = FLOOR - Y0 + 1.95
for sx in (1, -1):
    x = sx * (LEN / 2 - 0.03)
    # 外側為裝甲（迷彩）、內側為車內漆
    for mi, a0, a1 in ((A, x + sx * 0.005, x + sx * 0.03), (IN, x - sx * 0.02, x + sx * 0.005)):
        x0, x1 = min(a0, a1), max(a0, a1)
        for side in (-1, 1):
            poly = [(side * hw_in, WALL), (side * DOOR, WALL), (side * DOOR, top_in), (side * (hw_in - ch_in), top_in), (side * hw_in, top_in - ch_in)]
            inside.prism([(z, Y0 + y) for z, y in poly], x0, x1, mi)
        inside.prism([(-DOOR, Y0 + door_top), (DOOR, Y0 + door_top), (DOOR, Y0 + top_in), (-DOOR, Y0 + top_in)], x0, x1, mi)
    # 門框
    inside.box((x, Y0 + door_top + 0.03, 0), (0.09, 0.06, DOOR * 2 + 0.1), IST)
    for side in (-1, 1):
        inside.box((x, FLOOR + 0.97, side * (DOOR + 0.03)), (0.09, 1.95, 0.06), IST)

inside.box((0, FLOOR - 0.05, 0), (LEN + 0.9, 0.1, W - 2 * WALL - 0.02), WOOD)

# 砲塔座圈（從車頂垂下的環）
inside.lathe((TX, ROOF - WALL - 0.14, 0), (0, 1, 0), [(0, 0.92), (0.14, 0.92), (0.14, 0.84), (0, 0.84)], 32, IST, closed=True)
# 天花板吊燈
for x in (-5.5, -1.0, 6.0):
    inside.cylinder((x, ROOF - WALL, 0), (x, ROOF - WALL - 0.12, 0), 0.12, 12, IST)
    inside.cylinder((x, ROOF - WALL - 0.12, 0), (x, ROOF - WALL - 0.2, 0), 0.09, 12, LMP)
# 艙口梯
for z in (HATCH_Z - 0.22, HATCH_Z + 0.22):
    inside.box((HATCH_X - 0.35, (FLOOR + ROOF) / 2, z), (0.05, ROOF - FLOOR, 0.05), IST)
for y in [FLOOR + 0.3 * k for k in range(1, 7)]:
    inside.cylinder((HATCH_X - 0.35, y, HATCH_Z - 0.22), (HATCH_X - 0.35, y, HATCH_Z + 0.22), 0.02, 6, IST)
# 彈藥架（車廂前段兩側，十糎彈）
for side in (-1, 1):
    z = side * 1.22
    # 開放式彈架：背板、立柱、層板
    inside.box((6.4, FLOOR + 0.9, side * 1.43), (2.4, 1.8, 0.04), IST)
    for x in (5.2, 7.6):
        inside.box((x, FLOOR + 0.9, z), (0.05, 1.8, 0.42), IST)
    for row in range(3):
        inside.box((6.4, FLOOR + 0.27 + row * 0.55, z), (2.4, 0.04, 0.42), IST)
    for row in range(3):
        y = FLOOR + 0.3 + row * 0.55
        for k in range(7):
            x = 5.35 + k * 0.33
            inside.lathe((x, y, z), (0, 1, 0), [(0, 0.06), (0.42, 0.06)], 10, BRS)
            inside.lathe((x, y + 0.42, z), (0, 1, 0), [(0, 0.055), (0.12, 0.03), (0.15, 0)], 10, IST, cap0=False)
# 車內電話箱
inside.box((1.6, FLOOR + 1.4, -(hw_in - 0.08)), (0.3, 0.4, 0.14), IST)
inside.cylinder((1.6, FLOOR + 1.5, -(hw_in - 0.16)), (1.6, FLOOR + 1.5, -(hw_in - 0.2)), 0.05, 10, BLK)
# 折疊座椅
for x in (-3.5, -6.2):
    for side in (-1, 1):
        inside.box((x, FLOOR + 0.45, side * (hw_in - 0.25)), (0.5, 0.06, 0.4), WOOD)
        inside.box((x, FLOOR + 0.22, side * (hw_in - 0.25)), (0.05, 0.44, 0.05), IST)

# ── 牆面結構：肋骨、縱樑、管線 ──
WALL_TOP = Y0 + top_in - ch_in  # 側牆垂直段上緣
CEIL = Y0 + top_in
ROOF_HALF_IN = hw_in - ch_in


def on_wall(side, depth):
    return side * (hw_in - depth / 2)


for side in (-1, 1):
    for x in range(-7, 8):
        if abs(x) < 0.8 or 5.0 < x < 7.8:
            continue
        inside.box((x, (FLOOR + WALL_TOP) / 2, on_wall(side, 0.05)), (0.06, WALL_TOP - FLOOR, 0.05), IST)
    inside.box((0, WALL_TOP - 0.03, on_wall(side, 0.06)), (LEN - 0.2, 0.06, 0.06), IST)
    # 電線導管與托架
    zc = side * (hw_in - 0.07)
    inside.cylinder((-LEN / 2 + 0.1, 2.62, zc), (LEN / 2 - 0.1, 2.62, zc), 0.018, 8, ST)
    zh = side * (hw_in - 0.09)
    inside.cylinder((-LEN / 2 + 0.1, 1.48, zh), (LEN / 2 - 0.1, 1.48, zh), 0.035, 10, ST)
    for x in [k * 1.5 for k in range(-5, 6)]:
        inside.box((x, 2.62, on_wall(side, 0.09)), (0.04, 0.05, 0.09), IST)
        inside.box((x, 1.48, on_wall(side, 0.12)), (0.05, 0.06, 0.12), IST)
for x in range(-7, 8):
    if abs(x - TX) < 1.1:
        continue
    inside.box((x, CEIL - 0.03, 0), (0.06, 0.06, ROOF_HALF_IN * 2), IST)
# 傳聲管（黃銅）沿天花板，在砲塔下與電話旁垂下
inside.cylinder((-LEN / 2 + 0.1, CEIL - 0.09, 0.6), (LEN / 2 - 0.1, CEIL - 0.09, 0.6), 0.022, 10, BRS)
for x in (TX - 1.2, 1.2):
    inside.cylinder((x, CEIL - 0.09, 0.6), (x, 2.55, 0.6), 0.022, 10, BRS)
    inside.lathe((x, 2.55, 0.6), (0, -1, 0), [(0, 0.022), (0.08, 0.05), (0.1, 0.05), (0.1, 0)], 12, BRS)
inside.cylinder((-LEN / 2 + 0.1, CEIL - 0.08, -0.6), (LEN / 2 - 0.1, CEIL - 0.08, -0.6), 0.02, 8, BLK)

# ── 觀察孔與射擊孔（車內側） ──
for side in (-1, 1):
    for x in (-6.6, -2.4, 2.0):
        inside.box((x, 2.45, on_wall(side, 0.08)), (0.62, 0.2, 0.08), IST)
        inside.box((x, 2.45, on_wall(side, 0.1)), (0.45, 0.07, 0.1), BLK)
    for x in (-3.0, 3.0):
        inside.cylinder((x, 2.1, side * hw_in), (x, 2.1, side * (hw_in - 0.04)), 0.11, 14, IST)
        inside.box((x, 2.1, on_wall(side, 0.1)), (0.04, 0.12, 0.04), ST)

# ── 機槍位：保彈板彈藥箱、空彈殼袋 ──
for side in (-1, 1):
    for k in range(3):
        inside.box((-5.35, FLOOR + 0.09 + k * 0.18, on_wall(side, 0.32)), (0.34, 0.17, 0.3), OLV)
        inside.box((-5.35, FLOOR + 0.18 + k * 0.18, on_wall(side, 0.32)), (0.06, 0.02, 0.04), ST)
    inside.box((-3.95, FLOOR + 0.09, on_wall(side, 0.32)), (0.34, 0.17, 0.3), OLV)
    inside.box((MG_X, 1.95, on_wall(side, 0.5)), (0.22, 0.3, 0.16), CNV)

# ── 步槍架（右側牆）──
inside.box((-2.55, 2.0, on_wall(1, 0.03)), (1.0, 1.3, 0.03), WOOD)
for k in range(4):
    x = -2.88 + k * 0.22
    z = hw_in - 0.1
    inside.box((x, FLOOR + 0.3, z), (0.05, 0.5, 0.11), WOOD)
    inside.cylinder((x, FLOOR + 0.55, z), (x, FLOOR + 1.3, z), 0.013, 8, ST)
    inside.box((x, FLOOR + 0.62, z + 0.02), (0.03, 0.18, 0.05), WOOD)
inside.box((-2.55, FLOOR + 1.12, on_wall(1, 0.16)), (1.0, 0.03, 0.16), WOOD)

# ── 置物櫃（車尾兩側）──
for side in (-1, 1):
    inside.box((-7.3, FLOOR + 0.9, on_wall(side, 0.36)), (0.6, 1.8, 0.36), IST)
    inside.box((-7.3, FLOOR + 0.9, side * (hw_in - 0.365)), (0.01, 1.7, 0.01), BLK)
    for y in (2.6, 2.75):
        inside.box((-7.3, y, side * (hw_in - 0.365)), (0.4, 0.02, 0.01), BLK)
    inside.box((-7.08, FLOOR + 1.0, side * (hw_in - 0.37)), (0.03, 0.12, 0.03), ST)

# ── 滅火器、急救箱、配電箱、作戰圖板 ──
inside.lathe((0.85, FLOOR + 0.35, hw_in - 0.1), (0, 1, 0), [(0, 0.075), (0.48, 0.075), (0.53, 0.04), (0.6, 0.02), (0.6, 0)], 14, RED)
inside.box((0.85, FLOOR + 0.6, on_wall(1, 0.03)), (0.05, 0.4, 0.03), ST)
inside.box((-0.95, 2.15, on_wall(-1, 0.13)), (0.36, 0.28, 0.13), WHT)
inside.box((-0.95, 2.15, -(hw_in - 0.135)), (0.06, 0.18, 0.01), RED)
inside.box((-0.95, 2.15, -(hw_in - 0.135)), (0.18, 0.06, 0.01), RED)
inside.box((0.85, 2.3, on_wall(-1, 0.12)), (0.3, 0.36, 0.12), IST)
inside.box((0.85, 2.3, -(hw_in - 0.125)), (0.05, 0.08, 0.02), BLK)
inside.box((2.45, 2.2, on_wall(-1, 0.025)), (0.7, 0.5, 0.025), WOOD)
inside.box((2.45, 2.2, -(hw_in - 0.03)), (0.6, 0.42, 0.01), WHT)

# ── 鋼盔與水壺掛鉤（右側牆）──
for k in range(3):
    x = 3.9 + k * 0.32
    inside.cylinder((x, 2.42, hw_in), (x, 2.42, hw_in - 0.08), 0.012, 6, ST)
    inside.lathe((x, 2.2, hw_in - 0.17), (0, 1, 0), [(0, 0.16), (0.02, 0.15)] + [(0.02 + 0.13 * math.sin(math.radians(a)), 0.15 * math.cos(math.radians(a))) for a in range(20, 91, 20)], 14, OLV, cap0=True)
    inside.lathe((x, 1.95, hw_in - 0.09), (0, 0, -1), [(0, 0.07), (0.06, 0.07), (0.07, 0.03), (0.08, 0)], 12, CNV)

# ── 地板上的砲彈箱 ──
for side in (-1, 1):
    for k in range(2):
        inside.box((4.55, FLOOR + 0.18 + k * 0.36, on_wall(side, 0.4)), (0.55, 0.34, 0.38), WOOD)
        inside.box((4.55, FLOOR + 0.18 + k * 0.36, on_wall(side, 0.4)), (0.57, 0.04, 0.4), ST)

# ── 砲塔下方：登塔梯與彈藥揚彈筒 ──
for dz in (-0.75, -0.4):
    inside.box((TX - 0.55, (FLOOR + CEIL) / 2, dz), (0.05, CEIL - FLOOR, 0.05), IST)
for y in [FLOOR + 0.32 * k for k in range(1, 7)]:
    inside.cylinder((TX - 0.55, y, -0.75), (TX - 0.55, y, -0.4), 0.018, 6, IST)
inside.cylinder((TX + 0.65, FLOOR + 0.25, 0.6), (TX + 0.35, CEIL - 0.05, 0.5), 0.12, 14, IST)
inside.box((TX + 0.65, FLOOR + 0.12, 0.6), (0.4, 0.24, 0.4), IST)
inside.build('Interior', HULL_MATS, parent=root, bevel=0.008)

# ───────────────────────────── 底架、連結器、制動 ─────────────────────────────
frame = MeshBuilder()
frame.box((0, 0.95, 1.2), (LEN - 0.6, 0.3, 0.12), ST)
frame.box((0, 0.95, -1.2), (LEN - 0.6, 0.3, 0.12), ST)
frame.box((0, 0.9, 0), (LEN - 0.6, 0.25, 0.4), ST)
for x in (-6, -3, 0, 3, 6):
    frame.box((x, 0.95, 0), (0.15, 0.22, 2.3), ST)
for sx in (1, -1):
    frame.box((sx * (LEN / 2 - 0.12), 0.95, 0), (0.25, 0.42, 2.9), A)
    # 自動連結器（滿鐵為美式自動連結器）
    frame.box((sx * (LEN / 2 + 0.2), 0.9, 0), (0.55, 0.16, 0.2), ST)
    frame.box((sx * (LEN / 2 + 0.5), 0.9, 0), (0.22, 0.32, 0.34), ST)
    frame.box((sx * (LEN / 2 + 0.6), 0.9, 0.08), (0.12, 0.26, 0.12), ST)
    frame.cylinder((sx * (LEN / 2 + 0.05), 1.08, -1.1), (sx * (LEN / 2 + 0.05), 1.08, 0.4), 0.02, 6, ST)
    # 制動軟管
    frame.cylinder((sx * (LEN / 2 + 0.05), 0.85, 0.55), (sx * (LEN / 2 + 0.3), 0.6, 0.55), 0.035, 8, BLK)
frame.cylinder((1.0, 0.72, 0.45), (1.8, 0.72, 0.45), 0.2, 16, ST)
frame.cylinder((-2.4, 0.72, -0.45), (-0.8, 0.72, -0.45), 0.24, 16, ST)
frame.build('Underframe', HULL_MATS, parent=root, bevel=0.01)

# ───────────────────────────── 轉向架與輪對 ─────────────────────────────
bogies = MeshBuilder()
for bx in (LEN * 0.3, -LEN * 0.3):
    bogies.box((bx, 0.72, 0), (0.35, 0.26, 2.2), ST)
    for z in (-0.9, 0.9):
        bogies.box((bx, 0.85, z), (2.7, 0.1, 0.12), ST)
        bogies.box((bx, 0.42, z), (1.3, 0.1, 0.12), ST)
        for d in (-1, 1):
            bogies.box((bx + d * 0.9, 0.5, z), (0.3, 0.34, 0.2), ST)
            bogies.box((bx + d * 0.55, 0.63, z), (0.62, 0.08, 0.12), ST)
        for k in range(4):
            bogies.box((bx, 0.5 + k * 0.045, z), (0.9 - k * 0.16, 0.035, 0.14), ST)
        for d in (-1, 1):
            bogies.box((bx + d * 0.48, 0.43, z * 0.86), (0.08, 0.22, 0.1), BLK)
bogies.build('Bogies', HULL_MATS, parent=root, bevel=0.01)

WR = 0.43
for i, bx in enumerate((LEN * 0.3, -LEN * 0.3)):
    for k, ax in enumerate((-0.9, 0.9)):
        ws = MeshBuilder()
        ws.cylinder((0, 0, -0.98), (0, 0, 0.98), 0.075, 12, 0)
        for s in (-1, 1):
            zc = s * 0.7175
            prof = [(-0.07, 0.12), (-0.07, 0.36), (-0.04, 0.4), (-0.04, WR), (0.06, WR - 0.01), (0.06, 0.36), (0.03, 0.34), (0.03, 0.12)]
            if s < 0:
                prof = [(-d, r) for d, r in prof]
            ws.lathe((0, 0, zc), (0, 0, 1), prof, 28, 0, closed=True)
            flange = [(-0.075, WR - 0.01), (-0.075, WR + 0.03), (-0.055, WR + 0.03), (-0.045, WR - 0.01)]
            if s < 0:
                flange = [(-d, r) for d, r in flange]
            ws.lathe((0, 0, zc - s * 0.0), (0, 0, s * 1 if s > 0 else 1), flange, 28, 0, closed=True)
            ws.cylinder((0, 0, zc - 0.1), (0, 0, zc + 0.1), 0.13, 12, 0)
        ws.build(f'Wheelset_{i}{k}', [M_WHEEL], parent=root, loc=(bx + ax, WR, 0), bevel=0.0, extras={'radius': WR})

# ───────────────────────────── 車體外部細節 ─────────────────────────────
det = MeshBuilder()
for side in (-1, 1):
    zs = side * (W / 2)
    # 側門
    det.box((0.0, 2.05, zs + side * 0.015), (1.05, 1.45, 0.03), A)
    for y in (1.5, 2.05, 2.6):
        det.cylinder((-0.56, y - 0.1, zs + side * 0.035), (-0.56, y + 0.1, zs + side * 0.035), 0.03, 8, ST)
    det.box((0.38, 2.05, zs + side * 0.05), (0.04, 0.3, 0.04), ST)
    # 踏階
    for x in (-0.3, 0.3):
        det.box((x, 0.95, zs - side * 0.05), (0.04, 0.4, 0.04), ST)
    det.box((0, 0.76, zs - side * 0.02), (0.7, 0.04, 0.24), ST)
    # 觀察孔與防護罩
    for x in (-6.6, -2.4, 2.0, 6.4):
        det.box((x, 2.45, zs + side * 0.005), (0.45, 0.06, 0.02), BLK)
        det.box((x, 2.53, zs + side * 0.05), (0.62, 0.05, 0.1), A)
    # 射擊孔塞
    for x in (-3.0, 3.0, 5.0):
        det.lathe((x, 2.1, zs), (0, 0, side), [(0, 0.09), (0.03, 0.09), (0.04, 0.06), (0.045, 0)], 12, A, cap0=False)
    # 扶手
    for x in (-7.6, 7.6):
        det.cylinder((x, 1.4, zs + side * 0.08), (x, 2.6, zs + side * 0.08), 0.018, 6, ST)
        for y in (1.4, 2.6):
            det.cylinder((x, y, zs), (x, y, zs + side * 0.09), 0.015, 6, ST)
    # 機槍砲塔外環座
    det.lathe((MG_X, MG_Y, zs), (0, 0, side), [(-0.02, 0.56), (0.05, 0.56), (0.05, 0.47), (-0.02, 0.47)], 24, A, closed=True)

# 車頂：艙口、通風蘑菇頭、扶手
det.box((HATCH_X, ROOF + 0.04, HATCH_Z), (0.85, 0.08, 0.85), A)
det.box((HATCH_X, ROOF + 0.1, HATCH_Z), (0.72, 0.05, 0.72), A)
det.cylinder((HATCH_X - 0.37, ROOF + 0.12, HATCH_Z - 0.25), (HATCH_X - 0.37, ROOF + 0.12, HATCH_Z + 0.25), 0.04, 8, ST)
det.box((HATCH_X + 0.22, ROOF + 0.16, HATCH_Z), (0.05, 0.06, 0.3), ST)
for x in (-6.0, 6.8):
    det.cylinder((x, ROOF, 0), (x, ROOF + 0.18, 0), 0.1, 12, A)
    det.lathe((x, ROOF + 0.18, 0), (0, 1, 0), [(0, 0.24), (0.06, 0.22), (0.1, 0)], 14, A)
# 前後端板頂部吊環
for sx in (1, -1):
    for z in (-0.6, 0.6):
        det.lathe((sx * (LEN / 2 - 0.4), ROOF + 0.06, z), (1, 0, 0), [(0, 0.08), (0.03, 0.08), (0.03, 0.05), (0, 0.05)], 10, ST, closed=True)

if HIGH:
    # 砲塔座（甲車上方，讓乙車越頂射擊）
    det.lathe((TX, ROOF, 0), (0, 1, 0), [(0, 1.88), (0.7, 1.78), (0.8, 1.7), (0.8, 0)], 36, A, cap0=False)
det.build('HullDetails', HULL_MATS, parent=root, bevel=0.012)

# ───────────────────────────── 鉚釘 ─────────────────────────────
riv = MeshBuilder()
for side in (-1, 1):
    zs = side * (W / 2)
    nrm = (0, 0, side)
    for x in [k * 1.0 for k in range(-7, 8)]:
        if abs(x) < 0.7:
            continue
        for y in [1.17 + 0.11 * k for k in range(16)]:
            riv.rivet((x, y, zs), nrm)
    for y in (1.16, 2.0, 2.82):
        for k in range(int((LEN - 0.3) / 0.12)):
            x = -LEN / 2 + 0.15 + k * 0.12
            if abs(x) < 0.6 and y < 2.8:
                continue
            riv.rivet((x, y, zs), nrm)
for z in (-0.95, 0.95):
    for k in range(int((LEN - 0.3) / 0.14)):
        riv.rivet((-LEN / 2 + 0.15 + k * 0.14, ROOF, z), (0, 1, 0))
for sx in (1, -1):
    for z in [-1.4 + 0.14 * k for k in range(21)]:
        riv.rivet((sx * LEN / 2, Y0 + 0.08, z), (sx, 0, 0))
        riv.rivet((sx * LEN / 2, Y0 + 1.7, z), (sx, 0, 0))
riv.build('Rivets', [M_ARMOR], parent=root, smooth=True)

# ───────────────────────────── 十糎砲砲塔 ─────────────────────────────
turret = empty('Turret', root, (TX, TURRET_Y, 0))
tb = MeshBuilder()
tb.lathe((0, 0, 0), (0, 1, 0), [(0, RING_R + 0.18), (0.22, RING_R + 0.12), (0.22, 0)], 48, A, cap0=False)
tb.lathe((0, 0.22, 0), (0, 1, 0), [(0, RING_R), (0.55, RING_R - 0.05), (BODY_H - 0.12, RING_R - 0.22), (BODY_H, RING_R - 0.4), (BODY_H + 0.04, 0)], 48, A, cap0=False)
# 後部突出（無線電／彈藥箱）
tb.box((-1.25, 0.22 + 0.5, 0), (0.9, 0.75, 1.7), A)
# 車長艙口與潛望鏡
tb.lathe((-0.45, 0.22 + BODY_H, 0.45), (0, 1, 0), [(0, 0.36), (0.08, 0.34), (0.12, 0)], 20, A, cap0=False)
tb.box((PIVOT[0] + 0.2, 0.22 + BODY_H + 0.12, -0.55), (0.28, 0.3, 0.22), A)
tb.box((PIVOT[0] + 0.34, 0.22 + BODY_H + 0.17, -0.55), (0.02, 0.07, 0.16), BLK)
# 觀察孔
for ang in (40, 140, 220, 320):
    a = math.radians(ang)
    r = RING_R - 0.1
    tb.box((math.cos(a) * r, 0.22 + 0.75, -math.sin(a) * r), (0.08, 0.05, 0.3), BLK)
# 吊環
for ang in (60, 180, 300):
    a = math.radians(ang)
    r = RING_R - 0.42
    tb.lathe((math.cos(a) * r, 0.22 + BODY_H + 0.02, -math.sin(a) * r), (1, 0, 0), [(0, 0.07), (0.025, 0.07), (0.025, 0.045), (0, 0.045)], 10, ST, closed=True)
# 砲盾開口外框
tb.box((RING_R - 0.15, PIVOT[1], 0), (0.2, 0.95, 1.05), A)
tb.build('TurretBody', HULL_MATS, parent=turret, bevel=0.02)

tr = MeshBuilder()
for k in range(36):
    a = 2 * math.pi * k / 36
    tr.rivet((math.cos(a) * (RING_R + 0.01), 0.36, math.sin(a) * (RING_R + 0.01)), (math.cos(a), 0, math.sin(a)))
    tr.rivet((math.cos(a) * (RING_R - 0.07), 0.22 + BODY_H - 0.25, math.sin(a) * (RING_R - 0.07)), (math.cos(a), 0.3, math.sin(a)))
tr.build('TurretRivets', [M_ARMOR], parent=turret)

elev = empty('Elev', turret, PIVOT)
mant = MeshBuilder()
mant.lathe((RING_R - 0.25 - PIVOT[0], 0, -0.48), (0, 0, 1), [(0, 0.44), (0.96, 0.44)], 32, A)
mant.box((RING_R - 0.05 - PIVOT[0], 0, 0), (0.25, 0.32, 0.32), A)
mant.build('Mantlet', HULL_MATS, parent=elev, bevel=0.015)
recoil = empty('Recoil', elev)
bar = MeshBuilder()
bar.lathe((0, 0, 0), (1, 0, 0), [(0.6, 0.12), (1.5, 0.115), (1.6, 0.1), (2.2, 0.095), (4.75, 0.08), (4.8, 0.095), (5.0, 0.095), (5.0, 0.045), (4.9, 0.045)], 28, 0, cap0=True, cap1=False)
bar.lathe((0, 0, 0), (1, 0, 0), [(4.9, 0.045), (4.9, 0)], 16, 1)
for y in (0.19, -0.19):
    bar.cylinder((0.45, y, 0), (1.95, y, 0), 0.085, 18, 0)
    bar.cylinder((1.95, y, 0), (2.05, y, 0), 0.06, 12, 0)
bar.build('Barrel', [M_GUN, M_BLACK], parent=recoil, bevel=0.006)
empty('Muzzle', recoil, (0.6 + BARREL_LEN, 0, 0))
empty('Sight', turret, (PIVOT[0] + 0.25, PIVOT[1] + 0.22, -0.55))

# ───────────────────────────── 九二式重機槍（左、右） ─────────────────────────────
for tag, side, center in (('L', -1, math.pi / 2), ('R', 1, -math.pi / 2)):
    base = empty(f'MG_{tag}_Base', root, (MG_X, MG_Y, side * W / 2), yaw=center)
    hs = MeshBuilder()
    prof = [(0, 0.42)] + [(0.42 * math.sin(math.radians(a)), 0.42 * math.cos(math.radians(a))) for a in range(15, 91, 15)]
    hs.lathe((0, 0, 0), (1, 0, 0), prof, 24, 0, cap0=False)
    hs.build(f'MG_{tag}_Housing', [M_ARMOR], parent=base, bevel=0.0)
    yaw = empty(f'MG_{tag}_Yaw', base)
    pitch = empty(f'MG_{tag}_Pitch', yaw)
    gun = MeshBuilder()
    gun.lathe((0.32, 0, 0), (1, 0, 0), [(-0.2, 0)] + [(-0.2 * math.cos(math.radians(a)), 0.2 * math.sin(math.radians(a))) for a in range(20, 161, 20)] + [(0.2, 0)], 16, 0)
    fins = [(0.45, 0.05)]
    for k in range(13):
        x = 0.5 + k * 0.04
        fins += [(x, 0.05), (x, 0.075), (x + 0.018, 0.075), (x + 0.018, 0.05)]
    fins += [(1.05, 0.05), (1.05, 0)]
    gun.lathe((0, 0, 0), (1, 0, 0), fins, 12, 1, cap0=True)
    gun.cylinder((1.05, 0, 0), (1.38, 0, 0), 0.022, 10, 1)
    gun.lathe((0, 0, 0), (1, 0, 0), [(1.38, 0.022), (1.38, 0.03), (1.45, 0.034), (1.45, 0)], 10, 1)
    gun.box((0.62, 0.1, 0), (0.04, 0.06, 0.02), 1)
    # 車內側：機匣、握把、保彈板
    gun.box((-0.15, 0, 0), (0.5, 0.13, 0.11), 1)
    gun.box((-0.02, 0.075, 0), (0.18, 0.03, 0.08), 1)
    for dz in (-0.06, 0.06):
        gun.cylinder((-0.45, -0.07, dz), (-0.45, 0.05, dz), 0.016, 8, 1)
    gun.box((-0.43, -0.01, 0), (0.04, 0.03, 0.16), 1)
    gun.box((-0.05, 0.02, -0.15), (0.22, 0.025, 0.1), 2)
    gun.build(f'MG_{tag}_Gun', [M_ARMOR, M_GUN, M_BRASS], parent=pitch, bevel=0.0)
    empty(f'MG_{tag}_Muzzle', pitch, (1.45, 0, 0))
    empty(f'MG_{tag}_Sight', pitch, (0.05, 0.31, 0))

# ───────────────────────────── 輸出 ─────────────────────────────
glb = os.path.join(PROJECT, 'public', 'models', f'{NAME}.glb')
export_glb(root, glb)
save_blend(os.path.join(PROJECT, 'assets', 'blender', f'{NAME}.blend'))
render_preview(os.path.join(PROJECT, 'docs', 'preview', f'{NAME}.png'), target=(0, 2.4, 0), cam_pos=(-13, 6.5, -14))
print('DONE', glb, os.path.getsize(glb))
