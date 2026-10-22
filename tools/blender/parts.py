"""裝甲車廂共用零件庫：材質、空心車體、車內結構與內裝、底架、轉向架、機槍、鉚釘、輸出。

各車廂腳本（gun_car.py 等）用法：
    kit = Kit('警戒車', 'GuardCar')
    hull = kit.hull(len=12, w=3.0, front_door=False)
    hull.wall_structure(); hull.side_details(doors=[0.0], slits=[...]) ...
    kit.running_gear(12)
    kit.mg('L', (x, y, z), center_deg=35, arc_deg=75, label='警戒車 左前機槍')
    hull.finish()
    kit.export('guard_car', cam_target=(0, 2.4, 0), cam_pos=(-13, 6.5, -14))

座標一律為遊戲座標（+X 前、+Y 上、+Z 右），尺寸單位公尺。
遊戲端以節點名稱抓取：MG_<tag>_Base/Yaw/Pitch/Muzzle/Sight、Wheelset_*（radius）、
以及各車專屬節點（Turret、ConsoleAnchor、RF_Yaw 等），請勿更名。
"""
import math
import os

from common import (
    PROJECT, MeshBuilder, empty, reset_scene, camo_texture, paint_texture, wood_texture,
    material, export_glb, save_blend, render_preview,
)

Y0 = 1.1      # 車體底緣（軌頂起算）
WALL = 0.08   # 裝甲厚度（視覺）
FLOOR = 1.3   # 地板面
DOOR = 0.45   # 端門半寬


