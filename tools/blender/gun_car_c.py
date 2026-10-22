"""火砲車丙建模腳本：後部敞頂雙聯八八式七糎野戦高射砲＋測距儀。

執行：
  blender -b --factory-startup -P tools/blender/gun_car_c.py
  （加參數 -- interior 只渲染車內檢查圖到暫存資料夾，不輸出模型）

節點：Turret7 → Turret7_Elev（預設仰 8°）；RF_Yaw → RF_Anchor；Wheelset_*
尺寸須與 src/train/modelSpecs.js 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from common import MeshBuilder, empty, script_args, render_preview, V  # noqa: E402
from parts import Kit, FLOOR  # noqa: E402

NAME = 'gun_car_c'
CN = '火砲車丙'
LEN, W = 15.9, 3.1
T7_X = -4.2          # 後部砲塔
RF_X = 3.6           # 測距儀
HATCH_X = 0.6
SCRATCH = r'C:\Users\HSPS\AppData\Local\Temp\claude\C--Users-HSPS-Desktop-115------\b11bc165-f08e-4618-b89e-90e20b4ac3e1\scratchpad'

kit = Kit('GunCarC')
k = kit
hull = kit.hull(length=LEN, w=W)
ROOF = hull.roof
ins = hull.inside


def ammo_rack(x0, x1, side, rows=2, shell_len=0.7, r=0.045):
    """七糎彈架：高度控制在側牆垂直段內。"""
    z = side * 1.25
    xc = (x0 + x1) / 2
    ins.box((xc, FLOOR + 0.74, side * 1.43), (x1 - x0, 1.48, 0.04), k.IST)
    for x in (x0, x1):
        ins.box((x, FLOOR + 0.74, z), (0.05, 1.48, 0.38), k.IST)
    n = int((x1 - x0 - 0.15) / 0.2)
    for row in range(rows):
        y = FLOOR + 0.03 + row * 0.74
        ins.box((xc, y - 0.02, z), (x1 - x0, 0.04, 0.38), k.IST)
        for j in range(n):
            x = x0 + 0.17 + j * 0.2
            ins.lathe((x, y, z), (0, 1, 0), [(0, r), (shell_len * 0.62, r)], 10, k.BRS)
            ins.lathe((x, y + shell_len * 0.62, z), (0, 1, 0), [(0, r * 0.92), (shell_len * 0.3, r * 0.55), (shell_len * 0.38, 0)], 10, k.IST, cap0=False)
        # 固定帶
        ins.box((xc, y + 0.45, side * 1.08), (x1 - x0, 0.03, 0.01), k.CNV)


# ── 車內 ──
# 砲塔與測距儀下方的頂部開口環
for x, r in ((T7_X, 0.92), (RF_X, 0.9)):
    ins.lathe((x, hull.ceil - 0.14, 0), (0, 1, 0), [(0, r), (0.14, r), (0.14, r - 0.08), (0, r - 0.08)], 32, k.IST, closed=True)
# 登塔梯（後砲塔）與測距儀登梯：貼近左側，走道保持暢通
for lx in (T7_X - 0.55, RF_X - 0.55):
    for dz in (-1.08, -0.78):
        ins.box((lx, (FLOOR + hull.ceil) / 2, dz), (0.05, hull.ceil - FLOOR, 0.05), k.IST)
    for j in range(1, 7):
        ins.cylinder((lx, FLOOR + 0.32 * j, -1.08), (lx, FLOOR + 0.32 * j, -0.78), 0.018, 6, k.IST)
# 測距儀操作位：地板上的防滑踏板
ins.box((RF_X, FLOOR + 0.01, 0), (0.8, 0.02, 0.8), k.ST)

hull.lamps((-6.2, -1.5, 2.0, 6.0))
hull.hatch(HATCH_X)
ammo_rack(-7.4, -5.3, -1)
ammo_rack(-7.4, -5.3, 1)
ammo_rack(-3.3, -2.0, -1)

# 射擊指揮計算板（右側牆）
ins.box((2.5, FLOOR + 0.78, hull.on_wall(1, 0.4)), (1.1, 0.05, 0.4), k.WOOD)
for x in (2.0, 3.0):
    ins.box((x, FLOOR + 0.38, hull.on_wall(1, 0.36)), (0.05, 0.76, 0.05), k.IST)
ins.box((2.5, FLOOR + 0.82, hull.on_wall(1, 0.36)), (0.9, 0.02, 0.32), k.WHT)
ins.box((2.3, FLOOR + 0.84, hull.on_wall(1, 0.3)), (0.35, 0.015, 0.03), k.BRS)
ins.cylinder((2.8, FLOOR + 0.82, 1.2), (2.8, FLOOR + 0.86, 1.2), 0.08, 16, k.BRS)
ins.box((2.5, 2.25, hull.on_wall(1, 0.03)), (1.0, 0.55, 0.03), k.WOOD)
ins.box((2.5, 2.25, hull.hw_in - 0.035), (0.9, 0.45, 0.01), k.WHT)
# 射擊諸元傳送器（刻度盤）
for j, x in enumerate((3.25, 3.55)):
    ins.lathe((x, 2.3, hull.hw_in), (0, 0, -1), [(0, 0.12), (0.05, 0.12), (0.06, 0.1), (0.06, 0)], 18, k.IST, cap0=False)
    ins.box((x, 2.3, hull.hw_in - 0.065), (0.01, 0.09, 0.005), k.BLK)
# 傳聲管匯集箱（天花板，計算板上方）
ins.box((2.5, hull.ceil - 0.12, 0.6), (0.4, 0.18, 0.3), k.BRS)
for dz in (-0.1, 0.0, 0.1):
    ins.cylinder((2.5 + dz * 3, hull.ceil - 0.2, 0.6 + dz), (2.5 + dz * 3, 2.6, 0.6 + dz), 0.02, 8, k.BRS)
    ins.lathe((2.5 + dz * 3, 2.6, 0.6 + dz), (0, -1, 0), [(0, 0.02), (0.07, 0.045), (0.09, 0.045), (0.09, 0)], 12, k.BRS)

# 工具板（左側牆）：扳手、通條
ins.box((2.1, 2.05, hull.on_wall(-1, 0.03)), (1.0, 0.8, 0.03), k.WOOD)
for j in range(5):
    x = 1.72 + j * 0.18
    ins.box((x, 2.15, -(hull.hw_in - 0.05)), (0.04, 0.32 - j * 0.03, 0.02), k.ST)
ins.cylinder((1.65, 1.75, -(hull.hw_in - 0.06)), (2.55, 1.75, -(hull.hw_in - 0.06)), 0.012, 8, k.WOOD)
ins.cylinder((1.65, 1.82, -(hull.hw_in - 0.06)), (2.55, 1.82, -(hull.hw_in - 0.06)), 0.01, 8, k.ST)
ins.box((2.1, FLOOR + 0.15, hull.on_wall(-1, 0.32)), (0.6, 0.3, 0.3), k.OLV)  # 工具箱

hull.seats((5.4,), sides=(-1,))
hull.rifle_rack(5.4, side=1)
for side in (-1, 1):
    hull.locker(7.3, side)
hull.extinguisher(0.9, 1)
hull.first_aid(0.95, -1)
hull.elec_box(-0.9, -1)
hull.helmets(-1.9, 1)
hull.crates(-1.2, sides=(-1,), stack=1)
hull.wall_structure(skip=[(-7.6, -5.1), (-3.4, -1.9), (-0.8, 0.8), (1.5, 3.7), (4.8, 6.0)],
                    ceiling_skip=[(T7_X - 1.1, T7_X + 1.1), (RF_X - 0.7, RF_X + 0.7)])
hull.voice_tube(drops=(T7_X + 1.2,))
hull.inner_slits((-2.6, 5.6), sides=(1,))
hull.inner_slits((5.6,), sides=(-1,))
hull.inner_ports((-1.5, 4.6), sides=(-1,))

# ── 外部 ──
hull.side_details(doors=(0.0,), slits=(-6.4, -2.6, 2.4, 5.6), ports=(-1.5, 4.6))
hull.vents((-1.6, 6.6))
hull.lifting_rings()
# 測距儀基座
hull.det.lathe((RF_X, ROOF, 0), (0, 1, 0), [(0, 0.45), (0.06, 0.42), (0.06, 0)], 24, k.A, cap0=False)
hull.det.lathe((RF_X, ROOF + 0.06, 0), (0, 1, 0), [(0, 0.26), (0.54, 0.18), (0.54, 0)], 16, k.A, cap0=False)
hull.rivets(skip=[(-0.7, 0.7)])
hull.finish()
kit.running_gear(LEN)

# ── 後部敞頂砲塔（雙聯七糎） ──
t7 = empty('Turret7', kit.root, (T7_X, ROOF, 0), yaw=math.pi)
tb = MeshBuilder()
tb.lathe((0, 0, 0), (0, 1, 0), [(0, 1.78), (0.22, 1.72), (0.22, 0)], 48, k.A, cap0=False)
# 有厚度的環形護牆：外側迷彩、內側車內漆、頂緣鋼條
tb.lathe((0, 0, 0), (0, 1, 0), [(0.22, 1.6), (1.07, 1.6), (1.07, 1.56), (0.22, 1.56)], 48, k.A, closed=True)
tb.lathe((0, 0, 0), (0, 1, 0), [(0.22, 1.56), (1.07, 1.56), (1.07, 1.52), (0.22, 1.52)], 48, k.IN, closed=True)
tb.lathe((0, 0, 0), (0, 1, 0), [(1.07, 1.61), (1.11, 1.61), (1.11, 1.51), (1.07, 1.51)], 48, k.ST, closed=True)
tb.cylinder((0, 0.22, 0), (0, 0.25, 0), 1.52, 40, k.WOOD)
# 砲座：基柱與耳軸架
tb.cylinder((0, 0.25, 0), (0, 0.85, 0), 0.38, 20, k.GUN, r1=0.3)
for z in (-0.62, 0.62):
    tb.box((0.0, 1.0, z), (0.5, 0.5, 0.08), k.GUN)
# 方向／高低手輪
for z, ax in ((-0.85, -1), (0.85, 1)):
    tb.lathe((-0.15, 0.85, z), (0, 0, ax), [(0, 0.17), (0.03, 0.17), (0.03, 0.14), (0, 0.14)], 20, k.ST, closed=True)
    tb.cylinder((-0.15, 0.85, z * 0.82), (-0.15, 0.85, z), 0.02, 6, k.ST)
    for a in range(0, 180, 60):
        rad = math.radians(a)
        tb.cylinder((-0.15 - math.cos(rad) * 0.15, 0.85 - math.sin(rad) * 0.15, z), (-0.15 + math.cos(rad) * 0.15, 0.85 + math.sin(rad) * 0.15, z), 0.012, 6, k.ST)
# 砲手座椅
for z in (-0.95, 0.95):
    tb.cylinder((-0.55, 0.25, z), (-0.55, 0.62, z), 0.035, 8, k.ST)
    tb.box((-0.55, 0.64, z), (0.32, 0.05, 0.3), k.WOOD)
    tb.box((-0.7, 0.85, z), (0.04, 0.35, 0.28), k.WOOD)
# 待發彈藥箱（沿後方護牆內側）
for a in (130, 160, 200, 230):
    rad = math.radians(a)
    x, z = math.cos(rad) * 1.25, math.sin(rad) * 1.25
    tb.box((x, 0.42, z), (0.32, 0.34, 0.5), k.OLV)
    tb.box((x, 0.6, z), (0.34, 0.03, 0.52), k.ST)
tb.build('Turret7Body', k.MATS, parent=t7, bevel=0.012)
tr = MeshBuilder()
for j in range(40):
    a = 2 * math.pi * j / 40
    tr.rivet((math.cos(a) * 1.6, 0.6, math.sin(a) * 1.6), (math.cos(a), 0, math.sin(a)))
    tr.rivet((math.cos(a) * 1.78, 0.2, math.sin(a) * 1.78), (math.cos(a), 0.4, math.sin(a)))
tr.build('Turret7Rivets', [k.M['armor']], parent=t7)

elev = empty('Turret7_Elev', t7, (0.0, 1.15, 0))
elev.rotation_euler = (0, -math.radians(8), 0)  # 遊戲 +Z 軸仰角 8°
gg = MeshBuilder()
gg.box((0.0, 0, 0), (0.7, 0.32, 1.1), 0)  # 搖架
for z in (-0.32, 0.32):
    gg.box((-0.45, 0, z), (0.6, 0.24, 0.22), 0)  # 閉鎖機
    gg.lathe((0, 0, z), (1, 0, 0), [(0.3, 0.075), (0.9, 0.07), (1.0, 0.062), (3.4, 0.055), (3.45, 0.062), (3.5, 0.062), (3.5, 0.03), (3.45, 0.03)], 20, 0, cap1=False)
    gg.lathe((0, 0, z), (1, 0, 0), [(3.45, 0.03), (3.45, 0)], 12, 1)
    gg.cylinder((0.25, -0.13, z), (1.6, -0.13, z), 0.06, 14, 0)  # 駐退機
    gg.box((-0.85, -0.05, z), (0.14, 0.3, 0.26), 2)  # 閉鎖機尾板
# 瞄準具
gg.box((0.25, 0.25, -0.62), (0.4, 0.12, 0.1), 0)
gg.cylinder((0.05, 0.25, -0.62), (0.5, 0.25, -0.62), 0.04, 10, 1)
gg.build('Turret7Guns', [k.M['gun'], k.M['black'], k.M['steel']], parent=elev, bevel=0.006)

# ── 測距儀 ──
rf = empty('RF_Yaw', kit.root, (RF_X, ROOF + 0.78, 0))
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
rm.cylinder((-0.12, -0.05, 0.2), (-0.12, -0.05, 0.32), 0.04, 10, k.ST)  # 合像調整鈕
rm.build('RF_Tube', k.MATS, parent=rf, bevel=0.006)
empty('RF_Anchor', rf, (0, 0.2, 0))


def interior_renders():
    for x in (-6.0, -2.0, 2.0, 6.0):
        light = bpy.data.lights.new('IL', 'POINT')
        light.energy = 180
        ob = bpy.data.objects.new('IL', light)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = V(x, 3.0, 0)
    render_preview(os.path.join(SCRATCH, f'{NAME}_in_front.png'), target=(-5.0, 2.0, 0.0), cam_pos=(7.2, 2.9, 0.3), lens=16)
    render_preview(os.path.join(SCRATCH, f'{NAME}_in_rear.png'), target=(5.0, 2.0, 0.0), cam_pos=(-7.3, 2.9, -0.3), lens=16)
    render_preview(os.path.join(SCRATCH, f'{NAME}_turret.png'), target=(T7_X, ROOF + 0.6, 0), cam_pos=(T7_X + 5, ROOF + 4.5, 3.5), lens=30)


if 'interior' in script_args():
    interior_renders()
else:
    kit.export(NAME, cam_target=(-1.0, 2.6, 0), cam_pos=(-14, 7.0, -12))
