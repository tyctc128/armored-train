"""火砲車（甲／乙）建模腳本。

依《世界裝甲列車圖解百科》照片與說明：
- 甲（十加低車）：中段加高的上層車體上一座十四年式十糎高射砲砲塔（射界約 270°），
  前、後低段車頂各有機槍塔（前方對地、後方對地對空兩用）。
- 乙（十加高車）：上層車體更高，可越過甲車射擊；車頂後段裝艦艇用雙像測距儀與雙筒潛望鏡，
  共 4 座旋轉機槍塔。側面一排排小窗與圓形百葉通風口。
- 砲塔為多面體（斜裝甲板組成，像四坡屋頂），砲手經梯子進入砲塔下方的轉籃。
- 車內：裝甲板內側以木材支撐，左側彈架存放約 200 發砲彈。
- 車底：側裙板、射擊時保持車身水平用的制動棒（收納於車側下方）。

執行：
  blender -b --factory-startup -P tools/blender/gun_car.py -- A
  （A＝火砲車甲，B＝火砲車乙；加 interior 只渲染車內檢查圖，不輸出模型）

節點：Turret → Elev → Recoil → Muzzle；Turret → Sight；MG_L_* / MG_R_*；（乙）RF_Yaw → RF_Anchor；Wheelset_*
尺寸、砲塔高度、機槍與測距儀位置須與 src/train/carModels.js 的 buildGunCar 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, empty, script_args  # noqa: E402
from parts import (  # noqa: E402
    Kit, FLOOR, bulkhead_face, step_rivets, windows, window_row, end_handrails, skirts_and_jacks,
    cupola, cupola_platform, faceted_body, timber_lining,
)

ARGS = [a.upper() for a in script_args()]
HIGH = 'B' in ARGS
VARIANT = 'B' if HIGH else 'A'
NAME = f'gun_car_{VARIANT.lower()}'
CN = '火砲車乙' if HIGH else '火砲車甲'

LEN, W, H = 16.0, 3.1, 2.3
TX = 3.6
RAISE = 1.1 if HIGH else 0.4          # 上層車體加高
RING_R, BODY_H = 1.55, 1.15
PIVOT = (RING_R * 0.3, 0.22 + BODY_H * 0.55, 0.0)
BARREL_LEN = 4.4
CUP_R = 0.55                          # 機槍塔半徑
RF_X = -5.4                           # 乙：測距儀（上層車體後段車頂）

kit = Kit('GunCarB' if HIGH else 'GunCarA')
k = kit

# ───────────────────────────── 車體分段 ─────────────────────────────
# 甲：後低段 [-8, -2]、中段加高 [-2, 5.6]、前低段 [5.6, 8]
# 乙：加高段 [-8, 5.0]、前低段 [5.0, 8]
if HIGH:
    BOUNDS = [5.0]
    hi = kit.hull(length=13.0, x0=-1.5, w=W, h=H + RAISE, name='HullHigh')
    lo_f = kit.hull(length=3.0, x0=6.5, w=W, h=H, name='HullFront', rear_wall=False)
    segs = [hi, lo_f]
    lo_r = None
else:
    BOUNDS = [-2.0, 5.6]
    lo_r = kit.hull(length=6.0, x0=-5.0, w=W, h=H, name='HullRear', front_wall=False)
    hi = kit.hull(length=7.6, x0=1.8, w=W, h=H + RAISE, name='HullMid')
    lo_f = kit.hull(length=2.4, x0=6.8, w=W, h=H, name='HullFront', rear_wall=False)
    segs = [lo_r, hi, lo_f]
ROOF = lo_f.roof                 # 低段車頂 3.4
ROOF_HI = hi.roof
TURRET_Y = ROOF_HI


def seg_at(x):
    for s in segs:
        if s.x_min - 1e-6 <= x <= s.x_max + 1e-6:
            return s
    return segs[0]


def ins_at(x):
    return seg_at(x).inside


# 可操作的兩座機槍塔（L／R）與裝飾用機槍塔
if HIGH:
    MG_CUPS = [(6.6, -0.8, 'L', 90), (6.6, 0.8, 'R', -90)]
    DECO_CUPS = [(-7.1, -0.8, ROOF_HI, 120), (-7.1, 0.8, ROOF_HI, -120)]
else:
    MG_CUPS = [(-6.6, -0.8, 'L', 90), (-6.6, 0.8, 'R', -90)]
    DECO_CUPS = [(7.1, 0.0, ROOF, 0)]
MG_Y = ROOF + 0.12

# ───────────────────────────── 車內 ─────────────────────────────
# 砲塔座圈與轉籃（前後留出入口，玩家沿走道中線可穿過）
ins = hi.inside
ins.lathe((TX, hi.ceil - 0.14, 0), (0, 1, 0), [(0, 0.92), (0.14, 0.92), (0.14, 0.84), (0, 0.84)], 32, k.IST, closed=True)
BASKET_R = 0.82
for j in range(18):
    a = 2 * math.pi * j / 18
    if abs(math.cos(a)) > 0.9:   # 前後出入口
        continue
    x, z = TX + math.cos(a) * BASKET_R, -math.sin(a) * BASKET_R
    ins.cylinder((x, FLOOR + 0.05, z), (x, hi.ceil - 0.2, z), 0.018, 6, k.IST)
for y in (FLOOR + 0.9, hi.ceil - 0.22):
    ins.lathe((TX, y, 0), (0, 1, 0), [(-0.02, BASKET_R + 0.02), (0.02, BASKET_R + 0.02), (0.02, BASKET_R - 0.02), (-0.02, BASKET_R - 0.02)], 36, k.IST, closed=True)
ins.box((TX - 0.35, FLOOR + 0.5, -0.45), (0.32, 0.05, 0.3), k.WOOD)          # 砲手座
ins.box((TX - 0.35, FLOOR + 0.25, -0.45), (0.04, 0.5, 0.04), k.IST)
ins.lathe((TX + 0.1, FLOOR + 1.1, -0.62), (0, 0, 1), [(0, 0.15), (0.03, 0.15), (0.03, 0.12), (0, 0.12)], 18, k.ST, closed=True)  # 高低手輪
ins.lathe((TX - 0.15, FLOOR + 1.0, -0.2), (1, 0, 0), [(0, 0.15), (0.03, 0.15), (0.03, 0.12), (0, 0.12)], 18, k.ST, closed=True)  # 方向手輪
# 登塔梯（乙車砲塔較高，梯子更長）
LX = TX - 1.05
for dz in (-0.75, -0.4):
    ins.box((LX, (FLOOR + hi.ceil) / 2, dz), (0.05, hi.ceil - FLOOR, 0.05), k.IST)
for j in range(1, int((hi.ceil - FLOOR) / 0.3)):
    ins.cylinder((LX, FLOOR + 0.3 * j, -0.75), (LX, FLOOR + 0.3 * j, -0.4), 0.018, 6, k.IST)
# 揚彈筒
ins.cylinder((TX + 0.65, FLOOR + 0.25, 0.6), (TX + 0.35, hi.ceil - 0.05, 0.5), 0.12, 14, k.IST)
ins.box((TX + 0.65, FLOOR + 0.12, 0.6), (0.4, 0.24, 0.4), k.IST)


def shell_rack(seg, x0, x1, side, rows=3):
    """十糎彈架：方格內直立存放的砲彈（左側一列約 200 發，此處示意數排）。"""
    z = side * (seg.hw_in - 0.24)
    xc = (x0 + x1) / 2
    top = FLOOR + 0.05 + rows * 0.52
    seg.inside.box((xc, (FLOOR + top) / 2, seg.on_wall(side, 0.03)), (x1 - x0, top - FLOOR, 0.03), k.WOOD)
    n = int((x1 - x0) / 0.16)
    for r in range(rows):
        y = FLOOR + 0.05 + r * 0.52
        seg.inside.box((xc, y, z), (x1 - x0, 0.04, 0.44), k.WOOD)
        for j in range(n + 1):
            seg.inside.box((x0 + j * (x1 - x0) / n, y + 0.24, z), (0.025, 0.48, 0.44), k.WOOD)
        for j in range(n):
            for dz in (-0.1, 0.1):
                x = x0 + (j + 0.5) * (x1 - x0) / n
                seg.inside.lathe((x, y + 0.02, z + dz), (0, 1, 0), [(0, 0.052), (0.3, 0.052)], 10, k.BRS)
                seg.inside.lathe((x, y + 0.32, z + dz), (0, 1, 0), [(0, 0.05), (0.1, 0.03), (0.13, 0)], 10, k.IST, cap0=False)
    seg.inside.box((xc, top, z), (x1 - x0, 0.04, 0.46), k.WOOD)


# 前段（砲塔前方）：木材支撐的裝甲內壁、左側彈架、右側彈架
front_x0, front_x1 = TX + 1.0, LEN / 2 - 0.25
for seg in segs:
    a, b = max(seg.x_min + 0.1, front_x0), min(seg.x_max - 0.1, front_x1)
    if b - a > 0.5:
        timber_lining(k, seg, a, b)
        shell_rack(seg, a + 0.1, b - 0.1, -1)
        shell_rack(seg, a + 0.1, b - 0.1, 1, rows=2)

# 機槍塔下的踏台
for cx, cz, tag, _ in MG_CUPS:
    cupola_platform(k, seg_at(cx), cx, cz)

# 通用內裝（依各段位置分配）
for seg in segs:
    xs = [x for x in (-5.5, -1.0, 2.0, 6.4) if seg.x_min + 0.5 < x < seg.x_max - 0.5]
    if xs:
        seg.lamps(xs)
    skip = [(TX - 1.1, TX + 1.1), (-0.8, 0.8)]
    seg.wall_structure(skip=skip + [(front_x0, front_x1)], ceiling_skip=[(TX - 1.1, TX + 1.1)])
hi.voice_tube(drops=(TX - 1.2, 1.2))
# 車頂艙口（玩家上車頂用）：只開在低段車頂（遊戲的車頂高度以低段為準）
HATCH_X, HATCH_Z = (5.5, 0.0) if HIGH else (-3.6, -0.5)
seg_at(HATCH_X).hatch(HATCH_X, z=HATCH_Z)
ins_r = seg_at(-4.0)
seg_at(-4.0).rifle_rack(-2.9 if HIGH else -4.0, side=1)
seg_at(-7.2).locker(-7.3, -1)
seg_at(-7.2).locker(-7.3, 1)
seg_at(0.85).extinguisher(0.85, 1)
seg_at(0.95).first_aid(-0.95, -1)
seg_at(0.85).elec_box(0.85, -1)
seg_at(2.45).board(2.45, -1)
seg_at(1.6).phone(1.6, -1)
seg_at(-3.5).seats((-3.5, -6.2) if not HIGH else (-3.5,))
seg_at(-5.0).helmets(-5.6, -1)
seg_at(-1.6).crates(-1.6 if HIGH else -4.6)
if HIGH:
    # 乙車：上層高大的車內，沿走道一側的扶手欄杆
    for x in (-6.0, -4.0, -2.0, 0.0, 2.0):
        hi.inside.box((x, FLOOR + 0.45, 0.95), (0.04, 0.9, 0.04), k.IST)
    hi.inside.cylinder((-6.4, FLOOR + 0.9, 0.95), (2.3, FLOOR + 0.9, 0.95), 0.022, 8, k.IST)
    # 測距儀下方的登頂梯與傳聲管口
    for dz in (0.3, 0.65):
        hi.inside.box((RF_X + 0.6, (FLOOR + hi.ceil) / 2, dz), (0.05, hi.ceil - FLOOR, 0.05), k.IST)
    for j in range(1, int((hi.ceil - FLOOR) / 0.3)):
        hi.inside.cylinder((RF_X + 0.6, FLOOR + 0.3 * j, 0.3), (RF_X + 0.6, FLOOR + 0.3 * j, 0.65), 0.018, 6, k.IST)

# ───────────────────────────── 外部 ─────────────────────────────


for seg in segs:
    seg.side_details(doors=tuple(x for x in (0.0,) if seg.x_min < x < seg.x_max), slits=(), ports=(), handrails=False)
    xs = window_row(seg, keep_clear=[(-0.75, 0.75), (TX - 0.3, TX + 0.3)])
    windows(k, seg, xs, (2.45, 1.9))
    if seg is hi and RAISE > 0.8:
        windows(k, seg, xs[::2], (hi.wall_top - 0.25,))
    seg.rivets(skip=[(-0.7, 0.7)])
for seg in segs:
    seg.lifting_rings()
# 車端扶手
end_handrails(k, lo_f, LEN / 2 - 0.4)
end_handrails(k, segs[0], -LEN / 2 + 0.4)

# 乙車：圓形百葉通風口
if HIGH:
    for side in (-1, 1):
        zs = side * W / 2
        hi.det.lathe((0.9, 2.95, zs), (0, 0, side), [(0, 0.34), (0.04, 0.34), (0.05, 0.3), (0.05, 0)], 24, k.A, cap0=False)
        for j in range(7):
            y = 2.95 - 0.24 + j * 0.08
            half = math.sqrt(max(0.0, 0.3 ** 2 - (y - 2.95) ** 2))
            hi.det.box((0.9, y, zs + side * 0.06), (half * 2, 0.025, 0.03), k.ST)

# 加高段與低段的交界：朝低段車內那一面漆成車內色；加高段端面的鉚釘
for b in BOUNDS:
    toward = 1 if b > TX else -1
    bulkhead_face(k, seg_at(b + toward * 0.5), b, toward)
    step_rivets(k, hi, b, toward, ROOF, RAISE)

skirts_and_jacks(k, LEN)

# 機槍塔（可操作 2 座＋裝飾）
cups = MeshBuilder()
for cx, cz, tag, yaw in MG_CUPS:
    cupola(k, cups, cx, cz, ROOF, CUP_R)
for cx, cz, roof, yaw in DECO_CUPS:
    cupola(k, cups, cx, cz, roof, CUP_R, mg_dir_deg=yaw)
cups.build('MgCupolas', k.MATS, parent=kit.root, bevel=0.01)

for seg in segs:
    seg.finish()
kit.running_gear(LEN)

# ───────────────────────────── 十糎砲砲塔（多面體） ─────────────────────────────
turret = empty('Turret', kit.root, (TX, TURRET_Y, 0))
tb = MeshBuilder()
# 座圈
tb.lathe((0, 0, 0), (0, 1, 0), [(0, RING_R + 0.18), (0.22, RING_R + 0.12), (0.22, 0)], 48, k.A, cap0=False)


faceted_body(tb, 8, RING_R / math.cos(math.pi / 8) - 0.02, 0.92, 0.22, 0.72, 0.22 + BODY_H, k.A)
# 後部突出的彈藥室（平衡砲重）
tb.box((-1.35, 0.62, 0), (0.7, 0.8, 1.5), k.A)
tb.box((-1.35, 1.05, 0), (0.6, 0.06, 1.4), k.A)
# 頂部：車長潛望鏡、通風帽、艙蓋
tb.cylinder((-0.35, 0.22 + BODY_H, 0.45), (-0.35, 0.22 + BODY_H + 0.08, 0.45), 0.3, 20, k.A)
tb.box((-0.35, 0.22 + BODY_H + 0.1, 0.55), (0.04, 0.03, 0.3), k.ST)
tb.box((PIVOT[0] + 0.15, 0.22 + BODY_H + 0.1, -0.55), (0.26, 0.2, 0.2), k.A)
tb.box((PIVOT[0] + 0.29, 0.22 + BODY_H + 0.12, -0.55), (0.02, 0.06, 0.15), k.BLK)
tb.lathe((-0.6, 0.22 + BODY_H, -0.35), (0, 1, 0), [(0, 0.1), (0.12, 0.1), (0.16, 0.16), (0.2, 0)], 14, k.A, cap0=False)
# 側面觀察孔
for ang in (60, 120, 240, 300):
    a = math.radians(ang)
    r = RING_R - 0.12
    tb.box((math.cos(a) * r, 0.22 + 0.42, -math.sin(a) * r), (0.08, 0.05, 0.3), k.BLK)
# 正面砲盾開口框
tb.box((RING_R - 0.08, PIVOT[1], 0), (0.16, 1.0, 1.08), k.A)
tb.build('TurretBody', k.MATS, parent=turret, bevel=0.02)

tr = MeshBuilder()
for j in range(40):
    a = 2 * math.pi * j / 40
    tr.rivet((math.cos(a) * (RING_R + 0.01), 0.36, math.sin(a) * (RING_R + 0.01)), (math.cos(a), 0, math.sin(a)))
# 斜板接縫的鉚釘
for i in range(8):
    a = math.pi / 8 + 2 * math.pi * i / 8
    for t in (0.2, 0.45, 0.7):
        r = (RING_R - 0.02) + (0.92 - RING_R) * t
        tr.rivet((math.cos(a) * r, 0.72 + (BODY_H - 0.5) * t, -math.sin(a) * r), (math.cos(a), 0.6, -math.sin(a)))
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

# ───────────────────────────── 測距儀（乙車） ─────────────────────────────
if HIGH:
    # 基座、雙筒潛望鏡（操作手左側）
    det = MeshBuilder()
    det.lathe((RF_X, ROOF_HI, 0), (0, 1, 0), [(0, 0.45), (0.06, 0.42), (0.06, 0)], 24, k.A, cap0=False)
    det.lathe((RF_X, ROOF_HI + 0.06, 0), (0, 1, 0), [(0, 0.26), (0.54, 0.18), (0.54, 0)], 16, k.A, cap0=False)
    PX, PZ = RF_X + 0.9, -0.95
    det.cylinder((PX, ROOF_HI, PZ), (PX, ROOF_HI + 0.75, PZ), 0.07, 12, k.ST)
    det.box((PX, ROOF_HI + 0.85, PZ), (0.22, 0.2, 0.34), k.A)
    for dz in (-0.08, 0.08):
        det.cylinder((PX + 0.11, ROOF_HI + 0.9, PZ + dz), (PX + 0.2, ROOF_HI + 0.9, PZ + dz), 0.035, 10, k.ST)
        det.box((PX + 0.205, ROOF_HI + 0.9, PZ + dz), (0.01, 0.05, 0.05), k.GLS)
    # 操作手座椅（照片中兩名操作手坐在車頂）
    for dz in (-0.45, 0.45):
        det.box((RF_X - 0.55, ROOF_HI + 0.22, dz), (0.32, 0.05, 0.32), k.WOOD)
        det.cylinder((RF_X - 0.55, ROOF_HI, dz), (RF_X - 0.55, ROOF_HI + 0.2, dz), 0.03, 8, k.ST)
    # 車頂欄杆（操作位四周）
    for x in (RF_X - 1.1, RF_X + 1.4):
        for z in (-1.0, 1.0):
            det.cylinder((x, ROOF_HI, z), (x, ROOF_HI + 0.6, z), 0.02, 6, k.ST)
    for z in (-1.0, 1.0):
        det.cylinder((RF_X - 1.1, ROOF_HI + 0.6, z), (RF_X + 1.4, ROOF_HI + 0.6, z), 0.02, 6, k.ST)
    det.build('RangefinderMount', k.MATS, parent=kit.root, bevel=0.008)

    rf = empty('RF_Yaw', kit.root, (RF_X, ROOF_HI + 0.78, 0))
    rm = MeshBuilder()
    rm.cylinder((0, -0.18, 0), (0, 0, 0), 0.08, 12, k.ST)
    rm.cylinder((0, 0, -1.3), (0, 0, 1.3), 0.11, 18, k.ST)
    for sz in (-1, 1):
        rm.box((0, 0, sz * 1.3), (0.28, 0.28, 0.2), k.A)
        rm.box((0.141, 0.0, sz * 1.3), (0.01, 0.12, 0.12), k.GLS)
        rm.lathe((0, 0, sz * 1.15), (0, 0, sz), [(0, 0.13), (0.03, 0.13), (0.03, 0)], 18, k.A, cap0=False)
    rm.box((-0.2, 0.0, 0), (0.22, 0.16, 0.3), k.A)
    rm.cylinder((-0.31, 0.04, -0.07), (-0.36, 0.04, -0.07), 0.025, 10, k.BLK)
    rm.cylinder((-0.31, 0.04, 0.07), (-0.36, 0.04, 0.07), 0.025, 10, k.BLK)
    rm.cylinder((-0.12, -0.05, 0.2), (-0.12, -0.05, 0.32), 0.04, 10, k.ST)
    rm.build('RF_Tube', k.MATS, parent=rf, bevel=0.006)
    empty('RF_Anchor', rf, (0, 0.2, 0))

# ───────────────────────────── 九二式重機槍（機槍塔內） ─────────────────────────────
for cx, cz, tag, yaw in MG_CUPS:
    a = math.radians(yaw)
    pos = (cx + math.cos(a) * CUP_R, MG_Y, cz - math.sin(a) * CUP_R)
    kit.mg(tag, pos, yaw, 75, f'{CN} {"左" if tag == "L" else "右"}側機槍', housing=0.2)

if 'INTERIOR' in ARGS:
    kit.interior_shots(NAME, [
        ('front', (TX, 2.2, 0.0), (-5.0, 2.9, 0.2), 18),
        ('rack', (6.5, 1.9, -1.2), (2.2, 2.6, 0.6), 22),
        ('rear', (-6.0, 2.2, 0.0), (2.0, 2.9, 0.2), 18),
    ])
else:
    kit.export(NAME, cam_target=(0, 2.6, 0), cam_pos=(-13, 7.0, -14))
