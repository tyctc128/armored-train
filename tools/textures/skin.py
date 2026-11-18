"""皮膚貼圖：把 MakeHuman 社群的淺膚色男性皮膚（CC0）調成東亞膚色並縮到 1024，供軍士模型使用。

來源：light_skin_male_bronze.png（Margaret Toigo，MakeHuman Community Skins02，CC0）
      https://opengameart.org/content/toigo-natural-male-skin
用法：python tools/textures/skin.py
輸出：assets/pbr/skin_asian.jpg（由 tools/blender/soldier.py 讀取並嵌進 .glb）
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets', 'pbr', 'skin_src', 'light_skin_male_bronze.png')
OUT = os.path.join(ROOT, 'assets', 'pbr', 'skin_asian.jpg')
TARGET = np.array([199, 154, 116], dtype=np.float64)   # #c79a74

im = Image.open(SRC).convert('RGB').resize((1024, 1024), Image.LANCZOS)
a = np.asarray(im).astype(np.float64)
# MakeHuman 的皮膚貼圖把眼窩內側、口腔等處塗成鮮紅色（原本由另外的眼球、牙齒網格遮住）。
# 我們的眼球是自己做的小球，遮不住，所以把鮮紅區塊改成陰影裡的膚色
red = (a[:, :, 1] < 0.42 * a[:, :, 0]) & (a[:, :, 0] > 110)
a[red] = (150, 100, 70)
mean = a.reshape(-1, 3).mean(axis=0)
a *= (TARGET / mean)[None, None, :]
# 略降飽和度，避免調色後偏橘
g = a.mean(axis=2, keepdims=True)
a = g + (a - g) * 0.92
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(OUT, quality=88)
print('mean before', mean.round(1), '->', OUT, os.path.getsize(OUT))
