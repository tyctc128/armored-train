"""把 Blender 烘焙出的車廂 AO 貼圖（public/models/*_ao.jpg）轉成灰階並重新壓縮，縮小下載量。
用法：python tools/textures/shrink_ao.py
"""
import glob
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
for path in sorted(glob.glob(os.path.join(ROOT, 'public', 'models', '*_ao.jpg'))):
    before = os.path.getsize(path)
    im = Image.open(path)
    if im.mode == 'L' and before < 900_000:
        continue
    im.convert('L').save(path, quality=74, optimize=True)
    print(os.path.basename(path), before // 1024, '→', os.path.getsize(path) // 1024, 'KB')
