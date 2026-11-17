"""把 assets/pbr 的 Poly Haven 貼圖（CC0）壓縮成遊戲用的 public/textures。
每組輸出 <name>_d.jpg（顏色）、<name>_n.jpg（法線）、<name>_orm.jpg（AO／粗糙度／金屬）。
用法：python tools/textures/pack.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'assets', 'pbr')
DST = os.path.join(ROOT, 'public', 'textures')
# 遊戲內名稱: (來源, 邊長)
SETS = {
    'paint': ('green_metal_rust', 1024),
    'rust': ('rusty_metal_02', 1024),
    'planks': ('weathered_brown_planks', 1024),
    'gravel': ('gravel_stones', 1024),
    'grass': ('withered_grass', 1024),
    'dirt': ('dry_ground_01', 1024),
    'snow': ('snow_02', 512),
    'wool': ('poly_wool_herringbone', 512),
    'leather': ('brown_leather', 512),
    'bark': ('bark_willow', 512),
}
os.makedirs(DST, exist_ok=True)
total = 0
for name, (src, size) in SETS.items():
    for a, b, q in (('diff', 'd', 82), ('nor', 'n', 88), ('arm', 'orm', 80)):
        im = Image.open(os.path.join(SRC, f'{src}_{a}.jpg')).convert('RGB').resize((size, size), Image.LANCZOS)
        out = os.path.join(DST, f'{name}_{b}.jpg')
        im.save(out, quality=q, optimize=True)
        total += os.path.getsize(out)
print('total KB', total // 1024)
