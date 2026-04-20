/**
 * 金相場自動更新スクリプト
 *
 * ■ 相場表（LP表示用）: 田中貴金属の「税込買取価格」をそのまま表示
 * ■ シミュレーション用: 田中買取価格からマージンを引いた徳丸商会の買取価格
 *
 * マージン:
 *   金: -2,500円
 *   プラチナ: -2,500円
 *   シルバー: -150円
 *
 * GitHub Actions で毎朝9時(JST)に実行される。
 * 使い方: bun run scripts/update-gold-price.ts
 */

const TANAKA_GOLD_URL = "https://gold.tanaka.co.jp/commodity/souba/d-gold.php";
const TANAKA_PLATINUM_URL = "https://gold.tanaka.co.jp/commodity/souba/d-platinum.php";
const TANAKA_SILVER_URL = "https://gold.tanaka.co.jp/commodity/souba/d-silver.php";

const GOLD_MARGIN = 2500;
const PT_MARGIN = 2500;
const SV_MARGIN = 150;

const OUTPUT_PATH = decodeURIComponent(new URL("../src/data/goldPrice.ts", import.meta.url).pathname);

/**
 * 田中貴金属のページから「税込買取価格」を取得
 * HTMLに「店頭買取価格（税込）XX,XXX 円」のパターンがある
 */
