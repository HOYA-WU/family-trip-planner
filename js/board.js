// 行程看板與卡片編輯
import { html, useState, useEffect, useRef } from "./vendor/preact-htm.js";
import Sortable from "./vendor/sortable.esm.js";
import { store } from "./store.js";
import { CARD_TYPES, STATUSES, typeOf, shortDay, weekday, todayStr, orderBetween, sortCards, mapsHref, local } from "./utils.js";
import { useTrip, ConfirmButton, StatusBadge, Panel } from "./ui.js";
import { FilePick, FileList } from "./files.js";
import { tripCurrencies, mainCurrency, curLabel } from "./money.js";

export const blankCard = (day, order) => ({
  day, order, type: "sight", title: "", status: "normal",
  time: "", endTime: "", notes: "", location: "", links: [], booking: "", images: [],
});
export function timeText(c) {
  if (!c.time) return "";
  return c.endTime ? `${c.time}–${c.endTime}` : c.time;
}
export function endOrder(cards, day, exceptId) {
  const list = sortCards(cards.filter((c) => c.day === day && c.id !== exceptId));
  return list.length ? list[list.length - 1].order + 1000 : 1000;
}
const TYPE_TO_CATEGORY = { food: "food", move: "transport", stay: "stay", sight: "ticket", shop: "shopping" };

function CardChip({ card, onOpen }) {
  const t = typeOf(card.type);
  const n = (card.images || []).length;
  return html`<div class=${`bcard t-${card.type} st-${card.status || "normal"}`} data-id=${card.id}
      role="button" tabindex="0" onClick=${() => onOpen(card)}
      onKeyDown=${(e) => e.key === "Enter" && onOpen(card)}>
    <div class="bcard-top"><span class="tag">${t.icon} ${t.label}</span><${StatusBadge} status=${card.status} /></div>
    <div class="bcard-title">${card.title || "（未命名）"}</div>
    ${(card.time || n > 0) && html`<div class="bcard-time mono">${timeText(card)}${n > 0 && html`<span class="bcard-pics">📎${n}</span>`}</div>`}
  </div>`;
}

function QuickAdd({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) return html`<button class="add-card" onClick=${() => setOpen(true)}>＋ 新增卡片</button>`;
  return html`<form class="quick-add" onSubmit=${(e) => {
    e.preventDefault();
    if (text.trim()) onAdd(text.trim());
    setText("");
  }}>
    <input value=${text} onInput=${(e) => setText(e.target.value)} placeholder="名稱，按 Enter 新增"
      autofocus onBlur=${() => !text && setOpen(false)} onKeyDown=${(e) => e.key === "Escape" && setOpen(false)} />
  </form>`;
}

function Column({ day, cards, onOpen, onMove, narrow, onToggleNarrow }) {
  const { trip } = useTrip();
  const listRef = useRef();
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [editingLabel, setEditingLabel] = useState(false);
  useEffect(() => {
    if (!listRef.current) return;
    const s = Sortable.create(listRef.current, {
      group: "cards",
      animation: 150,
      delay: 250,
      delayOnTouchOnly: true,
      draggable: ".bcard",
      ghostClass: "is-ghost",
      chosenClass: "is-chosen",
      scrollSensitivity: 80,
      onEnd: (evt) => {
        const { item, from, to, oldIndex, newIndex } = evt;
        if (from === to && oldIndex === newIndex) return;
        // 把 DOM 還原，交給資料更新後重新繪製
        item.remove();
        from.insertBefore(item, from.children[oldIndex] || null);
        moveRef.current(item.dataset.id, to.dataset.day, newIndex);
      },
    });
    return () => s.destroy();
  }, [narrow]);

  const label = day ? (trip.dayLabels || {})[day] || "" : "";
  const saveLabel = (v) => {
    setEditingLabel(false);
    if (v === label) return;
    store.updateTrip(trip.id, { dayLabels: { ...(trip.dayLabels || {}), [day]: v } });
  };
  const isToday = day && day === todayStr();

  if (narrow)
    return html`<div class="col narrow" id=${"col-" + (day || "pool")}>
      <button class="col-narrow-btn" onClick=${onToggleNarrow} title="展開">
        <span class="mono">${day ? shortDay(day) : "待排"}</span><span class="muted">${cards.length}</span>
      </button>
    </div>`;

  return html`<div class=${"col" + (day ? "" : " pool") + (isToday ? " today" : "")} id=${"col-" + (day || "pool")}>
    <header class="col-h">
      <div class="col-date">
        ${day
          ? html`<b class="mono">${shortDay(day)}</b> <span class="muted">週${weekday(day)}</span>`
          : html`<b>待排</b> <span class="muted">還沒決定哪天</span>`}
        <button class="icon-btn" title="收窄這一欄" aria-label="收窄這一欄" onClick=${onToggleNarrow}>‹</button>
      </div>
      ${day && (editingLabel
        ? html`<input class="col-label-input" autofocus value=${label}
            onBlur=${(e) => saveLabel(e.target.value.trim())}
            onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingLabel(false); }} />`
        : html`<button class="col-label" onClick=${() => setEditingLabel(true)}>${label || html`<span class="muted">＋ 地點</span>`}</button>`)}
    </header>
    <div class="col-list" ref=${listRef} data-day=${day}>
      ${cards.map((c) => html`<${CardChip} key=${c.id} card=${c} onOpen=${onOpen} />`)}
    </div>
    <${QuickAdd} onAdd=${(title) => store.addSub(trip.id, "cards", { ...blankCard(day, endOrder(cards, day)), title })} />
  </div>`;
}

