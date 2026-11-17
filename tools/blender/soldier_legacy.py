"""軍士建模腳本（分部件關節，遊戲以程式產生動作）。

執行：
  blender -b --factory-startup -P tools/blender/soldier.py -- soldier   # 步兵：九〇式鉄帽、三八式歩兵銃（背在背上）
  blender -b --factory-startup -P tools/blender/soldier.py -- crew      # 車組員：略帽、無步槍
  blender -b --factory-startup -P tools/blender/soldier.py -- officer   # 軍官：略帽、軍刀、望遠鏡、手槍套

輸出 public/models/crew_<variant>.glb、assets/blender/crew_<variant>.blend、docs/preview/crew_<variant>.png

關節節點（遊戲以名稱抓取）：
  Root → Hips → Spine → Head
                     → ShoulderL → ElbowL → HandL（右側為 R）
             → HipL → KneeL → AnkleL（右側為 R）
  Rifle（步兵，掛在 Spine）
座標：+X 為角色面向、+Y 上、+Z 右；Root 在腳底。左側為 -Z。
"""
import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import (  # noqa: E402
    PROJECT, MeshBuilder, empty, reset_scene, script_args, material, paint_texture,
    export_glb, save_blend, render_preview,
)

VARIANT = (script_args() or ['soldier'])[0]
assert VARIANT in ('soldier', 'crew', 'officer', 'enemy')
ENEMY = VARIANT == 'enemy'  # 架空敵軍：灰綠制服、藍領章、平頂軍帽

reset_scene()
TEX = os.path.join(PROJECT, 'assets', 'textures')
M_WOOL = material('Wool', image=paint_texture(TEX, '#5d6a63' if ENEMY else '#857650', 'uniform_wool_enemy' if ENEMY else 'uniform_wool', seed=21), rough=0.95)
M_WOOL_D = material('WoolDark', '#46504a' if ENEMY else '#6f6243', rough=0.95)
M_SKIN = material('Skin', '#c99a72', rough=0.7)
M_LEATHER = material('Leather', '#5a3b22', rough=0.55)
M_BOOT = material('Boot', '#3a2a1c', rough=0.5)
M_HELM = material('Helmet', '#5d5e3e', rough=0.6, metal=0.25)
M_BRASS = material('Brass', '#c49a45', rough=0.35, metal=0.9)
M_RED = material('Collar', '#2f4f86' if ENEMY else '#9c2a22', rough=0.8)
M_STOCK = material('RifleWood', '#6b4426', rough=0.6)
M_STEEL = material('Steel', '#2c2c29', rough=0.4, metal=0.8)
M_DARK = material('Eye', '#151210', rough=0.6)
M_CANVAS = material('Canvas', '#8a7b55', rough=1.0)
MATS = [M_WOOL, M_WOOL_D, M_SKIN, M_LEATHER, M_BOOT, M_HELM, M_BRASS, M_RED, M_STOCK, M_STEEL, M_DARK, M_CANVAS]
WOOL, WOOLD, SKIN, LEA, BOOT, HELM, BRS, RED, WOOD, STL, EYE, CNV = range(12)

HIP_H = 0.92
root = empty('Root')
hips = empty('Hips', root, (0, HIP_H, 0))
spine = empty('Spine', hips, (0, 0.05, 0))
head = empty('Head', spine, (0, 0.46, 0))


def part(name, parent, builder, bevel=0.006):
    builder.build(name + 'Mesh', MATS, parent=parent, bevel=bevel)


# ── 骨盆、下襬 ──
m = MeshBuilder()
m.box((0, -0.03, 0), (0.21, 0.16, 0.32), WOOL)
m.prism([(-0.17, -0.12), (0.17, -0.12), (0.17, 0.02), (-0.17, 0.02)], -0.12, 0.12, WOOL)  # 上衣下襬
part('Pelvis', hips, m)

# ── 軀幹：上衣、領章、鈕扣、口袋、皮帶 ──
m = MeshBuilder()
m.prism([(-0.15, 0.0), (0.15, 0.0), (0.18, 0.36), (0.13, 0.45), (-0.13, 0.45), (-0.18, 0.36)], -0.11, 0.11, WOOL)
m.prism([(-0.07, 0.43), (0.07, 0.43), (0.06, 0.5), (-0.06, 0.5)], -0.06, 0.07, WOOL)      # 立領
for s in (-1, 1):
    m.box((0.068, 0.47, s * 0.045), (0.012, 0.035, 0.035), RED)                           # 領章
for j in range(5):
    m.lathe((0.112, 0.06 + j * 0.085, 0), (1, 0, 0), [(0, 0.011), (0.006, 0.006), (0.008, 0)], 8, BRS, cap0=False)
for s in (-1, 1):
    m.box((0.113, 0.33, s * 0.085), (0.012, 0.09, 0.09), WOOLD)                           # 胸前口袋
    m.box((0.117, 0.37, s * 0.085), (0.012, 0.03, 0.095), WOOLD)                          # 袋蓋
