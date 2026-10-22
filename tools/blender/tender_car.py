"""炭水車（輔助炭水車，附機槍）建模腳本。

執行：
  blender -b --factory-startup -P tools/blender/tender_car.py
  （加參數 -- inside 另外渲染車內視角到 docs/preview/tender_car_inside.png）

節點：MG_L_* / MG_R_*、Wheelset_*
車內：左側煤倉、右側水櫃，中央走道 |lat|<1.1 保持暢通。
尺寸須與 src/train/carModels.js 的 buildTender 一致。
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import script_args, render_preview, PROJECT  # noqa: E402
from parts import Kit, FLOOR, Y0  # noqa: E402

LEN, W = 10.0, 3.1
MG_X, MG_Y = 0.8, 2.3
HATCH_X = -2.6
BUNKER = (-4.4, -0.6)    # 前段：左煤倉、右水櫃
REAR_TANK = (2.0, 4.4)   # 後段：兩側低水櫃
CN = '炭水車'

kit = Kit('TenderCar')
k = kit
hull = kit.hull(length=LEN, w=W)
ins = hull.inside
hw = hull.hw_in
WALK = 1.1

# ── 煤倉（左側）：斜底煤斗、擋煤板、煤堆、出煤口 ──
b0, b1 = BUNKER
blen = b1 - b0
bc = (b0 + b1) / 2
ins.prism([(-hw, FLOOR), (-WALK - 0.02, FLOOR), (-WALK - 0.02, 1.75), (-hw, 2.35)], b0, b1, k.IST)   # 斜底
ins.prism([(-hw, 2.35), (-WALK - 0.02, 1.75), (-WALK - 0.06, 2.05), (-1.3, 2.45), (-hw, 2.62)], b0 + 0.05, b1 - 0.05, k.COAL)  # 煤堆
for x in (b0, b1):
    ins.box((x, 2.0, -(hw + WALK) / 2), (0.05, 1.4, hw - WALK), k.IST)
ins.box((bc, 1.6, -WALK), (blen, 0.6, 0.04), k.IST)          # 擋煤板
for x in (b0 + 0.6, bc, b1 - 0.6):
    ins.box((x, 1.6, -WALK + 0.03), (0.06, 0.62, 0.04), k.ST)
ins.box((bc, 1.42, -WALK + 0.03), (0.6, 0.22, 0.03), k.ST)   # 出煤口閘門
ins.box((bc + 0.33, 1.42, -WALK + 0.07), (0.05, 0.05, 0.08), k.BRS)
for j in range(5):                                            # 散落的煤塊
    ins.box((b0 + 0.5 + j * 0.7, FLOOR + 0.03, -WALK + 0.12 + (j % 2) * 0.1), (0.1, 0.06, 0.08), k.COAL)
# 煤鏟與火鉤（靠在擋煤板）
ins.box((b1 - 0.3, FLOOR + 0.55, -WALK + 0.07), (0.04, 1.1, 0.04), k.WOOD)
ins.box((b1 - 0.3, FLOOR + 0.06, -WALK + 0.12), (0.24, 0.04, 0.2), k.ST)
ins.cylinder((b0 + 0.35, FLOOR + 0.02, -WALK + 0.08), (b0 + 0.45, FLOOR + 1.2, -WALK + 0.06), 0.015, 6, k.ST)

# ── 水櫃（右側）：鉚接鋼板水箱、注水管、水位計、閥 ──
ins.box((bc, 1.95, (hw + WALK) / 2), (blen, 1.3, hw - WALK), k.ST)
for x in [b0 + 0.3 + j * 0.3 for j in range(int(blen / 0.3))]:
    for y in (1.35, 2.58):
        ins.rivet((x, y, WALK), (0, 0, -1), r=0.016)
for x in (b0 + 1.2, b1 - 1.2):
    ins.box((x, 1.95, WALK - 0.01), (0.05, 1.3, 0.03), k.ST)
ins.cylinder((b1 - 0.35, 1.45, WALK - 0.06), (b1 - 0.35, 2.55, WALK - 0.06), 0.03, 10, k.GLS)  # 水位計
for y in (1.45, 2.55):
    ins.box((b1 - 0.35, y, WALK - 0.06), (0.08, 0.07, 0.08), k.BRS)
ins.lathe((b0 + 0.5, 1.5, WALK), (0, 0, -1), [(0, 0.05), (0.15, 0.05)], 10, k.BRS)            # 出水閥
ins.lathe((b0 + 0.5, 1.5, WALK - 0.15), (0, 0, -1), [(0, 0.11), (0.02, 0.11), (0.02, 0.08), (0, 0.08)], 14, k.RED, closed=True)
ins.cylinder((b0 + 0.9, 2.6, (hw + WALK) / 2), (b0 + 0.9, hull.ceil, (hw + WALK) / 2), 0.08, 12, k.ST)  # 注水管通車頂

# ── 後段兩側低水櫃 ──
t0, t1 = REAR_TANK
for side in (-1, 1):
    zc = side * (hw + WALK) / 2
    ins.box(((t0 + t1) / 2, FLOOR + 0.45, zc), (t1 - t0, 0.9, hw - WALK), k.ST)
    ins.box(((t0 + t1) / 2, FLOOR + 0.92, zc), (t1 - t0 + 0.04, 0.04, hw - WALK + 0.02), k.IST)
    for x in [t0 + 0.25 + j * 0.3 for j in range(int((t1 - t0) / 0.3))]:
        ins.rivet((x, FLOOR + 0.82, side * WALK), (0, 0, -side), r=0.016)
    ins.lathe((t1 - 0.4, FLOOR + 0.94, zc), (0, 1, 0), [(0, 0.12), (0.06, 0.12), (0.08, 0)], 14, k.ST)  # 人孔蓋
    ins.cylinder((t0 + 0.3, FLOOR + 0.6, side * WALK), (t0 + 0.3, FLOOR + 0.6, side * (WALK - 0.15)), 0.04, 8, k.CU)
# 兩水櫃間的連通管（貼地）
ins.cylinder((t0 + 0.3, FLOOR + 0.06, -WALK), (t0 + 0.3, FLOOR + 0.06, WALK), 0.05, 10, k.CU)

# ── 共用內裝 ──
hull.lamps((-3.0, 0.8, 3.6))
hull.hatch(HATCH_X)
hull.wall_structure(skip=[(b0 - 0.1, b1 + 0.1), (t0 - 0.1, t1 + 0.1)])
hull.voice_tube(drops=(1.6,))
hull.inner_ports((-0.2,), sides=(-1, 1))
hull.mg_post(MG_X)
hull.extinguisher(4.75, 1)
hull.first_aid(-4.75, 1, y=2.2)
hull.phone(1.9, 1, y=2.2)
hull.helmets(4.55, -1, n=1)
hull.board(-0.3, 1, w=0.5, h=0.4, y=2.45)

# ── 外部 ──
hull.side_details(doors=(), slits=(-3.6, 3.4), ports=(-0.2,))
for side in (-1, 1):
    hull.mg_ring(MG_X, MG_Y, side)
r = hull.roof
# 車頂注水口蓋（加鉸鏈與把手）
hull.det.lathe((-3.5, r, 0.35), (0, 1, 0), [(0, 0.36), (0.12, 0.34), (0.12, 0)], 24, k.A, cap0=False)
hull.det.lathe((-3.5, r + 0.12, 0.35), (0, 1, 0), [(0, 0.38), (0.05, 0.36), (0.07, 0)], 24, k.A, cap0=False)
hull.det.cylinder((-3.88, r + 0.14, 0.15), (-3.88, r + 0.14, 0.55), 0.035, 8, k.ST)
hull.det.box((-3.15, r + 0.21, 0.35), (0.05, 0.05, 0.25), k.ST)
hull.vents((3.6,))
hull.lifting_rings()
hull.rivets()
hull.finish()
kit.running_gear(LEN)

# ── 九二式重機槍 ──
kit.mg('L', (MG_X, MG_Y, -W / 2), 90, 75, f'{CN} 左側機槍')
kit.mg('R', (MG_X, MG_Y, W / 2), -90, 75, f'{CN} 右側機槍')

kit.export('tender_car', cam_target=(0, 2.2, 0), cam_pos=(-11, 6.0, -12))
if 'inside' in script_args():
    render_preview(os.path.join(PROJECT, 'docs', 'preview', 'tender_car_inside.png'), target=(-4.5, 2.0, 0.0), cam_pos=(4.6, 2.95, 0.15))