class Kit:
    def __init__(self, root_name):
        reset_scene()
        tex = os.path.join(PROJECT, 'assets', 'textures')
        M = {}
        M['armor'] = material('Armor', image=camo_texture(tex), rough=0.78, metal=0.25)
        M['inner'] = material('InteriorPaint', image=paint_texture(tex, '#a9ab95', 'interior_paint'), rough=0.85)
        M['wood'] = material('Wood', image=wood_texture(tex), rough=0.9)
        M['steel'] = material('DarkSteel', '#2f2e2a', rough=0.5, metal=0.8)
        M['black'] = material('Slit', '#0a0a09', rough=0.9)
        M['brass'] = material('Brass', '#b08d4a', rough=0.35, metal=0.9)
        M['lamp'] = material('Lamp', '#fff1c8', rough=0.4, emission='#ffd890')
        M['isteel'] = material('InteriorSteel', '#7a7b6c', rough=0.6, metal=0.3)
        M['red'] = material('Red', '#8e2a22', rough=0.5)
        M['white'] = material('Paper', '#d9d4c3', rough=0.9)
        M['olive'] = material('Olive', '#5f5f3c', rough=0.75)
        M['canvas'] = material('Canvas', '#7a6a48', rough=1.0)
        M['gun'] = material('GunMetal', '#3b3d33', rough=0.45, metal=0.7)
        M['wheel'] = material('Wheel', '#2a2725', rough=0.55, metal=0.75)
        M['glass'] = material('Glass', '#9fb3b8', rough=0.15, metal=0.2)
        M['coal'] = material('Coal', '#151413', rough=0.95)
        M['copper'] = material('Copper', '#9a5a36', rough=0.4, metal=0.85)
        self.M = M
        # 共用材質清單與索引（MeshBuilder 的 mi 參數）
        self.MATS = [M[k] for k in ('armor', 'inner', 'wood', 'steel', 'black', 'brass', 'lamp', 'isteel',
                                    'red', 'white', 'olive', 'canvas', 'gun', 'glass', 'coal', 'copper')]
        (self.A, self.IN, self.WOOD, self.ST, self.BLK, self.BRS, self.LMP, self.IST,
         self.RED, self.WHT, self.OLV, self.CNV, self.GUN, self.GLS, self.COAL, self.CU) = range(16)
        self.root = empty(root_name)
        self._n = 0

    def uid(self, base):
        self._n += 1
        return f'{base}_{self._n}'

    def hull(self, **kw):
        return Hull(self, **kw)

    # ── 底架與走行部 ──
    def underframe(self, length, x0=0.0, name='Underframe', extras_fn=None):
        k = self
        f = MeshBuilder()
        L = length
        for z in (1.2, -1.2):
            f.box((x0, 0.95, z), (L - 0.6, 0.3, 0.12), k.ST)
        f.box((x0, 0.9, 0), (L - 0.6, 0.25, 0.4), k.ST)
        n = max(2, int(L / 3))
        for i in range(n + 1):
            f.box((x0 - (L - 1.2) / 2 + i * (L - 1.2) / n, 0.95, 0), (0.15, 0.22, 2.3), k.ST)
        for sx in (1, -1):
            xe = x0 + sx * L / 2
            f.box((xe - sx * 0.12, 0.95, 0), (0.25, 0.42, 2.9), k.A)
            # 美式自動連結器（滿鐵）
            f.box((xe + sx * 0.2, 0.9, 0), (0.55, 0.16, 0.2), k.ST)
            f.box((xe + sx * 0.5, 0.9, 0), (0.22, 0.32, 0.34), k.ST)
            f.box((xe + sx * 0.6, 0.9, 0.08), (0.12, 0.26, 0.12), k.ST)
            f.cylinder((xe + sx * 0.05, 1.08, -1.1), (xe + sx * 0.05, 1.08, 0.4), 0.02, 6, k.ST)
            f.cylinder((xe + sx * 0.05, 0.85, 0.55), (xe + sx * 0.3, 0.6, 0.55), 0.035, 8, k.BLK)
        f.cylinder((x0 + 1.0, 0.72, 0.45), (x0 + 1.8, 0.72, 0.45), 0.2, 16, k.ST)
        f.cylinder((x0 - 2.4, 0.72, -0.45), (x0 - 0.8, 0.72, -0.45), 0.24, 16, k.ST)
        if extras_fn:
            extras_fn(f)
        f.build(name, k.MATS, parent=k.root, bevel=0.01)

    def bogies(self, centers, name='Bogies'):
        k = self
        b = MeshBuilder()
        for bx in centers:
            b.box((bx, 0.72, 0), (0.35, 0.26, 2.2), k.ST)
            for z in (-0.9, 0.9):
                b.box((bx, 0.85, z), (2.7, 0.1, 0.12), k.ST)
                b.box((bx, 0.42, z), (1.3, 0.1, 0.12), k.ST)
                for d in (-1, 1):
                    b.box((bx + d * 0.9, 0.5, z), (0.3, 0.34, 0.2), k.ST)
                    b.box((bx + d * 0.55, 0.63, z), (0.62, 0.08, 0.12), k.ST)
                for j in range(4):
                    b.box((bx, 0.5 + j * 0.045, z), (0.9 - j * 0.16, 0.035, 0.14), k.ST)
                for d in (-1, 1):
                    b.box((bx + d * 0.48, 0.43, z * 0.86), (0.08, 0.22, 0.1), k.BLK)
        b.build(name, k.MATS, parent=k.root, bevel=0.01)

    def wheelset(self, x, r=0.43, name=None, spokes=0):
        """一組輪對（車軸＋兩輪），遊戲依 radius 屬性轉動。spokes>0 時做輻條輪（機關車動輪）。"""
        ws = MeshBuilder()
        ws.cylinder((0, 0, -0.98), (0, 0, 0.98), 0.075, 12, 0)
        for s in (-1, 1):
            zc = s * 0.7175
            hub = 0.12 if r < 0.6 else 0.16
            if spokes:
                rim = [(-0.07, r - 0.08), (-0.07, r - 0.02), (-0.04, r), (0.06, r - 0.01), (0.06, r - 0.08)]
                ws.lathe((0, 0, zc), (0, 0, 1), [(s * d, rr) for d, rr in rim], 32, 0, closed=True)
                for j in range(spokes):
                    a = 2 * math.pi * j / spokes
                    p0 = (math.cos(a) * hub, math.sin(a) * hub, zc)
                    p1 = (math.cos(a) * (r - 0.06), math.sin(a) * (r - 0.06), zc)
                    ws.cylinder(p0, p1, 0.028, 6, 0)
                # 平衡塊
                ws.box((0, -(r * 0.55), zc + s * 0.0), (r * 0.7, r * 0.3, 0.06), 0)
            else:
                prof = [(-0.07, 0.12), (-0.07, 0.36 * r / 0.43), (-0.04, r - 0.03), (-0.04, r), (0.06, r - 0.01),
                        (0.06, r - 0.07), (0.03, 0.34 * r / 0.43), (0.03, 0.12)]
                ws.lathe((0, 0, zc), (0, 0, 1), [(s * d, rr) for d, rr in prof], 28, 0, closed=True)
            flange = [(-0.075, r - 0.01), (-0.075, r + 0.03), (-0.055, r + 0.03), (-0.045, r - 0.01)]
            ws.lathe((0, 0, zc), (0, 0, 1), [(s * d, rr) for d, rr in flange], 28, 0, closed=True)
            ws.cylinder((0, 0, zc - 0.1), (0, 0, zc + 0.1), hub + 0.01, 12, 0)
        ws.build(name or self.uid('Wheelset'), [self.M['wheel']], parent=self.root, loc=(x, r, 0), extras={'radius': r})

    def running_gear(self, length, x0=0.0):
        """一般車廂：底架＋前後轉向架＋4 組輪對。"""
        self.underframe(length, x0)
        centers = (x0 + length * 0.3, x0 - length * 0.3)
        self.bogies(centers)
        i = 0
        for bx in centers:
            for ax in (-0.9, 0.9):
                self.wheelset(bx + ax, name=f'Wheelset_{i}')
                i += 1

    # ── 九二式重機槍球形槍架 ──
    def mg(self, tag, pos, center_deg, arc_deg, label):
        k = self
        base = empty(f'MG_{tag}_Base', k.root, pos, yaw=math.radians(center_deg))
        base['center_deg'] = center_deg
        base['arc_deg'] = arc_deg
        base['label'] = label
        hs = MeshBuilder()
        prof = [(0, 0.42)] + [(0.42 * math.sin(math.radians(a)), 0.42 * math.cos(math.radians(a))) for a in range(15, 91, 15)]
        hs.lathe((0, 0, 0), (1, 0, 0), prof, 24, 0, cap0=False)
        hs.build(f'MG_{tag}_Housing', [k.M['armor']], parent=base)
        yaw = empty(f'MG_{tag}_Yaw', base)
        pitch = empty(f'MG_{tag}_Pitch', yaw)
        g = MeshBuilder()
        g.lathe((0.32, 0, 0), (1, 0, 0), [(-0.2, 0)] + [(-0.2 * math.cos(math.radians(a)), 0.2 * math.sin(math.radians(a))) for a in range(20, 161, 20)] + [(0.2, 0)], 16, 0)
        fins = [(0.45, 0.05)]
        for j in range(13):
            x = 0.5 + j * 0.04
            fins += [(x, 0.05), (x, 0.075), (x + 0.018, 0.075), (x + 0.018, 0.05)]
        fins += [(1.05, 0.05), (1.05, 0)]
        g.lathe((0, 0, 0), (1, 0, 0), fins, 12, 1)
        g.cylinder((1.05, 0, 0), (1.38, 0, 0), 0.022, 10, 1)
        g.lathe((0, 0, 0), (1, 0, 0), [(1.38, 0.022), (1.38, 0.03), (1.45, 0.034), (1.45, 0)], 10, 1)
        g.box((0.62, 0.1, 0), (0.04, 0.06, 0.02), 1)
        # 車內側：機匣、握把、保彈板
        g.box((-0.15, 0, 0), (0.5, 0.13, 0.11), 1)
        g.box((-0.02, 0.075, 0), (0.18, 0.03, 0.08), 1)
        for dz in (-0.06, 0.06):
            g.cylinder((-0.45, -0.07, dz), (-0.45, 0.05, dz), 0.016, 8, 1)
        g.box((-0.43, -0.01, 0), (0.04, 0.03, 0.16), 1)
        g.box((-0.05, 0.02, -0.15), (0.22, 0.025, 0.1), 2)
        g.build(f'MG_{tag}_Gun', [k.M['armor'], k.M['gun'], k.M['brass']], parent=pitch)
        empty(f'MG_{tag}_Muzzle', pitch, (1.45, 0, 0))
        empty(f'MG_{tag}_Sight', pitch, (0.05, 0.31, 0))
        return base

    def export(self, name, cam_target=(0, 2.4, 0), cam_pos=(-13, 6.5, -14)):
        glb = os.path.join(PROJECT, 'public', 'models', f'{name}.glb')
        export_glb(self.root, glb)
        save_blend(os.path.join(PROJECT, 'assets', 'blender', f'{name}.blend'))
        render_preview(os.path.join(PROJECT, 'docs', 'preview', f'{name}.png'), target=cam_target, cam_pos=cam_pos)
        print('DONE', glb, os.path.getsize(glb))


