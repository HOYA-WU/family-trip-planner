// 國家、幣別與匯率
export const COUNTRIES = [
  { code: "JP", name: "日本", cur: "JPY" },
  { code: "KR", name: "韓國", cur: "KRW" },
  { code: "TH", name: "泰國", cur: "THB" },
  { code: "VN", name: "越南", cur: "VND" },
  { code: "SG", name: "新加坡", cur: "SGD" },
  { code: "MY", name: "馬來西亞", cur: "MYR" },
  { code: "PH", name: "菲律賓", cur: "PHP" },
  { code: "ID", name: "印尼", cur: "IDR" },
  { code: "HK", name: "香港", cur: "HKD" },
  { code: "MO", name: "澳門", cur: "MOP" },
  { code: "CN", name: "中國", cur: "CNY" },
  { code: "AU", name: "澳洲", cur: "AUD" },
  { code: "NZ", name: "紐西蘭", cur: "NZD" },
  { code: "US", name: "美國", cur: "USD" },
  { code: "CA", name: "加拿大", cur: "CAD" },
  { code: "GB", name: "英國", cur: "GBP" },
  { code: "FR", name: "法國", cur: "EUR" },
  { code: "DE", name: "德國", cur: "EUR" },
  { code: "IT", name: "義大利", cur: "EUR" },
  { code: "ES", name: "西班牙", cur: "EUR" },
  { code: "NL", name: "荷蘭", cur: "EUR" },
  { code: "AT", name: "奧地利", cur: "EUR" },
  { code: "CH", name: "瑞士", cur: "CHF" },
  { code: "CZ", name: "捷克", cur: "CZK" },
  { code: "TR", name: "土耳其", cur: "TRY" },
  { code: "TW", name: "台灣", cur: "TWD" },
];

export const CURRENCY_NAMES = {
  TWD: "台幣", JPY: "日圓", KRW: "韓元", THB: "泰銖", VND: "越南盾", SGD: "新加坡幣", MYR: "令吉", PHP: "披索",
  IDR: "印尼盾", HKD: "港幣", MOP: "澳門幣", CNY: "人民幣", AUD: "澳幣", NZD: "紐幣", USD: "美金", CAD: "加幣",
  GBP: "英鎊", EUR: "歐元", CHF: "瑞士法郎", CZK: "捷克克朗", TRY: "土耳其里拉",
};
export const curLabel = (c) => (CURRENCY_NAMES[c] ? `${CURRENCY_NAMES[c]} ${c}` : c);

// 這趟旅行會用到的外幣（依旅遊國家）
export function tripCurrencies(trip) {
  const out = [];
  for (const code of trip.countries || []) {
    const cur = COUNTRIES.find((c) => c.code === code)?.cur;
    if (cur && cur !== "TWD" && !out.includes(cur)) out.push(cur);
  }
  return out;
}
export const mainCurrency = (trip) => tripCurrencies(trip)[0] || "TWD";

// 免費匯率（每天更新）：回傳「1 外幣 = 多少台幣」
export async function fetchRates(curs) {
  const urls = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/twd.json",
    "https://latest.currency-api.pages.dev/v1/currencies/twd.json",
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u);
      if (!res.ok) continue;
      const json = await res.json();
      const out = {};
      for (const c of curs) {
        const perTwd = json.twd?.[c.toLowerCase()];
        if (perTwd) out[c] = Math.round((1 / perTwd) * 10000) / 10000;
      }
      return { rates: out, date: json.date };
    } catch {}
  }
  throw new Error("抓不到匯率，請確認有網路，或手動填寫");
}

export function toTWD(amount, cur, rates) {
  const n = Number(amount) || 0;
  if (cur === "TWD") return n;
  const r = rates?.[cur];
  return r ? n * r : null;
}

const DECIMALS = { JPY: 0, KRW: 0, VND: 0, IDR: 0, TWD: 0 };
export function fmtMoney(amount, cur) {
  const n = Number(amount) || 0;
  const d = DECIMALS[cur] ?? 2;
  const s = n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: d });
  return cur === "TWD" ? `NT$ ${s}` : `${cur} ${s}`;
}