m.box((0, 0.03, 0), (0.235, 0.06, 0.36), LEA)                                              # 皮帶
m.box((0.12, 0.03, 0), (0.012, 0.055, 0.06), BRS)                                          # 帶扣
if VARIANT in ('soldier', 'enemy'):
    for z in (-0.12, 0.12):
        m.box((0.13, 0.04, z), (0.06, 0.08, 0.1), LEA)                                     # 彈盒
    m.box((-0.13, 0.04, 0), (0.06, 0.08, 0.12), LEA)                                       # 後彈盒
    m.lathe((0.0, 0.02, 0.2), (0, 1, 0), [(-0.08, 0.06), (0.08, 0.06)], 12, CNV)           # 水壺
    m.box((-0.03, -0.02, -0.2), (0.16, 0.14, 0.05), CNV)                                   # 雜囊
    m.prism([(-0.13, 0.12), (0.13, 0.12), (0.13, 0.4), (-0.13, 0.4)], -0.23, -0.12, CNV)   # 背囊
if VARIANT == 'officer':
    # 斜背帶、望遠鏡、軍刀、手槍套
    for j in range(10):
        t = j / 9
        m.box((0.115, 0.05 + t * 0.38, -0.13 + t * 0.26), (0.01, 0.06, 0.04), LEA)
    m.box((0.14, 0.27, -0.05), (0.06, 0.1, 0.07), STL)
    m.box((0.14, 0.27, 0.05), (0.06, 0.1, 0.07), STL)
    m.box((0.13, -0.05, 0.19), (0.12, 0.14, 0.05), LEA)                                    # 手槍套
    m.cylinder((0.12, 0.0, -0.2), (-0.62, -0.62, -0.22), 0.022, 10, STL)                   # 軍刀鞘
    m.cylinder((0.12, 0.0, -0.2), (0.24, 0.12, -0.2), 0.016, 8, LEA)                       # 刀柄
    m.lathe((0.12, 0.0, -0.2), (1, 1, 0), [(0, 0.04), (0.01, 0.04), (0.01, 0)], 12, BRS)  # 護手
part('Torso', spine, m)

# ── 頭：臉、耳、頸；鉄帽或略帽 ──
m = MeshBuilder()
m.cylinder((0, -0.02, 0), (0, 0.08, 0), 0.05, 12, SKIN)
m.lathe((0, 0, 0), (0, 1, 0), [(0.06, 0), (0.07, 0.06), (0.1, 0.092), (0.15, 0.1), (0.21, 0.095), (0.25, 0.07), (0.27, 0)], 18, SKIN)
m.box((0.098, 0.15, 0), (0.03, 0.045, 0.026), SKIN)                                        # 鼻
for s in (-1, 1):
    m.box((0.09, 0.185, s * 0.038), (0.008, 0.012, 0.022), EYE)                           # 眼
    m.box((0.092, 0.205, s * 0.04), (0.008, 0.008, 0.035), EYE)                           # 眉
    m.box((0.0, 0.17, s * 0.1), (0.035, 0.05, 0.015), SKIN)                                # 耳
m.box((0.088, 0.105, 0), (0.008, 0.008, 0.04), EYE)                                        # 嘴
if ENEMY:
    # 平頂軍帽（帽頂較寬、黑色帽簷）
    m.lathe((0, 0.18, 0), (0, 1, 0), [(0, 0.113), (0.05, 0.116), (0.075, 0.135), (0.095, 0.14), (0.1, 0)], 20, WOOLD)
    m.box((0.1, 0.185, 0), (0.08, 0.012, 0.15), BOOT)
    m.lathe((0.112, 0.225, 0), (1, 0, 0), [(0, 0.016), (0.006, 0)], 6, RED)
elif VARIANT == 'soldier':
    m.lathe((0, 0.16, 0), (0, 1, 0), [(0, 0.16), (0.012, 0.15), (0.03, 0.135), (0.08, 0.125), (0.12, 0.1), (0.145, 0.06), (0.155, 0)], 20, HELM)
    m.lathe((0.13, 0.25, 0), (1, 0.6, 0), [(0, 0.02), (0.006, 0)], 5, BRS)                 # 星章
    for s in (-1, 1):
        m.cylinder((0, 0.17, s * 0.13), (0.03, 0.05, s * 0.07), 0.006, 6, LEA)              # 帽帶
else:
    m.lathe((0, 0.19, 0), (0, 1, 0), [(0, 0.112), (0.06, 0.112), (0.085, 0.1), (0.1, 0.06), (0.105, 0)], 18, WOOL)
    m.box((0.1, 0.195, 0), (0.07, 0.012, 0.15), LEA if VARIANT == 'officer' else WOOLD)    # 帽簷
    m.lathe((0, 0.222, 0), (0, 1, 0), [(0, 0.115), (0.024, 0.115)], 18, RED if VARIANT == 'officer' else WOOLD, cap0=False, cap1=False)  # 帽圈
    m.lathe((0.112, 0.24, 0), (1, 0, 0), [(0, 0.016), (0.006, 0)], 5, BRS)                 # 星章
