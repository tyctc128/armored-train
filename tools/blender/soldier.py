"""軍士建模腳本（寫實版）：以 MPFB（MakeHuman）產生人體，換成雙臂下垂的站姿，
再把身體表面做成軍服、加上裝具，綁到遊戲用的簡化骨架上。

執行（不要加 --factory-startup，需要已安裝的 MPFB 外掛）：
  blender -b -P tools/blender/soldier.py -- soldier   # 步兵：九〇式鉄帽、三八式歩兵銃、彈盒、背囊
  blender -b -P tools/blender/soldier.py -- crew      # 車組員：白色作業衣、軟帽、無步槍
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
CREW = VARIANT == 'crew'     # 車內乘員：試驗影片中穿白色作業衣、戴軟帽
WINTER = VARIANT in ('soldier', 'enemy')   # 車外作戰的人穿防寒外套、戴防寒帽；車內乘員穿軍衣
HEIGHT = 1.66

bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.preferences.addon_enable(module='bl_ext.user_default.mpfb')
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.user_default.mpfb.services.targetservice import TargetService  # noqa: E402

M_WOOL = material('Wool', '#5d6a63' if ENEMY else '#c4bca6' if CREW else '#75643f', rough=0.95)   # 昭五式：帶赤茶褐色；作業衣：未染色的白棉布
M_PUTTEE = material('WoolDark', '#46504a' if ENEMY else '#695a3b', rough=0.95)
# 皮膚：MakeHuman 社群的皮膚貼圖（CC0），由 tools/textures/skin.py 調成東亞膚色；人體保留 MakeHuman 的 UV
SKIN_IMG = os.path.join(PROJECT, 'assets', 'pbr', 'skin_asian.jpg')
SKIN_SRC = os.path.join(PROJECT, 'assets', 'pbr', 'skin_src', 'light_skin_male_bronze.png')
TEX = os.path.exists(SKIN_IMG) and os.path.exists(SKIN_SRC)
M_SKIN = material('Skin', '#ffffff', rough=0.62, image=bpy.data.images.load(SKIN_IMG) if os.path.exists(SKIN_IMG) else None)
if not os.path.exists(SKIN_IMG):
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
HAIR_MUL = (0.26, 0.25, 0.27)    # 頭髮蓋在皮膚貼圖上的明暗倍率
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
# 表情與體型：用 MPFB 內建的 MakeHuman 變形目標（表情單元、軀幹）。
# 預設的臉完全放鬆、嘴微張，看起來沒有表情；軍服底下的身體則把胸肌、腰線、臀部收斂一些
import bl_ext.user_default.mpfb as _mpfb  # noqa: E402
TDIR = os.path.join(os.path.dirname(_mpfb.__file__), 'data', 'targets')
EXPR = {
    # 步兵（哨兵、機槍手）：寒風中瞇眼、抿嘴
    'soldier': {'eyebrows-left-down': 0.45, 'eyebrows-right-down': 0.45, 'eye-left-slit': 0.3, 'eye-right-slit': 0.3,
                'mouth-compression': 0.6, 'mouth-depression': 0.15},
    # 車組員：專注操作，眉頭微皺
    'crew': {'eyebrows-left-down': 0.3, 'eyebrows-right-down': 0.3, 'eyebrows-left-inner-up': 0.15, 'eyebrows-right-inner-up': 0.15,
             'eye-left-slit': 0.15, 'eye-right-slit': 0.15, 'mouth-compression': 0.5},
    # 軍官：嚴厲，嘴角下壓
    'officer': {'eyebrows-left-down': 0.7, 'eyebrows-right-down': 0.7, 'eye-left-slit': 0.2, 'eye-right-slit': 0.2,
                'mouth-compression': 0.5, 'mouth-depression': 0.45, 'nose-compression': 0.25},
    # 敵軍：咬牙、瞇眼
    'enemy': {'eyebrows-left-down': 0.6, 'eyebrows-right-down': 0.6, 'eye-left-slit': 0.45, 'eye-right-slit': 0.45,
              'mouth-compression': 0.35, 'mouth-retraction': 0.3, 'nose-left-elevation': 0.2, 'nose-right-elevation': 0.2},
}
SHAPE = {'torso/torso-muscle-pectoral-decr': 1.0, 'buttocks/buttocks-volume-decr': 1.0, 'torso/measure-waist-circ-incr': 0.6}
for tn, tw in list(SHAPE.items()) + [('expression/units/asian/' + k, w) for k, w in EXPR[VARIANT].items()]:
    tp = os.path.join(TDIR, *tn.split('/')) + '.target.gz'
    if os.path.exists(tp):
        TargetService.load_target(body, tp, weight=tw, name=tn.split('/')[-1])
    else:
        print('MISSING TARGET', tp)
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
for n in ('scalp', 'lips', 'helper', 'deci'):
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
            mi = SKIN if TEX else HAIR   # 有貼圖時頭髮畫在頂點色上（見第 7 節）
        elif all(v[dl].get(li, 0) > 0 for v in f.verts):
            mi = SKIN if os.path.exists(SKIN_IMG) else LIP   # 貼圖上已有嘴唇
        else:
            mi = SKIN
    elif sum(r == 'Ankle' for r in rs) * 2 > len(rs):
        mi = BOOT
    elif sum(r == 'Knee' for r in rs) * 2 > len(rs):
        mi = PUT
    else:
        mi = WOOL
    f.material_index = mi

if TEX:
    # 髮際線：把頭皮權重抹開約 1 cm，減面後由頂點色內插成柔和的邊緣（丸刈り的短髮本來就沒有銳利的髮際線）
    sw = {v: (1.0 if v[dl].get(si, 0) > 0 else 0.0) for v in bm.verts}
    for _ in range(3):
        sw = {v: (sw[v] + sum(sw[e.other_vert(v)] for e in v.link_edges)) / (1 + len(v.link_edges)) for v in bm.verts}
    for v in bm.verts:
        if sw[v] > 0.002:
            v[dl][si] = sw[v]
    # 眼窩：MakeHuman 的人體在眼皮後面有一塊凹進去的「眼窩內壁」（貼圖上塗成鮮紅色的兩個圓），原本由另外的眼球網格遮住。
    # 用它量出眼眶實際的位置（骨架的 eye 骨頭不在眼眶正中）。
    import numpy as np
    src = bpy.data.images.load(SKIN_SRC)
    iw, ih = src.size
    px = np.empty(iw * ih * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(ih, iw, 4)
    uv0 = bm.loops.layers.uv.verify()

    def is_red(v):
        if not v.link_loops:
            return False
        for loop in v.link_loops:
            u, w_ = loop[uv0].uv
            r_, g_ = px[min(ih - 1, max(0, int(w_ * ih))), min(iw - 1, max(0, int(u * iw)))][:2]
            if not (r_ > 0.43 and g_ < 0.42 * r_):
                return False
        return True

    EYE_R = 0.0125
    for s_, sgn_ in (('L', 1), ('R', -1)):
        ec = P[f'eye.{s_}']
        pocket = [v for v in bm.verts if (v.co - ec).length < 0.06 and v.co.y * sgn_ > 0.012 and is_red(v)]
        cs = [v.co for v in pocket]
        lo = [min(c[i] for c in cs) for i in range(3)]
        hi_ = [max(c[i] for c in cs) for i in range(3)]
        # 眼球中心：眼窩正中，貼著內壁最深處往前一個半徑
        cen = Vector((lo[0] + EYE_R + 0.0005, (lo[1] + hi_[1]) / 2, (lo[2] + hi_[2]) / 2))
        P[f'eyeball.{s_}'] = cen
        print('POCKET', s_, len(cs), 'bone', [round(c, 4) for c in ec], 'eyeball', [round(c, 4) for c in cen])
        # 內壁壓平到眼球後半，減面後才不會穿到眼球前面
        for v in pocket:
            v.co.x = min(v.co.x, cen.x - EYE_R * 0.6)
    bpy.data.images.remove(src)
for f in bm.faces:
    f.smooth = True
bm.normal_update()
if not TEX:
    for s_ in 'LR':
        P[f'eyeball.{s_}'] = P[f'eye.{s_}'].copy()
# 減面時不動眼睛周圍，眼皮的形狀才留得住
for v in bm.verts:
    if min((v.co - P['eyeball.L']).length, (v.co - P['eyeball.R']).length) > 0.024:
        v[dl][vg['deci'].index] = 1.0

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
        amt = 0.026 if WINTER else 0.018   # 袖子
    v.co += v.normal * amt
bm.normal_update()

# 寬鬆剪裁：軍服是直筒剪裁的厚呢料，不會貼著身體。把布料改成「從最凸的地方往下垂掛」的筒狀：
# 每個高度切一圈，取外輪廓（填掉胸肌之間、脊椎溝、臀縫等凹處），再讓下面每一圈至少和上面一樣寬。
import numpy as np  # noqa: E402
NS = 48


def loosen(verts, z0, z1, ease, extra=None, h=0.012):
    vs = [v for v in verts if z0 <= v.co.z <= z1]
    if len(vs) < 50:
        return
    n = int((z1 - z0) / h) + 1
    sl = [[] for _ in range(n)]
    for v in vs:
        sl[min(n - 1, int((v.co.z - z0) / h))].append(v)
    R = np.zeros((n, NS))
    ax = [None] * n
    for i in range(n):
        if len(sl[i]) < 6:
            continue
        xs = [v.co.x for v in sl[i]]
        ys = [v.co.y for v in sl[i]]
        ax[i] = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    known = [i for i in range(n) if ax[i]]
    if not known:
        return
    for i in range(n):
        if ax[i] is None:
            ax[i] = ax[min(known, key=lambda j: abs(j - i))]

    def pol(v, i):
        dx, dy = v.co.x - ax[i][0], v.co.y - ax[i][1]
        return math.hypot(dx, dy), (math.atan2(dy, dx) % (2 * math.pi)) / (2 * math.pi) * NS

    for i in range(n):
        for v in sl[i]:
            r, k = pol(v, i)
            for kk in (int(k) % NS, (int(k) + 1) % NS):
                R[i, kk] = max(R[i, kk], r)
        row = R[i]
        for _ in range(4):      # 填凹處
            row = np.maximum(row, (np.roll(row, 1) + np.roll(row, -1)) / 2)
        R[i] = row
    for i in range(n - 2, -1, -1):      # 由上往下垂
        R[i] = np.maximum(R[i], R[i + 1])
    for i in range(n):
        for v in sl[i]:
            r, k = pol(v, i)
            k0 = int(k) % NS
            f = k - int(k)
            t = R[i, k0] * (1 - f) + R[i, (k0 + 1) % NS] * f + (extra(v.co.z) if extra else 0.0)     # 外輪廓再加鬆份
            w = ease(v.co.z)
            if t > r and w > 0 and r > 1e-5:
                g = (r + (t - r) * w) / r
                v.co.x = ax[i][0] + (v.co.x - ax[i][0]) * g
                v.co.y = ax[i][1] + (v.co.y - ax[i][1]) * g


def sstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


wool_v = [v for v in bm.verts if v.link_faces and all(f.material_index == WOOL for f in v.link_faces)]
belt_z = 0.6 * HEIGHT
arm_z = P['upperarm01.L'].z - 0.05
crotch_z = P['upperleg01.L'].z - 0.09
knee_z = P['lowerleg01.L'].z
torso_v = [v for v in wool_v if region[v] in ('Spine', 'Hips')]
cinch = 0.88 if WINTER else 0.8      # 腰帶處只略為收束（布料從胸口直直垂到腰帶）
EASE = 0.018 if WINTER else 0.016     # 上衣與身體之間的空隙
# 上衣：腰帶上方的布料多出一圈，蓋在腰帶上（束腰帶後自然鼓出）
loosen(torso_v, belt_z, arm_z, lambda z: cinch + (1 - cinch) * sstep((z - belt_z) / 0.09),
       lambda z: EASE * sstep((arm_z - z) / 0.08) + 0.01 * math.exp(-((z - belt_z - 0.055) / 0.04) ** 2))
loosen(torso_v, crotch_z, belt_z, lambda z: 1.0, lambda z: 0.02)
for s_, sgn_ in (('L', 1), ('R', -1)):
    # 短袴：大腿寬鬆，到膝蓋收攏
    leg_v = [v for v in wool_v if region[v] == 'Hip' + s_]
    loosen(leg_v, knee_z, P['upperleg01.L'].z, lambda z: sstep((z - knee_z) / 0.06),
           lambda z: 0.01 + 0.02 * sstep((z - knee_z) / 0.07))      # 短袴：膝上就鼓出來，垂在綁腿上緣
    for v in leg_v:
        if v.co.y * sgn_ < 0.003:
            v.co.y = 0.003 * sgn_
    # 袖子：從肩頭垂下的直筒，到袖口收攏
    wrist_z = P[f'wrist.{s_}'].z
    arm_v = [v for v in wool_v if region[v] in ('Shoulder' + s_, 'Elbow' + s_)]
    loosen(arm_v, wrist_z, arm_z, lambda z: sstep((z - wrist_z) / 0.04),
           lambda z: (0.02 if WINTER else 0.015) * sstep((arm_z - z) / 0.06))      # 直筒袖，到袖口才收
# 抹平：去掉肌肉線條與上面各段之間的接縫（與皮膚相接的頂點不動）
for _ in range(10):
    new = {}
    for v in wool_v:
        nb = [e.other_vert(v).co for e in v.link_edges]
        new[v] = v.co.lerp(sum(nb, Vector()) / len(nb), 0.5)
    for v, c in new.items():
        v.co = c
bm.normal_update()
for v in wool_v:
    v.co += v.normal * 0.004      # 補回抹平時縮掉的體積
bm.normal_update()
# 縐褶：布料不是光滑的殼。軀幹是直向的垂褶，袖子在手肘、褲子在膝上是橫向的擠褶
from mathutils import noise as _noise  # noqa: E402
elbow_z = P['lowerarm01.L'].z
for v in wool_v:
    c = v.co
    rg = region[v]
    if rg in ('Spine', 'Hips'):
        d = 0.007 * _noise.noise(Vector((c.x * 16, c.y * 16, c.z * 4.5))) + 0.006 * math.exp(-((c.z - belt_z - 0.05) / 0.05) ** 2) * _noise.noise(Vector((c.x * 30, c.y * 30, c.z * 6)))
    elif rg.startswith(('Shoulder', 'Elbow')):
        d = (0.004 + 0.007 * math.exp(-((c.z - elbow_z) / 0.09) ** 2)) * _noise.noise(Vector((c.x * 7, c.y * 7, c.z * 34)))
    elif rg.startswith('Hip'):
        d = (0.004 + 0.008 * math.exp(-((c.z - knee_z - 0.07) / 0.08) ** 2)) * _noise.noise(Vector((c.x * 8, c.y * 8, c.z * 30)))
    else:
        d = 0.0
    v.co += v.normal * d
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
LIPV = [game(v.co) for v in bm.verts if v[dl].get(li, 0) > 0.5]
NECKV = [game(v.co) for v in bm.verts if abs(v.co.z - collar_z) < 0.02 and region[v] in ('Head', 'Spine')]
face_mats = [f.material_index for f in bm.faces]
bm.to_mesh(me)
bm.free()
me.materials.clear()
for mat in MATS:
    me.materials.append(mat)
me.polygons.foreach_set('material_index', face_mats)
for n in (('lips', 'helper') if TEX else ('scalp', 'lips', 'helper')):   # 有貼圖時 scalp 留到第 7 節畫頭髮
    body.vertex_groups.remove(vg[n])
body.name = 'Body'

# 減面：MakeHuman 的網格很密（單是雙手就有六千多個三角形），遊戲裡同時有幾十名軍士。
# 整體簡化到約三成的面數；權重會跟著內插。
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
d = body.modifiers.new('Decimate', 'DECIMATE')
d.ratio = 0.36     # 留多一點面，縐褶才保得住
d.vertex_group = 'deci'
d.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=d.name)
body.vertex_groups.remove(body.vertex_groups['deci'])
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


def tube(mb, rings, mi, segs=24, pleat=None):
    """rings：[(y, cx, cz, rx, rz)] 由下而上的橢圓環。"""
    rows = []
    for ri, (y, cx, cz, rx, rz) in enumerate(rings):
        row = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            g = pleat[ri] * (0.6 * math.sin(7 * a + 0.8) + 0.4 * math.sin(11 * a + 2.1)) if pleat else 0.0     # 垂褶
            row.append(mb.bm.verts.new(V(cx + math.cos(a) * (rx + g), y, cz + math.sin(a) * (rz + g))))
        rows.append(row)
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
    tube(m, list(reversed(rings)), WOOL, segs=44, pleat=[0.014 * (1 - i / 7) ** 1.0 for i in range(8)])     # 越往下襬垂褶越深
    for j in range(2):     # 下襬的鈕扣（單排扣）
        for z in (0.0,):
            y = belt_y - 0.09 - j * 0.13
            t = (belt_y + 0.01 - y) / (belt_y + 0.01 - hem_y)
            k = min(1.0, t / 0.3)
            fx = cx + (hx - cx) * k + (rx + (hrx - rx) * k + 0.006 + k * 0.03 + t * 0.035) * math.sqrt(max(0.0, 1 - (z / (rz + hrz)) ** 2 * 4))
            m.lathe((fx - 0.004, y, z), (1, 0, 0), [(0, 0.012), (0.007, 0.008), (0.01, 0)], 10, BRS, cap0=False)

    def skirt_weights(g):
        t = max(0.0, min(1.0, (belt_y - g.y) / (belt_y - hem_y)))
        leg = min(1.0, t / 0.5)      # 下襬中段以下完全跟著大腿，膝蓋才不會從外套正面頂出來
        left = max(0.0, min(1.0, 0.5 - g.z / 0.16))    # 左側為 -Z
        return {'Hips': 1 - leg, 'HipL': leg * left, 'HipR': leg * (1 - left)}

    part('CoatSkirt', skirt_weights, m, bevel=0)
else:
    tube(m, [(belt_y - 0.2, hx, hz, hrx + 0.03, hrz + 0.028), (belt_y - 0.1, hx, hz, hrx + 0.022, hrz + 0.02), (belt_y + 0.01, cx, cz, rx + 0.006, rz + 0.006)], WOOL, segs=36, pleat=[0.007, 0.004, 0.0])
    part('TunicSkirt', 'Hips', m, bevel=0)
m = MeshBuilder()
r0, r1 = 0.012, 0.022     # 上衣不是正橢圓，皮帶要再大一圈才不會陷進布料
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
    for s_ in (() if CREW else (-1, 1)):     # 作業衣沒有領章
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
for s_ in (() if CREW else (-1, 1)):       # 肩章：緋色呢料，橫置於肩頭，順著肩線的斜度貼在衣服上（作業衣沒有）
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
    e = G[f'eyeball.{s}']
    r = 0.0125
    prof = [(math.cos(math.radians(a)) * r, max(0.0, math.sin(math.radians(a)) * r)) for a in range(180, -1, -15)]
    m.lathe(tuple(e), (1, 0, 0), [p for p in prof if p[0] <= r * 0.87], 16, WHT, cap0=False, cap1=False)
    m.lathe(tuple(e), (1, 0, 0), [p for p in prof if p[0] >= r * 0.86], 16, EYE, cap0=False, cap1=False)   # 虹膜直徑約 13 mm
    # 眉毛：眼睛上方的深色細條，略向外下斜
    sgn = -1 if s == 'L' else 1
    for j in range(13):
        t = j / 12
        by, bz = e.y + 0.0155 + 0.004 * t - 0.007 * t * t, e.z + sgn * (-0.011 + 0.031 * t)
        near = [p.x for p in HEADV if abs(p.y - by) < 0.005 and abs(p.z - bz) < 0.005]
        bx = max(near) if near else e.x + 0.02     # 眉骨表面
        m.box((bx - 0.0015, by, bz), (0.005, 0.0036 - 0.0016 * t, 0.0045), HAIR)
# 嘴唇之間：MakeHuman 的嘴是張開一條縫的，裡面沒有牙齒，會直接看穿到後面。在唇後放一塊深色擋住
if LIPV:
    lx = max(p.x for p in LIPV)
    ly = sorted(p.y for p in LIPV)[len(LIPV) // 2]
    lw = max(abs(p.z) for p in LIPV)
    m.box((lx - 0.0125, ly, 0), (0.006, 0.007, lw * 0.9), HAIR)   # 用不反光的深色（Eye 材質會反射天空而發亮）
    for sg_ in (-1, 1):     # 嘴角往後彎，分段跟著退
        m.box((lx - 0.0185, ly, sg_ * lw * 0.62), (0.006, 0.006, lw * 0.5), HAIR)
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
elif CREW:
    # 軟帽（作業帽）：貼著頭的低圓頂、短布簷、前有星章
    r0 = hrx + 0.012
    y0 = head_top - 0.06
    k = (hrz + 0.014) / r0
    rows = [(y0, r0, r0 * k), (y0 + 0.04, r0 + 0.002, (r0 + 0.002) * k), (y0 + 0.066, r0 * 0.86, r0 * 0.86 * k), (y0 + 0.08, r0 * 0.5, r0 * 0.5 * k), (y0 + 0.084, 0.001, 0.001)]
    band(m, list(reversed(rows)), 0, 360, PUT, segs=24)
    band(m, [(y0 + 0.006, r0, r0 * k), (y0 - 0.004, r0 + 0.05, (r0 + 0.05) * k)], -48, 48, PUT, segs=10)     # 短簷
    band(m, [(y0 - 0.006, r0 + 0.05, (r0 + 0.05) * k), (y0 + 0.004, r0, r0 * k)], -48, 48, PUT, segs=10)
    m.lathe((hcx + r0 + 0.003, y0 + 0.03, hcz), (1, 0, 0), [(0, 0.012), (0.004, 0)], 5, BRS, cap0=False)
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
    # 臉部膚色變化（沒有皮膚貼圖，改畫在頂點色上）：臉頰、鼻頭、耳朵偏紅（十二月的寒風），
    # 下巴與上唇有刮過鬍子的青灰，眼窩略暗，並加一點不均勻
    skin_v = set()
    for poly in ob.data.polygons:
        if poly.material_index == SKIN:
            skin_v.update(poly.vertices)
    eye = (G['eyeball.L'] + G['eyeball.R']) / 2
    ear_r = max(abs(p_.z) for p_ in HEADV)
    rnd = np.random.default_rng(7)
    for vi in skin_v:
        g = game(ob.data.vertices[vi].co)
        if g.y < collar_y:
            continue          # 手
        front = max(0.0, min(1.0, (g.x - (eye.x - 0.05)) / 0.04))
        dy = g.y - eye.y
        cheek = front * math.exp(-((dy + 0.04) / 0.028) ** 2) * min(1.0, abs(g.z) / 0.02 + 0.6)
        ear = max(0.0, min(1.0, (abs(g.z) - ear_r * 0.86) / (ear_r * 0.1))) * (1.0 if abs(dy) < 0.05 else 0.3)
        red = min(1.0, cheek * 0.8 + ear * 0.7)
        beard = front * max(0.0, min(1.0, (-dy - 0.062) / 0.02)) * max(0.0, min(1.0, (dy + 0.135) / 0.02))
        socket = front * math.exp(-(dy / 0.012) ** 2) * math.exp(-((abs(g.z) - abs(G['eyeball.L'].z)) / 0.022) ** 2)
        n = 1.0 + (rnd.random() - 0.5) * 0.05
        c = buf[vi, :3]
        c[0] *= n * (1 - 0.08 * beard) * (1 - 0.07 * socket)
        c[1] *= n * (1 - 0.09 * red) * (1 - 0.06 * beard) * (1 - 0.08 * socket)
        c[2] *= n * (1 - 0.12 * red) * (1 - 0.03 * beard) * (1 - 0.08 * socket)
    # 頭髮（丸刈り）：頭皮上的深色短髮，邊緣漸淡
    sg = ob.vertex_groups.get('scalp')
    if sg is not None:
        for v in ob.data.vertices:
            w_ = next((g_.weight for g_ in v.groups if g_.group == sg.index), 0.0)
            k_ = max(0.0, min(1.0, (w_ - 0.3) / 0.4))
            if k_ > 0:
                k_ = k_ * k_ * (3 - 2 * k_)
                buf[v.index, :3] *= 1 + (np.array(HAIR_MUL) - 1) * k_
        ob.vertex_groups.remove(sg)
    col.data.foreach_set('color', buf.ravel())

name = f'crew_{VARIANT}'
glb = os.path.join(PROJECT, 'public', 'models', f'{name}.glb')
export_glb(arm, glb, vertex_color=True)
save_blend(os.path.join(PROJECT, 'assets', 'blender', f'{name}.blend'))
render_preview(os.path.join(PROJECT, 'docs', 'preview', f'{name}.png'), target=(0, 0.95, 0), cam_pos=(2.3, 1.5, 1.3), size=(900, 1100), lens=50)
print('DONE', glb, os.path.getsize(glb))
