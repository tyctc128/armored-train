# 鋼軌堡壘

九四式裝甲列車模擬遊戲（網頁 3D，Three.js）。玩家獨自一人操作整列裝甲列車，在車廂間奔走，輪流擔任指揮官、主砲手、機槍手。

線上試玩：https://tyctc128.github.io/armored-train/

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
- 火砲車乙車頂雙像測距儀與指揮台觀測鏡（目測）→ 目標簿
- 火砲車丙前後兩座密閉砲塔（八八式七糎砲），同一崗位指揮兩座連動、輪流射擊
- 試驗靶場：靶板、土嚢陣地、移動靶車
- 第三人稱列車鏡頭；3D 定位合成音效（依音速延遲）
- 第一關「試驗運行」教學：7 章、57 個步驟，逐步提示按鍵、導引前往位置並自動判定完成（`src/tutorial/steps.js`）
- 右下角列車簡圖、數字鍵 1–8 自動走到車廂、車廂圖鑑（I）
- 第二關「沿線巡邏」：AI 軍士、敵騎兵與步兵、穿甲損傷、預備士兵
- 第三關「斷軌」：敵工兵炸斷鐵軌、司機 150 m 內才看得到斷口（太快會出軌）、下車在敵火下修軌（`src/world/railBreak.js`）
- 第四關「山谷伏擊」：稜線後的敵迫砲陣地逐發試射；電源車九七式曲射歩兵砲（曲射射表）依觀測哨回報修正彈著（`src/enemy/battery.js`）
- 第五關「鋼鐵對決」：敵裝甲列車（4 節）沿同一條鐵道駛來對峙砲戰；分車耐久與穿甲、砲手對敵車自動改用尖鋭弾（`src/enemy/enemyTrain.js`）

## Blender 模型

8 節車廂模型都由 `tools/blender/` 的 Python 腳本驅動 Blender 產生；共用零件（車體、車內結構、內裝、底架、機槍、機槍塔、窗）在 `parts.py`。
外觀與內裝依《世界裝甲列車圖解百科》的照片還原（分段加高的車體、多面體砲塔、車頂機槍塔、1934 年式細條紋迷彩），各腳本開頭有對應的照片說明。

| 車廂 | 腳本 |
|---|---|
| 警戒車 | `guard_car.py` |
| 火砲車甲／乙 | `gun_car.py -- A`／`gun_car.py -- B` |
| 火砲車丙 | `gun_car_c.py` |
| 指揮車 | `command_car.py` |
| 機關車 | `locomotive.py` |
| 炭水車 | `tender_car.py` |
| 電源車 | `power_car.py` |

```bash
powershell -File tools/blender/build_all.ps1
# 或單節（Linux／macOS）：
blender -b --factory-startup -P tools/blender/gun_car.py -- B
```

加參數 `interior` 只渲染車內檢查圖（不輸出模型），輸出到環境變數 `MODEL_SCRATCH` 指定的資料夾。

每節會產生：
- `public/models/<名稱>.glb`：遊戲載入（Draco 壓縮，解碼器在 `public/draco/`）
- `assets/blender/<名稱>.blend`：可用 Blender 開啟檢視、修改
- `docs/preview/<名稱>.png`：預覽圖

注意：
- 手動修改 .blend 後，請自行匯出成同名 .glb；重新執行腳本會覆蓋手動修改。
- 節點名稱（Turret、Elev、Muzzle、Sight、MG_*、RF_Yaw、ConsoleAnchor、Chimney、Wheelset_* 等）遊戲會用到，請勿更名；缺節點的模型會自動退回程式建模。
- 車廂尺寸須與 `src/train/carModels.js` 的程式建模一致（走動範圍、崗位位置都依它判定）。
- 開發伺服器不監看 `public/models`（避免 Blender 寫檔時中斷），新增模型檔後要重新啟動 `npm run dev`。

## 目錄

| 路徑 | 內容 |
|---|---|
| `src/world/` | 地形、鐵道、場景、天空 |
| `src/train/` | 車廂模型、列車運行、可走動範圍 |
| `src/weapons/` | 外彈道、射表、彈丸、特效 |
| `src/stations.js` | 各崗位（主砲、機槍、指揮台、測距儀）與目標簿 |
| `src/data/weapons.js` | 武器史料數據 |
