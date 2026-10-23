"""Blender 建模共用工具：幾何、貼圖、材質、輸出與預覽渲染。

座標約定：建模時一律寫「遊戲座標」（+X 列車前方、+Y 上、+Z 右側），
由 V() 轉成 Blender 座標（Z 朝上）：game(x, y, z) → blender(x, -z, y)。
glTF 輸出（Y 朝上）會再轉回遊戲座標。
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

PROJECT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def V(x, y, z):
    return Vector((x, -z, y))


def script_args():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ───────────────────────────── 幾何 ─────────────────────────────

class MeshBuilder:
    """在單一 bmesh 中累積幾何，最後建立物件。座標為遊戲座標、相對於物件原點。"""

    def __init__(self):
        self.bm = bmesh.new()

    def _v(self, p):
        return self.bm.verts.new(V(*p))

    def face(self, pts, mi=0):
        f = self.bm.faces.new([self._v(p) for p in pts])
        f.material_index = mi
        return f

    def box(self, c, s, mi=0):
        cx, cy, cz = c
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        corners = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
        v = [self._v((cx + dx * hx, cy + dy * hy, cz + dz * hz)) for dx, dy, dz in corners]
        for idx in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
            f = self.bm.faces.new([v[i] for i in idx])
            f.material_index = mi

    def prism(self, poly, x0, x1, mi=0):
        """把 (lat, y) 多邊形沿 X 從 x0 擠到 x1。"""
        a = [self._v((x0, y, z)) for z, y in poly]
        b = [self._v((x1, y, z)) for z, y in poly]
        n = len(poly)
        for f in [self.bm.faces.new(list(reversed(a))), self.bm.faces.new(b)]:
            f.material_index = mi
        for i in range(n):
            j = (i + 1) % n
            f = self.bm.faces.new([a[i], a[j], b[j], b[i]])
            f.material_index = mi

    def lathe(self, origin, axis, profile, segs=24, mi=0, cap0=True, cap1=True, closed=False):
        """沿軸旋轉剖面 [(距離, 半徑), ...]；半徑 0 收成一點。closed=True 時剖面首尾相連（環形）。"""
        o = V(*origin)
        a = V(*axis).normalized()
        t = a.orthogonal().normalized()
        b = a.cross(t)
        rings = []
        for d, r in profile:
            if r < 1e-6:
                rings.append(self.bm.verts.new(o + a * d))
            else:
                ring = []
                for i in range(segs):
                    ang = 2 * math.pi * i / segs
                    ring.append(self.bm.verts.new(o + a * d + (t * math.cos(ang) + b * math.sin(ang)) * r))
                rings.append(ring)
        pairs = list(zip(rings[:-1], rings[1:]))
        if closed:
            pairs.append((rings[-1], rings[0]))
        for r0, r1 in pairs:
            for i in range(segs):
                j = (i + 1) % segs
                if isinstance(r0, list) and isinstance(r1, list):
                    f = self.bm.faces.new([r0[i], r0[j], r1[j], r1[i]])
                elif isinstance(r0, list):
                    f = self.bm.faces.new([r0[i], r0[j], r1])
                elif isinstance(r1, list):
                    f = self.bm.faces.new([r0, r1[j], r1[i]])
                else:
                    continue
                f.material_index = mi
        if not closed:
            if cap0 and isinstance(rings[0], list):
                self.bm.faces.new(list(reversed(rings[0]))).material_index = mi
            if cap1 and isinstance(rings[-1], list):
                self.bm.faces.new(rings[-1]).material_index = mi

    def cylinder(self, p0, p1, r, segs=16, mi=0, r1=None):
        p0 = Vector(p0)
        p1 = Vector(p1)
        d = p1 - p0
        self.lathe(tuple(p0), tuple(d.normalized()), [(0, r), (d.length, r if r1 is None else r1)], segs, mi)

    def rivet(self, pos, normal, r=0.02, mi=0):
        self.lathe(pos, normal, [(-0.004, r), (0.008, r * 0.8), (0.014, 0)], 6, mi, cap0=False)

    def build(self, name, mats, parent=None, loc=(0, 0, 0), bevel=0.0, smooth=True, extras=None):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # 盒狀投影 UV：1 個貼圖單位 = 4 m
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for loop in f.loops:
                co = loop.vert.co + V(*loc)
                if ax == 0:
                    u, v = co.y, co.z
                elif ax == 1:
                    u, v = co.x, co.z
                else:
                    u, v = co.x, co.y
                loop[uv].uv = (u / 4, v / 4)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in mats:
            me.materials.append(m)
        for p in me.polygons:
            p.use_smooth = smooth
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        ob.location = V(*loc)
        if bevel > 0:
            mod = ob.modifiers.new('Bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = 2
            mod.limit_method = 'ANGLE'
            mod.angle_limit = math.radians(30)
            mod.use_clamp_overlap = True
        if smooth:
            wn = ob.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
            wn.keep_sharp = True
        for k, v in (extras or {}).items():
            ob[k] = v
        return ob


def empty(name, parent=None, loc=(0, 0, 0), yaw=0.0):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = 0.3
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = parent
    ob.location = V(*loc)
    ob.rotation_euler = (0, 0, yaw)  # 繞遊戲 +Y（Blender +Z）
    return ob


# ───────────────────────────── 貼圖 ─────────────────────────────

def _noise(n, cells, rng):
    """可平鋪的平滑值雜訊（0–1）。"""
    g = rng.random((cells, cells))
    xs = np.arange(n) * cells / n
    i0 = np.floor(xs).astype(int)
    f = xs - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    a = g[np.ix_(i0, i0)]
    b = g[np.ix_(i0, i1)]
    c = g[np.ix_(i1, i0)]
    d = g[np.ix_(i1, i1)]
    fx = f[None, :]
    fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(n, base, octaves, rng):
    out = np.zeros((n, n))
    amp = 1.0
    total = 0.0
    for k in range(octaves):
        out += _noise(n, base * 2 ** k, rng) * amp
        total += amp
        amp *= 0.5
    return out / total


def srgb(hex_or_tuple):
    if isinstance(hex_or_tuple, str):
        h = hex_or_tuple.lstrip('#')
        return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.array(hex_or_tuple)


def save_image(name, rgb, folder):
    """rgb: (n, n, 3) 的 sRGB 0–1 陣列，第 0 列為影像上緣。
    貼圖已存在時直接載入（內容固定由種子決定），避免多個腳本同時寫同一檔案。"""
    path = os.path.join(folder, f'{name}.png')
    if os.path.exists(path):
        return bpy.data.images.load(path, check_existing=True)
    n = rgb.shape[0]
    img = bpy.data.images.new(name, n, n, alpha=False)
    rgba = np.ones((n, n, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(rgb[::-1], 0, 1)  # Blender 像素由下往上
    img.pixels.foreach_set(rgba.ravel())
    os.makedirs(folder, exist_ok=True)
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def camo_texture(folder, n=1024, seed=1934):
    """1934 年試驗運行時的塗裝（依當時照片）：深橄欖底、低對比褐色斑，
    加上細的黃赭色彎曲條紋（寬約 11 cm、大致垂直、間隔約 2 m，偶有彎鉤）。
    一張代表 4 m，上下左右皆可平鋪。另含板縫與污漬。"""
    rng = np.random.default_rng(seed)
    base = srgb('#4b5034')
    patch = srgb('#4f4630')
    stripe = srgb('#c9ad66')
    px = n / 4.0  # 每公尺像素
    rows = np.arange(n)
    cols = np.arange(n)
    m1 = fbm(n, 3, 4, rng)
    rgb = np.empty((n, n, 3))
    rgb[:] = base
    # 低對比的褐色斑（照片中較深的區塊）
    soft = np.clip((m1 - 0.55) / 0.08, 0, 1) * 0.8
    rgb = rgb * (1 - soft[:, :, None]) + patch[None, None, :] * soft[:, :, None]

    mask = np.zeros((n, n))
    half_w = 0.055 * px

    def paint_curve(xc, rows_sel, slope, scale=1.0):
        """xc：每列條紋中心（像素，可超出邊界、以平鋪處理）；scale：每列寬度倍率。"""
        hw = half_w * np.sqrt(1 + slope ** 2) * scale
        for r, x, w in zip(rows_sel, xc, hw):
            d = np.abs(((cols - x + n / 2) % n) - n / 2)
            mask[r] = np.maximum(mask[r], np.clip(w + 1.0 - d, 0, 1))

    # 大致垂直的彎曲條紋：每 4 m 兩條（垂直方向週期 = 一張圖，可平鋪）
    t = rows / n * 2 * np.pi
    lines = []
    for i, x0 in enumerate((0.9, 2.9)):
        k1, k2 = 1, 2
        a1, a2 = rng.uniform(0.25, 0.45) * px, rng.uniform(0.08, 0.16) * px
        p1, p2 = rng.uniform(0, 6.28), rng.uniform(0, 6.28)
        x = x0 * px + a1 * np.sin(k1 * t + p1) + a2 * np.sin(k2 * t + p2)
        dx = (a1 * k1 * np.cos(k1 * t + p1) + a2 * k2 * np.cos(k2 * t + p2)) * 2 * np.pi / n
        paint_curve(x, rows, dx)
        lines.append(x)
    # 彎鉤：從條紋分出的一段弧（照片中常見的 J／S 形），末端漸細
    for li, y0, span, sgn in ((0, 0.7, 1.1, 1), (1, 2.6, 0.9, -1)):
        r0 = int(y0 * px)
        rr = np.arange(r0, r0 + int(0.9 * px)) % n
        u = np.arange(len(rr)) / len(rr)
        x = lines[li][r0] + sgn * span * px * np.sin(u * np.pi / 2) ** 1.5
        dx = np.gradient(x)
        paint_curve(x, rr, dx, scale=1 - 0.65 * u ** 2)
    # 條紋邊緣些微不規則、局部磨損
    wear = fbm(n, 24, 3, rng)
    mask *= np.clip((wear - 0.18) / 0.1, 0.55, 1)
    rgb = rgb * (1 - mask[:, :, None]) + stripe[None, None, :] * mask[:, :, None]

    # 細部明暗與垂直雨痕
    grain = fbm(n, 32, 3, rng)
    streak = fbm(n, 4, 2, rng)
    streak_v = np.repeat(_noise(n, 96, rng)[:1, :], n, axis=0)
    shade = 0.9 + grain * 0.16 - streak_v * 0.07 - (streak - 0.5) * 0.06
    rgb *= shade[:, :, None]
    # 板縫：每 1 m（n/4 px）
    step = n // 4
    for k in range(0, n, step):
        rgb[k:k + 3, :] *= 0.5
        rgb[k + 3:k + 5, :] *= 1.1
        rgb[:, k:k + 3] *= 0.5
        rgb[:, k + 3:k + 5] *= 1.1
    return save_image('armor_camo_1934', rgb, folder)


def paint_texture(folder, color, name, n=512, seed=7):
    rng = np.random.default_rng(seed)
    base = srgb(color)
    g = fbm(n, 8, 4, rng)
    rgb = base[None, None, :] * (0.88 + g[:, :, None] * 0.22)
    return save_image(name, rgb, folder)


def wood_texture(folder, n=512, seed=11):
    """木地板：沿 U 方向的木條，每條 25 cm。"""
    rng = np.random.default_rng(seed)
    rows = n // 8
    rgb = np.zeros((n, n, 3))
    grain = np.repeat(_noise(n, 128, rng)[:, :1], n, axis=1)
    for i in range(8):
        tone = 0.75 + rng.random() * 0.35
        rgb[i * rows:(i + 1) * rows] = srgb('#6b5236') * tone
        rgb[i * rows:i * rows + 2] *= 0.4
    streak = fbm(n, 4, 3, rng)
    rgb *= (0.85 + 0.25 * grain[:, :, None] * streak[:, :, None])
    return save_image('wood_floor', rgb, folder)


# ───────────────────────────── 材質 ─────────────────────────────

def material(name, color='#808080', rough=0.7, metal=0.0, image=None, emission=None):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except AttributeError:
        pass
    m.use_backface_culling = True  # 輸出為單面，車體內外各自可見
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    c = srgb(color)
    lin = [((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c]
    bsdf.inputs['Base Color'].default_value = (*lin, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if emission is not None:
        e = srgb(emission)
        bsdf.inputs['Emission Color'].default_value = (*e, 1)
        bsdf.inputs['Emission Strength'].default_value = 2.0
    return m


# ───────────────────────────── 輸出與預覽 ─────────────────────────────

def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')
    stack = [root]
    while stack:
        ob = stack.pop()
        ob.select_set(True)
        stack.extend(ob.children)
    bpy.context.view_layer.objects.active = root


def export_glb(root, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_tree(root)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_image_format='JPEG',
        export_jpeg_quality=88,
        # Draco 幾何壓縮（遊戲端以 DRACOLoader 解碼）
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
    )


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)


def _set_engine(scene):
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scene.render.engine = eng
            return eng
        except TypeError:
            continue
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    return 'CYCLES'


def render_preview(path, target=(0, 2, 0), cam_pos=(-14, 7, 15), size=(1600, 900), lens=40):
    """加地面、鐵軌、日光與相機後渲染一張預覽圖（這些輔助物件不會輸出到 GLB）。"""
    scene = bpy.context.scene
    _set_engine(scene)
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.filepath = path
    scene.view_settings.view_transform = 'AgX'

    world = bpy.data.worlds.new('PreviewWorld')
    scene.world = world
    try:
        world.use_nodes = True
    except AttributeError:
        pass
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.55, 0.65, 0.78, 1)
    bg.inputs['Strength'].default_value = 0.9

    ground = MeshBuilder()
    ground.box((0, -0.55, 0), (80, 1.0, 80), 0)
    ground.box((0, -0.18, 0), (80, 0.18, 2.7), 1)
    for z in (-0.7535, 0.7535):
        ground.box((0, -0.08, z), (80, 0.16, 0.08), 2)
    ground.build('PreviewGround', [material('PrevGrass', '#56603a', 1.0), material('PrevTies', '#4a3a2c', 0.95), material('PrevRail', '#5c5650', 0.4, 0.9)], bevel=0, smooth=False)

    sun_data = bpy.data.lights.new('Sun', 'SUN')
    sun_data.energy = 4.0
    sun_data.angle = math.radians(2)
    sun = bpy.data.objects.new('Sun', sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))

    cam_data = bpy.data.cameras.new('Cam')
    cam_data.lens = lens
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = V(*cam_pos)
    direction = V(*target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    # 移除預覽輔助物件，避免存進 .blend
    for ob in (bpy.data.objects.get('PreviewGround'), sun, cam):
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)
