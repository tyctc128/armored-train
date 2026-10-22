"""戰馬建模腳本（敵軍騎兵用，分部件關節，遊戲以程式產生奔跑與站立動作）。

執行：
  blender -b --factory-startup -P tools/blender/horse.py

輸出 public/models/horse.glb、assets/blender/horse.blend、docs/preview/horse.png

關節節點（遊戲以名稱抓取）：
  Root → Body → Neck → HeadH
              → LegFL / LegFR / LegBL / LegBR → KneeFL / KneeFR / KneeBL / KneeBR
              → Tail
              → Saddle（騎手骨盆位置）
座標：+X 為馬頭方向、+Y 上、+Z 右；Root 在地面。左側為 -Z。各關節繞 Z 軸擺動（正值往前）。
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    PROJECT, MeshBuilder, empty, reset_scene, material, paint_texture,
    export_glb, save_blend, render_preview,
)

reset_scene()
TEX = os.path.join(PROJECT, 'assets', 'textures')
M_COAT = material('Coat', image=paint_texture(TEX, '#5a2f1c', 'horse_coat', seed=33), rough=0.75)
M_MANE = material('Mane', '#1e1712', rough=0.9)
M_HOOF = material('Hoof', '#2e2b28', rough=0.6)
M_LEATHER = material('Leather', '#4a2e1a', rough=0.55)
M_CANVAS = material('Canvas', '#8a7b55', rough=1.0)
M_STEEL = material('Steel', '#3a3a36', rough=0.4, metal=0.8)
M_EYE = material('Eye', '#0e0b09', rough=0.3)
MATS = [M_COAT, M_MANE, M_HOOF, M_LEATHER, M_CANVAS, M_STEEL, M_EYE]
COAT, MANE, HOOF, LEA, CNV, STL, EYE = range(7)

BODY_Y = 1.15
LEG_Y = -0.05            # 腿根相對 Body 的高度 → 世界 1.10
UPPER = 0.55             # 腿根到膝
LOWER = 0.55             # 膝到蹄底

root = empty('Root')
body = empty('Body', root, (0, BODY_Y, 0))


def part(name, parent, builder, bevel=0.0):
    builder.build(name + 'Mesh', MATS, parent=parent, bevel=bevel)


# ── 軀幹：胴體、胸、臀、鬐甲；鞍墊、馬鞍、肚帶、馬鐙 ──
m = MeshBuilder()
m.lathe((0, 0, 0), (1, 0, 0), [(-0.82, 0), (-0.8, 0.12), (-0.7, 0.24), (-0.5, 0.3), (-0.1, 0.31),
                               (0.35, 0.3), (0.62, 0.27), (0.78, 0.2), (0.84, 0.1), (0.85, 0)], 18, COAT)
m.lathe((-0.55, 0.06, 0), (0, 1, 0), [(-0.2, 0.0), (-0.18, 0.2), (0.0, 0.27), (0.18, 0.2), (0.22, 0)], 14, COAT)   # 臀部隆起
m.lathe((0.55, 0.12, 0), (0, 1, 0), [(0.0, 0.0), (0.02, 0.17), (0.2, 0.12), (0.24, 0)], 12, COAT)                  # 鬐甲
m.box((0.0, 0.305, 0), (0.62, 0.035, 0.42), CNV)                                                   # 鞍墊
for s in (-1, 1):
    m.box((0.0, 0.17, s * 0.3), (0.56, 0.26, 0.02), CNV)                                           # 鞍墊側片
m.box((0.0, 0.34, 0), (0.48, 0.07, 0.4), LEA)                                                       # 鞍座
m.box((0.2, 0.39, 0), (0.08, 0.08, 0.3), LEA)                                                       # 前鞍橋
m.box((-0.2, 0.38, 0), (0.07, 0.07, 0.34), LEA)                                                     # 後鞍橋
m.lathe((0.05, 0, 0), (1, 0, 0), [(-0.04, 0.315), (0.04, 0.315), (0.04, 0.305), (-0.04, 0.305)], 18, LEA, closed=True)  # 肚帶
for s in (-1, 1):
    m.box((0.02, 0.05, s * 0.33), (0.03, 0.5, 0.012), LEA)                                         # 鐙帶
    m.lathe((0.02, -0.22, s * 0.34), (0, 0, 1), [(-0.01, 0.07), (0.01, 0.07), (0.01, 0.055), (-0.01, 0.055)], 10, STL, closed=True)  # 馬鐙
    m.box((0.02, -0.285, s * 0.34), (0.1, 0.012, 0.04), STL)
    m.box((-0.45, 0.24, s * 0.3), (0.2, 0.18, 0.06), CNV)                                          # 鞍囊
part('Body', body, m, bevel=0.0)
empty('Saddle', body, (-0.02, 0.32, 0))

# ── 頸、鬃毛、頭、轡頭、韁繩 ──
neck = empty('Neck', body, (0.68, 0.2, 0))
m = MeshBuilder()
m.cylinder((0, -0.05, 0), (0.32, 0.5, 0), 0.19, 14, COAT, r1=0.12)
for j in range(8):
    t = j / 7
    m.box((-0.06 + t * 0.32, 0.12 + t * 0.42, 0), (0.1, 0.1, 0.05), MANE)                          # 鬃毛
part('Neck', neck, m)

headh = empty('HeadH', neck, (0.34, 0.52, 0))
m = MeshBuilder()
m.cylinder((0, 0, 0), (0.42, -0.3, 0), 0.115, 14, COAT, r1=0.07)
m.lathe((0.42, -0.3, 0), (0.81, -0.58, 0), [(-0.04, 0.072), (0.02, 0.06), (0.04, 0)], 12, COAT)   # 口鼻
for s in (-1, 1):
    m.cylinder((-0.02, 0.06, s * 0.06), (0.0, 0.2, s * 0.07), 0.035, 6, COAT, r1=0.008)            # 耳
    m.box((0.12, -0.02, s * 0.1), (0.03, 0.03, 0.02), EYE)                                         # 眼
    m.box((0.48, -0.32, s * 0.06), (0.04, 0.03, 0.015), EYE)                                       # 鼻孔
    m.box((0.2, -0.13, s * 0.105), (0.32, 0.02, 0.01), LEA)                                        # 頰革
    m.cylinder((0.36, -0.28, s * 0.08), (-0.8, -0.36, s * 0.2), 0.01, 6, LEA)                      # 韁繩
m.box((0.36, -0.24, 0), (0.025, 0.02, 0.2), LEA)                                                    # 鼻革
m.box((0.02, 0.05, 0), (0.02, 0.02, 0.2), LEA)                                                      # 額革
m.box((0.06, 0.07, 0), (0.1, 0.04, 0.05), MANE)                                                     # 額髮
part('Head', headh, m)

# ── 尾巴 ──
tail = empty('Tail', body, (-0.8, 0.15, 0))
m = MeshBuilder()
m.cylinder((0, 0, 0), (-0.12, -0.15, 0), 0.05, 8, MANE, r1=0.06)
m.cylinder((-0.12, -0.15, 0), (-0.18, -0.72, 0), 0.08, 10, MANE, r1=0.04)
part('Tail', tail, m)

# ── 四條腿：上段（前臂／大腿）、下段（管骨、球節、蹄） ──
for tag, x, z in (('FL', 0.62, -0.2), ('FR', 0.62, 0.2), ('BL', -0.6, -0.2), ('BR', -0.6, 0.2)):
    front = tag[0] == 'F'
    leg = empty(f'Leg{tag}', body, (x, LEG_Y, z))
    m = MeshBuilder()
    if front:
        m.lathe((0, 0.05, 0), (0, -1, 0), [(0, 0.11), (0.25, 0.1), (UPPER - 0.02, 0.065), (UPPER + 0.09, 0.068), (UPPER + 0.09, 0)], 12, COAT)
    else:
        m.lathe((0, 0.1, 0), (0, -1, 0), [(0, 0.15), (0.2, 0.13), (0.4, 0.085), (UPPER + 0.14, 0.068), (UPPER + 0.14, 0)], 12, COAT)
    part(f'Upper{tag}', leg, m)
    knee = empty(f'Knee{tag}', leg, (0, -UPPER, 0))
    m = MeshBuilder()
    m.lathe((0, 0, 0), (0, -1, 0), [(0, 0.068), (0.06, 0.06), (0.3, 0.045), (0.38, 0.05), (0.42, 0.055),
                                     (0.47, 0.05)], 12, COAT)                                           # 管骨、球節
    m.lathe((0.015, -(LOWER - 0.08), 0), (0, -1, 0), [(0, 0.05), (0.08, 0.062), (0.08, 0)], 12, HOOF)   # 蹄（底在 -LOWER）
    m.cylinder((0, -(LOWER - 0.13), 0), (0.0, -(LOWER - 0.08), 0), 0.056, 10, MANE)                 # 距毛
    part(f'Lower{tag}', knee, m)

glb = os.path.join(PROJECT, 'public', 'models', 'horse.glb')
export_glb(root, glb)
save_blend(os.path.join(PROJECT, 'assets', 'blender', 'horse.blend'))
render_preview(os.path.join(PROJECT, 'docs', 'preview', 'horse.png'), target=(0.1, 1.0, 0), cam_pos=(2.6, 1.7, 3.2), size=(1100, 900), lens=40)
print('DONE', glb, os.path.getsize(glb))
