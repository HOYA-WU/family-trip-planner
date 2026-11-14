// 每日穿搭：行前依人編輯，旅途中依日期查看
import { html, useState } from "../vendor/preact-htm.js";
import { store } from "../store.js";
import { shortDay, weekday, todayStr, sortCards, local } from "../utils.js";
import { useTrip, useSub, LazyInput, useWide } from "../ui.js";
import { FilePick, FileList } from "../files.js";
import { WeatherBadge } from "../weather.js";

export function useOutfits() {
  const { trip } = useTrip();
  const xs = useSub((cb) => store.onSub(trip.id, "outfits", cb), [trip.id]) || [];
  const map = {};
  for (const o of xs) map[`${o.date}_${o.personId}`] = o;
  return map;
}

function save(trip, date, personId, patch) {
  store.setSub(trip.id, "outfits", `${date}_${personId}`, { date, personId, ...patch });
}

// 那天的行程重點，幫忙決定穿什麼
function dayHint(cards, day) {
  return sortCards(cards.filter((c) => c.day === day && c.status !== "cancelled" && (c.type === "sight" || c.type === "move")))
    .slice(0, 3).map((c) => c.title).join("・");
}

function OutfitCell({ date, person, o, compact }) {
  const { trip } = useTrip();
  const img = o?.imageId ? [o.imageId] : [];
  return html`<div class="outfit-cell">
    <${LazyInput} id=${`of-${date}-${person.id}`} value=${o?.text || ""} placeholder=${compact ? "" : "穿什麼？"}
      onSave=${(v) => save(trip, date, person.id, { text: v })} aria-label=${`${shortDay(date)} ${person.name} 的穿搭`} />
    ${!compact && html`<div class="outfit-img">
      <${FileList} ids=${img} size="sm" onRemove=${(fid) => { store.deleteFile(trip.id, fid); save(trip, date, person.id, { imageId: "" }); }} />
      ${!img.length && html`<${FilePick} id=${`of-img-${date}-${person.id}`} label="📷" class="btn ghost small" multiple=${false} accept="image/*"
        onAdded=${([fid]) => save(trip, date, person.id, { imageId: fid })} />`}
    </div>`}
  </div>`;
}

function ByPerson() {
  const { trip, days, cards, travelers, weather } = useTrip();
  const map = useOutfits();
  const [pid, setPid] = useState(() => local.get("of-person", travelers[0]?.id));
  const person = travelers.find((p) => p.id === pid) || travelers[0];
  if (!person) return html`<p class="muted">請先在「編輯旅行」選擇這趟的旅伴。</p>`;
  return html`<div class="stack">
    <div class="chips">${travelers.map((p) => html`<button key=${p.id} class=${"chip" + (p.id === person.id ? " on" : "")}
      onClick=${() => { setPid(p.id); local.set("of-person", p.id); }}>${p.name}</button>`)}</div>
    <ul class="outfit-days">
      ${days.map((d) => html`<li key=${d}>
        <div class="outfit-date"><b class="mono">${shortDay(d)}</b> <span class="muted">週${weekday(d)}</span>
          <span class="muted small">${(trip.dayLabels || {})[d] || ""}</span>
          ${weather?.[d] && html`<${WeatherBadge} w=${weather[d]} />`}
          <span class="outfit-hint small">${dayHint(cards, d)}</span></div>
        <${OutfitCell} date=${d} person=${person} o=${map[`${d}_${person.id}`]} />
      </li>`)}
    </ul>
  </div>`;
}

export function DayOutfits({ day }) {
  const { travelers } = useTrip();
  const map = useOutfits();
  return html`<ul class="outfit-people">
    ${travelers.map((p) => {
      const o = map[`${day}_${p.id}`];
      return html`<li key=${p.id}>
        <span class="outfit-name">${p.name}</span>
        <div class="outfit-what">
          ${o?.text ? html`<span>${o.text}</span>` : html`<span class="muted">未填</span>`}
          ${o?.imageId && html`<${FileList} ids=${[o.imageId]} size="sm" />`}
        </div>
      </li>`;
    })}
  </ul>`;
}

function ByDate() {
  const { days } = useTrip();
  const [day, setDay] = useState(() => (days.includes(todayStr()) ? todayStr() : days[0]));
  return html`<div class="stack">
    <div class="chips scroll">${days.map((d) => html`<button key=${d} class=${"chip" + (d === day ? " on" : "")} onClick=${() => setDay(d)}>${shortDay(d)}</button>`)}</div>
    ${day && html`<${DayOutfits} day=${day} />`}
  </div>`;
}

function Grid() {
  const { days, travelers } = useTrip();
  const map = useOutfits();
  return html`<div class="table-wrap"><table class="outfit-grid">
    <thead><tr><th>日期</th>${travelers.map((p) => html`<th key=${p.id}>${p.name}</th>`)}</tr></thead>
    <tbody>${days.map((d) => html`<tr key=${d}>
      <th class="mono">${shortDay(d)}</th>
      ${travelers.map((p) => html`<td key=${p.id}><${OutfitCell} date=${d} person=${p} o=${map[`${d}_${p.id}`]} compact=${true} /></td>`)}
    </tr>`)}</tbody>
  </table></div>`;
}

export function Full() {
  const wide = useWide();
  const [mode, setMode] = useState(() => local.get("of-mode", "person"));
  const pick = (m) => {
    setMode(m);
    local.set("of-mode", m);
  };
  return html`<div class="stack">
    <div class="chips">
      <button class=${"chip" + (mode === "person" ? " on" : "")} onClick=${() => pick("person")}>依人編輯</button>
      <button class=${"chip" + (mode === "date" ? " on" : "")} onClick=${() => pick("date")}>依日期查看</button>
      ${wide && html`<button class=${"chip" + (mode === "grid" ? " on" : "")} onClick=${() => pick("grid")}>總表</button>`}
    </div>
    ${mode === "person" && html`<${ByPerson} />`}
    ${mode === "date" && html`<${ByDate} />`}
    ${mode === "grid" && wide && html`<${Grid} />`}
  </div>`;
}

export function Summary() {
  const { days, travelers } = useTrip();
  const map = useOutfits();
  const day = days.includes(todayStr()) ? todayStr() : days[0];
  const filled = Object.values(map).filter((o) => o.text || o.imageId).length;
  const total = days.length * travelers.length;
  return html`<div class="sum">
    <p class="muted small">已填 ${filled}/${total} 格${day ? `・${shortDay(day)}` : ""}</p>
    ${day && travelers.map((p) => html`<div class="mini" key=${p.id}>
      <span>${map[`${day}_${p.id}`]?.text || html`<span class="muted">未填</span>`}</span><span class="muted small">${p.name}</span>
    </div>`)}
  </div>`;
}