export function Board({ onOpen }) {
  const { trip, days, cards } = useTrip();
  const [narrow, setNarrow] = useState(() => local.get("narrow:" + trip.id, {}));
  const toggleNarrow = (key) => {
    const next = { ...narrow, [key]: !narrow[key] };
    setNarrow(next);
    local.set("narrow:" + trip.id, next);
  };
  const dayset = new Set(days);
  const groups = { "": [] };
  days.forEach((d) => (groups[d] = []));
  for (const c of cards) groups[dayset.has(c.day) ? c.day : ""].push(c);
  for (const k in groups) groups[k] = sortCards(groups[k]);

  const onMove = (id, toDay, newIndex) => {
    const target = groups[toDay].filter((c) => c.id !== id);
    const order = orderBetween(target[newIndex - 1]?.order, target[newIndex]?.order);
    store.updateSub(trip.id, "cards", id, { day: toDay, order });
  };
  const jump = (d) => {
    if (narrow[d]) toggleNarrow(d);
    document.getElementById("col-" + (d || "pool"))?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };
  return html`<div class="board-wrap">
    <nav class="day-jump" aria-label="跳到某一天">
      ${days.map((d) => html`<button key=${d} class=${"chip" + (d === todayStr() ? " on" : "")} onClick=${() => jump(d)}>${shortDay(d)}</button>`)}
    </nav>
    <div class="board">
      ${["", ...days].map((d) => html`<${Column} key=${d || "pool"} day=${d} cards=${groups[d]}
        onOpen=${onOpen} onMove=${onMove} narrow=${!!narrow[d || "pool"]} onToggleNarrow=${() => toggleNarrow(d || "pool")} />`)}
    </div>
  </div>`;
}

