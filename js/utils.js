// 共用小工具

export function newId(len = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = "";
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

export const CARD_TYPES = [
  { id: "sight", label: "景點", icon: "⛰" },
  { id: "food", label: "吃喝", icon: "🍴" },
  { id: "move", label: "移動", icon: "🚗" },
  { id: "stay", label: "住宿", icon: "🛏" },
  { id: "shop", label: "購物", icon: "🛍" },
];
export const typeOf = (id) => CARD_TYPES.find((t) => t.id === id) || CARD_TYPES[0];

export const STATUSES = [
  { id: "normal", label: "一般" },
  { id: "booked", label: "已訂" },
  { id: "backup", label: "備案" },
  { id: "cancelled", label: "取消" },
];

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

// "2026-02-09" → Date（當地時間）
export function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function todayStr() {
  return fmtDate(new Date());
}
export function daysBetween(start, end) {
  if (!start || !end) return [];
  const out = [];
  const d = parseDate(start);
  const e = parseDate(end);
  let guard = 0;
  while (d <= e && guard++ < 120) {
    out.push(fmtDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
export function shortDay(s) {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
export function weekday(s) {
  return WEEK[parseDate(s).getDay()];
}

// 排序用：取兩個 order 中間的值
export function orderBetween(before, after) {
  if (before == null && after == null) return 1000;
  if (before == null) return after - 1000;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}

export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const o = (a.order ?? 0) - (b.order ?? 0);
    return o !== 0 ? o : (a.title || "").localeCompare(b.title || "");
  });
}

export function isUrl(s) {
  return /^https?:\/\//i.test((s || "").trim());
}
export function mapsHref(location) {
  const v = (location || "").trim();
  if (!v) return "";
  if (isUrl(v)) return v;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(v);
}

// 每台裝置自己的偏好（收合狀態等），不會同步給家人
export const local = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("ftp:" + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem("ftp:" + key, JSON.stringify(value));
    } catch {}
  },
};
