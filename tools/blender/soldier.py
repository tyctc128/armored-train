"""軍士建模腳本（寫實版）：以 MPFB（MakeHuman）產生人體，換成雙臂下垂的站姿，
再把身體表面做成軍服、加上裝具，綁到遊戲用的簡化骨架上。

執行（不要加 --factory-startup，需要已安裝的 MPFB 外掛）：
  blender -b -P tools/blender/soldier.py -- soldier   # 步兵：九〇式鉄帽、三八式歩兵銃、彈盒、背囊
  blender -b -P tools/blender/soldier.py -- crew      # 車組員：軍帽、無步槍
  blender -b -P tools/blender/soldier.py -- officer   # 軍官：軍帽、軍刀、望遠鏡、手槍套
  blender -b -P tools/blender/soldier.py -- enemy     # 架空敵軍：灰綠軍服、平頂軍帽、步槍

輸出 public/models/crew_<variant>.glb、assets/blender/crew_<variant>.blend、docs/preview/crew_<variant>.png

骨架（遊戲以名稱抓取，並直接設定各關節的旋轉）：
  Root → Hips → Spine → Head
                     → ShoulderL → ElbowL → HandL（右側為 R）
             → HipL → KneeL → AnkleL（右側為 R）
  Rifle（步兵，掛在 Spine 下的節點）
每根骨頭都是直立的短骨，靜止時各關節的座標軸與遊戲座標一致（+X 面向、+Y 上、+Z 右），
所以遊戲端的姿勢表（src/crew/soldier.js 的 POSES）可以直接套用。Root 在腳底，左側為 -Z。

考據（昭和九年前後）：昭五式軍衣（立領、領章、五顆鈕扣、胸前口袋）、短袴加綁腿、編上靴；
車外作戰的步兵與敵軍另穿外套（單排扣、及膝下）、戴防寒帽（呢料帽體、毛皮護耳與護額）與手套；
步兵戴九〇式鉄帽，車組員與軍官戴軍帽（紅色帽圈、星章）。出處見 docs/references.md。
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    PROJECT, MeshBuilder, V, empty, script_args, material, export_glb, save_blend, render_preview,
)

VARIANT = (script_args() or ['soldier'])[0]
assert VARIANT in ('soldier', 'crew', 'officer', 'enemy')
ENEMY = VARIANT == 'enemy'
WINTER = VARIANT in ('soldier', 'enemy')   # 車外作戰的人穿防寒外套、戴防寒帽；車內乘員穿軍衣
HEIGHT = 1.66

bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.preferences.addon_enable(module='bl_ext.user_default.mpfb')
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402

M_WOOL = material('Wool', '#5d6a63' if ENEMY else '#75643f', rough=0.95)   # 昭五式：帶赤茶褐色
M_PUTTEE = material('WoolDark', '#46504a' if ENEMY else '#695a3b', rough=0.95)
M_SKIN = material('Skin', '#c79a74', rough=0.62)
M_LEATHER = material('Leather', '#5a3b22', rough=0.55)
M_BOOT = material('Boot', '#33241a', rough=0.5)
M_HELM = material('Helmet', '#5a5a3c', rough=0.6, metal=0.0)
M_BRASS = material('Brass', '#c49a45', rough=0.35, metal=0.9)
M_RED = material('Collar', '#2f4f86' if ENEMY else '#9c2a22', rough=0.8)
M_STOCK = material('RifleWood', '#6b4426', rough=0.6)
M_STEEL = material('Steel', '#2c2c29', rough=0.4, metal=0.8)
M_DARK = material('Eye', '#1c120c', rough=0.3)
M_CANVAS = material('Canvas', '#8a7b55', rough=1.0)
M_HAIR = material('Hair', '#4a3d34', rough=0.9)    # 丸刈り：貼著頭皮的短髮，顏色接近深膚色
M_LIP = material('Lip', '#b58268', rough=0.55)
M_WHITE = material('EyeWhite', '#d8d2c8', rough=0.3)
M_FUR = material('Fur', '#77776f' if ENEMY else '#8f7a5c', rough=1.0)   # 兔毛
MATS = [M_WOOL, M_PUTTEE, M_SKIN, M_LEATHER, M_BOOT, M_HELM, M_BRASS, M_RED, M_STOCK, M_STEEL, M_DARK, M_CANVAS, M_HAIR, M_LIP, M_WHITE, M_FUR]
WOOL, PUT, SKIN, LEA, BOOT, HELM, BRS, RED, WOOD, STL, EYE, CNV, HAIR, LIP, WHT, FUR = range(16)

# ───────────────────────── 1. 產生人體並擺成雙臂下垂 ─────────────────────────
macro = TargetService.get_default_macro_info_dict()
macro.update(gender=1.0, age=0.5, muscle=0.55, weight=0.42)
macro['race'] = {'asian': 1.0, 'caucasian': 0.0, 'african': 0.0}
body = HumanService.create_human(mask_helpers=True, detailed_helpers=False, extra_vertex_groups=True,
                                 feet_on_ground=False, scale=0.1, macro_detail_dict=macro)
TargetService.bake_targets(body)
rig = HumanService.add_builtin_rig(body, 'default', import_weights=True)

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='POSE')
for side, out in (('L', 1), ('R', -1)):
    pb = rig.pose.bones[f'upperarm01.{side}']
    wr = rig.pose.bones[f'wrist.{side}']
    v = (wr.head - pb.head).normalized()
    tgt = Vector((0.07 * out, 0.02, -1)).normalized()
    q = v.rotation_difference(tgt)
    pb.matrix = Matrix.Translation(pb.head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pb.head) @ pb.matrix
    bpy.context.view_layer.update()
    # 雙腿收攏成立正站姿（MakeHuman 預設兩腳分開）
    pb = rig.pose.bones[f'upperleg01.{side}']
    ft = rig.pose.bones[f'foot.{side}']
    v = (ft.head - pb.head).normalized()
    tgt = Vector((0.012 * out, v.y, -1)).normalized()
    q = v.rotation_difference(tgt)
    pb.matrix = Matrix.Translation(pb.head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pb.head) @ pb.matrix
    bpy.context.view_layer.update()
bpy.context.view_layer.update()
PB = {b.name: (rig.matrix_world @ b.head).copy() for b in rig.pose.bones}
RIG_BONES = set(PB)
bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
for mod in list(body.modifiers):
    if mod.type == 'ARMATURE':
        bpy.ops.object.modifier_apply(modifier=mod.name)
    else:
        body.modifiers.remove(mod)
mw = body.matrix_world.copy()
body.parent = None
body.matrix_world = mw
bpy.context.view_layer.update()
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.data.objects.remove(rig, do_unlink=True)


def game(p):
    """Blender 座標 → 遊戲座標 (x 前, y 上, z 右)"""
    return Vector((p.x, p.z, -p.y))


# ───────────────────────── 2. 權重改綁到遊戲骨架 ─────────────────────────
def target_bone(name):
    side = name[-1] if name.endswith(('.L', '.R')) else ''
    n = name.lower()
    if n.startswith(('upperarm', 'shoulder01')):
        return 'Shoulder' + side
    if n.startswith('lowerarm'):
        return 'Elbow' + side
    if n.startswith(('wrist', 'finger', 'metacarpal')):
        return 'Hand' + side
    if n.startswith('upperleg'):
        return 'Hip' + side
    if n.startswith('lowerleg'):
        return 'Knee' + side
    if n.startswith(('foot', 'toe')):
        return 'Ankle' + side
    if n == 'root' or n.startswith('pelvis') or n == 'spine05':
        return 'Hips'
    if n.startswith(('spine', 'clavicle', 'breast')) or n == 'neck01':
        return 'Spine'
    return 'Head'   # 頸部上段、頭與臉部的骨頭


me = body.data
names = {g.index: g.name for g in body.vertex_groups}
helper = set()
flags = {'scalp': set(), 'lips': set()}
weights = []
for v in me.vertices:
    acc = {}
    for g in v.groups:
        n = names[g.group]
        if n in ('HelperGeometry', 'JointCubes'):
            if g.weight > 0:
                helper.add(v.index)
        elif n in flags:
            if g.weight > 0.5:
                flags[n].add(v.index)
        elif n in RIG_BONES:
            t = target_bone(n)
            acc[t] = acc.get(t, 0.0) + g.weight
    weights.append(acc)
body.vertex_groups.clear()
BONES = ['Hips', 'Spine', 'Head'] + [f'{b}{s}' for s in 'LR' for b in ('Shoulder', 'Elbow', 'Hand', 'Hip', 'Knee', 'Ankle')]
vg = {n: body.vertex_groups.new(name=n) for n in BONES}
for n in ('scalp', 'lips', 'helper'):
    vg[n] = body.vertex_groups.new(name=n)
for i, acc in enumerate(weights):
    tot = sum(acc.values())
    for n, w in acc.items():
        if w / max(tot, 1e-9) > 0.01:
            vg[n].add([i], w / tot, 'REPLACE')
for n in ('scalp', 'lips'):
    vg[n].add(sorted(flags[n]), 1.0, 'REPLACE')
vg['helper'].add(sorted(helper), 1.0, 'REPLACE')

# ───────────────────────── 3. 刪輔助幾何、轉向、縮放、分區、做成軍服 ─────────────────────────
bm = bmesh.new()
bm.from_mesh(me)
dl = bm.verts.layers.deform.verify()
hi = vg['helper'].index
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[dl].get(hi, 0) > 0], context='VERTS')
zs = [v.co.z for v in bm.verts]
scale = HEIGHT / (max(zs) - min(zs))
# MakeHuman 面向 -Y；轉成面向 +X（遊戲的前方），腳底放在原點，縮放到指定身高
XF = Matrix.Scale(scale, 4) @ Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Translation((0, 0, -min(zs)))
bm.transform(XF)
P = {k: XF @ p for k, p in PB.items()}
bm.normal_update()

idx2name = {vg[n].index: n for n in BONES}


def dominant(v):
    best, bw = 'Spine', 0.0
    for gi, w in v[dl].items():
        if gi in idx2name and w > bw:
            best, bw = idx2name[gi], w
    return best


region = {v: dominant(v) for v in bm.verts}
si, li = vg['scalp'].index, vg['lips'].index
collar_z = P['neck01'].z + 0.02
# 在領口高度把網格切一刀，皮膚與軍服的交界才會是整齊的一圈（否則沿著三角形邊緣呈鋸齒狀）
bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces), plane_co=(0, 0, collar_z), plane_no=(0, 0, 1), dist=0.0005)
bm.verts.ensure_lookup_table()
bm.normal_update()
region = {v: dominant(v) for v in bm.verts}
SKINLIKE = {SKIN, HAIR, LIP}
for f in bm.faces:
    rs = [region[v][:-1] if region[v][-1] in 'LR' else region[v] for v in f.verts]
    if all(r == 'Hand' for r in rs):
        mi = PUT if WINTER else SKIN   # 冬季戴防寒手套
    elif all(r in ('Head', 'Spine') for r in rs) and f.calc_center_median().z > collar_z:
        if all(v[dl].get(si, 0) > 0 for v in f.verts):
            mi = HAIR
        elif all(v[dl].get(li, 0) > 0 for v in f.verts):
            mi = LIP
        else:
            mi = SKIN
    elif sum(r == 'Ankle' for r in rs) * 2 > len(rs):
        mi = BOOT
    elif sum(r == 'Knee' for r in rs) * 2 > len(rs):
        mi = PUT
    else:
        mi = WOOL
    f.material_index = mi
    f.smooth = True

# 衣物比皮膚厚：沿法線向外推；與皮膚相接的頂點不動（袖口、領口自然收攏）
for v in bm.verts:
    mats = {f.material_index for f in v.link_faces}
    if mats & SKINLIKE:
        continue
    r = region[v]
    if BOOT in mats:
        amt = 0.009
    elif PUT in mats:
        amt = 0.007
    elif r.startswith('Hip') and r != 'Hips':
        amt = 0.03     # 短袴大腿寬鬆，到膝下才收進綁腿
    elif r in ('Spine', 'Hips'):
        amt = 0.032 if WINTER else 0.015
    elif r.startswith('Hand'):
        amt = 0.006
    else:
        amt = 0.024 if WINTER else 0.012   # 袖子
    v.co += v.normal * amt
bm.normal_update()

# 衣物改用盒狀投影 UV（1 單位 = 4 m，與車廂一致），布紋才不會隨人體 UV 忽大忽小
uvl = bm.loops.layers.uv.verify()
for f in bm.faces:
    if f.material_index in SKINLIKE:
        continue
    n = f.normal
    ax = max(range(3), key=lambda i: abs(n[i]))
    for loop in f.loops:
        c = loop.vert.co
        u, w = (c.y, c.z) if ax == 0 else (c.x, c.z) if ax == 1 else (c.x, c.y)
        loop[uvl].uv = (u / 4, w / 4)

FEET = {s: [game(v.co) for v in bm.verts if region[v] == 'Ankle' + s] for s in 'LR'}
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == BOOT], context='FACES')
CLOTH = [(game(v.co), region[v]) for v in bm.verts if not ({f.material_index for f in v.link_faces} & SKINLIKE)]
HEADV = [game(v.co) for v in bm.verts if region[v] == 'Head' and v.co.z > collar_z]
NECKV = [game(v.co) for v in bm.verts if abs(v.co.z - collar_z) < 0.02 and region[v] in ('Head', 'Spine')]
face_mats = [f.material_index for f in bm.faces]
bm.to_mesh(me)
bm.free()
me.materials.clear()
for mat in MATS:
    me.materials.append(mat)
me.polygons.foreach_set('material_index', face_mats)
for n in ('scalp', 'lips', 'helper'):
    body.vertex_groups.remove(vg[n])
body.name = 'Body'

# 減面：MakeHuman 的網格很密（單是雙手就有六千多個三角形），遊戲裡同時有幾十名軍士。
# 整體簡化到約三成的面數；權重會跟著內插。
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
d = body.modifiers.new('Decimate', 'DECIMATE')
d.ratio = 0.3
d.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=d.name)
print('BODY TRIS', sum(len(p.vertices) - 2 for p in body.data.polygons))

# ───────────────────────── 4. 量測身體，供裝具定位 ─────────────────────────
G = {k: game(p) for k, p in P.items()}
hip_mid = (G['upperleg01.L'] + G['upperleg01.R']) / 2
JP = {
    'Hips': hip_mid + Vector((0, 0.06, 0)),
    'Spine': hip_mid + Vector((0, 0.11, 0)),
    'Head': G['neck01'],
}
for s in 'LR':
    JP['Shoulder' + s] = G[f'upperarm01.{s}']
    JP['Elbow' + s] = G[f'lowerarm01.{s}']
    JP['Hand' + s] = G[f'wrist.{s}']
    JP['Hip' + s] = G[f'upperleg01.{s}']
    JP['Knee' + s] = G[f'lowerleg01.{s}']
    JP['Ankle' + s] = G[f'foot.{s}']
print('JOINTS', {k: tuple(round(c, 3) for c in p) for k, p in JP.items()})
TORSO = [p for p, r in CLOTH if r in ('Spine', 'Hips', 'HipL', 'HipR')]
belt_y = 0.6 * HEIGHT
collar_y = collar_z
sh_y = JP['ShoulderL'].y


def ring_at(y, dy=0.025, pts=None):
    sel = [p for p in (TORSO if pts is None else pts) if abs(p.y - y) < dy]
    xs = [p.x for p in sel]
    zz = [p.z for p in sel]
    return (min(xs) + max(xs)) / 2, (min(zz) + max(zz)) / 2, (max(xs) - min(xs)) / 2, (max(zz) - min(zz)) / 2


def front_x(y, z, dy=0.025, dz=0.03):
    return max(p.x for p in TORSO if abs(p.y - y) < dy and abs(p.z - z) < dz)


def back_x(y, z=0.0, dy=0.03, dz=0.05):
    return min(p.x for p in TORSO if abs(p.y - y) < dy and abs(p.z - z) < dz)


def tube(mb, rings, mi, segs=24):
    """rings：[(y, cx, cz, rx, rz)] 由下而上的橢圓環。"""
    rows = []
    for y, cx, cz, rx, rz in rings:
        rows.append([mb.bm.verts.new(V(cx + math.cos(2 * math.pi * i / segs) * rx, y, cz + math.sin(2 * math.pi * i / segs) * rz)) for i in range(segs)])
    for a, b in zip(rows[:-1], rows[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            mb.bm.faces.new([a[i], b[i], b[j], a[j]]).material_index = mi


def patch(mb, y0, y1, z0, z1, off, mi, n=5):
    """貼著胸前曲面的一塊布（口袋、袋蓋）：在身體表面取樣後往外推 off，四周收邊。"""
    grid = []
    for i in range(n + 1):
        y = y0 + (y1 - y0) * i / n
        row = []
        for j in range(n + 1):
            z = z0 + (z1 - z0) * j / n
            edge = i in (0, n) or j in (0, n)
            row.append(mb.bm.verts.new(V(front_x(y, z, 0.022, 0.022) + (0.0 if edge else off), y, z)))
        grid.append(row)
    for i in range(n):
        for j in range(n):
            mb.bm.faces.new([grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]).material_index = mi


def loft_x(mb, sections, mi, segs=14, floor=None):
    """沿 X 方向放樣的橢圓截面 [(x, yc, zc, ry, rz)]；floor：低於此高度的點壓平（鞋底）。"""
    rows = []
    for x, yc, zc, ry, rz in sections:
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            y = yc + math.sin(a) * ry
            row.append(mb.bm.verts.new(V(x, y if floor is None else max(floor, y), zc + math.cos(a) * rz)))
        rows.append(row)
    for a, b in zip(rows[:-1], rows[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            mb.bm.faces.new([a[i], a[j], b[j], b[i]]).material_index = mi
    mb.bm.faces.new(rows[0]).material_index = mi
    mb.bm.faces.new(list(reversed(rows[-1]))).material_index = mi


PARTS = []   # (物件, 綁定的骨頭)


def part(name, bone, builder, bevel=0.004):
    PARTS.append((builder.build(name, MATS, bevel=bevel), bone))


# ── 上衣下襬（皮帶以下）、皮帶與腰間裝具 ──
m = MeshBuilder()
cx, cz, rx, rz = ring_at(belt_y)
hx, hz, hrx, hrz = ring_at(belt_y - 0.14)
if WINTER:
    # 外套下襬：從腰帶到膝下約 12 cm，向下略張開。下半段的權重分給左右大腿，走動、騎馬時會跟著腿擺動
    hem_y = JP['KneeL'].y - 0.12
    rings = []
    for i in range(8):
        t = i / 7
        y = belt_y + 0.01 - t * (belt_y + 0.01 - hem_y)
        k = min(1.0, t / 0.3)
        gx = 0.006 + k * 0.03 + t * 0.035
        gz = 0.006 + k * 0.026 + t * 0.03
        rings.append((y, cx + (hx - cx) * k, cz + (hz - cz) * k, rx + (hrx - rx) * k + gx, rz + (hrz - rz) * k + gz))
    tube(m, list(reversed(rings)), WOOL)
    for j in range(2):     # 下襬的鈕扣（單排扣）
        for z in (0.0,):
            y = belt_y - 0.09 - j * 0.13
            t = (belt_y + 0.01 - y) / (belt_y + 0.01 - hem_y)
            k = min(1.0, t / 0.3)
            fx = cx + (hx - cx) * k + (rx + (hrx - rx) * k + 0.006 + k * 0.03 + t * 0.035) * math.sqrt(max(0.0, 1 - (z / (rz + hrz)) ** 2 * 4))
            m.lathe((fx - 0.004, y, z), (1, 0, 0), [(0, 0.012), (0.007, 0.008), (0.01, 0)], 10, BRS, cap0=False)

    def skirt_weights(g):
        t = max(0.0, min(1.0, (belt_y - g.y) / (belt_y - hem_y)))
        leg = 0.8 * t
        left = max(0.0, min(1.0, 0.5 - g.z / 0.16))    # 左側為 -Z
        return {'Hips': 1 - leg, 'HipL': leg * left, 'HipR': leg * (1 - left)}

    part('CoatSkirt', skirt_weights, m, bevel=0)
else:
    tube(m, [(belt_y - 0.2, hx, hz, hrx + 0.03, hrz + 0.028), (belt_y - 0.1, hx, hz, hrx + 0.022, hrz + 0.02), (belt_y + 0.01, cx, cz, rx + 0.006, rz + 0.006)], WOOL)
    part('TunicSkirt', 'Hips', m, bevel=0)
m = MeshBuilder()
r0, r1 = 0.004, 0.012
tube(m, [(belt_y - 0.025, cx, cz, rx + r0, rz + r0), (belt_y - 0.025, cx, cz, rx + r1, rz + r1), (belt_y + 0.025, cx, cz, rx + r1, rz + r1), (belt_y + 0.025, cx, cz, rx + r0, rz + r0)], LEA)
m.box((cx + rx + r1, belt_y, cz), (0.012, 0.05, 0.055), BRS)                                # 帶扣
if VARIANT in ('soldier', 'enemy'):
    for z in (-0.105, 0.105):
        m.box((front_x(belt_y, z) + 0.035, belt_y + 0.005, z), (0.06, 0.085, 0.1), LEA)    # 前彈盒
        m.box((front_x(belt_y, z) + 0.066, belt_y + 0.03, z), (0.006, 0.03, 0.104), LEA)
    m.box((back_x(belt_y) - 0.035, belt_y + 0.005, 0), (0.06, 0.085, 0.13), LEA)           # 後彈盒
    m.lathe((cx - 0.02, belt_y - 0.2, cz + rz + 0.05), (0, 1, 0), [(0, 0.0), (0.01, 0.05), (0.13, 0.055), (0.16, 0.02), (0.19, 0.016), (0.19, 0)], 14, CNV)  # 水壺
    m.box((cx - 0.02, belt_y - 0.1, cz - rz - 0.035), (0.2, 0.2, 0.055), CNV)              # 雜囊
if VARIANT == 'officer':
    m.box((cx + 0.02, belt_y - 0.07, cz + rz + 0.03), (0.13, 0.15, 0.05), LEA)             # 手槍套
    sx, sz = cx + 0.02, cz - rz - 0.03
    m.cylinder((sx + 0.1, belt_y - 0.02, sz), (sx - 0.5, belt_y - 0.66, sz - 0.02), 0.02, 10, STL)   # 軍刀鞘
    m.cylinder((sx + 0.1, belt_y - 0.02, sz), (sx + 0.22, belt_y + 0.1, sz), 0.015, 8, LEA)          # 刀柄
    m.lathe((sx + 0.1, belt_y - 0.02, sz), (1, 1, 0), [(0, 0.04), (0.01, 0.04), (0.01, 0)], 12, BRS)
part('Belt', 'Hips', m)

# ── 立領、領章、鈕扣、胸前口袋、背囊 ──
m = MeshBuilder()
NECK = [p for p in NECKV if math.hypot(p.x - JP['Head'].x, p.z) < 0.085]
nx, nz, nrx, nrz = ring_at(collar_y, 0.02, NECK)
if WINTER:
    # 外套：寬大的翻領（立起來可護住下巴與後頸）、單排扣。我軍為呢料領，架空敵軍為毛皮領
    tube(m, [(collar_y - 0.085, nx - 0.01, nz, nrx + 0.085, nrz + 0.095), (collar_y - 0.03, nx - 0.008, nz, nrx + 0.075, nrz + 0.08),
             (collar_y + 0.02, nx - 0.004, nz, nrx + 0.05, nrz + 0.05), (collar_y + 0.035, nx, nz, nrx + 0.03, nrz + 0.03),
             (collar_y + 0.02, nx, nz, nrx + 0.012, nrz + 0.012)], FUR if ENEMY else WOOL)
    for s_ in (-1, 1):       # 領章在翻領的前端
        a_ = math.radians(30) * s_
        m.box((nx - 0.008 + (nrx + 0.078) * math.cos(a_), collar_y - 0.03, nz + (nrz + 0.083) * math.sin(a_)), (0.012, 0.022, 0.034), RED)
    for j in range(4):
        y = belt_y + 0.07 + j * (collar_y - 0.16 - belt_y - 0.07) / 3
        for z in (0.0,):
            m.lathe((front_x(y, z) + 0.001, y, z), (1, 0, 0), [(0, 0.012), (0.007, 0.008), (0.01, 0)], 10, BRS, cap0=False)
else:
    tube(m, [(collar_y - 0.05, nx, nz, nrx + 0.04, nrz + 0.04), (collar_y - 0.015, nx, nz, nrx + 0.02, nrz + 0.02), (collar_y + 0.03, nx, nz, nrx + 0.014, nrz + 0.014), (collar_y + 0.03, nx, nz, nrx + 0.003, nrz + 0.003)], WOOL)
    for s_ in (-1, 1):
        m.box((nx + nrx * 0.93 + 0.026, collar_y + 0.008, s_ * 0.03), (0.006, 0.02, 0.032), RED)
    for j in range(5):
        y = belt_y + 0.06 + j * (collar_y - 0.09 - belt_y - 0.06) / 4
        m.lathe((front_x(y, 0) + 0.001, y, 0), (1, 0, 0), [(0, 0.011), (0.006, 0.007), (0.009, 0)], 10, BRS, cap0=False)
    py = sh_y - 0.15
    for s_ in (-1, 1):
        fx = front_x(py, s_ * 0.09, 0.03, 0.04)
        patch(m, py - 0.05, py + 0.05, s_ * 0.09 - 0.047, s_ * 0.09 + 0.047, 0.004, WOOL)      # 袋身
        patch(m, py + 0.022, py + 0.058, s_ * 0.09 - 0.05, s_ * 0.09 + 0.05, 0.008, WOOL)       # 袋蓋
        m.lathe((fx + 0.009, py + 0.03, s_ * 0.09), (1, 0, 0), [(0, 0.007), (0.005, 0)], 8, BRS, cap0=False)
SHOULDER = [p for p, r in CLOTH if r in ('Spine', 'ShoulderL', 'ShoulderR')]
for s_ in (-1, 1):       # 肩章：緋色呢料，橫置於肩頭，順著肩線的斜度貼在衣服上
    zj = JP['ShoulderL' if s_ < 0 else 'ShoulderR'].z
    xj = JP['ShoulderL'].x
    rows = []
    for i in range(5):
        z = zj * (0.6 + 0.3 * i / 4)
        y = max(p.y for p in SHOULDER if abs(p.z - z) < 0.015 and abs(p.x - xj) < 0.05) + 0.004
        rows.append((m.bm.verts.new(V(xj - 0.03, y - 0.006, z)), m.bm.verts.new(V(xj - 0.026, y, z)), m.bm.verts.new(V(xj + 0.026, y, z)), m.bm.verts.new(V(xj + 0.03, y - 0.006, z))))
    for r0_, r1_ in zip(rows[:-1], rows[1:]):
        for k in range(3):
            m.bm.faces.new([r0_[k], r0_[k + 1], r1_[k + 1], r1_[k]]).material_index = RED
if VARIANT in ('soldier', 'enemy'):
    by = belt_y + 0.24
    bxk = back_x(by) - 0.065
    m.box((bxk, by, 0), (0.12, 0.3, 0.29), CNV)                                            # 背囊
    m.cylinder((bxk, by + 0.17, -0.16), (bxk, by + 0.17, 0.16), 0.045, 12, CNV if WINTER else PUT)   # 捲起的外套（冬季穿在身上，改捲天幕）
if VARIANT == 'officer':
    for j in range(40):                                                                   # 斜背帶
        t = j / 39
        z = -0.15 + t * 0.27
        y = belt_y + 0.03 + t * (sh_y - belt_y - 0.05)
        m.box((front_x(y, z, 0.04, 0.05) + 0.003, y, z), (0.008, 0.03, 0.036), LEA)
    fy = belt_y + 0.2
    for z in (-0.04, 0.04):
        m.lathe((front_x(fy, 0) + 0.035, fy - 0.05, z), (0, 1, 0), [(0, 0.028), (0.07, 0.024), (0.1, 0.02), (0.1, 0)], 12, STL)   # 望遠鏡
part('TunicDetails', 'Spine', m)

# ── 編上靴（取代赤腳）──
def prism_z(mb, poly, z0, z1, mi):
    a = [mb.bm.verts.new(V(x, y, z0)) for x, y in poly]
    b = [mb.bm.verts.new(V(x, y, z1)) for x, y in poly]
    mb.bm.faces.new(a).material_index = mi
    mb.bm.faces.new(list(reversed(b))).material_index = mi
    for i in range(len(poly)):
        j = (i + 1) % len(poly)
        mb.bm.faces.new([a[j], a[i], b[i], b[j]]).material_index = mi


for s in 'LR':
    f = FEET[s]
    x0, x1 = min(p.x for p in f), max(p.x for p in f)
    z0, z1 = min(p.z for p in f), max(p.z for p in f)
    zc = (z0 + z1) / 2
    ax, az = JP['Ankle' + s].x, JP['Ankle' + s].z
    L = x1 - x0
    m = MeshBuilder()
    # 鞋身：後跟圓、腳背隆起、鞋頭略收
    loft_x(m, [(x0 - 0.004, 0.035, az, 0.03, 0.03), (x0 + 0.03, 0.045, az, 0.047, 0.04), (x0 + L * 0.42, 0.05, zc, 0.05, 0.045),
               (x0 + L * 0.7, 0.038, zc, 0.04, 0.047), (x0 + L * 0.92, 0.03, zc, 0.031, 0.042), (x1 + 0.006, 0.024, zc, 0.02, 0.03)], BOOT, floor=0.012)
    # 鞋底與鞋跟
    loft_x(m, [(x0 - 0.006, 0.006, az, 0.007, 0.033), (x0 + L * 0.5, 0.006, zc, 0.007, 0.049), (x1 + 0.008, 0.006, zc, 0.007, 0.034)], EYE, floor=0.0)
    m.box((x0 + 0.028, 0.008, az), (0.06, 0.018, 0.066), EYE)
    # 靴筒（到腳踝上方，綁腿蓋在外面）
    tube(m, [(0.05, ax - 0.005, az, 0.05, 0.043), (0.11, ax - 0.008, az, 0.046, 0.041), (0.17, ax - 0.01, az, 0.047, 0.043), (0.17, ax - 0.01, az, 0.03, 0.03)], BOOT, segs=14)
    part('Boot' + s, 'Ankle' + s, m, bevel=0)
    # 綁腿的纏繞紋：小腿上一圈圈略凸的布邊
    calf = [p for p, r in CLOTH if r == 'Knee' + s]
    if calf:
        m = MeshBuilder()
        ys = sorted(p.y for p in calf)
        y = ys[0] + 0.05
        while y < ys[-1] - 0.05:
            c1, c2, r1, r2 = ring_at(y, 0.02, calf)
            tube(m, [(y - 0.012, c1, c2, r1 + 0.001, r2 + 0.001), (y, c1, c2, r1 + 0.005, r2 + 0.005), (y + 0.004, c1, c2, r1 + 0.001, r2 + 0.001)], PUT, segs=14)
            y += 0.042
        part('Puttee' + s, 'Knee' + s, m, bevel=0)

# ── 眼球 ──
m = MeshBuilder()
for s in 'LR':
    e = G[f'eye.{s}'] + Vector((0.003, 0, 0))
    r = 0.0128
    prof = [(math.cos(math.radians(a)) * r, max(0.0, math.sin(math.radians(a)) * r)) for a in range(180, -1, -20)]
    m.lathe(tuple(e), (1, 0, 0), [p for p in prof if p[0] <= r * 0.78], 14, WHT, cap0=False, cap1=False)
    m.lathe(tuple(e), (1, 0, 0), [p for p in prof if p[0] >= r * 0.76], 14, EYE, cap0=False, cap1=False)
    # 眉毛：眼睛上方的深色細條，略向外下斜
    sgn = -1 if s == 'L' else 1
    for j in range(4):
        t = j / 3
        m.box((e.x + 0.013 - 0.004 * t, e.y + 0.021 - 0.004 * t * t, e.z + sgn * (-0.008 + 0.026 * t)), (0.005, 0.0045, 0.009), HAIR)
part('Eyes', 'Head', m, bevel=0)

# ── 鉄帽／軍帽 ──
head_top = max(p.y for p in HEADV)
crown = [p for p in HEADV if p.y > head_top - 0.09]
hcx = (min(p.x for p in crown) + max(p.x for p in crown)) / 2
hcz = (min(p.z for p in crown) + max(p.z for p in crown)) / 2
hrx = (max(p.x for p in crown) - min(p.x for p in crown)) / 2
hrz = (max(p.z for p in crown) - min(p.z for p in crown)) / 2
ear_y = G['eye.L'].y - 0.01
m = MeshBuilder()


def band(mb, rows, a0, a1, mi, segs=18):
    """沒有繞滿一圈的帶狀曲面（護耳、帽簷）。rows：[(y, rx, rz)] 由上而下；角度 0 為正前方。"""
    grid = []
    for y, rx_, rz_ in rows:
        grid.append([mb.bm.verts.new(V(hcx + math.cos(math.radians(a0 + (a1 - a0) * i / segs)) * rx_, y,
                                       hcz + math.sin(math.radians(a0 + (a1 - a0) * i / segs)) * rz_)) for i in range(segs + 1)])
    for a, b in zip(grid[:-1], grid[1:]):
        for i in range(segs):
            mb.bm.faces.new([a[i], a[i + 1], b[i + 1], b[i]]).material_index = mi


def ear_flaps(mb, top_y, grow=0.0):
    """防寒帽的護耳與護頸：從帽緣垂到下顎線，臉部正面（左右各 62°）留空。"""
    ring = [p for p in HEADV if abs(p.y - ear_y) < 0.04]
    rx_ = (max(p.x for p in ring) - min(p.x for p in ring)) / 2 + 0.012 + grow
    rz_ = (max(p.z for p in ring) - min(p.z for p in ring)) / 2 + 0.012 + grow
    band(mb, [(top_y, rx_, rz_), (ear_y - 0.02, rx_ + 0.006, rz_ + 0.006), (ear_y - 0.085, rx_ + 0.002, rz_ - 0.004), (ear_y - 0.1, rx_ - 0.012, rz_ - 0.018)], 62, 298, FUR)


if VARIANT == 'soldier':
    # 九〇式鉄帽：圓頂、下緣略外張，前有星章
    k = (hrx + 0.03) / 0.125
    y0 = head_top - 0.105
    prof = [(0, 0.16 * k), (0.012, 0.15 * k), (0.03, 0.137 * k), (0.07, 0.128 * k), (0.105, 0.105 * k), (0.128, 0.065 * k), (0.138, 0.03 * k), (0.141, 0)]
    m.lathe((hcx - 0.005, y0, hcz), (0, 1, 0), prof, 24, HELM, cap0=False)
    m.lathe((hcx - 0.005, y0 + 0.004, hcz), (0, 1, 0), [(0, 0.16 * k), (0, 0.11 * k)], 24, EYE, cap0=False, cap1=False)   # 帽內陰影
    m.lathe((hcx + 0.131 * k, y0 + 0.075, hcz), (1, 0.45, 0), [(0, 0.016), (0.005, 0)], 5, BRS, cap0=False)
    for s in (-1, 1):
        m.cylinder((hcx, y0 + 0.01, hcz + s * 0.125 * k), (hcx + 0.035, head_top - 0.225, hcz + s * 0.062), 0.005, 6, CNV)   # 顎紐
    ear_flaps(m, y0 + 0.02)            # 鉄帽下戴著防寒帽，只露出護耳
elif WINTER:
    # 防寒帽：毛皮圓頂帽，前面的護額往上翻，護耳放下
    r0 = hrx + 0.02
    y0 = head_top - 0.075
    k = (hrz + 0.026) / r0
    rows = [(y0, r0, r0 * k), (y0 + 0.05, r0 - 0.004, (r0 - 0.004) * k), (y0 + 0.085, r0 * 0.8, r0 * 0.8 * k), (y0 + 0.1, r0 * 0.45, r0 * 0.45 * k), (y0 + 0.104, 0.001, 0.001)]
    band(m, list(reversed(rows)), 0, 360, WOOL, segs=24)
    band(m, [(y0 + 0.07, r0 + 0.004, (r0 + 0.004) * k), (y0 + 0.068, r0 + 0.016, (r0 + 0.016) * k), (y0 + 0.004, r0 + 0.018, (r0 + 0.018) * k), (y0, r0 + 0.004, (r0 + 0.004) * k)], -64, 64, FUR, segs=12)   # 上翻的護額
    m.lathe((hcx + r0 + 0.018, y0 + 0.036, hcz), (1, 0, 0), [(0, 0.014), (0.005, 0)], 5, RED if ENEMY else BRS, cap0=False)
    ear_flaps(m, y0 + 0.06, 0.006)
else:
    # 軍帽：帽圈（我軍紅色）、較寬的平頂、黑色帽簷、星章
    r0 = hrx + 0.012
    y0 = head_top - 0.05
    m.lathe((hcx, y0, hcz), (0, 1, 0), [(0, r0), (0.04, r0)], 24, PUT if ENEMY else RED, cap0=False, cap1=False)
    m.lathe((hcx, y0 + 0.04, hcz), (0, 1, 0), [(0, r0), (0.045, r0 + 0.022), (0.06, r0 + 0.02), (0.066, 0)], 24, WOOL, cap0=False)
    m.prism([(hcz - 0.085, y0 + 0.004), (hcz + 0.085, y0 + 0.004), (hcz + 0.07, y0 - 0.008), (hcz - 0.07, y0 - 0.008)], hcx + r0 - 0.02, hcx + r0 + 0.05, BOOT)
    m.lathe((hcx + r0 + 0.004, y0 + 0.02, hcz), (1, 0, 0), [(0, 0.014), (0.005, 0)], 5, RED if ENEMY else BRS, cap0=False)
part('Headgear', 'Head', m, bevel=0.002)

# ───────────────────────── 5. 遊戲骨架 ─────────────────────────
arm_data = bpy.data.armatures.new('Root')
arm = bpy.data.objects.new('Root', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
PARENT = {'Hips': None, 'Spine': 'Hips', 'Head': 'Spine'}
for s in 'LR':
    PARENT.update({'Shoulder' + s: 'Spine', 'Elbow' + s: 'Shoulder' + s, 'Hand' + s: 'Elbow' + s,
                   'Hip' + s: 'Hips', 'Knee' + s: 'Hip' + s, 'Ankle' + s: 'Knee' + s})
eb = {}
for n in BONES:
    b = arm_data.edit_bones.new(n)
    b.head = V(*JP[n])
    b.tail = V(*JP[n]) + Vector((0, 0, 0.08))
    b.roll = 0.0
    eb[n] = b
for n, pn in PARENT.items():
    if pn:
        eb[n].parent = eb[pn]
bpy.ops.object.mode_set(mode='OBJECT')
print('BONE AXES', [tuple(round(x, 2) for x in row) for row in arm_data.bones['Hips'].matrix_local.to_3x3()])

# 裝具併入身體網格，各自 100% 綁到一根骨頭
bpy.ops.object.select_all(action='DESELECT')
for ob, bone in PARTS:
    ob.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0][0]
bpy.ops.object.convert(target='MESH')
for ob, bone in PARTS:
    if callable(bone):
        grps = {}
        for v in ob.data.vertices:
            for n, w in bone(game(ob.matrix_world @ v.co)).items():
                if w > 0.001:
                    if n not in grps:
                        grps[n] = ob.vertex_groups.new(name=n)
                    grps[n].add([v.index], w, 'REPLACE')
        continue
    grp = ob.vertex_groups.new(name=bone)
    grp.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.parent = arm
mod = body.modifiers.new('Armature', 'ARMATURE')
mod.object = arm

# ───────────────────────── 6. 三八式歩兵銃（斜背；遊戲可改到手上） ─────────────────────────
if VARIANT in ('soldier', 'enemy'):
    rifle = empty('Rifle')
    rifle.parent = arm
    rifle.parent_type = 'BONE'
    rifle.parent_bone = 'Spine'
    bpy.context.view_layer.update()
    rx0 = back_x(belt_y + 0.24) - 0.15
    rifle.matrix_world = Matrix.Translation(V(rx0, JP['Spine'].y + 0.22, 0)) @ Matrix.Rotation(math.radians(28), 4, 'X')
    m = MeshBuilder()
    m.prism([(-0.02, -0.55), (0.02, -0.55), (0.02, -0.28), (0.012, -0.2), (-0.012, -0.2), (-0.02, -0.28)], -0.03, 0.045, WOOD)  # 槍托
    m.box((0, 0.05, 0.008), (0.03, 0.5, 0.05), WOOD)                                       # 護木
    m.cylinder((0.0, -0.2, 0.015), (0.0, 0.73, 0.015), 0.011, 8, STL)                      # 槍管
    m.box((0, -0.15, 0.03), (0.026, 0.12, 0.04), STL)                                      # 機匣
    m.cylinder((0.0, -0.13, 0.04), (0.0, -0.13, 0.08), 0.007, 6, STL)                      # 槍機柄
    m.box((0, -0.24, -0.01), (0.014, 0.08, 0.02), STL)                                     # 扳機護圈
    m.cylinder((0.0, 0.6, 0.015), (0.0, 0.62, 0.015), 0.016, 8, STL)                       # 前環
    m.cylinder((0, -0.45, -0.025), (0, 0.4, -0.025), 0.006, 6, LEA)                       # 背帶
    m.build('RifleMesh', MATS, parent=rifle, bevel=0.003)

# ───────────────────────── 7. 把縫隙陰影烘焙到頂點色 ─────────────────────────
# 眼窩、鼻翼、耳朵、帽簷下、腋下、裝具接觸處會變暗；遊戲端把頂點色乘進底色
for ob in [body]:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    col = ob.data.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    ob.data.color_attributes.active_color = col
    ob.data.color_attributes.render_color_index = ob.data.color_attributes.find('Col')
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    scn.cycles.samples = 48
    if scn.world is None:
        scn.world = bpy.data.worlds.new('BakeWorld')
    scn.world.light_settings.distance = 0.25
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    # 陰影只壓到約一半亮度：靜止姿勢下手貼著大腿，全黑的話抬手時會像戴了深色手套
    import numpy as np
    buf = np.zeros(len(col.data) * 4, dtype=np.float32)
    col.data.foreach_get('color', buf)
    buf = buf.reshape(-1, 4)
    buf[:, :3] = 0.5 + 0.5 * buf[:, :3]
    col.data.foreach_set('color', buf.ravel())

name = f'crew_{VARIANT}'
glb = os.path.join(PROJECT, 'public', 'models', f'{name}.glb')
export_glb(arm, glb, vertex_color=True)
save_blend(os.path.join(PROJECT, 'assets', 'blender', f'{name}.blend'))
render_preview(os.path.join(PROJECT, 'docs', 'preview', f'{name}.png'), target=(0, 0.95, 0), cam_pos=(2.3, 1.5, 1.3), size=(900, 1100), lens=50)
print('DONE', glb, os.path.getsize(glb))
