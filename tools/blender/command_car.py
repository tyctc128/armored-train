"""指揮車建模腳本。

依《世界裝甲列車圖解百科》照片與說明：以タサ型 60 噸煤車為底；車體中段大幅加高（上下兩層），
後端低段一座機槍塔（每座塔一挺九二式重機槍），上層前端兩側有裝在裝甲罩內的側置探照燈，
車頂有指揮塔、潛望鏡頭與天線。車內上層有潛望鏡底座、長椅與彎管扶手；下層是列車指揮人員的辦公室
（桌上電話、牆上儀表與分格面板）。

遊戲中玩家只在下層地板走動：上層做成沿兩側牆的走廊（高於頭部），中央挑空，以樓梯相連。

執行：
  blender -b --factory-startup -P tools/blender/command_car.py
  （加參數 -- interior 只渲染車內檢查圖，不輸出模型）

節點：ConsoleAnchor（觀測鏡相機，指揮塔內）、MG_L_*（後端機槍塔）、Wheelset_*
尺寸、指揮塔與機槍位置須與 src/train/carModels.js 的 buildCommand 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, empty, script_args  # noqa: E402
from parts import (  # noqa: E402
    Kit, FLOOR, bulkhead_face, step_rivets, windows, window_row, end_handrails, skirts_and_jacks,
    cupola, cupola_platform,
)

LEN, W, H = 15.0, 3.1, 2.4
RAISE = 1.1
HI0, HI1 = -3.5, 5.0          # 上層車體範圍
CX = 3.2                      # 指揮塔
CUP_X, CUP_Z, CUP_R = -6.4, -0.75, 0.55   # 後端機槍塔
HATCH_X = -4.4
MASTS = (-2.6, 1.2)
DECK = FLOOR + 1.85           # 上層走廊地板（高於玩家頭部）

kit = Kit('CommandCar')
k = kit
lo_r = kit.hull(length=HI0 + LEN / 2, x0=(HI0 - LEN / 2) / 2, w=W, h=H, name='HullRear', front_wall=False)
hi = kit.hull(length=HI1 - HI0, x0=(HI0 + HI1) / 2, w=W, h=H + RAISE, name='HullHigh')
lo_f = kit.hull(length=LEN / 2 - HI1, x0=(LEN / 2 + HI1) / 2, w=W, h=H, name='HullFront', rear_wall=False)
segs = [lo_r, hi, lo_f]
ROOF = lo_f.roof
ROOF_HI = hi.roof
CEIL = hi.ceil
ins = hi.inside
hw = hi.hw_in


def seg_at(x):
    for s in segs:
        if s.x_min - 1e-6 <= x <= s.x_max + 1e-6:
            return s
    return segs[0]


# ───────────────────────────── 車內：上層走廊 ─────────────────────────────
G0, G1 = HI0 + 0.3, HI1 - 0.25
GW = 0.55
for side in (-1, 1):
    zc = side * (hw - GW / 2)
    ins.box(((G0 + G1) / 2, DECK - 0.04, zc), (G1 - G0, 0.08, GW), k.WOOD)          # 走廊地板
    ins.box(((G0 + G1) / 2, DECK - 0.12, side * (hw - GW)), (G1 - G0, 0.12, 0.06), k.IST)  # 邊樑
    # 托架
    for x in [G0 + 0.3 + i * 1.4 for i in range(int((G1 - G0) / 1.4) + 1)]:
        ins.box((x, DECK - 0.3, side * (hw - 0.05)), (0.06, 0.4, 0.08), k.IST)
        ins.cylinder((x, DECK - 0.5, side * (hw - 0.05)), (x, DECK - 0.1, side * (hw - GW + 0.05)), 0.02, 6, k.IST)
    # 彎管扶手（照片中的彎曲扶手）
    rz = side * (hw - GW + 0.04)
    for x in [G0 + 0.2 + i * 1.2 for i in range(int((G1 - G0) / 1.2) + 1)]:
        ins.cylinder((x, DECK, rz), (x, DECK + 0.9, rz), 0.022, 8, k.IST)
    ins.cylinder((G0 + 0.2, DECK + 0.9, rz), (G1 - 0.2, DECK + 0.9, rz), 0.024, 8, k.IST)
    ins.cylinder((G0 + 0.2, DECK + 0.45, rz), (G1 - 0.2, DECK + 0.45, rz), 0.018, 8, k.IST)
    # 長椅（靠牆）
    for x0, x1 in ((G0 + 0.4, G0 + 2.2), (1.6, 2.6)):
        ins.box(((x0 + x1) / 2, DECK + 0.42, side * (hw - 0.18)), (x1 - x0, 0.05, 0.3), k.WOOD)
        ins.box(((x0 + x1) / 2, DECK + 0.2, side * (hw - 0.3)), (x1 - x0, 0.4, 0.03), k.WOOD)
    # 潛望鏡底座（喇叭形底座＋立柱＋手把）
    for px in (-0.2, 0.9):
        pz = side * (hw - 0.3)
        ins.lathe((px, DECK, pz), (0, 1, 0), [(0, 0.2), (0.05, 0.18), (0.18, 0.08), (0.24, 0.06), (0.24, 0)], 18, k.IST)
        ins.cylinder((px, DECK + 0.24, pz), (px, CEIL, pz), 0.05, 12, k.ST)
        ins.box((px, DECK + 1.25, pz), (0.12, 0.16, 0.14), k.ST)
        for dz in (-0.1, 0.1):
            ins.cylinder((px, DECK + 1.15, pz + dz), (px - 0.15, DECK + 1.15, pz + dz * 1.8), 0.015, 6, k.BLK)
# 樓梯：左後角從下層地板上到左側走廊（扶手）
SX0, SX1 = HI0 + 0.4, HI0 + 1.9
n_steps = 7
for j in range(n_steps):
    x = SX0 + (j + 0.5) * (SX1 - SX0) / n_steps
    y = FLOOR + (j + 1) * (DECK - FLOOR) / (n_steps + 1)
    ins.box((x, y, -(hw - 0.28)), ((SX1 - SX0) / n_steps, 0.05, 0.5), k.WOOD)
ins.cylinder((SX0, FLOOR + 0.9, -(hw - 0.55)), (SX1, DECK + 0.9, -(hw - 0.55)), 0.022, 8, k.IST)
ins.cylinder((SX0, FLOOR, -(hw - 0.55)), (SX0, FLOOR + 0.9, -(hw - 0.55)), 0.022, 8, k.IST)

# ───────────────────────────── 車內：下層 ─────────────────────────────
for s in segs:
    xs = [x for x in (-5.8, -1.8, 1.4, 4.4, 6.4) if s.x_min + 0.4 < x < s.x_max - 0.4]
    if xs:
        s.lamps(xs)
lo_r.hatch(HATCH_X, z=0.5)
for s in segs:
    s.wall_structure(skip=[(-0.8, 0.8)], ceiling_skip=[(CX - 1.0, CX + 1.0)], pipes=s is not hi)
hi.voice_tube(drops=(2.5,))
cupola_platform(k, lo_r, CUP_X, CUP_Z)

# 指揮塔下方：座圈、登塔梯（上層車體天花板）
ins.lathe((CX, CEIL - 0.12, 0), (0, 1, 0), [(0, 0.72), (0.12, 0.72), (0.12, 0.64), (0, 0.64)], 28, k.IST, closed=True)
for dz in (-0.62, -0.28):
    ins.box((CX - 0.5, (FLOOR + CEIL) / 2, dz), (0.05, CEIL - FLOOR, 0.05), k.IST)
for j in range(1, int((CEIL - FLOOR) / 0.3)):
    ins.cylinder((CX - 0.5, FLOOR + 0.3 * j, -0.62), (CX - 0.5, FLOOR + 0.3 * j, -0.28), 0.018, 6, k.IST)

# 傳令鐘（黃銅，右側）
TGX, TGZ = 4.5, 0.85
ins.lathe((TGX, FLOOR, TGZ), (0, 1, 0), [(0, 0.16), (0.06, 0.14), (0.1, 0.07), (0.95, 0.06), (0.95, 0)], 16, k.BRS)
ins.lathe((TGX, FLOOR + 1.1, TGZ), (-1, 0, 0), [(-0.08, 0.24), (0.07, 0.24), (0.08, 0.2), (0.08, 0)], 28, k.BRS, cap0=True)
ins.lathe((TGX - 0.081, FLOOR + 1.1, TGZ), (-1, 0, 0), [(0, 0.19), (0.004, 0)], 28, k.WHT)
for j in range(5):
    a = math.radians(-60 + j * 30)
    ins.box((TGX - 0.09, FLOOR + 1.1 + math.cos(a) * 0.15, TGZ + math.sin(a) * 0.15), (0.01, 0.06, 0.012), k.BLK)
ins.cylinder((TGX - 0.1, FLOOR + 1.1, TGZ), (TGX - 0.12, FLOOR + 1.28, TGZ + 0.05), 0.018, 8, k.BRS)
ins.lathe((TGX - 0.12, FLOOR + 1.28, TGZ + 0.05), (0, 1, 0), [(0, 0.035), (0.05, 0.035), (0.06, 0)], 10, k.BLK)
ins.cylinder((TGX, FLOOR + 0.95, TGZ), (TGX, FLOOR + 0.95, hw - 0.05), 0.015, 6, k.BLK)
# 傳聲管匯集口
for j in range(4):
    z = hw - 0.05
    x = 3.55 + j * 0.16
    ins.cylinder((x, DECK - 0.2, z), (x, 2.25, z), 0.02, 8, k.BRS)
    ins.lathe((x, 2.25, z), (0, -1, 0), [(0, 0.02), (0.06, 0.045), (0.08, 0.045), (0.08, 0)], 10, k.BRS)

# 下層辦公室（照片）：靠左牆的桌子、桌上電話、牆上圓形儀表與六格面板、椅子
OX = 1.5
oz = -(hw - 0.3)
ins.box((OX, FLOOR + 0.75, oz), (1.2, 0.05, 0.6), k.WOOD)
for dx in (-0.55, 0.55):
    ins.box((OX + dx, FLOOR + 0.37, oz), (0.05, 0.74, 0.55), k.WOOD)
ins.box((OX - 0.2, FLOOR + 0.6, oz), (0.7, 0.25, 0.5), k.WOOD)                    # 抽屜
ins.box((OX + 0.3, FLOOR + 0.82, oz), (0.2, 0.08, 0.16), k.BLK)                      # 桌上電話
ins.cylinder((OX + 0.3, FLOOR + 0.9, oz - 0.06), (OX + 0.3, FLOOR + 0.9, oz + 0.06), 0.03, 10, k.BLK)
ins.cylinder((OX + 0.3, FLOOR + 0.9, oz - 0.06), (OX + 0.3, FLOOR + 0.98, oz - 0.06), 0.012, 6, k.BLK)
ins.box((OX - 0.25, FLOOR + 0.78, oz + 0.05), (0.3, 0.01, 0.22), k.WHT)              # 文件
ins.box((OX, 2.25, -(hw - 0.03)), (1.0, 0.7, 0.04), k.WOOD)                          # 六格面板
for r in range(2):
    for c in range(3):
        ins.box((OX - 0.32 + c * 0.32, 2.08 + r * 0.34, -(hw - 0.055)), (0.28, 0.3, 0.01), k.GLS)
ins.lathe((OX, 2.78, -hw), (0, 0, 1), [(0, 0.12), (0.05, 0.12), (0.05, 0)], 20, k.BRS)  # 圓形儀表
ins.lathe((OX, 2.78, -(hw - 0.051)), (0, 0, 1), [(0, 0.1), (0.003, 0)], 20, k.WHT)
ins.box((OX + 0.03, 2.8, -(hw - 0.056)), (0.07, 0.008, 0.004), k.BLK)
for dx, back in ((-0.1, 1),):
    cx_ = OX + dx
    cz = oz + 0.55
    ins.box((cx_, FLOOR + 0.45, cz), (0.4, 0.05, 0.4), k.WOOD)
    for ddx in (-0.17, 0.17):
        for ddz in (-0.17, 0.17):
            ins.box((cx_ + ddx, FLOOR + 0.22, cz + ddz), (0.035, 0.44, 0.035), k.WOOD)
    ins.box((cx_, FLOOR + 0.75, cz + back * 0.19), (0.4, 0.45, 0.035), k.WOOD)

# 電話總機（左側牆，上層樓梯前方）
SBX = -0.7
ins.box((SBX, FLOOR + 0.75, hi.on_wall(-1, 0.4)), (1.0, 1.5, 0.4), k.WOOD)
zf = -(hw - 0.405)
ins.box((SBX, FLOOR + 1.15, zf), (0.86, 0.6, 0.01), k.BLK)
for r in range(4):
    for c in range(8):
        ins.cylinder((SBX - 0.35 + c * 0.1, FLOOR + 0.95 + r * 0.13, zf), (SBX - 0.35 + c * 0.1, FLOOR + 0.95 + r * 0.13, zf + 0.012), 0.018, 8, k.BRS)
ins.box((SBX, FLOOR + 0.74, -(hw - 0.47)), (0.9, 0.04, 0.14), k.WOOD)

# 小型無線電收發報機（右側層架）
RX = -1.2
ins.box((RX, FLOOR + 0.95, hi.on_wall(1, 0.45)), (1.1, 0.04, 0.45), k.WOOD)
for dx in (-0.5, 0.5):
    ins.box((RX + dx, FLOOR + 0.47, hi.on_wall(1, 0.45)), (0.04, 0.94, 0.45), k.WOOD)
ins.box((RX - 0.2, FLOOR + 1.17, hi.on_wall(1, 0.36)), (0.55, 0.4, 0.36), k.OLV)
zr = hw - 0.365
for j in range(3):
    ins.cylinder((RX - 0.35 + j * 0.15, FLOOR + 1.2, zr), (RX - 0.35 + j * 0.15, FLOOR + 1.2, zr - 0.03), 0.03, 12, k.BLK)
ins.box((RX + 0.3, FLOOR + 1.06, hi.on_wall(1, 0.3)), (0.25, 0.18, 0.2), k.OLV)
ins.box((RX - 0.2, FLOOR + 0.45, hi.on_wall(1, 0.4)), (0.5, 0.35, 0.36), k.OLV)

# 後低段：文件櫃、置物櫃、急救箱；前低段：電話、鋼盔
for j in range(3):
    lo_r.inside.box((-5.0, FLOOR + 0.24 + j * 0.42, lo_r.on_wall(1, 0.45)), (0.55, 0.4, 0.45), k.OLV)
    lo_r.inside.box((-5.0, FLOOR + 0.3 + j * 0.42, lo_r.hw_in - 0.455), (0.18, 0.03, 0.02), k.BRS)
lo_r.first_aid(-4.6, -1)
lo_r.locker(-7.0, 1)
lo_r.extinguisher(-3.9, 1)
lo_f.phone(6.4, -1, y=2.5)
lo_f.helmets(5.8, 1, n=2)
lo_f.locker(7.0, -1)
hi.board(3.9, -1, w=0.8, h=0.55)

# ───────────────────────────── 外部 ─────────────────────────────
for s in segs:
    s.side_details(doors=tuple(x for x in (0.0,) if s.x_min < x < s.x_max), slits=(), ports=(), handrails=False)
    xs = window_row(s, keep_clear=[(-0.75, 0.75)])
    windows(k, s, xs, (2.45, 1.9))
    if s is hi:
        windows(k, s, xs[::2], (hi.wall_top - 0.3,))
        hi.inner_slits(xs[::2], y=hi.wall_top - 0.3)
    s.rivets(skip=[(-0.7, 0.7)])
    s.lifting_rings()
end_handrails(k, lo_f, LEN / 2 - 0.4)
end_handrails(k, lo_r, -LEN / 2 + 0.4)
for b in (HI0, HI1):
    toward = 1 if b > 0 else -1
    bulkhead_face(k, seg_at(b + toward * 0.5), b, toward)
    step_rivets(k, hi, b, toward, ROOF, RAISE)
skirts_and_jacks(k, LEN, jack_x=())
det = hi.det
# 側置探照燈（上層前端兩側的裝甲罩內）
for side in (-1, 1):
    zs = side * (W / 2)
    det.box((HI1 - 0.55, ROOF_HI - 0.55, zs + side * 0.22), (0.9, 0.55, 0.44), k.A)
    det.box((HI1 - 0.1, ROOF_HI - 0.55, zs + side * 0.22), (0.06, 0.6, 0.5), k.A)
    det.lathe((HI1 - 0.06, ROOF_HI - 0.55, zs + side * 0.22), (1, 0, 0), [(0, 0.17), (0.04, 0.17), (0.05, 0)], 20, k.LMP, cap0=False)
    for j in range(3):
        det.box((HI1 - 0.02, ROOF_HI - 0.66 + j * 0.11, zs + side * 0.22), (0.02, 0.015, 0.38), k.ST)
# 車頂潛望鏡頭
for px, pz in ((-0.2, -1.05), (-0.2, 1.05), (0.9, -1.05), (0.9, 1.05)):
    det.cylinder((px, ROOF_HI, pz * 0.9), (px, ROOF_HI + 0.35, pz * 0.9), 0.07, 12, k.A)
    det.box((px + 0.05, ROOF_HI + 0.4, pz * 0.9), (0.2, 0.12, 0.12), k.A)
    det.box((px + 0.155, ROOF_HI + 0.4, pz * 0.9), (0.01, 0.06, 0.08), k.GLS)
# 天線：兩根桅杆、絕緣子、天線、引入線
MAST_H = 2.6
for x in MASTS:
    det.cylinder((x, ROOF_HI, 0), (x, ROOF_HI + 0.12, 0), 0.1, 12, k.A)
    det.cylinder((x, ROOF_HI + 0.12, 0), (x, ROOF_HI + MAST_H, 0), 0.04, 8, k.ST)
    for sz in (-1, 1):
        det.cylinder((x, ROOF_HI + 1.5, 0), (x, ROOF_HI + 0.05, sz * 0.8), 0.008, 4, k.ST)
for dz in (-0.12, 0.12):
    det.cylinder((MASTS[0] + 0.1, ROOF_HI + MAST_H - 0.05, dz), (MASTS[1] - 0.1, ROOF_HI + MAST_H - 0.05, dz), 0.006, 4, k.CU)
for x in MASTS:
    det.cylinder((x, ROOF_HI + MAST_H - 0.05, -0.15), (x, ROOF_HI + MAST_H - 0.05, 0.15), 0.025, 8, k.WHT)
cups = MeshBuilder()
cupola(k, cups, CUP_X, CUP_Z, ROOF, CUP_R)
cups.build('MgCupola', k.MATS, parent=kit.root, bevel=0.01)
for s in segs:
    s.finish()

# 指揮塔：封閉圓柱＋圓頂（單面、法線朝外，相機在內部時整個看不見）
cup = MeshBuilder()


def cup_r(y):
    return 0.8 - 0.08 * y / 0.9


prof = [(0, 0.8), (0.64, cup_r(0.64)), (0.74, cup_r(0.74)), (0.9, 0.72)] + \
    [(0.9 + 0.72 * math.sin(math.radians(a)), 0.72 * math.cos(math.radians(a))) for a in range(15, 91, 15)]
cup.lathe((CX, ROOF_HI, 0), (0, 1, 0), prof, 32, k.A, cap0=True)
for f in cup.bm.faces:
    yc = f.calc_center_median().z - ROOF_HI
    if 0.64 < yc < 0.74:
        f.material_index = k.BLK
cup.lathe((CX, ROOF_HI, 0), (0, 1, 0), [(0, 0.86), (0.05, 0.86), (0.08, 0.81), (0, 0.81)], 32, k.A, closed=True)
cup.lathe((CX - 0.25, ROOF_HI + 1.62, 0), (0, 1, 0), [(0, 0.2), (0.05, 0.18), (0.08, 0)], 16, k.A)
cup.cylinder((CX - 0.45, ROOF_HI + 1.6, -0.12), (CX - 0.45, ROOF_HI + 1.6, 0.12), 0.03, 8, k.ST)
cup.build('Cupola', k.MATS, parent=kit.root, bevel=0.01)
cr = MeshBuilder()
for j in range(28):
    a = 2 * math.pi * j / 28
    cr.rivet((CX + math.cos(a) * 0.79, ROOF_HI + 0.25, math.sin(a) * 0.79), (math.cos(a), 0.12, math.sin(a)))
cr.build('CupolaRivets', [k.M['armor']], parent=kit.root)
empty('ConsoleAnchor', kit.root, (CX, ROOF_HI + 0.7, 0))

kit.running_gear(LEN)

# ───────────────────────────── 九二式重機槍（後端機槍塔） ─────────────────────────────
a = math.radians(90)
kit.mg('L', (CUP_X + math.cos(a) * CUP_R, ROOF + 0.12, CUP_Z - math.sin(a) * CUP_R), 90, 75, '指揮車 左側機槍', housing=0.2)

if 'interior' in script_args():
    kit.interior_shots('command_car', [
        ('lower', (4.5, 2.2, 0.0), (-2.6, 2.6, 0.3), 18),
        ('upper', (3.0, DECK + 0.6, -1.0), (-2.0, DECK + 1.3, 0.6), 20),
        ('office', (OX, 2.1, -1.4), (OX + 0.4, 2.7, 0.9), 22),
    ], lights_x=(-5.0, -1.0, 2.0, 5.5))
else:
    kit.export('command_car', cam_target=(0, 2.8, 0), cam_pos=(-12, 7, -14))
