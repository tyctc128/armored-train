"""火砲車（甲／乙）建模腳本。

執行：
  blender -b --factory-startup -P tools/blender/gun_car.py -- A
  （A＝火砲車甲，B＝火砲車乙，多一座砲塔座讓乙車越頂射擊）

節點：Turret → Elev → Recoil → Muzzle；Turret → Sight；MG_L_* / MG_R_*；Wheelset_*
尺寸須與 src/train/modelSpecs.js 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, empty, script_args  # noqa: E402
from parts import Kit, FLOOR  # noqa: E402

VARIANT = (script_args() or ['A'])[0].upper()
HIGH = VARIANT == 'B'
NAME = f'gun_car_{VARIANT.lower()}'
CN = '火砲車乙' if HIGH else '火砲車甲'

LEN, W = 16.0, 3.1
TX = 3.6
RING_R, BODY_H = 1.55, 1.15
PIVOT = (RING_R * 0.3, 0.22 + BODY_H * 0.55, 0.0)
BARREL_LEN = 4.4
MG_X, MG_Y = -4.6, 2.3

kit = Kit('GunCarB' if HIGH else 'GunCarA')
k = kit
hull = kit.hull(length=LEN, w=W)
ROOF = hull.roof
TURRET_Y = ROOF + (0.8 if HIGH else 0.0)
ins = hull.inside

# ── 車內 ──
# 砲塔座圈
ins.lathe((TX, hull.ceil - 0.14, 0), (0, 1, 0), [(0, 0.92), (0.14, 0.92), (0.14, 0.84), (0, 0.84)], 32, k.IST, closed=True)
hull.lamps((-5.5, -1.0, 6.0))
hull.hatch(-1.6)
# 開放式彈架（十糎彈）
for side in (-1, 1):
    z = side * 1.22
    ins.box((6.4, FLOOR + 0.75, side * 1.43), (2.4, 1.5, 0.04), k.IST)
    for x in (5.2, 7.6):
        ins.box((x, FLOOR + 0.75, z), (0.05, 1.5, 0.42), k.IST)
    for row in range(2):
        ins.box((6.4, FLOOR + 0.27 + row * 0.7, z), (2.4, 0.04, 0.42), k.IST)
        y = FLOOR + 0.3 + row * 0.7
        for j in range(7):
            x = 5.35 + j * 0.33
            ins.lathe((x, y, z), (0, 1, 0), [(0, 0.06), (0.42, 0.06)], 10, k.BRS)
            ins.lathe((x, y + 0.42, z), (0, 1, 0), [(0, 0.055), (0.12, 0.03), (0.15, 0)], 10, k.IST, cap0=False)
hull.phone(1.6, -1)
hull.seats((-3.5, -6.2))
hull.wall_structure(skip=[(-0.8, 0.8), (5.0, 7.8)], ceiling_skip=[(TX - 1.1, TX + 1.1)])
hull.voice_tube(drops=(TX - 1.2, 1.2))
hull.inner_slits((-6.6, -2.4, 2.0))
hull.inner_ports((-3.0, 3.0))
hull.mg_post(MG_X)
hull.rifle_rack(-2.55, side=1)
for side in (-1, 1):
    hull.locker(-7.3, side)
hull.extinguisher(0.85, 1)
hull.first_aid(-0.95, -1)
hull.elec_box(0.85, -1)
hull.board(2.45, -1)
hull.helmets(3.9, 1)
hull.crates(4.55)
# 砲塔下方：登塔梯與揚彈筒
for dz in (-0.75, -0.4):
    ins.box((TX - 0.55, (FLOOR + hull.ceil) / 2, dz), (0.05, hull.ceil - FLOOR, 0.05), k.IST)
for j in range(1, 7):
    ins.cylinder((TX - 0.55, FLOOR + 0.32 * j, -0.75), (TX - 0.55, FLOOR + 0.32 * j, -0.4), 0.018, 6, k.IST)
ins.cylinder((TX + 0.65, FLOOR + 0.25, 0.6), (TX + 0.35, hull.ceil - 0.05, 0.5), 0.12, 14, k.IST)
ins.box((TX + 0.65, FLOOR + 0.12, 0.6), (0.4, 0.24, 0.4), k.IST)

# ── 外部 ──
hull.side_details(doors=(0.0,), slits=(-6.6, -2.4, 2.0, 6.4), ports=(-3.0, 3.0, 5.0))
for side in (-1, 1):
    hull.mg_ring(MG_X, MG_Y, side)
hull.vents((-6.0, 6.8))
hull.lifting_rings()
if HIGH:
    hull.det.lathe((TX, ROOF, 0), (0, 1, 0), [(0, 1.88), (0.7, 1.78), (0.8, 1.7), (0.8, 0)], 36, k.A, cap0=False)
hull.rivets(skip=[(-0.7, 0.7)])
hull.finish()
kit.running_gear(LEN)

# ── 十糎砲砲塔 ──
turret = empty('Turret', kit.root, (TX, TURRET_Y, 0))
tb = MeshBuilder()
tb.lathe((0, 0, 0), (0, 1, 0), [(0, RING_R + 0.18), (0.22, RING_R + 0.12), (0.22, 0)], 48, k.A, cap0=False)
tb.lathe((0, 0.22, 0), (0, 1, 0), [(0, RING_R), (0.55, RING_R - 0.05), (BODY_H - 0.12, RING_R - 0.22), (BODY_H, RING_R - 0.4), (BODY_H + 0.04, 0)], 48, k.A, cap0=False)
tb.box((-1.25, 0.22 + 0.5, 0), (0.9, 0.75, 1.7), k.A)
tb.lathe((-0.45, 0.22 + BODY_H, 0.45), (0, 1, 0), [(0, 0.36), (0.08, 0.34), (0.12, 0)], 20, k.A, cap0=False)
tb.box((PIVOT[0] + 0.2, 0.22 + BODY_H + 0.12, -0.55), (0.28, 0.3, 0.22), k.A)
tb.box((PIVOT[0] + 0.34, 0.22 + BODY_H + 0.17, -0.55), (0.02, 0.07, 0.16), k.BLK)
for ang in (40, 140, 220, 320):
    a = math.radians(ang)
    r = RING_R - 0.1
    tb.box((math.cos(a) * r, 0.22 + 0.75, -math.sin(a) * r), (0.08, 0.05, 0.3), k.BLK)
for ang in (60, 180, 300):
    a = math.radians(ang)
    r = RING_R - 0.42
    tb.lathe((math.cos(a) * r, 0.22 + BODY_H + 0.02, -math.sin(a) * r), (1, 0, 0), [(0, 0.07), (0.025, 0.07), (0.025, 0.045), (0, 0.045)], 10, k.ST, closed=True)
tb.box((RING_R - 0.15, PIVOT[1], 0), (0.2, 0.95, 1.05), k.A)
tb.build('TurretBody', k.MATS, parent=turret, bevel=0.02)

tr = MeshBuilder()
for j in range(36):
    a = 2 * math.pi * j / 36
    tr.rivet((math.cos(a) * (RING_R + 0.01), 0.36, math.sin(a) * (RING_R + 0.01)), (math.cos(a), 0, math.sin(a)))
    tr.rivet((math.cos(a) * (RING_R - 0.07), 0.22 + BODY_H - 0.25, math.sin(a) * (RING_R - 0.07)), (math.cos(a), 0.3, math.sin(a)))
tr.build('TurretRivets', [k.M['armor']], parent=turret)

elev = empty('Elev', turret, PIVOT)
mant = MeshBuilder()
mant.lathe((RING_R - 0.25 - PIVOT[0], 0, -0.48), (0, 0, 1), [(0, 0.44), (0.96, 0.44)], 32, k.A)
mant.box((RING_R - 0.05 - PIVOT[0], 0, 0), (0.25, 0.32, 0.32), k.A)
mant.build('Mantlet', k.MATS, parent=elev, bevel=0.015)
recoil = empty('Recoil', elev)
bar = MeshBuilder()
bar.lathe((0, 0, 0), (1, 0, 0), [(0.6, 0.12), (1.5, 0.115), (1.6, 0.1), (2.2, 0.095), (4.75, 0.08), (4.8, 0.095), (5.0, 0.095), (5.0, 0.045), (4.9, 0.045)], 28, 0, cap0=True, cap1=False)
bar.lathe((0, 0, 0), (1, 0, 0), [(4.9, 0.045), (4.9, 0)], 16, 1)
for y in (0.19, -0.19):
    bar.cylinder((0.45, y, 0), (1.95, y, 0), 0.085, 18, 0)
    bar.cylinder((1.95, y, 0), (2.05, y, 0), 0.06, 12, 0)
bar.build('Barrel', [k.M['gun'], k.M['black']], parent=recoil, bevel=0.006)
empty('Muzzle', recoil, (0.6 + BARREL_LEN, 0, 0))
empty('Sight', turret, (PIVOT[0] + 0.25, PIVOT[1] + 0.22, -0.55))

# ── 九二式重機槍 ──
kit.mg('L', (MG_X, MG_Y, -W / 2), 90, 75, f'{CN} 左側機槍')
kit.mg('R', (MG_X, MG_Y, W / 2), -90, 75, f'{CN} 右側機槍')

kit.export(NAME, cam_target=(0, 2.4, 0), cam_pos=(-13, 6.5, -14))
