# 鋼軌堡壘

九四式裝甲列車模擬遊戲（網頁 3D，Three.js）。玩家獨自一人操作整列裝甲列車，在車廂間奔走，輪流擔任指揮官、主砲手、機槍手。

設計文件：[docs/GDD.md](docs/GDD.md)

## 執行

```bash
npm install
npm run dev
```

開啟 http://localhost:5173 ，按「開始」後點擊畫面鎖定滑鼠。按 **H** 查看操作說明。

## 目前進度：M1 原型

- 3.2 km 鐵道與 16 km 見方地形、樹林、村落、起點站
- 九四式 8 節編成：警戒車、火砲車甲乙丙、指揮車、機關車、炭水車、電源車
- 指揮車傳令鐘（約 2 秒傳令延遲）控制司機調速，終點自動減速
- 3D 角色在車內走動、經艙口上車頂、沿機關車腳踏板通過（暴露位置提示）
- 十四年式十糎高射砲：依史料最大射程校正的外彈道、自動產生的射表、表尺（密位）直接瞄準具、25 秒裝填
- 九二式重機関銃 11 處：每分 450 發、30 發保彈板、槍管過熱
- 火砲車丙測距儀與指揮台觀測鏡（目測）→ 目標簿
- 試驗靶場：靶板、土嚢陣地、移動靶車
- 第三人稱列車鏡頭；3D 定位合成音效（依音速延遲）

## Blender 模型

車廂模型由 `tools/blender/` 的 Python 腳本驅動 Blender 產生（目前完成火砲車甲；其餘車廂仍用程式建模）。

```bash
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup -P tools/blender/gun_car.py -- A
```

會產生：
- `public/models/gun_car_a.glb`：遊戲載入
- `assets/blender/gun_car_a.blend`：可用 Blender 開啟檢視、修改
- `docs/preview/gun_car_a.png`：預覽圖

手動修改 .blend 後，請自行匯出成同名 .glb；重新執行腳本會覆蓋手動修改。節點名稱（Turret、Elev、Muzzle、Sight、MG_L_*、Wheelset_* 等）遊戲會用到，請勿更名。

## 目錄

| 路徑 | 內容 |
|---|---|
| `src/world/` | 地形、鐵道、場景、天空 |
| `src/train/` | 車廂模型、列車運行、可走動範圍 |
| `src/weapons/` | 外彈道、射表、彈丸、特效 |
| `src/stations.js` | 各崗位（主砲、機槍、指揮台、測距儀）與目標簿 |
| `src/data/weapons.js` | 武器史料數據 |