async function fetchBuyPrice(url: string, label: string): Promise<number> {
  const res = await fetch(url);
  const html = await res.text();

  // パターン1: 「店頭買取価格（税込）\n...\n26,655 円」のような表記（改行を挟む）
  const buyMatch = html.match(/店頭買取価格[（(]税込[）)][\s\S]*?([\d,]+(?:\.\d+)?)\s*円/);
  if (buyMatch) {
    const price = parseFloat(buyMatch[1].replace(/,/g, ""));
    if (!isNaN(price) && price > 10) {
      console.log(`  ${label} 買取(税込): ¥${price.toLocaleString()}/g`);
      return Math.floor(price);
    }
  }

  // パターン2: data1配列から小売価格を取得し、差額から推測（フォールバック）
  const dataMatch = html.match(/const\s+data1\s*=\s*\[([^\]]+)\]/);
  if (dataMatch) {
    const retail = parseInt(dataMatch[1].split(",")[0].trim().replace(/"/g, ""), 10);
    if (!isNaN(retail)) {
      // 金の場合: 小売-買取の差額は約356円（2026-04-20実測）
      const estimatedBuy = Math.round(retail * 0.9868); // 約1.3%差
      console.log(`  ${label} 買取(推定): ¥${estimatedBuy.toLocaleString()}/g (小売 ¥${retail.toLocaleString()} から推定)`);
      return estimatedBuy;
    }
  }

  throw new Error(`${label} price not found at ${url}`);
}

async function main() {
  console.log("田中貴金属から税込買取価格を取得中...\n");

  // === 金 ===
  let goldTanakaBuy: number;
  try {
    goldTanakaBuy = await fetchBuyPrice(TANAKA_GOLD_URL, "金");
  } catch (e) {
    console.error("金の価格取得に失敗:", e);
    process.exit(1);
  }

  // === プラチナ ===
  let ptTanakaBuy: number;
  try {
    ptTanakaBuy = await fetchBuyPrice(TANAKA_PLATINUM_URL, "プラチナ");
  } catch (e) {
    console.error("プラチナの価格取得に失敗:", e);
    ptTanakaBuy = 11607; // フォールバック
  }

  // === シルバー ===
  let svTanakaBuy: number;
  try {
    svTanakaBuy = await fetchBuyPrice(TANAKA_SILVER_URL, "シルバー");
  } catch (e) {
    console.error("シルバーの価格取得に失敗:", e);
    svTanakaBuy = 441; // フォールバック
  }

  // 徳丸商会の買取価格（シミュレーション用）= 田中買取 - マージン
  const goldSimPrice = goldTanakaBuy - GOLD_MARGIN;
  const ptSimPrice = ptTanakaBuy - PT_MARGIN;
  const svSimPrice = svTanakaBuy - SV_MARGIN;

  // 品位別の相場表価格（田中買取価格 × 純度比率）
  const purityRatios: Record<string, number> = {
    k24: 1.0,
    k23: 0.9583,
    k22: 0.917,
    k21_6: 0.9,
    k20: 0.833,
    k18: 0.75,
    k17: 0.7083,
    k14: 0.585,
    k12: 0.5,
    k10: 0.417,
    k9: 0.375,
    k8: 0.333,
    k7: 0.292,
    k5: 0.208,
  };

  // 相場表用の価格（田中買取価格ベース）
  const marketPrices: Record<string, number> = {};
  for (const [key, ratio] of Object.entries(purityRatios)) {
    marketPrices[key] = Math.round(goldTanakaBuy * ratio);
  }

  // シミュレーション用の価格（徳丸買取価格ベース）
  const simPrices: Record<string, number> = {};
  for (const [key, ratio] of Object.entries(purityRatios)) {
    simPrices[key] = Math.round(goldSimPrice * ratio);
  }

  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + jstOffset);
  const lastUpdated = jst.toISOString().replace("Z", "+09:00");

  const output = `/** 金・貴金属 1gあたりの価格データ
 *  GitHub Actions で毎朝9時に自動更新される。
 *
 *  ■ market: 田中貴金属の税込買取価格（相場表に表示）
 *  ■ sim: 徳丸商会の買取価格（シミュレーション用）
 *    金: 田中買取 - ${GOLD_MARGIN}円
 *    プラチナ: 田中買取 - ${PT_MARGIN}円
 *    シルバー: 田中買取 - ${SV_MARGIN}円
 *
 *  最終更新: ${lastUpdated}
 */
export const goldPrice = {
  lastUpdated: "${lastUpdated}",
  source: "市場税込買取価格基準",

  // === 金 ===
  gold: {
    tanakaBuy: ${goldTanakaBuy},
    // 相場表用（田中買取価格 × 純度比率）
    market: {
${Object.entries(marketPrices)
  .map(([k, v]) => `      ${k}: ${v},`)
  .join("\n")}
    },
    // シミュレーション用（田中買取 - ${GOLD_MARGIN}円 × 純度比率）
    sim: {
${Object.entries(simPrices)
  .map(([k, v]) => `      ${k}: ${v},`)
  .join("\n")}
    },
  },

  // === プラチナ ===
  platinum: {
    tanakaBuy: ${ptTanakaBuy},
    market: {
      pt1000: ${ptTanakaBuy},
      pt950: ${Math.round(ptTanakaBuy * 0.95)},
      pt900: ${Math.round(ptTanakaBuy * 0.9)},
      pt850: ${Math.round(ptTanakaBuy * 0.85)},
    },
    sim: {
      pt1000: ${ptSimPrice},
      pt950: ${Math.round(ptSimPrice * 0.95)},
      pt900: ${Math.round(ptSimPrice * 0.9)},
      pt850: ${Math.round(ptSimPrice * 0.85)},
    },
  },

  // === シルバー ===
  silver: {
    tanakaBuy: ${svTanakaBuy},
    market: {
      sv1000: ${svTanakaBuy},
      sv925: ${Math.round(svTanakaBuy * 0.925)},
    },
    sim: {
      sv1000: ${svSimPrice},
      sv925: ${Math.round(svSimPrice * 0.925)},
    },
  },
} as const;

export type GoldPrice = typeof goldPrice;
`;

  await Bun.write(OUTPUT_PATH, output);
  console.log(`\n更新完了: ${OUTPUT_PATH}`);
  console.log(`\n■ 相場表（田中買取価格）:`);
  console.log(`  金 K24: ¥${goldTanakaBuy.toLocaleString()}/g`);
  console.log(`  金 K18: ¥${marketPrices.k18.toLocaleString()}/g`);
  console.log(`  Pt1000: ¥${ptTanakaBuy.toLocaleString()}/g`);
  console.log(`  Sv1000: ¥${svTanakaBuy.toLocaleString()}/g`);
  console.log(`\n■ シミュレーション（徳丸買取価格）:`);
  console.log(`  金 K24: ¥${goldSimPrice.toLocaleString()}/g (-${GOLD_MARGIN})`);
  console.log(`  Pt1000: ¥${ptSimPrice.toLocaleString()}/g (-${PT_MARGIN})`);
  console.log(`  Sv1000: ¥${svSimPrice.toLocaleString()}/g (-${SV_MARGIN})`);

  // === goldPrice.json も同時に出力（サーバー用） ===
  const jsonPath = decodeURIComponent(new URL("../public/goldPrice.json", import.meta.url).pathname);
  const jsonData = {
    lastUpdated,
    gold: {
      tanakaBuy: goldTanakaBuy,
      market: marketPrices,
      sim: simPrices,
    },
    platinum: {
      tanakaBuy: ptTanakaBuy,
      market: {
        pt1000: ptTanakaBuy,
        pt950: Math.round(ptTanakaBuy * 0.95),
        pt900: Math.round(ptTanakaBuy * 0.9),
        pt850: Math.round(ptTanakaBuy * 0.85),
      },
      sim: {
        pt1000: ptSimPrice,
        pt950: Math.round(ptSimPrice * 0.95),
        pt900: Math.round(ptSimPrice * 0.9),
        pt850: Math.round(ptSimPrice * 0.85),
      },
    },
    silver: {
      tanakaBuy: svTanakaBuy,
      market: {
        sv1000: svTanakaBuy,
        sv925: Math.round(svTanakaBuy * 0.925),
      },
      sim: {
        sv1000: svSimPrice,
        sv925: Math.round(svSimPrice * 0.925),
      },
    },
  };
  await Bun.write(jsonPath, JSON.stringify(jsonData));
  console.log(`\nJSON出力: ${jsonPath}`);
}

main();
