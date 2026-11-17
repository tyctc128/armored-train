"""戰馬建模腳本（寫實版，敵軍騎兵用）：蒙古馬體型——矮壯、頭大、頸粗、鬃毛與尾毛濃密。
各部位以橢圓截面放樣成圓潤的形體，關節處互相重疊；遊戲以程式轉動關節產生奔跑、站立、倒地動作。

執行：
  blender -b --factory-startup -P tools/blender/horse.py

輸出 public/models/horse.glb、assets/blender/horse.blend、docs/preview/horse.png

關節節點（遊戲以名稱抓取，請勿更名）：
  Root → Body → Neck → HeadH
              → LegFL / LegFR / LegBL / LegBR → KneeFL / KneeFR / KneeBL / KneeBR
              → Tail
              → Saddle（騎手骨盆位置）
座標：+X 為馬頭方向、+Y 上、+Z 右；Root 在地面。左側為 -Z。各關節繞 Z 軸擺動（正值往前）。
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    PROJECT, MeshBuilder, V, empty, reset_scene, material, paint_texture,
    export_glb, save_blend, render_preview,
)

reset_scene()
TEX = os.path.join(PROJECT, 'assets', 'textures')
M_COAT = material('Coat', image=paint_texture(TEX, '#6b4426', 'horse_coat_dun', seed=33), rough=0.75)
M_MANE = material('Mane', '#1e1712', rough=0.9)
M_HOOF = material('Hoof', '#2e2b28', rough=0.6)
M_LEATHER = material('Leather', '#4a2e1a', rough=0.55)
M_CANVAS = material('Canvas', '#8a7b55', rough=1.0)
M_STEEL = material('Steel', '#3a3a36', rough=0.4, metal=0.8)
M_EYE = material('Eye', '#0e0b09', rough=0.3)
MATS = [M_COAT, M_MANE, M_HOOF, M_LEATHER, M_CANVAS, M_STEEL, M_EYE]
COAT, MANE, HOOF, LEA, CNV, STL, EYE = range(7)

BODY_Y = 1.06            # 胴體中心高度（肩高約 1.35 m）
LEG_Y = -0.05            # 腿根相對 Body 的高度
UPPER = 0.5              # 腿根到膝（後腿為飛節）
LOWER = 0.51             # 膝到蹄底

root = empty('Root')
body = empty('Body', root, (0, BODY_Y, 0))


def loft(mb, sections, mi, segs=16, arc=(0.0, 360.0), cap=True):
    """沿路徑放樣的橢圓截面：sections = [((x, y), 上下半徑, 左右半徑), ...]（路徑在 XY 平面，左右對稱）。
    arc：只做截面的一段角度（度，0° 在正上方，順時針朝 +Z），用於鞍墊這類只蓋住上半的東西。"""
    full = arc[1] - arc[0] >= 360
    n = segs if full else segs + 1
    rows = []
    for i, ((x, y), ru, rs) in enumerate(sections):
        a = sections[max(0, i - 1)][0]
        b = sections[min(len(sections) - 1, i + 1)][0]
        t = Vector((b[0] - a[0], b[1] - a[1], 0)).normalized()
        up = Vector((-t.y, t.x, 0))          # 路徑的法線（在 XY 平面內）
        if up.y < 0 and abs(t.x) > abs(t.y):
            up = -up
        row = []
        for k in range(n):
            ang = math.radians(arc[0] + (arc[1] - arc[0]) * k / segs)
            p = Vector((x, y, 0)) + up * math.cos(ang) * ru + Vector((0, 0, 1)) * math.sin(ang) * rs
            row.append(mb.bm.verts.new(V(*p)))
        rows.append(row)
    for a, b in zip(rows[:-1], rows[1:]):
        for k in range(n if full else n - 1):
            j = (k + 1) % n
            mb.bm.faces.new([a[k], a[j], b[j], b[k]]).material_index = mi
    if cap and full:
        mb.bm.faces.new(rows[0]).material_index = mi
        mb.bm.faces.new(list(reversed(rows[-1]))).material_index = mi


def part(name, parent, builder):
    return builder.build(name + 'Mesh', MATS, parent=parent, bevel=0.0)


# ── 軀幹：臀、腹、肩；鞍墊、馬鞍、肚帶、馬鐙、鞍囊 ──
BODY = [((-0.80, 0.06), 0.09, 0.07), ((-0.74, 0.07), 0.2, 0.17), ((-0.6, 0.06), 0.29, 0.25), ((-0.4, 0.03), 0.32, 0.28),
        ((-0.15, 0.0), 0.32, 0.3), ((0.12, -0.02), 0.33, 0.3), ((0.38, 0.0), 0.32, 0.27), ((0.56, 0.04), 0.31, 0.23),
        ((0.7, 0.03), 0.26, 0.18), ((0.8, -0.01), 0.15, 0.12), ((0.84, -0.03), 0.06, 0.05)]
m = MeshBuilder()
loft(m, BODY, COAT, 18)
pad = [(p, ru + 0.012, rs + 0.012) for p, ru, rs in BODY if -0.3 <= p[0] <= 0.4]
loft(m, pad, CNV, 14, arc=(-105, 105))                                                             # 鞍墊（毛氈）
seat = [((-0.24, 0.02), 0.385, 0.2), ((-0.2, 0.0), 0.365, 0.22), ((0.0, -0.01), 0.36, 0.22), ((0.18, 0.0), 0.365, 0.2), ((0.24, 0.02), 0.4, 0.16)]
loft(m, seat, LEA, 10, arc=(-48, 48))                                                              # 鞍座（前後鞍橋隆起）
loft(m, [((0.1, -0.02), 0.338, 0.308), ((0.18, -0.02), 0.338, 0.305)], LEA, 18, cap=False)        # 肚帶
for s in (-1, 1):
    m.box((0.02, 0.03, s * 0.305), (0.03, 0.5, 0.012), LEA)                                        # 鐙帶
    m.lathe((0.02, -0.25, s * 0.32), (0, 0, 1), [(-0.01, 0.07), (0.01, 0.07), (0.01, 0.055), (-0.01, 0.055)], 10, STL, closed=True)  # 馬鐙
    m.box((0.02, -0.315, s * 0.32), (0.1, 0.012, 0.04), STL)
part('Body', body, m)
# 鞍囊：鞍後兩側各一個小袋
for s in (-1, 1):
    mb = MeshBuilder()
    mb.box((-0.4, 0.1, s * 0.3), (0.22, 0.2, 0.07), CNV)
    mb.box((-0.4, 0.17, s * 0.305), (0.23, 0.07, 0.075), LEA)
    mb.build(f'Bag{"L" if s < 0 else "R"}Mesh', MATS, parent=body, bevel=0.02)
empty('Saddle', body, (-0.02, 0.37, 0))

# ── 頸（粗短）、鬃毛 ──
neck = empty('Neck', body, (0.62, 0.16, 0))
m = MeshBuilder()
NECK = [((-0.14, -0.2), 0.27, 0.17), ((-0.02, -0.02), 0.25, 0.16), ((0.12, 0.2), 0.2, 0.125), ((0.26, 0.4), 0.16, 0.1), ((0.34, 0.52), 0.13, 0.09)]
loft(m, NECK, COAT, 14)
loft(m, [(p, ru + 0.035, rs * 0.45) for p, ru, rs in NECK], MANE, 10, arc=(-40, 40))               # 鬃毛：頸脊上的一道
loft(m, [(p, ru + 0.012, rs + 0.014) for p, ru, rs in NECK[1:]], MANE, 10, arc=(-95, -8))          # 垂向左側的鬃毛
part('Neck', neck, m)

# ── 頭（大而粗）：額、頰、口鼻、耳、眼、轡頭、韁繩 ──
headh = empty('HeadH', neck, (0.34, 0.52, 0))
m = MeshBuilder()
HEAD = [((-0.07, 0.07), 0.09, 0.08), ((0.0, 0.02), 0.135, 0.1), ((0.13, -0.08), 0.14, 0.1), ((0.27, -0.19), 0.105, 0.075),
        ((0.4, -0.3), 0.08, 0.062), ((0.48, -0.365), 0.072, 0.064), ((0.525, -0.4), 0.045, 0.05)]
loft(m, HEAD, COAT, 14)
for s in (-1, 1):
    m.lathe((-0.03, 0.1, s * 0.055), (-0.15, 1, s * 0.25), [(0, 0.034), (0.07, 0.03), (0.15, 0.004)], 7, COAT)   # 耳
    m.lathe((0.1, 0.0, s * 0.092), (0, 0, s), [(-0.01, 0.0), (0.0, 0.02), (0.012, 0.014), (0.016, 0)], 8, EYE, cap0=False)   # 眼
    m.lathe((0.5, -0.36, s * 0.04), (0.6, -0.3, s), [(0, 0.016), (0.012, 0.01), (0.015, 0)], 6, EYE, cap0=False)             # 鼻孔
    m.box((0.19, -0.1, s * 0.098), (0.3, 0.018, 0.008), LEA)                                       # 頰革
    m.cylinder((0.4, -0.31, s * 0.068), (-0.62, -0.5, s * 0.2), 0.008, 6, LEA)                     # 韁繩
loft(m, [((0.37, -0.275), 0.092, 0.073), ((0.395, -0.295), 0.09, 0.071)], LEA, 12, cap=False)      # 鼻革
loft(m, [((0.0, 0.02), 0.142, 0.106), ((0.025, 0.0), 0.142, 0.106)], LEA, 12, cap=False)           # 額革／項革
m.box((0.04, 0.1, 0), (0.12, 0.05, 0.07), MANE)                                                    # 額髮
m.box((0.1, 0.07, 0), (0.08, 0.04, 0.06), MANE)
part('Head', headh, m)

# ── 尾巴（濃密，垂到飛節以下） ──
tail = empty('Tail', body, (-0.79, 0.12, 0))
m = MeshBuilder()
loft(m, [((0.02, 0.02), 0.05, 0.05), ((-0.08, -0.06), 0.075, 0.07), ((-0.14, -0.3), 0.1, 0.09), ((-0.17, -0.6), 0.095, 0.085),
         ((-0.18, -0.85), 0.06, 0.055), ((-0.18, -0.95), 0.02, 0.02)], MANE, 10)
part('Tail', tail, m)

# ── 四條腿：上段（前臂／後腿股脛）、下段（管骨、球節、繫、蹄） ──
for tag, x, z in (('FL', 0.58, -0.17), ('FR', 0.58, 0.17), ('BL', -0.58, -0.17), ('BR', -0.58, 0.17)):
    front = tag[0] == 'F'
    leg = empty(f'Leg{tag}', body, (x, LEG_Y, z))
    m = MeshBuilder()
    if front:
        loft(m, [((0.0, 0.26), 0.04, 0.03), ((0.0, 0.2), 0.11, 0.075), ((0.0, 0.0), 0.12, 0.09), ((0.0, -0.2), 0.085, 0.07), ((0.0, -0.4), 0.058, 0.05),
                 ((0.0, -UPPER), 0.062, 0.055), ((0.0, -UPPER - 0.05), 0.05, 0.045)], COAT, 12)
    else:
        loft(m, [((0.03, 0.34), 0.06, 0.04), ((0.03, 0.25), 0.18, 0.09), ((0.02, 0.05), 0.19, 0.12), ((-0.01, -0.15), 0.13, 0.09), ((-0.03, -0.35), 0.075, 0.058),
                 ((0.0, -UPPER), 0.066, 0.055), ((0.0, -UPPER - 0.05), 0.05, 0.045)], COAT, 12)
    part(f'Upper{tag}', leg, m)
    knee = empty(f'Knee{tag}', leg, (0, -UPPER, 0))
    m = MeshBuilder()
    loft(m, [((0.0, 0.03), 0.058, 0.052), ((0.0, -0.08), 0.042, 0.036), ((0.0, -0.3), 0.038, 0.032), ((0.0, -0.37), 0.052, 0.046),
             ((0.015, -0.42), 0.042, 0.04), ((0.025, -(LOWER - 0.075)), 0.046, 0.046)], COAT, 10)
    loft(m, [((0.025, -(LOWER - 0.08)), 0.048, 0.048), ((0.035, -LOWER), 0.064, 0.062)], HOOF, 10)   # 蹄
    loft(m, [((0.0, -0.33), 0.058, 0.05), ((-0.02, -0.4), 0.05, 0.03)], MANE, 8)                    # 距毛
    part(f'Lower{tag}', knee, m)

# ── 把縫隙陰影（腹下、腿間、鞍具接觸處）烘焙到頂點色 ──
scn = bpy.context.scene
scn.render.engine = 'CYCLES'
scn.cycles.device = 'CPU'
scn.cycles.samples = 48
if scn.world is None:
    scn.world = bpy.data.worlds.new('BakeWorld')
scn.world.light_settings.distance = 0.5
for ob in [o for o in bpy.data.objects if o.type == 'MESH']:
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for mod in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    col = ob.data.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    ob.data.color_attributes.active_color = col
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')

glb = os.path.join(PROJECT, 'public', 'models', 'horse.glb')
export_glb(root, glb, vertex_color=True)
save_blend(os.path.join(PROJECT, 'assets', 'blender', 'horse.blend'))
render_preview(os.path.join(PROJECT, 'docs', 'preview', 'horse.png'), target=(0.1, 0.95, 0), cam_pos=(2.6, 1.6, 3.2), size=(1100, 900), lens=40)
print('DONE', glb, os.path.getsize(glb))
