import { DEG } from '../core/math.js';

// 武器數據。史料數值見 docs/GDD.md 第 2.1 節；form 為相對阻力（形狀係數），
// 阻力常數 C 於載入時依史料最大射程校正。
export const WEAPONS = {
  type14: {
    id: 'type14',
    name: '十四年式十糎高射砲',
    short: '十糎砲',
    maxRange: 16300,
    reloadTime: 25, // 以完整砲組射速抽象化
    traverseRate: 8 * DEG,
    elevRate: 5 * DEG,
    elevMin: 0,
    elevMax: 85 * DEG,
    dispersionMil: 0.35,
    wearPerRound: 0.00004, // 每發初速下降比例
    stock: { AP: 80, HE: 120 },
    shells: [
      { id: 'AP', name: '尖鋭弾', mass: 16.0, v0: 700, form: 1.0, he: false },
      { id: 'HE', name: '榴弾', mass: 15.8, v0: 700, form: 1.07, he: true },
    ],
  },
  type92: {
    id: 'type92',
    name: '九二式重機関銃',
    short: '重機槍',
    maxRange: 4300,
    rpm: 450,
    stripSize: 30,
    reloadTime: 3,
    traverseRate: 110 * DEG,
    elevRate: 80 * DEG,
    elevMin: -10 * DEG,
    elevMax: 60 * DEG,
    dispersionMil: 1.6,
    poolPerCar: 3000,
    shells: [{ id: 'BALL', name: '普通弾', mass: 0.0132, v0: 750, form: 1.0, he: false }],
  },
};