class Hull:
    """一段空心裝甲車體（x0 為中心）。inside / det / riv 三個 MeshBuilder 累積內裝、外部細節、鉚釘。"""

    def __init__(self, kit, length, w=3.1, h=2.3, c=0.55, x0=0.0, front_door=True, rear_door=True,
                 front_closed_plate=True, name='Hull'):
        self.k = kit
        self.L, self.W, self.H, self.C, self.x0 = length, w, h, c, x0
        self.name = name
        self.roof = Y0 + h
        self.hw_in = w / 2 - WALL
        self.top_in = h - WALL
        self.ch_in = c - WALL * 0.4
        self.wall_top = Y0 + self.top_in - self.ch_in   # 側牆垂直段上緣
        self.ceil = Y0 + self.top_in
        self.roof_half_in = self.hw_in - self.ch_in
        self.roof_half = w / 2 - c
        self.inside = MeshBuilder()
        self.det = MeshBuilder()
        self.riv = MeshBuilder()
        self._shell()
        self._bulkheads(front_door, rear_door)
        ext0 = 0.45 if front_door else 0.0
        ext1 = 0.45 if rear_door else 0.0
        self.inside.box((x0 + (ext0 - ext1) / 2, FLOOR - 0.05, 0), (length + ext0 + ext1, 0.1, w - 2 * WALL - 0.02), kit.WOOD)

    @property
    def x_min(self):
        return self.x0 - self.L / 2

    @property
    def x_max(self):
        return self.x0 + self.L / 2

    def profile(self, inset=0.0):
        hw = self.W / 2 - inset
        top = self.H - inset
        ch = self.C - inset * 0.4
        return [(-hw, inset), (hw, inset), (hw, top - ch), (hw - ch, top), (-hw + ch, top), (-hw, top - ch)]

    def on_wall(self, side, depth):
        return side * (self.hw_in - depth / 2)

    def _shell(self):
        k = self.k
        from common import V
        sh = MeshBuilder()
        bm = sh.bm

        def ring(prof, x):
            return [bm.verts.new(V(x, Y0 + y, z)) for z, y in prof]

        o0, o1 = ring(self.profile(), self.x_min), ring(self.profile(), self.x_max)
        i0, i1 = ring(self.profile(WALL), self.x_min), ring(self.profile(WALL), self.x_max)
        n = len(o0)
        for a in range(n):
            b = (a + 1) % n
            bm.faces.new([o0[a], o0[b], o1[b], o1[a]]).material_index = k.A
            bm.faces.new([i0[a], i1[a], i1[b], i0[b]]).material_index = k.IN
            bm.faces.new([o1[a], o1[b], i1[b], i1[a]]).material_index = k.A
            bm.faces.new([o0[a], i0[a], i0[b], o0[b]]).material_index = k.A
        sh.build(f'{self.name}Shell', k.MATS, parent=k.root, bevel=0.03)

    def _bulkheads(self, front_door, rear_door):
        k = self.k
        ins = self.inside
        hw, top, ch = self.hw_in, self.top_in, self.ch_in
        door_top = FLOOR - Y0 + 1.95
        for sx, door in ((1, front_door), (-1, rear_door)):
            x = self.x0 + sx * (self.L / 2 - 0.03)
            for mi, a0, a1 in ((k.A, x + sx * 0.005, x + sx * 0.03), (k.IN, x - sx * 0.02, x + sx * 0.005)):
                x0, x1 = min(a0, a1), max(a0, a1)
                if door:
                    for side in (-1, 1):
                        poly = [(side * hw, WALL), (side * DOOR, WALL), (side * DOOR, top), (side * (hw - ch), top), (side * hw, top - ch)]
                        ins.prism([(z, Y0 + y) for z, y in poly], x0, x1, mi)
                    ins.prism([(-DOOR, Y0 + door_top), (DOOR, Y0 + door_top), (DOOR, Y0 + top), (-DOOR, Y0 + top)], x0, x1, mi)
                else:
                    poly = [(-hw, WALL), (hw, WALL), (hw, top - ch), (hw - ch, top), (-hw + ch, top), (-hw, top - ch)]
                    ins.prism([(z, Y0 + y) for z, y in poly], x0, x1, mi)
            if door:
                ins.box((x, Y0 + door_top + 0.03, 0), (0.09, 0.06, DOOR * 2 + 0.1), k.IST)
                for side in (-1, 1):
                    ins.box((x, FLOOR + 0.97, side * (DOOR + 0.03)), (0.09, 1.95, 0.06), k.IST)

    # ── 車內結構 ──
    def wall_structure(self, skip=(), ceiling_skip=(), pipes=True):
        """肋骨（每 1 m）、縱樑、天花板橫樑、電線導管、暖氣管。skip：[(x0, x1)] 不放肋骨的區段。"""
        k = self.k
        ins = self.inside

        def skipped(x, ranges):
            return any(a <= x <= b for a, b in ranges)

        xs = [self.x0 + d for d in range(-int(self.L / 2) + 1, int(self.L / 2))]
        for side in (-1, 1):
            for x in xs:
                if not skipped(x, skip):
                    ins.box((x, (FLOOR + self.wall_top) / 2, self.on_wall(side, 0.05)), (0.06, self.wall_top - FLOOR, 0.05), k.IST)
            ins.box((self.x0, self.wall_top - 0.03, self.on_wall(side, 0.06)), (self.L - 0.2, 0.06, 0.06), k.IST)
            if pipes:
                zc = side * (self.hw_in - 0.07)
                ins.cylinder((self.x_min + 0.1, 2.62, zc), (self.x_max - 0.1, 2.62, zc), 0.018, 8, k.ST)
                zh = side * (self.hw_in - 0.09)
                ins.cylinder((self.x_min + 0.1, 1.48, zh), (self.x_max - 0.1, 1.48, zh), 0.035, 10, k.ST)
                n = int(self.L / 1.5)
                for j in range(n + 1):
                    x = self.x_min + 0.3 + j * (self.L - 0.6) / max(1, n)
                    ins.box((x, 2.62, self.on_wall(side, 0.09)), (0.04, 0.05, 0.09), k.IST)
                    ins.box((x, 1.48, self.on_wall(side, 0.12)), (0.05, 0.06, 0.12), k.IST)
        for x in xs:
            if not skipped(x, ceiling_skip):
                ins.box((x, self.ceil - 0.03, 0), (0.06, 0.06, self.roof_half_in * 2), k.IST)

    def voice_tube(self, drops=(), z=0.6):
        """沿天花板的黃銅傳聲管，drops 處垂下話口；另一側為電纜。"""
        k = self.k
        ins = self.inside
        y = self.ceil - 0.09
        ins.cylinder((self.x_min + 0.1, y, z), (self.x_max - 0.1, y, z), 0.022, 10, k.BRS)
        for x in drops:
            ins.cylinder((x, y, z), (x, 2.55, z), 0.022, 10, k.BRS)
            ins.lathe((x, 2.55, z), (0, -1, 0), [(0, 0.022), (0.08, 0.05), (0.1, 0.05), (0.1, 0)], 12, k.BRS)
        ins.cylinder((self.x_min + 0.1, self.ceil - 0.08, -z), (self.x_max - 0.1, self.ceil - 0.08, -z), 0.02, 8, k.BLK)

    def lamps(self, xs):
        k = self.k
        for x in xs:
            self.inside.cylinder((x, self.ceil, 0), (x, self.ceil - 0.12, 0), 0.12, 12, k.IST)
            self.inside.cylinder((x, self.ceil - 0.12, 0), (x, self.ceil - 0.2, 0), 0.09, 12, k.LMP)

    def hatch(self, x, z=-0.5, ladder=True):
        """車頂艙口（外）與爬梯（內）。艙口偏左讓出走道。"""
        k = self.k
        r = self.roof
        self.det.box((x, r + 0.04, z), (0.85, 0.08, 0.85), k.A)
        self.det.box((x, r + 0.1, z), (0.72, 0.05, 0.72), k.A)
        self.det.cylinder((x - 0.37, r + 0.12, z - 0.25), (x - 0.37, r + 0.12, z + 0.25), 0.04, 8, k.ST)
        self.det.box((x + 0.22, r + 0.16, z), (0.05, 0.06, 0.3), k.ST)
        if ladder:
            for dz in (-0.22, 0.22):
                self.inside.box((x - 0.35, (FLOOR + self.ceil) / 2, z + dz), (0.05, self.ceil - FLOOR, 0.05), k.IST)
            for j in range(1, 7):
                y = FLOOR + 0.3 * j
                self.inside.cylinder((x - 0.35, y, z - 0.22), (x - 0.35, y, z + 0.22), 0.02, 6, k.IST)

    def seats(self, xs, sides=(-1, 1)):
        k = self.k
        for x in xs:
            for side in sides:
                self.inside.box((x, FLOOR + 0.45, side * (self.hw_in - 0.25)), (0.5, 0.06, 0.4), k.WOOD)
                self.inside.box((x, FLOOR + 0.22, side * (self.hw_in - 0.25)), (0.05, 0.44, 0.05), k.IST)

    def inner_slits(self, xs, sides=(-1, 1), y=2.45):
        k = self.k
        for side in sides:
            for x in xs:
                self.inside.box((x, y, self.on_wall(side, 0.08)), (0.62, 0.2, 0.08), k.IST)
                self.inside.box((x, y, self.on_wall(side, 0.1)), (0.45, 0.07, 0.1), k.BLK)

    def inner_ports(self, xs, sides=(-1, 1), y=2.1):
        k = self.k
        for side in sides:
            for x in xs:
                self.inside.cylinder((x, y, side * self.hw_in), (x, y, side * (self.hw_in - 0.04)), 0.11, 14, k.IST)
                self.inside.box((x, y, self.on_wall(side, 0.1)), (0.04, 0.12, 0.04), k.ST)

    def mg_post(self, x, sides=(-1, 1)):
        """機槍位旁的保彈板彈藥箱與空彈殼袋。"""
        k = self.k
        for side in sides:
            for j in range(3):
                self.inside.box((x - 0.75, FLOOR + 0.09 + j * 0.18, self.on_wall(side, 0.32)), (0.34, 0.17, 0.3), k.OLV)
                self.inside.box((x - 0.75, FLOOR + 0.18 + j * 0.18, self.on_wall(side, 0.32)), (0.06, 0.02, 0.04), k.ST)
            self.inside.box((x + 0.65, FLOOR + 0.09, self.on_wall(side, 0.32)), (0.34, 0.17, 0.3), k.OLV)
            self.inside.box((x, 1.95, self.on_wall(side, 0.5)), (0.22, 0.3, 0.16), k.CNV)

    def rifle_rack(self, x, side=1, n=4):
        k = self.k
        w = n * 0.22 + 0.15
        self.inside.box((x, 2.0, self.on_wall(side, 0.03)), (w, 1.3, 0.03), k.WOOD)
        for j in range(n):
            xx = x - (n - 1) * 0.11 + j * 0.22
            z = side * (self.hw_in - 0.1)
            self.inside.box((xx, FLOOR + 0.3, z), (0.05, 0.5, 0.11), k.WOOD)
            self.inside.cylinder((xx, FLOOR + 0.55, z), (xx, FLOOR + 1.3, z), 0.013, 8, k.ST)
            self.inside.box((xx, FLOOR + 0.62, z + side * 0.02), (0.03, 0.18, 0.05), k.WOOD)
        self.inside.box((x, FLOOR + 1.12, self.on_wall(side, 0.16)), (w, 0.03, 0.16), k.WOOD)

    def locker(self, x, side):
        k = self.k
        zf = side * (self.hw_in - 0.365)
        # 高度不超過側牆垂直段，避免穿出上緣倒角
        self.inside.box((x, FLOOR + 0.72, self.on_wall(side, 0.36)), (0.6, 1.44, 0.36), k.IST)
        self.inside.box((x, FLOOR + 0.72, zf), (0.01, 1.36, 0.01), k.BLK)
        for y in (2.35, 2.5):
            self.inside.box((x, y, zf), (0.4, 0.02, 0.01), k.BLK)
        self.inside.box((x + 0.22, FLOOR + 1.0, side * (self.hw_in - 0.37)), (0.03, 0.12, 0.03), k.ST)

    def extinguisher(self, x, side):
        k = self.k
        z = side * (self.hw_in - 0.1)
        self.inside.lathe((x, FLOOR + 0.35, z), (0, 1, 0), [(0, 0.075), (0.48, 0.075), (0.53, 0.04), (0.6, 0.02), (0.6, 0)], 14, k.RED)
        self.inside.box((x, FLOOR + 0.6, self.on_wall(side, 0.03)), (0.05, 0.4, 0.03), k.ST)

    def first_aid(self, x, side, y=2.15):
        k = self.k
        self.inside.box((x, y, self.on_wall(side, 0.13)), (0.36, 0.28, 0.13), k.WHT)
        zf = side * (self.hw_in - 0.135)
        self.inside.box((x, y, zf), (0.06, 0.18, 0.01), k.RED)
        self.inside.box((x, y, zf), (0.18, 0.06, 0.01), k.RED)

    def elec_box(self, x, side, y=2.3):
        k = self.k
        self.inside.box((x, y, self.on_wall(side, 0.12)), (0.3, 0.36, 0.12), k.IST)
        self.inside.box((x, y, side * (self.hw_in - 0.125)), (0.05, 0.08, 0.02), k.BLK)

    def board(self, x, side, w=0.7, h=0.5, y=2.2):
        """作戰圖板／告示板。"""
        k = self.k
        self.inside.box((x, y, self.on_wall(side, 0.025)), (w, h, 0.025), k.WOOD)
        self.inside.box((x, y, side * (self.hw_in - 0.03)), (w - 0.1, h - 0.08, 0.01), k.WHT)

    def phone(self, x, side, y=2.7):
        k = self.k
        self.inside.box((x, y, self.on_wall(side, 0.14)), (0.3, 0.4, 0.14), k.IST)
        self.inside.cylinder((x, y + 0.1, side * (self.hw_in - 0.16)), (x, y + 0.1, side * (self.hw_in - 0.2)), 0.05, 10, k.BLK)

    def helmets(self, x, side, n=3):
        k = self.k
        for j in range(n):
            xx = x + j * 0.32
            self.inside.cylinder((xx, 2.42, side * self.hw_in), (xx, 2.42, side * (self.hw_in - 0.08)), 0.012, 6, k.ST)
            prof = [(0, 0.16), (0.02, 0.15)] + [(0.02 + 0.13 * math.sin(math.radians(a)), 0.15 * math.cos(math.radians(a))) for a in range(20, 91, 20)]
            self.inside.lathe((xx, 2.2, side * (self.hw_in - 0.17)), (0, 1, 0), prof, 14, k.OLV)
            self.inside.lathe((xx, 1.95, side * (self.hw_in - 0.09)), (0, 0, -side), [(0, 0.07), (0.06, 0.07), (0.07, 0.03), (0.08, 0)], 12, k.CNV)

    def crates(self, x, sides=(-1, 1), stack=2):
        k = self.k
        for side in sides:
            for j in range(stack):
                self.inside.box((x, FLOOR + 0.18 + j * 0.36, self.on_wall(side, 0.4)), (0.55, 0.34, 0.38), k.WOOD)
                self.inside.box((x, FLOOR + 0.18 + j * 0.36, self.on_wall(side, 0.4)), (0.57, 0.04, 0.4), k.ST)

    # ── 外部細節 ──
    def side_details(self, doors=(0.0,), slits=(), ports=(), handrails=True, sides=(-1, 1)):
        k = self.k
        d = self.det
        for side in sides:
            zs = side * (self.W / 2)
            for x in doors:
                d.box((x, 2.05, zs + side * 0.015), (1.05, 1.45, 0.03), k.A)
                for y in (1.5, 2.05, 2.6):
                    d.cylinder((x - 0.56, y - 0.1, zs + side * 0.035), (x - 0.56, y + 0.1, zs + side * 0.035), 0.03, 8, k.ST)
                d.box((x + 0.38, 2.05, zs + side * 0.05), (0.04, 0.3, 0.04), k.ST)
                for xx in (x - 0.3, x + 0.3):
                    d.box((xx, 0.95, zs - side * 0.05), (0.04, 0.4, 0.04), k.ST)
                d.box((x, 0.76, zs - side * 0.02), (0.7, 0.04, 0.24), k.ST)
            for x in slits:
                d.box((x, 2.45, zs + side * 0.005), (0.45, 0.06, 0.02), k.BLK)
                d.box((x, 2.53, zs + side * 0.05), (0.62, 0.05, 0.1), k.A)
            for x in ports:
                d.lathe((x, 2.1, zs), (0, 0, side), [(0, 0.09), (0.03, 0.09), (0.04, 0.06), (0.045, 0)], 12, k.A, cap0=False)
            if handrails:
                for x in (self.x_min + 0.4, self.x_max - 0.4):
                    d.cylinder((x, 1.4, zs + side * 0.08), (x, 2.6, zs + side * 0.08), 0.018, 6, k.ST)
                    for y in (1.4, 2.6):
                        d.cylinder((x, y, zs), (x, y, zs + side * 0.09), 0.015, 6, k.ST)

    def mg_ring(self, x, y, side):
        """機槍球形槍架外環座。"""
        zs = side * (self.W / 2)
        self.det.lathe((x, y, zs), (0, 0, side), [(-0.02, 0.56), (0.05, 0.56), (0.05, 0.47), (-0.02, 0.47)], 24, self.k.A, closed=True)

    def vents(self, xs):
        k = self.k
        for x in xs:
            self.det.cylinder((x, self.roof, 0), (x, self.roof + 0.18, 0), 0.1, 12, k.A)
            self.det.lathe((x, self.roof + 0.18, 0), (0, 1, 0), [(0, 0.24), (0.06, 0.22), (0.1, 0)], 14, k.A)

    def lifting_rings(self):
        for sx in (1, -1):
            for z in (-0.6, 0.6):
                self.det.lathe((self.x0 + sx * (self.L / 2 - 0.4), self.roof + 0.06, z), (1, 0, 0),
                               [(0, 0.08), (0.03, 0.08), (0.03, 0.05), (0, 0.05)], 10, self.k.ST, closed=True)

    def rivets(self, skip=()):
        """側面板縫鉚釘、車頂邊緣、端板。skip：[(x0, x1)] 不打鉚釘的區段（門）。"""
        r = self.riv

        def skipped(x):
            return any(a <= x <= b for a, b in skip)

        for side in (-1, 1):
            zs = side * (self.W / 2)
            nrm = (0, 0, side)
            for x in [self.x0 + d for d in range(-int(self.L / 2) + 1, int(self.L / 2))]:
                if skipped(x):
                    continue
                for j in range(16):
                    r.rivet((x, 1.17 + 0.11 * j, zs), nrm)
            for y in (Y0 + 0.06, 2.0, self.wall_top + 0.02):
                for j in range(int((self.L - 0.3) / 0.12)):
                    x = self.x_min + 0.15 + j * 0.12
                    if skipped(x) and y < self.wall_top:
                        continue
                    r.rivet((x, y, zs), nrm)
        for z in (-(self.roof_half - 0.05), self.roof_half - 0.05):
            for j in range(int((self.L - 0.3) / 0.14)):
                r.rivet((self.x_min + 0.15 + j * 0.14, self.roof, z), (0, 1, 0))
        for sx in (1, -1):
            for j in range(21):
                z = -1.4 + 0.14 * j
                r.rivet((self.x0 + sx * self.L / 2, Y0 + 0.08, z), (sx, 0, 0))
                r.rivet((self.x0 + sx * self.L / 2, Y0 + 1.7, z), (sx, 0, 0))

    def finish(self):
        k = self.k
        self.inside.build(f'{self.name}Interior', k.MATS, parent=k.root, bevel=0.008)
        self.det.build(f'{self.name}Details', k.MATS, parent=k.root, bevel=0.012)
        self.riv.build(f'{self.name}Rivets', [k.M['armor']], parent=k.root)
