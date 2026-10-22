"""指揮車建模腳本（指揮塔、傳令鐘、海圖桌、電話總機、天線）。

執行：
  blender -b --factory-startup -P tools/blender/command_car.py

節點：ConsoleAnchor（觀測鏡相機，指揮塔內）、MG_L_*、Wheelset_*
尺寸須與 src/train/carModels.js 的 buildCommand 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, empty  # noqa: E402
from parts import Kit, FLOOR  # noqa: E402

LEN, W, H = 15.0, 3.1, 2.4
CX = 3.2           # 指揮塔
MG_X, MG_Y = -4.0, 2.3
HATCH_X = -1.0
MASTS = (-5.5, -1.5)

kit = Kit('CommandCar')
k = kit
hull = kit.hull(length=LEN, w=W, h=H)
ROOF = hull.roof
CEIL = hull.ceil
ins = hull.inside
hw = hull.hw_in

# ───────────────────────────── 車內 ─────────────────────────────
hull.lamps((-5.0, -1.8, 1.4, 5.6))
hull.hatch(HATCH_X)
hull.wall_structure(skip=[(-0.8, 0.8)], ceiling_skip=[(CX - 1.0, CX + 1.0)])
hull.voice_tube(drops=(2.5,))
hull.inner_slits((-6.5, -2.2, 1.8, 5.8))
hull.inner_ports((-2.8, 2.6))
hull.mg_post(MG_X, sides=(-1,))

# 指揮塔下方：座圈、登塔梯、可升降座
ins.lathe((CX, CEIL - 0.12, 0), (0, 1, 0), [(0, 0.72), (0.12, 0.72), (0.12, 0.64), (0, 0.64)], 28, k.IST, closed=True)
for dz in (-0.62, -0.28):
    ins.box((CX - 0.5, (FLOOR + CEIL) / 2, dz), (0.05, CEIL - FLOOR, 0.05), k.IST)
for j in range(1, 7):
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

# 傳聲管匯集口（右側牆，傳令鐘旁）
for j in range(4):
    z = hw - 0.05
    x = 3.55 + j * 0.16
    ins.cylinder((x, CEIL - 0.2, z), (x, 2.25, z), 0.02, 8, k.BRS)
    ins.lathe((x, 2.25, z), (0, -1, 0), [(0, 0.02), (0.06, 0.045), (0.08, 0.045), (0.08, 0)], 10, k.BRS)
ins.box((3.79, CEIL - 0.18, hw - 0.05), (0.7, 0.08, 0.08), k.BRS)

# 靠牆的海圖桌與兩端軍官座椅（左側，讓出走道）
MTX, MTZ = 1.2, -(hw - 0.24)
ins.box((MTX, FLOOR + 0.85, MTZ), (1.3, 0.05, 0.48), k.WOOD)
ins.box((MTX, FLOOR + 0.876, MTZ), (1.1, 0.004, 0.38), k.WHT)
for dx in (-0.58, 0.58):
    ins.box((MTX + dx, FLOOR + 0.42, MTZ + 0.18), (0.05, 0.84, 0.05), k.WOOD)
ins.box((MTX, FLOOR + 0.65, MTZ - 0.2), (1.2, 0.3, 0.03), k.WOOD)
ins.cylinder((MTX - 0.3, FLOOR + 0.885, MTZ - 0.05), (MTX + 0.1, FLOOR + 0.885, MTZ + 0.05), 0.006, 6, k.BRS)
ins.box((MTX + 0.35, FLOOR + 0.89, MTZ + 0.05), (0.2, 0.02, 0.24), k.BLK)
for cx, back in ((MTX - 0.95, -1), (MTX + 0.95, 1)):
    cz = MTZ + 0.02
    ins.box((cx, FLOOR + 0.45, cz), (0.38, 0.05, 0.38), k.WOOD)
    for dx in (-0.16, 0.16):
        for dz in (-0.16, 0.16):
            ins.box((cx + dx, FLOOR + 0.22, cz + dz), (0.035, 0.44, 0.035), k.WOOD)
    ins.box((cx + back * 0.18, FLOOR + 0.75, cz), (0.035, 0.4, 0.38), k.WOOD)

# 電話總機（左側牆）
SBX = -2.4
ins.box((SBX, FLOOR + 0.75, hull.on_wall(-1, 0.4)), (1.0, 1.5, 0.4), k.WOOD)
zf = -(hw - 0.405)
ins.box((SBX, FLOOR + 1.15, zf), (0.86, 0.6, 0.01), k.BLK)
for r in range(4):
    for c in range(8):
        ins.cylinder((SBX - 0.35 + c * 0.1, FLOOR + 0.95 + r * 0.13, zf), (SBX - 0.35 + c * 0.1, FLOOR + 0.95 + r * 0.13, zf + 0.012), 0.018, 8, k.BRS)
ins.box((SBX, FLOOR + 0.74, -(hw - 0.47)), (0.9, 0.04, 0.14), k.WOOD)
for c in range(6):
    ins.cylinder((SBX - 0.3 + c * 0.12, FLOOR + 0.76, -(hw - 0.48)), (SBX - 0.3 + c * 0.12, FLOOR + 0.84, -(hw - 0.48)), 0.012, 6, k.BRS)
# 接線員座椅（靠牆，在總機旁）
ins.box((SBX + 0.75, FLOOR + 0.45, -(hw - 0.22)), (0.38, 0.05, 0.38), k.WOOD)
for dx in (-0.16, 0.16):
    ins.box((SBX + 0.75 + dx, FLOOR + 0.22, -(hw - 0.22)), (0.035, 0.44, 0.035), k.ST)

# 電話（多具）
for x, side in ((5.6, -1), (-0.9, 1), (-5.4, 1)):
    hull.phone(x, side, y=2.5)

# 小型無線電收發報機（右側層架）
RX = -3.6
ins.box((RX, FLOOR + 0.95, hull.on_wall(1, 0.45)), (1.1, 0.04, 0.45), k.WOOD)
for dx in (-0.5, 0.5):
    ins.box((RX + dx, FLOOR + 0.47, hull.on_wall(1, 0.45)), (0.04, 0.94, 0.45), k.WOOD)
ins.box((RX - 0.2, FLOOR + 1.17, hull.on_wall(1, 0.36)), (0.55, 0.4, 0.36), k.OLV)
zr = hw - 0.365
for j in range(3):
    ins.cylinder((RX - 0.35 + j * 0.15, FLOOR + 1.2, zr), (RX - 0.35 + j * 0.15, FLOOR + 1.2, zr - 0.03), 0.03, 12, k.BLK)
ins.box((RX - 0.2, FLOOR + 1.05, zr - 0.01), (0.4, 0.06, 0.01), k.WHT)
ins.box((RX + 0.3, FLOOR + 1.06, hull.on_wall(1, 0.3)), (0.25, 0.18, 0.2), k.OLV)
ins.box((RX + 0.3, FLOOR + 1.2, hw - 0.25), (0.08, 0.03, 0.12), k.BLK)
for dz in (-0.07, 0.07):
    ins.cylinder((RX + 0.05, FLOOR + 0.99, hw - 0.3 + dz), (RX + 0.05, FLOOR + 1.03, hw - 0.3 + dz), 0.04, 10, k.BLK)
ins.box((RX - 0.2, FLOOR + 0.45, hull.on_wall(1, 0.4)), (0.5, 0.35, 0.36), k.OLV)

# 雙眼望遠鏡架（右側）
BX = 2.3
ins.box((BX, FLOOR + 1.3, hull.on_wall(1, 0.04)), (0.4, 0.5, 0.04), k.WOOD)
for dz in (-0.05, 0.05):
    ins.cylinder((BX - 0.12, FLOOR + 1.35, hw - 0.12 + dz), (BX + 0.12, FLOOR + 1.35, hw - 0.12 + dz), 0.035, 12, k.BLK)
ins.box((BX, FLOOR + 1.38, hw - 0.12), (0.06, 0.03, 0.08), k.BLK)
ins.cylinder((BX, FLOOR + 1.2, hw - 0.03), (BX, FLOOR + 1.2, hw - 0.12), 0.012, 6, k.ST)

# 文件櫃（左後）
for j in range(3):
    ins.box((-6.3, FLOOR + 0.24 + j * 0.42, hull.on_wall(-1, 0.45)), (0.55, 0.4, 0.45), k.OLV)
    ins.box((-6.3, FLOOR + 0.3 + j * 0.42, -(hw - 0.455)), (0.18, 0.03, 0.02), k.BRS)
    ins.box((-6.3, FLOOR + 0.14 + j * 0.42, -(hw - 0.455)), (0.1, 0.06, 0.004), k.WHT)

# 壁鐘（左側牆）
CLX = 0.9
ins.lathe((CLX, 2.55, -hw), (0, 0, 1), [(0, 0.17), (0.05, 0.17), (0.05, 0)], 24, k.WOOD)
ins.lathe((CLX, 2.55, -(hw - 0.051)), (0, 0, 1), [(0, 0.14), (0.003, 0)], 24, k.WHT)
ins.box((CLX, 2.6, -(hw - 0.056)), (0.012, 0.1, 0.004), k.BLK)
ins.box((CLX + 0.04, 2.55, -(hw - 0.056)), (0.08, 0.01, 0.004), k.BLK)

# 共用內裝
hull.board(-0.95, -1, w=0.9, h=0.6)
hull.first_aid(-6.3, 1)
hull.extinguisher(0.85, 1)
hull.elec_box(-1.0, -1)
hull.helmets(5.8, 1, n=2)
hull.locker(-6.9, 1)
hull.seats((-4.8,), sides=(1,))

# ───────────────────────────── 外部 ─────────────────────────────
det = hull.det
hull.side_details(doors=(0.0,), slits=(-6.5, -2.2, 1.8, 5.8), ports=(-2.8, 2.6))
hull.mg_ring(MG_X, MG_Y, -1)
hull.vents((-6.6, 6.2))
hull.lifting_rings()
hull.rivets(skip=[(-0.7, 0.7)])

# 天線：兩根桅杆、絕緣子、天線、引入線
MAST_H = 3.2
for x in MASTS:
    det.cylinder((x, ROOF, 0), (x, ROOF + 0.12, 0), 0.1, 12, k.A)
    det.cylinder((x, ROOF + 0.12, 0), (x, ROOF + MAST_H, 0), 0.04, 8, k.ST)
    det.cylinder((x, ROOF + MAST_H, 0), (x, ROOF + MAST_H + 0.05, 0), 0.025, 8, k.ST)
    for sz in (-1, 1):
        det.cylinder((x, ROOF + 1.8, 0), (x, ROOF + 0.05, sz * 0.8), 0.008, 4, k.ST)
for x in (MASTS[0] + 0.25, MASTS[1] - 0.25):
    det.cylinder((x, ROOF + MAST_H - 0.05, 0), (x + (0.1 if x < 0 and x < -3 else -0.1), ROOF + MAST_H - 0.05, 0), 0.025, 8, k.WHT)
for dz in (-0.12, 0.12):
    det.cylinder((MASTS[0] + 0.35, ROOF + MAST_H - 0.05, dz), (MASTS[1] - 0.35, ROOF + MAST_H - 0.05, dz), 0.006, 4, k.CU)
det.cylinder(((MASTS[0] + MASTS[1]) / 2, ROOF + MAST_H - 0.05, 0.12), ((MASTS[0] + MASTS[1]) / 2 + 0.3, ROOF + 0.15, 0.4), 0.006, 4, k.CU)
det.lathe(((MASTS[0] + MASTS[1]) / 2 + 0.3, ROOF, 0.4), (0, 1, 0), [(0, 0.06), (0.15, 0.04), (0.15, 0)], 10, k.WHT)
hull.finish()

# 指揮塔：封閉圓柱＋圓頂（單面、法線朝外，相機在內部時整個看不見）
cup = MeshBuilder()


def cup_r(y):
    return 0.8 - 0.08 * y / 0.9


prof = [(0, 0.8), (0.64, cup_r(0.64)), (0.74, cup_r(0.74)), (0.9, 0.72)] + \
    [(0.9 + 0.72 * math.sin(math.radians(a)), 0.72 * math.cos(math.radians(a))) for a in range(15, 91, 15)]
cup.lathe((CX, ROOF, 0), (0, 1, 0), prof, 32, k.A, cap0=True)
# 環形觀察縫：塔身同一圈面改成黑色（不另加環，避免從內部擋住觀測鏡視線）
for f in cup.bm.faces:
    yc = f.calc_center_median().z - ROOF
    if 0.64 < yc < 0.74:
        f.material_index = k.BLK
cup.lathe((CX, ROOF, 0), (0, 1, 0), [(0, 0.86), (0.05, 0.86), (0.08, 0.81), (0, 0.81)], 32, k.A, closed=True)
cup.lathe((CX - 0.25, ROOF + 1.62, 0), (0, 1, 0), [(0, 0.2), (0.05, 0.18), (0.08, 0)], 16, k.A)
cup.cylinder((CX - 0.45, ROOF + 1.6, -0.12), (CX - 0.45, ROOF + 1.6, 0.12), 0.03, 8, k.ST)
cup.build('Cupola', k.MATS, parent=kit.root, bevel=0.01)
cr = MeshBuilder()
for j in range(28):
    a = 2 * math.pi * j / 28
    cr.rivet((CX + math.cos(a) * 0.79, ROOF + 0.25, math.sin(a) * 0.79), (math.cos(a), 0.12, math.sin(a)))
cr.build('CupolaRivets', [k.M['armor']], parent=kit.root)
empty('ConsoleAnchor', kit.root, (CX, ROOF + 0.7, 0))

kit.running_gear(LEN)

# ───────────────────────────── 九二式重機槍 ─────────────────────────────
kit.mg('L', (MG_X, MG_Y, -W / 2), 90, 75, '指揮車 左側機槍')

kit.export('command_car', cam_target=(0, 2.6, 0), cam_pos=(-12, 7, -14))
