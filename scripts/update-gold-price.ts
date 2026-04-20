/**
 * 金相場自動更新スクリプト
 * 田中貴金属の店頭小売価格をスクレイピングし、徳丸商会の買取価格を計算する。
 * GitHub Actions で毎朝9時(JST)に実行される。
 *
 * 使い方: bun run scripts/update-gold-price.ts
 */

const TANAKA_GOLD_URL = "https://gold.tanaka.co.jp/commodity/souba/d-gold.php";
const TANAKA_PLATINUM_URL = "https://gold.tanaka.co.jp/commodity/souba/d-platinum.php";
const MARGIN = 2500; // 田中小売価格からの差額
const PT_MARGIN = 500; // プラチナの差額
const SV_MARGIN = 50; // シルバーの差額

const OUTPUT_PATH = new URL("../src/data/goldPrice.ts", import.meta.url).pathname;

async function fetchPrice(url: string): Promise<number> {
  const res = await fetch(url);
  const html = await res.text();

  // 田中貴金属のページからdata1配列（小売価格）を抽出
  const match = html.match(/const\s+data1\s*=\s*\[([^\]]+)\]/);
  if (!match) throw new Error(`Price data not found in ${url}`);

  const prices = match[1].split(",").map((s) => parseInt(s.trim().replace(/"/g, ""), 10));
  if (prices.length === 0 || isNaN(prices[0])) throw new Error(`Invalid price data from ${url}`);

  return prices[0]; // 最新の価格（配列の先頭）
}

async function main() {
  console.log("Fetching gold price from 田中貴金属...");

  let goldRetail: number;
  try {
    goldRetail = await fetchPrice(TANAKA_GOLD_URL);
    console.log(`  Gold retail: ¥${goldRetail.toLocaleString()}/g`);
  } catch (e) {
    console.error("Failed to fetch gold price:", e);
    process.exit(1);
  }

  // プラチナ価格（取得失敗時はデフォルト値を使用）
  let ptRetail = 5200;
  try {
    ptRetail = await fetchPrice(TANAKA_PLATINUM_URL);
    console.log(`  Platinum retail: ¥${ptRetail.toLocaleString()}/g`);
  } catch {
    console.log("  Platinum: using default value");
  }

  // 買取価格 = 小売価格 - マージン
  const goldBuy = goldRetail - MARGIN;
  const ptBuy = ptRetail - PT_MARGIN;
  const svRetail = 165; // シルバーは固定（変動小さい）
  const svBuy = svRetail - SV_MARGIN;

  // 品位別価格を計算
  const purityRatios: Record<string, number> = {
    k24: 0.999,
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

  const goldPrices: Record<string, number> = {};
  for (const [key, ratio] of Object.entries(purityRatios)) {
    goldPrices[key] = Math.round(goldBuy * ratio);
  }

  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + jstOffset);
  const lastUpdated = jst.toISOString().replace("Z", "+09:00");

  const output = `/** 金・貴金属 1gあたりの参考買取相場表
 *  GitHub Actions で毎朝9時に自動更新される。
 *  田中貴金属の店頭小売価格 - ${MARGIN}円 = 徳丸商会の買取価格
 *  最終更新: ${lastUpdated}
 */
export const goldPrice = {
  lastUpdated: "${lastUpdated}",
  source: "田中貴金属工業 店頭小売価格",
  margin: ${MARGIN},
  gold: {
    retail: ${goldRetail},
    buy: ${goldBuy},
${Object.entries(goldPrices)
  .map(([k, v]) => `    ${k}: ${v},`)
  .join("\n")}
  },
  platinum: {
    retail: ${ptRetail},
    buy: ${ptBuy},
    pt1000: ${ptBuy},
    pt950: ${Math.round(ptBuy * 0.95)},
    pt900: ${Math.round(ptBuy * 0.9)},
    pt850: ${Math.round(ptBuy * 0.85)},
  },
  silver: {
    retail: ${svRetail},
    buy: ${svBuy},
    sv1000: ${svBuy},
    sv925: ${Math.round(svBuy * 0.925)},
  },
} as const;

export type GoldPrice = typeof goldPrice;
`;

  await Bun.write(OUTPUT_PATH, output);
  console.log(`\nUpdated: ${OUTPUT_PATH}`);
  console.log(`Gold buy price: ¥${goldBuy.toLocaleString()}/g (K24)`);
  console.log(`K18: ¥${goldPrices.k18.toLocaleString()}/g`);
  console.log(`Platinum: ¥${ptBuy.toLocaleString()}/g`);
}

main();
