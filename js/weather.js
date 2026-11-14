// 天氣預報：Open-Meteo（免費、不用金鑰），只能預報未來 16 天
import { html, useState, useEffect } from "./vendor/preact-htm.js";
import { local, todayStr } from "./utils.js";

const CODES = [
  [[0], "☀️", "晴"], [[1, 2], "🌤", "晴時多雲"], [[3], "☁️", "陰"], [[45, 48], "🌫", "霧"],
  [[51, 53, 55, 56, 57], "🌦", "毛毛雨"], [[61, 63, 65, 66, 67], "🌧", "雨"], [[71, 73, 75, 77], "❄️", "雪"],
  [[80, 81, 82], "🌦", "陣雨"], [[85, 86], "🌨", "陣雪"], [[95, 96, 99], "⛈", "雷雨"],
];
export const codeInfo = (c) => CODES.find(([xs]) => xs.includes(c)) || [[], "🌡", ""];

async function geocode(name, country) {
  const key = `geo:${country || ""}:${name}`;
  const hit = local.get(key, null);
  if (hit) return hit;
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  u.searchParams.set("name", name);
  u.searchParams.set("count", "1");
  u.searchParams.set("language", "zh");
  if (country) u.searchParams.set("countryCode", country);
  const res = await fetch(u);
  const r = (await res.json()).results?.[0];
  const out = r ? { lat: r.latitude, lon: r.longitude, name: r.name } : { none: true };
  local.set(key, out);
  return out;
}

async function forecast(lat, lon) {
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = local.get(key, null);
  // 3 小時內抓過就用存著的；沒網路也用存著的
  if (hit && (Date.now() - hit.at < 3 * 3600_000 || !navigator.onLine)) return hit.days;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
  const d = (await (await fetch(u)).json()).daily;
  const days = {};
  d.time.forEach((t, i) => (days[t] = { code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], pop: d.precipitation_probability_max[i] }));
  local.set(key, { at: Date.now(), days });
  return days;
}

// 回傳 { "2027-01-20": { code, max, min, pop, place } }；地點用每天的地點，沒填就用旅行的「天氣地點」
export function useWeather(trip, days) {
  const [wx, setWx] = useState({});
  const today = todayStr();
  const limit = new Date();
  limit.setDate(limit.getDate() + 15);
  const last = limit.toISOString().slice(0, 10);
  const inRange = days.filter((d) => d >= today && d <= last);
  const country = (trip.countries || []).length === 1 ? trip.countries[0] : "";
  const sig = inRange.map((d) => (trip.dayLabels || {})[d] || "").join("|") + "#" + (trip.weatherPlace || "") + country;
  useEffect(() => {
    if (!inRange.length) return setWx({});
    let alive = true;
    (async () => {
      const out = {};
      for (const d of inRange) {
        for (const place of [(trip.dayLabels || {})[d], trip.weatherPlace].filter(Boolean)) {
          try {
            const g = await geocode(place, country);
            if (g.none) continue;
            const f = await forecast(g.lat, g.lon);
            if (f[d]) {
              out[d] = { ...f[d], place: g.name };
              break;
            }
          } catch {}
        }
      }
      if (alive) setWx(out);
    })();
    return () => (alive = false);
  }, [sig]);
  return wx;
}

export function WeatherBadge({ w, long = false }) {
  if (!w) return null;
  const [, icon, text] = codeInfo(w.code);
  return html`<span class="wx" title=${`${w.place} ${text}`}>${icon} <span class="mono">${Math.round(w.min)}°/${Math.round(w.max)}°</span>${w.pop != null && w.pop >= 20 ? html` <span class="muted">☔${w.pop}%</span>` : ""}${long ? html` <span class="muted">${w.place}</span>` : ""}</span>`;
}