part('HeadMesh', head, m, bevel=0.0)

# ── 手臂 ──
for tag, s in (('L', -1), ('R', 1)):
    sh = empty(f'Shoulder{tag}', spine, (0, 0.4, s * 0.19))
    m = MeshBuilder()
    m.lathe((0, 0.0, 0), (0, 1, 0), [(-0.05, 0.0), (-0.04, 0.045), (0.0, 0.06), (0.04, 0.045), (0.05, 0)], 12, WOOL)
    m.lathe((0, 0, 0), (0, -1, 0), [(0, 0.055), (0.27, 0.047)], 12, WOOL)
    part(f'UpperArm{tag}', sh, m)
    el = empty(f'Elbow{tag}', sh, (0, -0.28, 0))
    m = MeshBuilder()
    m.lathe((0, 0, 0), (0, -1, 0), [(0, 0.047), (0.2, 0.042), (0.21, 0.046), (0.24, 0.044), (0.24, 0)], 12, WOOL)
    part(f'Forearm{tag}', el, m)
    hd = empty(f'Hand{tag}', el, (0, -0.25, 0))
    m = MeshBuilder()
    m.box((0.01, -0.05, 0), (0.085, 0.1, 0.04), SKIN)
    m.box((0.045, -0.035, -s * 0.02), (0.03, 0.06, 0.025), SKIN)                           # 拇指
    part(f'HandMesh{tag}', hd, m)

# ── 腿：馬褲、綁腿、短靴 ──
for tag, s in (('L', -1), ('R', 1)):
    hp = empty(f'Hip{tag}', hips, (0, -0.06, s * 0.09))
    m = MeshBuilder()
    m.lathe((0, 0, 0), (0, -1, 0), [(0, 0.08), (0.12, 0.092), (0.26, 0.085), (0.41, 0.062), (0.41, 0)], 12, WOOL)
    part(f'Thigh{tag}', hp, m)
    kn = empty(f'Knee{tag}', hp, (0, -0.41, 0))
    m = MeshBuilder()
    prof = [(0, 0.058)]
    for j in range(9):
        y = 0.03 + j * 0.04
        r = 0.058 - j * 0.0016
        prof += [(y, r), (y + 0.005, r + 0.004), (y + 0.035, r + 0.002)]
    prof += [(0.4, 0.046), (0.4, 0)]
    m.lathe((0, 0, 0), (0, -1, 0), prof, 12, WOOLD)
    part(f'Shin{tag}', kn, m)
    an = empty(f'Ankle{tag}', kn, (0, -0.42, 0))
    m = MeshBuilder()
    m.box((0.04, -0.035, 0), (0.25, 0.08, 0.1), BOOT)
    m.box((0.155, -0.05, 0), (0.04, 0.05, 0.09), BOOT)
    part(f'Foot{tag}', an, m)

# ── 三八式歩兵銃（步兵：斜背在背上；遊戲可改掛到手上） ──
if VARIANT in ('soldier', 'enemy'):
    rifle = empty('Rifle', spine, (-0.16, 0.22, 0))
    rifle.rotation_euler = (math.radians(28), 0, 0)  # 斜背
    m = MeshBuilder()
    # 沿 +Y 方向建（槍托在下、槍口在上），長 1.28 m
    m.prism([(-0.02, -0.55), (0.02, -0.55), (0.02, -0.28), (0.012, -0.2), (-0.012, -0.2), (-0.02, -0.28)], -0.03, 0.045, WOOD)  # 槍托
    m.box((0, 0.05, 0.008), (0.03, 0.5, 0.05), WOOD)                                       # 護木
    m.cylinder((0.0, -0.2, 0.015), (0.0, 0.73, 0.015), 0.011, 8, STL)                      # 槍管
    m.box((0, -0.15, 0.03), (0.026, 0.12, 0.04), STL)                                      # 機匣
    m.cylinder((0.0, -0.13, 0.04), (0.0, -0.13, 0.08), 0.007, 6, STL)                      # 槍機柄
    m.box((0, -0.24, -0.01), (0.014, 0.08, 0.02), STL)                                     # 扳機護圈
    m.cylinder((0.0, 0.6, 0.015), (0.0, 0.62, 0.015), 0.016, 8, STL)                       # 前環
    m.cylinder((0, -0.45, -0.025), (0, 0.4, -0.025), 0.006, 6, LEA)                       # 背帶
    part('RifleMesh', rifle, m, bevel=0.003)

name = f'crew_{VARIANT}'
glb = os.path.join(PROJECT, 'public', 'models', f'{name}.glb')
export_glb(root, glb)
save_blend(os.path.join(PROJECT, 'assets', 'blender', f'{name}.blend'))
render_preview(os.path.join(PROJECT, 'docs', 'preview', f'{name}.png'), target=(0, 1.0, 0), cam_pos=(2.6, 1.6, 1.4), size=(900, 1100), lens=50)
print('DONE', glb, os.path.getsize(glb))
