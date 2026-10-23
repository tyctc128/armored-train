"""火砲車丙建模腳本。

依《世界裝甲列車圖解百科》照片與說明：以 60 噸「試驗 1 型」（チ-1）車為底，中段加高，
上面兩座密閉多面體砲塔，各裝一門八八式七糎野戦高射砲（也能打地面目標，水平射程約 14 km，
每門備彈 300 發，射速每分約 20 發）。砲塔內部可見兩根粗支柱、砲尾與手輪。前端低段車頂一座小機槍塔。

遊戲中兩座砲塔由同一個崗位指揮：同步轉向、輪流射擊。

執行：
  blender -b --factory-startup -P tools/blender/gun_car_c.py
  （加參數 -- interior 只渲染車內檢查圖，不輸出模型）

節點：Turret → Elev → Recoil → Muzzle、Turret → Sight（前砲塔，玩家瞄準用）；
      Turret2 → Elev2 → Recoil2 → Muzzle2（後砲塔）；Wheelset_*
尺寸、砲塔位置須與 src/train/carModels.js 的 buildGunCarC 一致。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import MeshBuilder, empty, script_args  # noqa: E402
from parts import (  # noqa: E402
    Kit, FLOOR, bulkhead_face, step_rivets, windows, window_row, end_handrails, skirts_and_jacks,
    cupola, faceted_body,
)

NAME = 'gun_car_c'
CN = '火砲車丙'
LEN, W, H = 15.9, 3.1, 2.3
RAISE = 0.6
T1_X, T2_X = 2.4, -2.6         # 前、後砲塔
RING_R, BODY_H = 1.25, 1.0
PIVOT = (RING_R * 0.3, 0.22 + BODY_H * 0.55, 0.0)
BARREL_LEN = 3.5
HATCH_X = -6.4
BOUNDS = [-5.0, 4.6]

kit = Kit('GunCarC')
k = kit
lo_r = kit.hull(length=LEN / 2 - 5.0, x0=(-LEN / 2 - 5.0) / 2, w=W, h=H, name='HullRear', front_wall=False)
hi = kit.hull(length=9.6, x0=-0.2, w=W, h=H + RAISE, name='HullMid')
lo_f = kit.hull(length=LEN / 2 - 4.6, x0=(LEN / 2 + 4.6) / 2, w=W, h=H, name='HullFront', rear_wall=False)
segs = [lo_r, hi, lo_f]
ROOF = lo_f.roof
ROOF_HI = hi.roof


def seg_at(x):
    for s in segs:
        if s.x_min - 1e-6 <= x <= s.x_max + 1e-6:
            return s
    return segs[0]


def ammo_rack(seg, x0, x1, side, rows=2, shell_len=0.7, r=0.045):
    """七糎彈架：直立存放，固定帶綁住；高度控制在側牆垂直段內。"""
    ins = seg.inside
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
        ins.box((xc, y + 0.45, side * 1.08), (x1 - x0, 0.03, 0.01), k.CNV)


# ───────────────────────────── 車內 ─────────────────────────────
ins = hi.inside
for tx in (T1_X, T2_X):
    # 砲塔座圈、兩根粗支柱（照片中砲塔內部的特徵）、手輪、砲手座與揚彈筒
    ins.lathe((tx, hi.ceil - 0.14, 0), (0, 1, 0), [(0, 0.95), (0.14, 0.95), (0.14, 0.86), (0, 0.86)], 32, k.IST, closed=True)
    for dz in (-0.95, 0.95):
        ins.box((tx, (FLOOR + hi.ceil) / 2, dz), (0.24, hi.ceil - FLOOR, 0.24), k.IST)
        ins.box((tx, FLOOR + 0.05, dz), (0.4, 0.1, 0.4), k.ST)
    ins.lathe((tx + 0.2, FLOOR + 1.25, -0.8), (0, 0, 1), [(0, 0.17), (0.03, 0.17), (0.03, 0.14), (0, 0.14)], 18, k.ST, closed=True)
    ins.lathe((tx - 0.2, FLOOR + 1.1, 0.8), (0, 0, -1), [(0, 0.15), (0.03, 0.15), (0.03, 0.12), (0, 0.12)], 18, k.ST, closed=True)
    for j in range(3):
        a = math.pi * j / 3
        ins.cylinder((tx + 0.2 + math.cos(a) * 0.15, FLOOR + 1.25 + math.sin(a) * 0.15, -0.79),
                     (tx + 0.2 - math.cos(a) * 0.15, FLOOR + 1.25 - math.sin(a) * 0.15, -0.79), 0.01, 6, k.ST)
    ins.box((tx - 0.45, FLOOR + 0.5, -0.6), (0.3, 0.05, 0.28), k.WOOD)
    ins.box((tx - 0.45, FLOOR + 0.25, -0.6), (0.04, 0.5, 0.04), k.IST)
    # 圓形踏板（轉盤）
    ins.lathe((tx, FLOOR + 0.005, 0), (0, 1, 0), [(0, 0.8), (0.02, 0.8), (0.02, 0)], 32, k.ST, cap0=False)
    # 揚彈筒與砲彈托
    ins.cylinder((tx + 0.6, FLOOR + 0.2, 0.45), (tx + 0.4, hi.ceil - 0.05, 0.35), 0.09, 12, k.IST)
    ins.box((tx + 0.6, FLOOR + 0.1, 0.45), (0.32, 0.2, 0.32), k.IST)
    # 登塔梯（貼近左側）
    lx = tx - 1.0
    for dz in (-1.1, -0.8):
        ins.box((lx, (FLOOR + hi.ceil) / 2, dz), (0.05, hi.ceil - FLOOR, 0.05), k.IST)
    for j in range(1, int((hi.ceil - FLOOR) / 0.3)):
        ins.cylinder((lx, FLOOR + 0.3 * j, -1.1), (lx, FLOOR + 0.3 * j, -0.8), 0.018, 6, k.IST)

# 彈架：每門 300 發，分散在前後低段與中段
ammo_rack(lo_r, -7.6, -5.3, -1)
ammo_rack(lo_r, -7.6, -5.3, 1)
ammo_rack(lo_f, 5.0, 7.3, -1)
ammo_rack(lo_f, 5.0, 6.4, 1)
ammo_rack(hi, -4.6, -3.7, 1)
ammo_rack(hi, 3.6, 4.4, 1)

# 中段：工具板、傳聲管、電話、配電箱
ins.box((0.0, 2.15, hi.on_wall(-1, 0.03)), (1.0, 0.8, 0.03), k.WOOD)
for j in range(5):
    ins.box((-0.38 + j * 0.18, 2.25, -(hi.hw_in - 0.05)), (0.04, 0.32 - j * 0.03, 0.02), k.ST)
ins.cylinder((-0.45, 1.85, -(hi.hw_in - 0.06)), (0.45, 1.85, -(hi.hw_in - 0.06)), 0.012, 8, k.WOOD)
hi.phone(0.6, 1)
hi.elec_box(-0.6, 1)
hi.voice_tube(drops=(T1_X - 1.3, T2_X + 1.3))
hi.lamps((-4.0, 0.0, 4.0))
lo_r.lamps((-6.5,))
lo_f.lamps((6.2,))
hi.wall_structure(skip=[(T1_X - 1.1, T1_X + 1.1), (T2_X - 1.1, T2_X + 1.1), (-0.8, 0.8), (-4.7, -3.6), (3.5, 4.5)],
                  ceiling_skip=[(T1_X - 1.1, T1_X + 1.1), (T2_X - 1.1, T2_X + 1.1)])
lo_r.wall_structure(skip=[(-7.7, -5.2)])
lo_f.wall_structure(skip=[(4.9, 7.4)])
lo_r.hatch(HATCH_X)
lo_f.locker(7.5, -1)
lo_f.extinguisher(7.0, 1)
hi.first_aid(1.0, -1)
hi.helmets(-1.4, 1)
hi.rifle_rack(-0.2, side=1)

# ───────────────────────────── 外部 ─────────────────────────────
for seg in segs:
    seg.side_details(doors=tuple(x for x in (0.0,) if seg.x_min < x < seg.x_max), slits=(), ports=(), handrails=False)
    xs = window_row(seg, keep_clear=[(-0.75, 0.75)])
    windows(k, seg, xs, (2.45, 1.9))
    seg.rivets(skip=[(-0.7, 0.7)])
    seg.lifting_rings()
end_handrails(k, lo_f, LEN / 2 - 0.4)
end_handrails(k, lo_r, -LEN / 2 + 0.4)
for b in BOUNDS:
    toward = 1 if b > 0 else -1
    bulkhead_face(k, seg_at(b + toward * 0.5), b, toward)
    step_rivets(k, hi, b, toward, ROOF, RAISE)
hi.vents((0.0,))
skirts_and_jacks(k, LEN)
cups = MeshBuilder()
cupola(k, cups, 6.9, 0.0, ROOF, 0.5, mg_dir_deg=0)
cups.build('MgCupola', k.MATS, parent=kit.root, bevel=0.01)
for seg in segs:
    seg.finish()
kit.running_gear(LEN)


# ───────────────────────────── 七糎砲砲塔 ×2（多面體、密閉） ─────────────────────────────
def gun_turret(suffix, x):
    turret = empty(f'Turret{suffix}', kit.root, (x, ROOF_HI, 0))
    tb = MeshBuilder()
    tb.lathe((0, 0, 0), (0, 1, 0), [(0, RING_R + 0.15), (0.2, RING_R + 0.1), (0.2, 0)], 40, k.A, cap0=False)
    faceted_body(tb, 8, RING_R / math.cos(math.pi / 8) - 0.02, 0.72, 0.2, 0.62, 0.2 + BODY_H, k.A)
    tb.box((-1.05, 0.55, 0), (0.5, 0.6, 1.2), k.A)                       # 後部突出
    tb.cylinder((-0.3, 0.2 + BODY_H, 0.35), (-0.3, 0.2 + BODY_H + 0.07, 0.35), 0.24, 18, k.A)  # 艙蓋
    tb.box((PIVOT[0] + 0.12, 0.2 + BODY_H + 0.08, -0.45), (0.22, 0.16, 0.18), k.A)              # 瞄準具罩
    tb.box((PIVOT[0] + 0.24, 0.2 + BODY_H + 0.1, -0.45), (0.02, 0.05, 0.13), k.BLK)
    for ang in (60, 120, 240, 300):
        a = math.radians(ang)
        tb.box((math.cos(a) * (RING_R - 0.1), 0.2 + 0.4, -math.sin(a) * (RING_R - 0.1)), (0.07, 0.045, 0.24), k.BLK)
    tb.box((RING_R - 0.06, PIVOT[1], 0), (0.14, 0.8, 0.8), k.A)
    tb.build(f'TurretBody{suffix}', k.MATS, parent=turret, bevel=0.018)
    tr = MeshBuilder()
    for j in range(32):
        a = 2 * math.pi * j / 32
        tr.rivet((math.cos(a) * (RING_R + 0.01), 0.32, math.sin(a) * (RING_R + 0.01)), (math.cos(a), 0, math.sin(a)))
    for i in range(8):
        a = math.pi / 8 + 2 * math.pi * i / 8
        for t in (0.25, 0.6):
            r = (RING_R - 0.02) + (0.72 - RING_R) * t
            tr.rivet((math.cos(a) * r, 0.62 + (BODY_H - 0.42) * t, -math.sin(a) * r), (math.cos(a), 0.6, -math.sin(a)))
    tr.build(f'TurretRivets{suffix}', [k.M['armor']], parent=turret)
    elev = empty(f'Elev{suffix}', turret, PIVOT)
    mant = MeshBuilder()
    mant.lathe((RING_R - 0.22 - PIVOT[0], 0, -0.36), (0, 0, 1), [(0, 0.34), (0.72, 0.34)], 28, k.A)
    mant.box((RING_R - 0.04 - PIVOT[0], 0, 0), (0.2, 0.26, 0.26), k.A)
    mant.build(f'Mantlet{suffix}', k.MATS, parent=elev, bevel=0.012)
    recoil = empty(f'Recoil{suffix}', elev)
    bar = MeshBuilder()
    bar.lathe((0, 0, 0), (1, 0, 0), [(0.5, 0.09), (1.2, 0.085), (1.3, 0.075), (1.8, 0.07), (BARREL_LEN, 0.06), (BARREL_LEN + 0.05, 0.07), (BARREL_LEN + 0.15, 0.07), (BARREL_LEN + 0.15, 0.035), (BARREL_LEN + 0.08, 0.035)], 24, 0, cap0=True, cap1=False)
    bar.lathe((0, 0, 0), (1, 0, 0), [(BARREL_LEN + 0.08, 0.035), (BARREL_LEN + 0.08, 0)], 14, 1)
    bar.cylinder((0.4, -0.15, 0), (1.6, -0.15, 0), 0.065, 14, 0)   # 駐退機
    bar.build(f'Barrel{suffix}', [k.M['gun'], k.M['black']], parent=recoil, bevel=0.005)
    empty(f'Muzzle{suffix}', recoil, (BARREL_LEN + 0.15, 0, 0))
    return turret


t1 = gun_turret('', T1_X)
empty('Sight', t1, (PIVOT[0] + 0.25, PIVOT[1] + 0.2, -0.45))
gun_turret('2', T2_X)

if 'interior' in script_args():
    kit.interior_shots(NAME, [
        ('turret', (T1_X, 2.6, 0.0), (T1_X - 2.6, 2.2, 0.3), 18),
        ('rear', (-6.5, 2.2, 0.0), (1.0, 2.9, 0.2), 18),
    ])
else:
    kit.export(NAME, cam_target=(-0.5, 2.8, 0), cam_pos=(-13, 7.0, -13))