export function CardEditor({ card, onClose }) {
  const { trip, days, cards, expenses } = useTrip();
  const isNew = !card.id;
  const costId = card.id ? "c_" + card.id : null;
  const oldCost = costId ? (expenses || []).find((x) => x.id === costId) : null;
  const curs = ["TWD", ...tripCurrencies(trip)];
  const [d, setD] = useState(() => ({ ...blankCard("", 0), ...card, links: [...(card.links || [])], images: [...(card.images || [])] }));
  const [cost, setCost] = useState(() => ({ amount: oldCost ? String(oldCost.amount) : "", currency: oldCost?.currency || mainCurrency(trip) }));
  const [dirty, setDirty] = useState(false);
  const added = useRef([]);
  const set = (k, v) => {
    setD((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const bind = (k) => ({ value: d[k] || "", onInput: (e) => set(k, e.target.value) });
  // 取消時，把這次新上傳但沒存的圖片刪掉
  const cancel = () => {
    added.current.forEach((fid) => store.deleteFile(trip.id, fid));
    onClose();
  };

  const save = async (e) => {
    e && e.preventDefault();
    // 存檔時，把被移除的舊圖片刪掉
    (card.images || []).filter((fid) => !d.images.includes(fid)).forEach((fid) => store.deleteFile(trip.id, fid));
    added.current.filter((fid) => !d.images.includes(fid)).forEach((fid) => store.deleteFile(trip.id, fid));
    added.current = [];
    const { id, ...data } = d;
    data.title = (data.title || "").trim();
    data.links = data.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
    let cardId = card.id;
    if (isNew) {
      data.order = endOrder(cards, data.day);
      cardId = await store.addSub(trip.id, "cards", data);
    } else {
      if (data.day !== card.day) data.order = endOrder(cards, data.day, card.id);
      store.updateSub(trip.id, "cards", card.id, data);
    }
    // 卡片上的花費會同步到「花費」區塊
    const amt = parseFloat(cost.amount);
    if (amt > 0) {
      store.setSub(trip.id, "expenses", "c_" + cardId, {
        cardId, amount: amt, currency: cost.currency, title: data.title || "（未命名）",
        date: data.day || todayStr(), category: TYPE_TO_CATEGORY[data.type] || "other",
      });
    } else if (oldCost) {
      store.deleteSub(trip.id, "expenses", oldCost.id);
    }
    onClose();
  };
  const remove = () => {
    store.deleteSub(trip.id, "cards", card.id);
    if (oldCost) store.deleteSub(trip.id, "expenses", oldCost.id);
    (card.images || []).forEach((fid) => store.deleteFile(trip.id, fid));
    onClose();
  };
  const setLink = (i, k, v) => set("links", d.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return html`<${Panel} title=${isNew ? "新增卡片" : "編輯卡片"} onClose=${cancel} onSubmit=${save} guard=${dirty}
    footer=${html`
      ${!isNew && html`<${ConfirmButton} label="刪除" onConfirm=${remove} />`}
      <span class="spacer"></span>
      <button type="button" class="btn" onClick=${cancel}>取消</button>
      <button type="submit" class="btn primary">儲存</button>`}>
    <div class="seg" role="group" aria-label="類型">
      ${CARD_TYPES.map((t) => html`<button type="button" class=${`seg-btn t-${t.id}` + (d.type === t.id ? " on" : "")}
        onClick=${() => set("type", t.id)}>${t.icon} ${t.label}</button>`)}
    </div>
    <label class="field"><span>名稱</span><input id="card-title" ...${bind("title")} placeholder="例如：菲利普島看企鵝歸巢" autofocus=${isNew} /></label>
    <div class="row3">
      <label class="field"><span>日期</span>
        <select id="card-day" value=${d.day} onChange=${(e) => set("day", e.target.value)}>
          <option value="">待排</option>
          ${days.map((x) => html`<option value=${x}>${shortDay(x)}（${weekday(x)}）${(trip.dayLabels || {})[x] ? " " + trip.dayLabels[x] : ""}</option>`)}
        </select></label>
      <label class="field"><span>開始</span><input id="card-time" type="time" ...${bind("time")} /></label>
      <label class="field"><span>結束</span><input id="card-end" type="time" ...${bind("endTime")} /></label>
    </div>
    <div class="field"><span>狀態</span>
      <div class="seg small" role="group" aria-label="狀態">
        ${STATUSES.map((s) => html`<button type="button" class=${"seg-btn" + ((d.status || "normal") === s.id ? " on" : "")}
          onClick=${() => set("status", s.id)}>${s.label}</button>`)}
      </div>
    </div>
    <label class="field"><span>地點</span>
      <input id="card-location" ...${bind("location")} placeholder="貼 Google Maps 連結，或直接打地址" />
      ${d.location && html`<a class="hint-link" href=${mapsHref(d.location)} target="_blank" rel="noopener">在 Google Maps 開啟 ↗</a>`}
    </label>
    <div class="field"><span>圖片與附件（訂房確認信、菜單、電子票…）</span>
      <${FileList} ids=${d.images} onRemove=${(fid) => set("images", d.images.filter((x) => x !== fid))} />
      <div><${FilePick} id="card-images" label="＋ 圖片或 PDF"
        onAdded=${(ids) => { added.current.push(...ids); setD((x) => ({ ...x, images: [...x.images, ...ids] })); setDirty(true); }} /></div>
    </div>
    <div class="field"><span>連結</span>
      ${d.links.map((l, i) => html`<div class="link-row" key=${i}>
        <input id=${"link-label-" + i} value=${l.label} onInput=${(e) => setLink(i, "label", e.target.value)} placeholder="名稱（可空白）" />
        <input id=${"link-url-" + i} value=${l.url} onInput=${(e) => setLink(i, "url", e.target.value)} placeholder="https://…" />
        <button type="button" class="icon-btn" aria-label="移除連結" onClick=${() => set("links", d.links.filter((_, j) => j !== i))}>×</button>
      </div>`)}
      <div><button type="button" class="btn ghost small" onClick=${() => set("links", [...d.links, { label: "", url: "" }])}>＋ 新增連結</button></div>
    </div>
    <div class="field"><span>花費（可不填，填了會記到花費區塊）</span>
      <div class="money-row">
        <input id="card-cost" type="number" inputmode="decimal" min="0" step="any" value=${cost.amount}
          onInput=${(e) => { setCost({ ...cost, amount: e.target.value }); setDirty(true); }} placeholder="金額" />
        <select id="card-cost-cur" value=${cost.currency} onChange=${(e) => { setCost({ ...cost, currency: e.target.value }); setDirty(true); }}>
          ${curs.map((c) => html`<option value=${c}>${curLabel(c)}</option>`)}
        </select>
      </div>
    </div>
    <label class="field"><span>訂位資訊</span><textarea id="card-booking" rows="2" ...${bind("booking")} placeholder="訂位號碼、人數…"></textarea></label>
    <label class="field"><span>備註</span><textarea id="card-notes" rows="7" ...${bind("notes")} placeholder="可以用 **粗體**，「- 」開頭會變成清單"></textarea></label>
  <//>`;
}
