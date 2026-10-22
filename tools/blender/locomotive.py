"""機關車（滿鐵ミカイ型 2-8-2，加裝甲）建模腳本。

執行：
  blender -b --factory-startup -P tools/blender/locomotive.py
  （加參數 -- inside 另外渲染駕駛室後方視角到 docs/preview/locomotive_cab.png）

節點：Chimney（煙囪口，遊戲由此冒煙）、Wheelset_*（radius）
可走動區（遊戲判定，不可擋住）：
  前平台 x∈[5.55, 6.75] 全寬；右側腳踏板 x∈[-5.6, 5.55]、z∈[1.45, 1.8]、y=1.3；後平台 x∈[-6.75, -5.6] 全寬
尺寸須與 src/train/carModels.js 的 buildLocomotive 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, empty, script_args, render_preview, PROJECT  # noqa: E402
from parts import Kit, FLOOR  # noqa: E402

LEN = 13.5
HL = LEN / 2
CASE_X0, CASE_X1 = -2.2, 5.5      # 鍋爐裝甲罩（前端讓出前平台）
CASE_W, CASE_H, CASE_C, CASE_Y = 2.8, 2.3, 0.6, 1.25
CASE_TOP = CASE_Y + CASE_H
CAB_X0, CAB_X1 = -5.6, -2.2
CAB_W, CAB_H, CAB_Y = 2.7, 2.9, 1.1
CAB_TOP = CAB_Y + CAB_H
BOARD_Z = 1.62                    # 腳踏板中心
RAIL_Z = 1.88                     # 外側扶手

kit = Kit('Locomotive')
k = kit


def case_profile():
    hw = CASE_W / 2
    return [(-hw, CASE_Y), (hw, CASE_Y), (hw, CASE_Y + CASE_H - CASE_C), (hw - CASE_C, CASE_TOP),
            (-hw + CASE_C, CASE_TOP), (-hw, CASE_Y + CASE_H - CASE_C)]


# ───────────────────────────── 主車架、緩衝樑、連結器 ─────────────────────────────
fr = MeshBuilder()
for z in (-0.55, 0.55):
    fr.box((0.3, 0.98, z), (LEN - 1.2, 0.5, 0.1), k.ST)  # 上緣 1.23，低於地板
for x in (-5.2, -3.6, -1.8, 0.0, 1.7, 3.4, 5.0):
    fr.box((x, 1.05, 0), (0.12, 0.4, 1.0), k.ST)
for sx in (1, -1):
    xe = sx * (HL - 0.2)
    fr.box((xe, 1.0, 0), (0.3, 0.5, 2.9), k.A)
    fr.box((sx * (HL + 0.2), 0.9, 0), (0.55, 0.16, 0.2), k.ST)
    fr.box((sx * (HL + 0.5), 0.9, 0), (0.22, 0.32, 0.34), k.ST)
    fr.box((sx * (HL + 0.6), 0.9, 0.08), (0.12, 0.26, 0.12), k.ST)
    fr.cylinder((sx * (HL + 0.05), 0.85, 0.55), (sx * (HL + 0.3), 0.6, 0.55), 0.035, 8, k.BLK)
# 排障器（前端楔形格柵）
for j in range(7):
    z = -1.2 + j * 0.4
    fr.box((HL + 0.35, 0.45, z), (0.08, 0.5, 0.06), k.ST)
fr.box((HL + 0.3, 0.72, 0), (0.12, 0.08, 2.6), k.ST)
fr.box((HL + 0.42, 0.22, 0), (0.12, 0.08, 2.6), k.ST)

# 汽缸（前方兩側）與汽室
for s in (-1, 1):
    fr.lathe((4.3, 0.95, s * 1.08), (1, 0, 0), [(0, 0.34), (0.05, 0.36), (1.05, 0.36), (1.1, 0.34)], 24, k.ST, cap0=True, cap1=True)
    fr.box((4.85, 1.18, s * 0.95), (0.9, 0.18, 0.28), k.ST)
    # 十字頭導桿、活塞桿
    fr.box((3.55, 1.08, s * 1.08), (1.5, 0.05, 0.08), k.ST)
    fr.box((3.55, 0.82, s * 1.08), (1.5, 0.05, 0.08), k.ST)
    fr.cylinder((4.3, 0.95, s * 1.08), (3.0, 0.95, s * 1.08), 0.035, 8, k.GUN)
    fr.box((2.95, 0.95, s * 1.08), (0.18, 0.22, 0.12), k.GUN)
    # 主連桿（十字頭 → 第三動輪曲柄）、側連桿（連結四軸）
    fr.cylinder((2.95, 0.95, s * 1.0), (0.8, 0.69 - 0.32, s * 0.95), 0.05, 8, k.GUN)
    fr.box((-0.08, 0.69 - 0.32, s * 0.88), (5.5, 0.1, 0.05), k.GUN)
    # 撒砂管
    for x in (-0.95, 0.8):
        fr.cylinder((x + 0.4, 1.25, s * 0.85), (x + 0.6, 0.35, s * 0.85), 0.015, 6, k.ST)
# 導輪、從輪轉向架框
fr.box((4.9, 0.55, 0), (1.0, 0.18, 1.6), k.ST)
fr.box((-4.6, 0.6, 0), (1.1, 0.2, 1.7), k.ST)
for s in (-1, 1):
    fr.box((-4.6, 0.55, s * 0.92), (0.35, 0.3, 0.18), k.ST)
    fr.box((4.9, 0.45, s * 0.92), (0.3, 0.26, 0.16), k.ST)

# 裝甲裙板（遮住動輪上半部，外緣 z=1.40 以內）
for s in (-1, 1):
    fr.box((0.9, 1.02, s * 1.37), (8.6, 0.56, 0.05), k.A)
    fr.box((0.9, 0.76, s * 1.37), (8.6, 0.05, 0.07), k.ST)
fr.build('Frame', k.MATS, parent=k.root, bevel=0.01)

# ───────────────────────────── 走道：前平台、腳踏板、後平台、扶手 ─────────────────────────────
wk = MeshBuilder()
wk.box((HL - 0.6, FLOOR - 0.04, 0), (1.2, 0.08, 3.6), k.A)                 # 前平台
wk.box((-HL + 0.575, FLOOR - 0.04, 0), (1.15, 0.08, 3.6), k.A)            # 後平台
for s in (-1, 1):
    wk.box((-0.025, FLOOR - 0.03, s * BOARD_Z), (11.15, 0.06, 0.4), k.A)  # 腳踏板
    for x in [-5.0 + 1.6 * j for j in range(7)]:
        wk.box((x, FLOOR - 0.12, s * BOARD_Z), (0.06, 0.16, 0.38), k.ST)  # 托架
    # 外側扶手：立柱 + 上下兩道橫桿
    posts = [-5.5 + 1.83 * j for j in range(7)]
    for x in posts:
        wk.cylinder((x, FLOOR, s * RAIL_Z), (x, FLOOR + 1.0, s * RAIL_Z), 0.02, 8, k.ST)
    wk.cylinder((posts[0], FLOOR + 1.0, s * RAIL_Z), (posts[-1], FLOOR + 1.0, s * RAIL_Z), 0.018, 8, k.ST)
    wk.cylinder((posts[0], FLOOR + 0.5, s * RAIL_Z), (posts[-1], FLOOR + 0.5, s * RAIL_Z), 0.014, 8, k.ST)
    # 前後平台角落踏階
    for xe in (HL - 0.25, -HL + 0.25):
        for y in (0.55, 0.95):
            wk.box((xe, y, s * 1.62), (0.35, 0.04, 0.3), k.ST)
        wk.box((xe, 0.85, s * 1.78), (0.35, 0.8, 0.04), k.ST)
    # 鍋爐罩上的扶手（腳踏板內側）
    wk.cylinder((CASE_X0 + 0.2, 2.6, s * (CASE_W / 2 + 0.06)), (CASE_X1 - 0.3, 2.6, s * (CASE_W / 2 + 0.06)), 0.018, 8, k.BRS)
    for x in (CASE_X0 + 0.3, 1.6, CASE_X1 - 0.4):
        wk.cylinder((x, 2.6, s * CASE_W / 2), (x, 2.6, s * (CASE_W / 2 + 0.07)), 0.014, 6, k.ST)
# 前平台欄杆
for s in (-1, 1):
    wk.cylinder((HL - 0.05, FLOOR, s * 1.2), (HL - 0.05, FLOOR + 0.9, s * 1.2), 0.02, 8, k.ST)
wk.build('Walkways', k.MATS, parent=k.root, bevel=0.006)

# ───────────────────────────── 鍋爐裝甲罩與其上配件 ─────────────────────────────
cs = MeshBuilder()
cs.prism(case_profile(), CASE_X0, CASE_X1, k.A)
# 煙室門（前面圓門與鉸鏈）
cs.lathe((CASE_X1, 2.35, 0), (1, 0, 0), [(0, 0.82), (0.05, 0.82), (0.07, 0.75), (0.1, 0.3), (0.12, 0)], 32, k.A, cap0=False)
for y in (2.0, 2.7):
    cs.box((CASE_X1 + 0.08, y, -0.7), (0.06, 0.08, 0.35), k.ST)
cs.cylinder((CASE_X1 + 0.12, 2.35, -0.25), (CASE_X1 + 0.12, 2.35, 0.25), 0.03, 8, k.ST)
# 前照燈
cs.lathe((CASE_X1 - 0.1, CASE_TOP + 0.25, 0), (1, 0, 0), [(0, 0.2), (0.35, 0.2), (0.38, 0.17)], 18, k.A, cap0=True, cap1=False)
cs.lathe((CASE_X1 + 0.27, CASE_TOP + 0.25, 0), (1, 0, 0), [(0, 0.16), (0.01, 0)], 18, k.GLS)
cs.box((CASE_X1 - 0.1, CASE_TOP + 0.05, 0), (0.25, 0.1, 0.25), k.ST)
# 煙囪（頂端 y=4.3）
cs.lathe((5.4 - 0.3, CASE_TOP - 0.02, 0), (0, 1, 0), [(0, 0.42), (0.1, 0.34), (0.12, 0.3), (0.7, 0.3), (0.72, 0.36), (0.77, 0.36), (0.77, 0.26)], 24, k.A, cap0=False, cap1=False)
cs.lathe((5.4 - 0.3, CASE_TOP + 0.6, 0), (0, 1, 0), [(0, 0.26), (0.0, 0)], 24, k.BLK)
# 汽室圓頂、沙箱、安全閥、汽笛
cs.lathe((2.4, CASE_TOP - 0.02, 0), (0, 1, 0), [(0, 0.55), (0.08, 0.45), (0.45, 0.42), (0.55, 0.36), (0.62, 0.2), (0.64, 0)], 24, k.A, cap0=False)
cs.box((0.6, CASE_TOP + 0.22, 0), (0.9, 0.45, 0.75), k.A)
cs.box((0.6, CASE_TOP + 0.47, 0), (0.95, 0.05, 0.8), k.A)
for dz in (-0.12, 0.12):
    cs.lathe((-1.4, CASE_TOP - 0.02, dz), (0, 1, 0), [(0, 0.07), (0.25, 0.06), (0.27, 0.09), (0.32, 0.09), (0.34, 0)], 12, k.BRS, cap0=False)
cs.lathe((-1.85, CASE_TOP - 0.02, 0.35), (0, 1, 0), [(0, 0.04), (0.2, 0.035), (0.22, 0.06), (0.45, 0.06), (0.47, 0.03), (0.5, 0)], 12, k.BRS, cap0=False)
# 檢修門（兩側）
for s in (-1, 1):
    for x in (-1.0, 1.6, 4.0):
        cs.box((x, 2.0, s * (CASE_W / 2 + 0.012)), (0.9, 0.6, 0.025), k.A)
        cs.box((x + 0.36, 2.0, s * (CASE_W / 2 + 0.03)), (0.04, 0.16, 0.03), k.ST)
        for y in (1.82, 2.18):
            cs.cylinder((x - 0.45, y - 0.06, s * (CASE_W / 2 + 0.03)), (x - 0.45, y + 0.06, s * (CASE_W / 2 + 0.03)), 0.022, 8, k.ST)
    # 觀察孔
    cs.box((4.8, 2.75, s * (CASE_W / 2 + 0.005)), (0.4, 0.05, 0.02), k.BLK)
# 空氣壓縮機（左側，在裝甲罩與腳踏板之間外露）
cs.lathe((-0.2, 1.65, -1.48), (0, 1, 0), [(0, 0.0), (0.0, 0.11), (0.7, 0.11), (0.7, 0)], 14, k.ST)
cs.build('BoilerCasing', k.MATS, parent=k.root, bevel=0.025)

# ───────────────────────────── 駕駛室（後方開放） ─────────────────────────────
cab = MeshBuilder()
hw = CAB_W / 2
cab_len = CAB_X1 - CAB_X0
cx = (CAB_X0 + CAB_X1) / 2
for s in (-1, 1):
    # 側牆（窗以下、窗間、窗以上）
    cab.box((cx, CAB_Y + 0.95, s * (hw - 0.04)), (cab_len, 1.9, 0.08), k.A)
    cab.box((cx, CAB_TOP - 0.3, s * (hw - 0.04)), (cab_len, 0.6, 0.08), k.A)
    cab.box((CAB_X1 - 0.35, CAB_Y + 2.15, s * (hw - 0.04)), (0.7, 0.4, 0.08), k.A)
    cab.box((CAB_X0 + 0.35, CAB_Y + 2.15, s * (hw - 0.04)), (0.7, 0.4, 0.08), k.A)
    cab.box((cx, CAB_Y + 2.15, s * (hw - 0.04)), (0.6, 0.4, 0.08), k.A)
    # 側窗（觀察孔與裝甲窗蓋）
    for x in (CAB_X1 - 1.0, CAB_X0 + 1.0):
        cab.box((x, CAB_Y + 2.15, s * (hw - 0.06)), (0.68, 0.38, 0.02), k.GLS)
        cab.box((x, CAB_Y + 2.4, s * (hw + 0.04)), (0.72, 0.05, 0.12), k.A)
# 前牆（窗在裝甲罩上方）
cab.box((CAB_X1, CAB_Y + 1.25, 0), (0.08, 2.5, CAB_W), k.A)
cab.box((CAB_X1, CAB_TOP - 0.12, 0), (0.08, 0.24, CAB_W), k.A)
for s in (-1, 1):
    cab.box((CAB_X1, CAB_Y + 2.62, s * 0.3), (0.08, 0.32, 0.4), k.A)
    cab.box((CAB_X1, CAB_Y + 2.62, s * 1.15), (0.08, 0.32, 0.4), k.A)
    cab.lathe((CAB_X1 + 0.02, CAB_Y + 2.62, s * 0.72), (1, 0, 0), [(0, 0.2), (0.03, 0.2)], 16, k.GLS)
# 屋頂（帶倒角）與通風口
roof_prof = [(-hw - 0.1, CAB_TOP - 0.05), (hw + 0.1, CAB_TOP - 0.05), (hw + 0.1, CAB_TOP + 0.03), (hw - 0.3, CAB_TOP + 0.2), (-hw + 0.3, CAB_TOP + 0.2), (-hw - 0.1, CAB_TOP + 0.03)]
cab.prism(roof_prof, CAB_X0 - 0.15, CAB_X1 + 0.05, k.A)
cab.box((cx, CAB_TOP + 0.26, 0), (1.0, 0.1, 0.8), k.A)
# 駕駛室地板與內牆漆
cab.box((cx, FLOOR - 0.04, 0), (cab_len, 0.08, CAB_W - 0.16), k.WOOD)
for s in (-1, 1):
    cab.box((cx, CAB_Y + 1.45, s * (hw - 0.085)), (cab_len - 0.05, 2.7, 0.01), k.IN)
cab.build('Cab', k.MATS, parent=k.root, bevel=0.012)

# ── 爐頭（從後平台看得到） ──
bh = MeshBuilder()
bx = CAB_X1 - 0.08
bh.box((bx - 0.3, CAB_Y + 1.2, 0), (0.6, 2.2, 1.9), k.ST)                    # 火室後板
bh.lathe((bx - 0.6, FLOOR + 0.55, 0), (-1, 0, 0), [(0, 0.3), (0.04, 0.3), (0.06, 0.24), (0.08, 0)], 20, k.BRS)  # 爐門框
bh.box((bx - 0.66, FLOOR + 0.55, 0), (0.02, 0.38, 0.5), k.BLK)
bh.cylinder((bx - 0.68, FLOOR + 0.45, 0.2), (bx - 0.68, FLOOR + 0.65, 0.2), 0.02, 6, k.ST)
for z, y in ((-0.45, 2.95), (0.45, 2.95), (0.0, 3.1)):                       # 壓力錶
    bh.lathe((bx - 0.6, y, z), (-1, 0, 0), [(0, 0.13), (0.04, 0.13), (0.05, 0)], 18, k.BRS)
    bh.lathe((bx - 0.65, y, z), (-1, 0, 0), [(0, 0.11), (0.005, 0)], 18, k.WHT)
for z in (-0.75, 0.75):                                                       # 水位計
    bh.cylinder((bx - 0.62, 2.1, z), (bx - 0.62, 2.7, z), 0.03, 8, k.GLS)
    for y in (2.1, 2.7):
        bh.box((bx - 0.62, y, z), (0.08, 0.06, 0.08), k.BRS)
bh.cylinder((bx - 0.65, 2.55, -0.7), (bx - 0.65, 2.55, 0.25), 0.03, 8, k.ST)  # 調節閥軸
bh.box((bx - 0.65, 2.35, 0.27), (0.05, 0.45, 0.05), k.ST)                    # 調節閥把手
for z in (-0.9, 0.9):                                                         # 注水器管路
    bh.cylinder((bx - 0.62, 1.6, z), (bx - 0.62, 2.6, z), 0.035, 8, k.CU)
    bh.cylinder((bx - 0.62, 2.6, z), (bx - 0.62, 2.6, z * 0.5), 0.035, 8, k.CU)
    bh.lathe((bx - 0.66, 2.0, z), (-1, 0, 0), [(0, 0.08), (0.03, 0.08), (0.04, 0)], 12, k.RED)
# 逆轉機（左側立柱與手輪）
bh.box((-3.3, FLOOR + 0.5, -0.95), (0.18, 1.0, 0.14), k.ST)
bh.lathe((-3.15, FLOOR + 1.05, -0.95), (1, 0, 0), [(0, 0.18), (0.03, 0.18), (0.03, 0.14), (0, 0.14)], 16, k.ST, closed=True)
# 司機座與司爐座
for z in (-0.6, 0.65):
    bh.box((-3.6, FLOOR + 0.55, z), (0.4, 0.06, 0.4), k.WOOD)
    bh.box((-3.6, FLOOR + 0.27, z), (0.06, 0.5, 0.06), k.ST)
# 煤鏟
bh.box((-5.2, FLOOR + 0.6, 1.0), (0.04, 1.1, 0.04), k.WOOD)
bh.box((-5.2, FLOOR + 0.08, 1.0), (0.25, 0.04, 0.22), k.ST)
bh.build('Backhead', k.MATS, parent=k.root, bevel=0.005)

# ── 司機人偶（坐姿） ──
dv = MeshBuilder()
x, z = -3.45, -0.6
dv.box((x, FLOOR + 0.72, z), (0.45, 0.2, 0.36), k.OLV)                       # 大腿
dv.box((x + 0.24, FLOOR + 0.35, z), (0.14, 0.62, 0.3), k.OLV)               # 小腿
dv.box((x - 0.05, FLOOR + 1.12, z), (0.28, 0.62, 0.4), k.OLV)               # 上身
dv.lathe((x - 0.05, FLOOR + 1.48, z), (0, 1, 0), [(0, 0.06), (0.06, 0.11), (0.2, 0.11), (0.28, 0.06), (0.29, 0)], 12, k.WHT)  # 頭
dv.lathe((x - 0.05, FLOOR + 1.66, z), (0, 1, 0), [(0, 0.15), (0.03, 0.12), (0.12, 0.12), (0.13, 0)], 12, k.CNV)  # 帽
dv.cylinder((x + 0.05, FLOOR + 1.25, z + 0.2), (x + 0.35, FLOOR + 1.05, z + 0.32), 0.05, 8, k.OLV)  # 手臂
dv.build('Driver', k.MATS, parent=k.root)

# ───────────────────────────── 鉚釘 ─────────────────────────────
rv = MeshBuilder()
hw_c = CASE_W / 2
for s in (-1, 1):
    for y in (CASE_Y + 0.06, 1.6, CASE_Y + CASE_H - CASE_C - 0.04):
        for j in range(int((CASE_X1 - CASE_X0 - 0.2) / 0.13)):
            rv.rivet((CASE_X0 + 0.1 + j * 0.13, y, s * hw_c), (0, 0, s))
    for x in [CASE_X0 + 1.0 * j for j in range(1, 8)]:
        for j in range(15):
            rv.rivet((x, CASE_Y + 0.1 + 0.12 * j, s * hw_c), (0, 0, s))
    for j in range(int(cab_len / 0.13)):
        for y in (CAB_Y + 0.08, CAB_Y + 1.85, CAB_TOP - 0.08):
            rv.rivet((CAB_X0 + 0.08 + j * 0.13, y, s * hw), (0, 0, s))
    for j in range(10):
        rv.rivet((0.9 - 4.2 + j * 0.9, 1.22, s * 1.4), (0, 0, s))
for z in (-(hw_c - CASE_C - 0.05), hw_c - CASE_C - 0.05):
    for j in range(int((CASE_X1 - CASE_X0 - 0.2) / 0.15)):
        rv.rivet((CASE_X0 + 0.1 + j * 0.15, CASE_TOP, z), (0, 1, 0))
rv.build('Rivets', [k.M['armor']], parent=k.root)

# ───────────────────────────── 輪對與煙囪節點 ─────────────────────────────
for x in (-2.7, -0.95, 0.8, 2.55):
    kit.wheelset(x, r=0.69, spokes=14)
kit.wheelset(4.9, r=0.43)
kit.wheelset(-4.6, r=0.5)
empty('Chimney', kit.root, (5.4, 4.3, 0))

kit.export('locomotive', cam_target=(0.5, 2.0, 0.5), cam_pos=(9, 5.5, 14))
if 'inside' in script_args():
    render_preview(os.path.join(PROJECT, 'docs', 'preview', 'locomotive_cab.png'), target=(-3.0, 2.3, 0), cam_pos=(-9.5, 3.3, 1.2))
