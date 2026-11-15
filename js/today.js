// 手機「今天」：當天穿搭＋時間軸，卡片可收合展開
import { html, useState, useEffect, useRef } from "./vendor/preact-htm.js";
import { CARD_TYPES, typeOf, shortDay, weekday, todayStr, sortCards, mapsHref, local } from "./utils.js";
import { useTrip, Notes, StatusBadge } from "./ui.js";
import { FileList } from "./files.js";
import { DayOutfits } from "./blocks/outfits.js";
import { blankCard } from "./board.js";
import { fmtMoney } from "./money.js";
import { WeatherBadge } from "./weather.js";

function CardDetail({ card, onEdit }) {
  const { expenses } = useTrip();
  const cost = (expenses || []).find((x) => x.id === "c_" + card.id);
  return html`<div class="detail">
    <${FileList} ids=${card.images} />
    <${Notes} text=${card.notes} />
    ${card.booking && html`<p class="booking"><span class="muted">訂位：</span>${card.booking}</p>`}
    ${cost && html`<p class="booking"><span class="muted">花費：</span><span class="mono">${fmtMoney(cost.amount, cost.currency)}</span></p>`}
    <div class="detail-actions">
      ${card.location && html`<a class="btn small" href=${mapsHref(card.location)} target="_blank" rel="noopener">📍 導航</a>`}
      ${(card.links || []).map((l, i) => html`<a key=${i} class="btn small" href=${l.url} target="_blank" rel="noopener">${l.label || "連結"} ↗</a>`)}
      <button class="btn ghost small" onClick=${onEdit}>編輯</button>
    </div>
  </div>`;
}

