"""炭水車（輔助炭水車，附機槍）建模腳本。

依《世界裝甲列車圖解百科》照片：敞頂、垂直裝甲側牆；前段（靠機關車）兩側煤倉，後段兩側水櫃，
水櫃頂共 6 個圓形注水口；左側有可收回的機槍突出座（上有小型機槍塔），右側有側門。

執行：
  blender -b --factory-startup -P tools/blender/tender_car.py
  （加參數 -- interior 只渲染車內檢查圖到暫存資料夾，不輸出模型）

節點：MG_L_* / MG_R_*、Wheelset_*
車內：中央走道 |lat|<1.1 保持暢通（敞頂，遊戲判定為暴露區）。
尺寸須與 src/train/carModels.js 的 buildTender 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, script_args  # noqa: E402
from parts import Kit, FLOOR, Y0  # noqa: E402

LEN, W, H = 10.0, 3.1, 2.3
MG_X = 0.5
MG_L_Y, MG_L_Z = 2.55, -(W / 2 + 0.32)   # 左：突出座上的小機槍塔
MG_R_Y = 2.3                             # 右：球形槍架
COAL = (1.1, 4.7)        # 前段：兩側煤倉
TANK = (-4.7, -0.1)      # 後段：兩側水櫃
TANK_TOP = 2.75
DOOR_X = -2.4            # 右側門
CN = '炭水車'

kit = Kit('TenderCar')
k = kit
hull = kit.hull(length=LEN, w=W, h=H, open_top=True)
ins = hull.inside
hw = hull.hw_in
WALK = 1.1
TOP = Y0 + H

# ── 煤倉（前段兩側）：斜底煤斗、擋煤板、煤堆、出煤口 ──
c0, c1 = COAL
cc = (c0 + c1) / 2
for side in (-1, 1):
    def zz(pts):
        return [(side * z, y) for z, y in pts] if side > 0 else [(side * z, y) for z, y in pts][::-1]
    ins.prism(zz([(WALK + 0.02, FLOOR), (hw, FLOOR), (hw, 2.35), (WALK + 0.02, 1.75)]), c0, c1, k.IST)        # 斜底
    ins.prism(zz([(WALK + 0.02, 1.75), (hw, 2.35), (hw, 2.95), (1.3, 2.7), (WALK + 0.06, 2.1)]), c0 + 0.05, c1 - 0.05, k.COAL)  # 煤堆
    for x in (c0, c1):
        ins.box((x, 2.1, side * (hw + WALK) / 2), (0.05, 1.6, hw - WALK), k.IST)
    ins.box((cc, 1.65, side * WALK), (c1 - c0, 0.7, 0.04), k.IST)             # 擋煤板
    for x in (c0 + 0.6, cc, c1 - 0.6):
        ins.box((x, 1.65, side * (WALK - 0.03)), (0.06, 0.72, 0.04), k.ST)
    ins.box((cc, 1.42, side * (WALK - 0.03)), (0.6, 0.22, 0.03), k.ST)       # 出煤口閘門
    ins.box((cc + 0.33, 1.42, side * (WALK - 0.07)), (0.05, 0.05, 0.08), k.BRS)
    for j in range(4):                                                        # 散落的煤塊
        ins.box((c0 + 0.5 + j * 0.8, FLOOR + 0.03, side * (WALK - 0.12 - (j % 2) * 0.1)), (0.1, 0.06, 0.08), k.COAL)
# 煤鏟與火鉤（靠在左擋煤板）
ins.box((c0 + 0.3, FLOOR + 0.55, -(WALK - 0.07)), (0.04, 1.1, 0.04), k.WOOD)
ins.box((c0 + 0.3, FLOOR + 0.06, -(WALK - 0.12)), (0.24, 0.04, 0.2), k.ST)
ins.cylinder((c1 - 0.35, FLOOR + 0.02, WALK - 0.08), (c1 - 0.45, FLOOR + 1.2, WALK - 0.06), 0.015, 6, k.ST)

# ── 水櫃（後段兩側）：鉚接鋼板水箱、櫃頂 6 個圓形注水口、水位計、閥、連通管 ──
t0, t1 = TANK
tc = (t0 + t1) / 2
for side in (-1, 1):
    zc = side * (hw + WALK) / 2
    ins.box((tc, (FLOOR + TANK_TOP) / 2, zc), (t1 - t0, TANK_TOP - FLOOR, hw - WALK), k.ST)
    ins.box((tc, TANK_TOP + 0.02, zc), (t1 - t0 + 0.04, 0.04, hw - WALK + 0.02), k.IST)
    for x in [t0 + 0.2 + j * 0.3 for j in range(int((t1 - t0) / 0.3))]:
        for y in (FLOOR + 0.08, TANK_TOP - 0.08):
            ins.rivet((x, y, side * WALK), (0, 0, -side), r=0.016)
    for x in (t0 + 1.5, t1 - 1.5):
        ins.box((x, (FLOOR + TANK_TOP) / 2, side * (WALK - 0.01)), (0.05, TANK_TOP - FLOOR, 0.03), k.ST)
    for x in (t0 + 0.75, tc, t1 - 0.75):                                     # 注水口（附鉸鏈與把手）
        ins.lathe((x, TANK_TOP + 0.04, zc), (0, 1, 0), [(0, 0.24), (0.1, 0.24), (0.1, 0)], 22, k.ST, cap0=False)
        ins.lathe((x, TANK_TOP + 0.14, zc), (0, 1, 0), [(0, 0.27), (0.04, 0.26), (0.06, 0)], 22, k.ST, cap0=False)
        ins.cylinder((x - 0.29, TANK_TOP + 0.16, zc - 0.12), (x - 0.29, TANK_TOP + 0.16, zc + 0.12), 0.025, 8, k.ST)
        ins.box((x + 0.24, TANK_TOP + 0.21, zc), (0.05, 0.04, 0.16), k.ST)
    ins.cylinder((t1 - 0.35, 1.5, side * (WALK - 0.06)), (t1 - 0.35, 2.6, side * (WALK - 0.06)), 0.03, 10, k.GLS)  # 水位計
    for y in (1.5, 2.6):
        ins.box((t1 - 0.35, y, side * (WALK - 0.06)), (0.08, 0.07, 0.08), k.BRS)
ins.lathe((t0 + 0.6, 1.55, WALK), (0, 0, -1), [(0, 0.05), (0.15, 0.05)], 10, k.BRS)                 # 出水閥
ins.lathe((t0 + 0.6, 1.55, WALK - 0.15), (0, 0, -1), [(0, 0.11), (0.02, 0.11), (0.02, 0.08), (0, 0.08)], 14, k.RED, closed=True)
ins.cylinder((t1 - 0.3, FLOOR + 0.06, -WALK), (t1 - 0.3, FLOOR + 0.06, WALK), 0.05, 10, k.CU)        # 連通管（貼地）
for x in (t1 - 0.45, t1 - 0.15):
    ins.box((x, FLOOR + 0.03, 0), (0.08, 0.06, 0.14), k.ST)
# 往機關車的進水軟管（前端）
for side in (-1, 1):
    ins.cylinder((t1 - 0.05, FLOOR + 0.3, side * WALK), (c0 - 0.1, FLOOR + 0.3, side * WALK), 0.06, 10, k.CU)

# ── 機槍突出座（左，內側：開口框、踏台、彈藥箱） ──
ins.box((MG_X, FLOOR + 1.85, -(hw - 0.03)), (1.1, 0.06, 0.06), k.IST)
for dx in (-0.55, 0.55):
    ins.box((MG_X + dx, FLOOR + 0.95, -(hw - 0.04)), (0.06, 1.9, 0.08), k.IST)
ins.box((MG_X, 2.05, -(hw - 0.005)), (1.0, 0.8, 0.01), k.BLK)                # 通往突出座的開口
ins.box((MG_X, FLOOR + 0.15, -(hw - 0.35)), (0.9, 0.3, 0.6), k.WOOD)      # 踏台
hull.mg_post(MG_X + 1.4, sides=(1,))
for j in range(3):
    ins.box((MG_X - 0.75, FLOOR + 0.4 + 0.09 + j * 0.18, -(hw - 0.2)), (0.34, 0.17, 0.3), k.OLV)

# ── 共用內裝 ──
hull.wall_structure(skip=[(c0 - 0.1, c1 + 0.1), (t0 - 0.1, t1 + 0.1), (MG_X - 0.6, MG_X + 0.6)], pipes=False)
hull.extinguisher(4.75, 1)
hull.first_aid(-4.85, -1, y=2.2)
hull.phone(1.1 - 0.5, 1, y=2.2)
# 牆頂扶手與遮陽帆布捲
for side in (-1, 1):
    ins.cylinder((-LEN / 2 + 0.3, TOP - 0.25, side * (hw - 0.06)), (LEN / 2 - 0.3, TOP - 0.25, side * (hw - 0.06)), 0.02, 8, k.ST)
    for x in (-4.0, -1.0, 2.0, 4.5):
        ins.box((x, TOP - 0.25, side * (hw - 0.03)), (0.04, 0.04, 0.06), k.ST)
ins.cylinder((-LEN / 2 + 0.4, TOP + 0.08, 1.5), (LEN / 2 - 0.4, TOP + 0.08, 1.5), 0.09, 12, k.CNV)

# ───────────────────────────── 外部 ─────────────────────────────
hull.side_details(doors=(DOOR_X,), slits=(3.4,), ports=(-0.6,), sides=(1,))
hull.side_details(doors=(), slits=(3.4, -2.4), ports=(), sides=(-1,))
hull.mg_ring(MG_X, MG_R_Y, 1)
d = hull.det
# 牆頂加強緣
for side in (-1, 1):
    d.box((0, TOP - 0.03, side * (W / 2 + 0.015)), (LEN, 0.06, 0.03), k.ST)
for sx in (1, -1):
    d.box((sx * (LEN / 2 + 0.015), TOP - 0.03, 0), (0.03, 0.06, W), k.ST)
# 機槍突出座（左）：外伸箱體＋小型圓柱機槍塔，滑軌與收回用手柄
zs = -W / 2
SP = 0.42
d.box((MG_X, 2.05, zs - SP / 2), (1.15, 0.9, SP), k.A)
d.prism([(zs - SP, 1.6), (zs, 1.6), (zs, 1.25)], MG_X - 0.575, MG_X + 0.575, k.A)    # 下方斜撐板
for dx in (-0.62, 0.62):
    d.box((MG_X + dx, 1.95, zs - 0.12), (0.06, 0.08, 0.24), k.ST)                   # 滑軌
d.lathe((MG_X, 2.5, MG_L_Z + 0.02), (0, 1, 0), [(0, 0.36), (0.32, 0.36), (0.36, 0.3), (0.4, 0)], 22, k.A)  # 小機槍塔
d.lathe((MG_X, 2.62, MG_L_Z + 0.02), (0, 1, 0), [(0, 0.365), (0.04, 0.365)], 22, k.BLK, cap0=False, cap1=False)
d.box((MG_X, 2.95, MG_L_Z + 0.02), (0.22, 0.05, 0.12), k.ST)
# 右側門：鉸鏈、把手、踏階
for y in (1.55, 2.55):
    d.cylinder((DOOR_X - 0.5, y - 0.08, W / 2 + 0.04), (DOOR_X - 0.5, y + 0.08, W / 2 + 0.04), 0.03, 8, k.ST)
d.box((DOOR_X + 0.4, 2.0, W / 2 + 0.05), (0.04, 0.2, 0.04), k.ST)
for y in (0.6, 0.95):
    d.box((DOOR_X, y, W / 2 + 0.12), (0.5, 0.04, 0.24), k.ST)
d.box((DOOR_X, 0.8, W / 2 + 0.03), (0.5, 0.45, 0.04), k.ST)
hull.rivets()
hull.finish()
kit.running_gear(LEN)

# ── 九二式重機槍 ──
kit.mg('L', (MG_X, MG_L_Y, MG_L_Z), 90, 75, f'{CN} 左側機槍', housing=0.2)
kit.mg('R', (MG_X, MG_R_Y, W / 2), -90, 75, f'{CN} 右側機槍')

if 'interior' in script_args():
    kit.interior_shots('tender_car', [
        ('front', (-4.6, 2.9, 0.0), (4.5, 2.0, 0.0), 18),
        ('top', (-6.5, 5.5, 2.5), (0.0, 2.2, 0.0), 22),
        ('mg', (1.5, 2.8, 0.8), (MG_X, 2.4, -1.6), 20),
    ], lights_x=(-3.0, 0.5, 3.5))
else:
    kit.export('tender_car', cam_target=(0, 2.2, 0), cam_pos=(-11, 6.5, -12))