export function TodayView({ onOpen }) {
  const { trip, days, cards, travelers, weather } = useTrip();
  const today = todayStr();
  const [day, setDay] = useState(() => {
    if (days.includes(today)) return today;
    const saved = local.get("day:" + trip.id, "");
    return days.includes(saved) ? saved : days[0] || "";
  });
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set(local.get("exp:" + trip.id, [])));
  const [outfitOpen, setOutfitOpen] = useState(() => local.get("today-outfit", true));
  const chipsRef = useRef();
  const touch = useRef(null);

  const pick = (d) => {
    setDay(d);
    local.set("day:" + trip.id, d);
  };
  // 把選到的日期捲到日期列中間（只捲日期列，不動整個頁面）
  useEffect(() => {
    const row = chipsRef.current;
    const on = row?.querySelector(".on");
    if (!row || !on) return;
    const a = on.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    row.scrollLeft = Math.max(0, row.scrollLeft + (a.left - b.left) - (row.clientWidth - a.width) / 2);
  }, [day]);

  const setExp = (next) => {
    setExpanded(next);
    local.set("exp:" + trip.id, [...next]);
  };
  const toggle = (id) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExp(n);
  };
  const list = sortCards(cards.filter((c) => c.day === day && (filter === "all" || c.type === filter)));
  const allOpen = list.length > 0 && list.every((c) => expanded.has(c.id));
  const toggleAll = () => {
    const n = new Set(expanded);
    list.forEach((c) => (allOpen ? n.delete(c.id) : n.add(c.id)));
    setExp(n);
  };
  const idx = days.indexOf(day);

  // 左右滑換天：時間軸跟著手指走，放開後滑出去、新的一天從另一邊滑進來
  const tl = useRef();
  const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // 先套用起點位置，再開始動畫回到原位（不用 requestAnimationFrame，背景分頁也不會卡住）
  const settle = () => setTimeout(() => { void tl.current?.offsetWidth; move(0, 220); }, 30);
  const move = (x, ms = 0, fade = 0) => {
    const el = tl.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.7,.3,1), opacity ${ms}ms` : "none";
    el.style.transform = x ? `translateX(${x}px)` : "";
    el.style.opacity = fade ? String(1 - fade) : "";
  };
  // 換到某一天；dir = 1 往後、-1 往前，新內容從那一邊進來
  const go = (d, dir = Math.sign(days.indexOf(d) - idx)) => {
    if (d === day) return;
    const el = tl.current;
    if (el && dir && !calm()) move(dir * el.offsetWidth * 0.35, 0, 0.6);
    pick(d);
    if (el && dir && !calm()) settle();
  };
  const onTouchStart = (e) => {
    if (e.touches.length > 1) return (touch.current = null);
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), lock: null, dx: 0 };
  };
  const onTouchMove = (e) => {
    const s = touch.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    if (!s.lock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) s.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
    if (s.lock !== "x") return;
    s.dx = dx;
    const edge = (dx > 0 && idx <= 0) || (dx < 0 && idx >= days.length - 1);
    if (!calm()) move(edge ? dx / 4 : dx);
  };
  const onTouchEnd = () => {
    const s = touch.current;
    touch.current = null;
    if (!s || s.lock !== "x") return;
    const el = tl.current;
    const w = el?.offsetWidth || 300;
    const dir = s.dx < 0 ? 1 : -1;
    const next = days[idx + dir];
    const fast = Math.abs(s.dx) > 40 && Math.abs(s.dx) / (Date.now() - s.t) > 0.5;
    if (!next || !(Math.abs(s.dx) > w * 0.25 || fast)) return move(0, 200);
    if (calm()) return pick(next);
    move(-dir * w, 160, 0.3);
    setTimeout(() => {
      move(dir * w, 0, 0.3);
      pick(next);
      settle();
    }, 160);
  };

  return html`<div class="today">
    <div class="day-chips" ref=${chipsRef}>
      ${days.map((d) => html`<button key=${d} class=${"chip" + (d === day ? " on" : "")} onClick=${() => go(d)}>
        ${shortDay(d)}${d === today ? " 今天" : ""}</button>`)}
    </div>
    <div class="today-h">
      <div><b>${day ? `${shortDay(day)}（${weekday(day)}）` : ""}</b><span class="muted"> ${(trip.dayLabels || {})[day] || ""}</span>
        ${weather?.[day] && html` <${WeatherBadge} w=${weather[day]} />`}</div>
      ${list.length > 0 && html`<button class="btn ghost small" onClick=${toggleAll}>${allOpen ? "全部收合" : "全部展開"}</button>`}
    </div>
    ${travelers.length > 0 && day && html`<section class="today-outfit">
      <button class="today-outfit-h" aria-expanded=${outfitOpen} onClick=${() => { setOutfitOpen(!outfitOpen); local.set("today-outfit", !outfitOpen); }}>
        <b>今天穿什麼</b><span class="chev">${outfitOpen ? "▾" : "▸"}</span></button>
      ${outfitOpen && html`<${DayOutfits} day=${day} />`}
    </section>`}
    <div class="type-filter">
      <button class=${"chip" + (filter === "all" ? " on" : "")} onClick=${() => setFilter("all")}>全部</button>
      ${CARD_TYPES.map((t) => html`<button key=${t.id} class=${"chip" + (filter === t.id ? " on" : "")} onClick=${() => setFilter(t.id)}>${t.label}</button>`)}
    </div>
    <ol class="timeline" ref=${tl} onTouchStart=${onTouchStart} onTouchMove=${onTouchMove} onTouchEnd=${onTouchEnd} onTouchCancel=${onTouchEnd}>
      ${list.map((c) => {
        const open = expanded.has(c.id);
        const t = typeOf(c.type);
        return html`<li key=${c.id} class="tl-item">
          <span class="tl-time mono">${c.time || ""}</span>
          <div class=${`tcard t-${c.type} st-${c.status || "normal"}` + (open ? " open" : "")}>
            <button class="tcard-h" aria-expanded=${open} onClick=${() => toggle(c.id)}>
              <span class="tag">${t.icon} ${t.label}</span><${StatusBadge} status=${c.status} />
              <span class="tcard-title">${c.title || "（未命名）"}${(c.images || []).length > 0 && html` <span class="muted small">📎</span>`}</span>
              <span class="chev" aria-hidden="true">${open ? "▾" : "▸"}</span>
            </button>
            ${open && html`<${CardDetail} card=${c} onEdit=${() => onOpen(c)} />`}
          </div>
        </li>`;
      })}
      ${list.length === 0 && html`<li class="muted empty">這天還沒有${filter === "all" ? "" : typeOf(filter).label}行程。</li>`}
    </ol>
    <button class="btn wide" onClick=${() => onOpen(blankCard(day, 0))}>＋ 新增到這天</button>
  </div>`;
}
