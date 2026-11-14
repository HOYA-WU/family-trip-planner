import { html, render, useState, useEffect, useRef } from "./vendor/preact-htm.js";
import Sortable from "./vendor/sortable.esm.js";
import { firebaseConfig } from "./config.js";
import {
  CARD_TYPES, STATUSES, typeOf, daysBetween, shortDay, weekday, todayStr,
  orderBetween, sortCards, mapsHref, local, compressImage,
} from "./utils.js";

// 網址加上 ?demo 可以強制用示範模式（資料只在這台裝置，不影響家人的資料）
const USE_FIREBASE = !!firebaseConfig.projectId && !new URLSearchParams(location.search).has("demo");
const { store } = await import(USE_FIREBASE ? "./store-firebase.js" : "./store-demo.js");

// ---------------------------------------------------------------- hooks

function useSub(subscribe, deps) {
  const [value, setValue] = useState(undefined);
  useEffect(() => {
    setValue(undefined);
    const off = subscribe(setValue);
    return () => typeof off === "function" && off();
  }, deps);
  return value;
}
function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return hash;
}
function useMedia(q) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}
function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const f = () => setOn(navigator.onLine);
    addEventListener("online", f);
    addEventListener("offline", f);
    return () => {
      removeEventListener("online", f);
      removeEventListener("offline", f);
    };
  }, []);
  return on;
}

// ---------------------------------------------------------------- toast

let pushToast = () => {};
function Toasts() {
  const [items, setItems] = useState([]);
  pushToast = (text) => {
    const id = Math.random();
    setItems((xs) => [...xs, { id, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  };
  return html`<div class="toasts" role="status" aria-live="polite">
    ${items.map((t) => html`<div class="toast" key=${t.id}>${t.text}</div>`)}
  </div>`;
}
store.onError = (e) => {
  console.error(e);
  const code = e && e.code;
  if (code === "permission-denied") pushToast("沒有權限。這台裝置可能被移除了，請重新點邀請連結。");
  else pushToast("儲存失敗：" + (e && e.message ? e.message : e));
};

// ---------------------------------------------------------------- 小元件

function ConfirmButton({ label, confirmLabel = "確定刪除？", onConfirm, class: cls = "btn danger" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return html`<button type="button" class=${cls + (armed ? " armed" : "")}
    onClick=${() => (armed ? onConfirm() : setArmed(true))}>${armed ? confirmLabel : label}</button>`;
}

async function copyText(text, inputEl) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast("已複製連結");
  } catch {
    if (inputEl) {
      inputEl.select();
      pushToast("請按複製（⌘C / 長按）");
    }
  }
}

// 備註：支援 **粗體**、以「- 」開頭的清單、網址自動變連結
function inline(str) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push(str.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith("**")
      ? html`<strong>${t.slice(2, -2)}</strong>`
      : html`<a href=${t} target="_blank" rel="noopener">${t}</a>`);
    last = re.lastIndex;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}
function Notes({ text }) {
  if (!text) return null;
  const blocks = [];
  let bullets = null;
  for (const line of text.split("\n")) {
    const b = line.match(/^\s*[-•]\s+(.*)$/);
    if (b) {
      (bullets ||= []).push(b[1]);
      continue;
    }
    if (bullets) {
      blocks.push(html`<ul>${bullets.map((x) => html`<li>${inline(x)}</li>`)}</ul>`);
      bullets = null;
    }
    if (line.trim()) blocks.push(html`<p>${inline(line)}</p>`);
  }
  if (bullets) blocks.push(html`<ul>${bullets.map((x) => html`<li>${inline(x)}</li>`)}</ul>`);
  return html`<div class="notes">${blocks}</div>`;
}

function StatusBadge({ status }) {
  if (status === "booked") return html`<span class="badge booked">已訂</span>`;
  if (status === "backup") return html`<span class="badge backup">備案</span>`;
  if (status === "cancelled") return html`<span class="badge cancelled">取消</span>`;
  return null;
}

function timeText(c) {
  if (!c.time) return "";
  return c.endTime ? `${c.time}–${c.endTime}` : c.time;
}

const blankCard = (day, order) => ({
  day, order, type: "sight", title: "", status: "normal",
  time: "", endTime: "", notes: "", location: "", links: [], booking: "",
});

function endOrder(cards, day, exceptId) {
  const list = sortCards(cards.filter((c) => c.day === day && c.id !== exceptId));
  return list.length ? list[list.length - 1].order + 1000 : 1000;
}

// ---------------------------------------------------------------- 首頁：旅行列表

// 選圖片 → 壓縮 → 回傳 data URL
function ImagePick({ id, label, onPick, class: cls = "btn small" }) {
  const [busy, setBusy] = useState(false);
  const onChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      onPick(await compressImage(file));
    } catch (err) {
      pushToast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<label class=${cls + (busy ? " busy" : "")} for=${id}>
    ${busy ? "處理中…" : label}
    <input id=${id} type="file" accept="image/*" class="visually-hidden" onChange=${onChange} disabled=${busy} />
  </label>`;
}

function TripForm({ trip, onClose }) {
  const [title, setTitle] = useState(trip?.title || "");
  const [start, setStart] = useState(trip?.startDate || "");
  const [end, setEnd] = useState(trip?.endDate || "");
  const [cover, setCover] = useState(trip?.cover || "");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErr("請填旅行名稱");
    if (!start || !end) return setErr("請選出發和回程日期");
    if (end < start) return setErr("回程日期要在出發日期之後");
    if (daysBetween(start, end).length > 90) return setErr("一趟旅行最多 90 天");
    const data = { title: title.trim(), startDate: start, endDate: end, cover };
    if (trip) {
      store.updateTrip(trip.id, data);
      onClose();
    } else {
      const id = await store.createTrip(data);
      onClose();
      location.hash = "#/trip/" + id;
    }
  };
  return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <form class="dialog" onSubmit=${submit}>
      <h2>${trip ? "編輯旅行" : "新旅行"}</h2>
      <label class="field"><span>旅行名稱</span>
        <input id="trip-title" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="例如：2026 寒假澳洲之旅" autofocus /></label>
      <div class="row2">
        <label class="field"><span>出發</span><input id="trip-start" type="date" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
        <label class="field"><span>回程</span><input id="trip-end" type="date" value=${end} onInput=${(e) => setEnd(e.target.value)} /></label>
      </div>
      <div class="field"><span>封面圖</span>
        <div class="cover-edit">
          ${cover
            ? html`<img class="cover-preview" src=${cover} alt="封面預覽" />`
            : html`<div class="cover-preview empty">還沒有封面圖</div>`}
          <div class="cover-actions">
            <${ImagePick} id="trip-cover" label=${cover ? "更換圖片" : "選擇圖片"} onPick=${setCover} />
            ${cover && html`<button type="button" class="btn ghost small danger" onClick=${() => setCover("")}>移除</button>`}
          </div>
        </div>
      </div>
      ${trip && html`<p class="hint">改日期不會刪掉卡片；超出新日期範圍的卡片會移到「待排」。</p>`}
      ${err && html`<p class="error">${err}</p>`}
      <div class="dialog-actions">
        ${trip && html`<${ConfirmButton} label="刪除這趟旅行" confirmLabel="確定刪除整趟旅行？"
          onConfirm=${() => { store.deleteTrip(trip.id); onClose(); location.hash = "#/"; }} />`}
        <span class="spacer"></span>
        <button type="button" class="btn" onClick=${onClose}>取消</button>
        <button type="submit" class="btn primary">${trip ? "儲存" : "建立"}</button>
      </div>
    </form>
  </div>`;
}

function Home() {
  const trips = useSub((cb) => store.onTrips(cb), []);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  if (!trips) return html`<div class="center muted">載入中…</div>`;
  const today = todayStr();
  const shown = trips.filter((t) => !q || (t.title || "").toLowerCase().includes(q.toLowerCase()));
  const upcoming = shown.filter((t) => (t.endDate || "") >= today).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  const past = shown.filter((t) => (t.endDate || "") < today).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  const item = (t) => {
    const n = daysBetween(t.startDate, t.endDate).length;
    const now = t.startDate <= today && today <= t.endDate;
    return html`<div class="trip-item" key=${t.id}>
      <a class="trip-item-main" href=${"#/trip/" + t.id}>
        <span class="trip-item-title">${t.title}${now && html` <span class="badge booked">旅行中</span>`}</span>
        <span class="trip-item-date">${t.startDate} → ${t.endDate}・${n} 天</span>
      </a>
      ${t.cover
        ? html`<a class="trip-cover" href=${"#/trip/" + t.id} tabindex="-1" aria-hidden="true"><img src=${t.cover} alt="" /></a>`
        : html`<${ImagePick} id=${"cover-" + t.id} class="trip-cover empty" label="＋ 封面圖"
            onPick=${(c) => store.updateTrip(t.id, { cover: c })} />`}
    </div>`;
  };
  return html`<div class="page home">
    <header class="topbar">
      <h1>我們家的旅行</h1>
      <a class="btn ghost" href="#/settings">設定</a>
    </header>
    <div class="home-tools">
      <input id="trip-search" class="search" type="search" placeholder="搜尋旅行名稱" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <button class="btn primary" onClick=${() => setCreating(true)}>＋ 新旅行</button>
    </div>
    <section class="trip-group">
      <h2 class="eyebrow">即將出發與進行中</h2>
      ${upcoming.length ? upcoming.map(item) : html`<p class="muted">還沒有排定的旅行。按「＋ 新旅行」開始規劃。</p>`}
    </section>
    ${past.length > 0 && html`<section class="trip-group">
      <h2 class="eyebrow">過去的旅行</h2>
      ${past.map(item)}
    </section>`}
    ${creating && html`<${TripForm} onClose=${() => setCreating(false)} />`}
  </div>`;
}

// ---------------------------------------------------------------- 待辦

function TodoList({ tripId, todos }) {
  const [text, setText] = useState("");
  const list = [...(todos || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const last = list.length ? list[list.length - 1].order ?? 0 : 0;
    store.addTodo(tripId, { text: t, done: false, order: last + 1000 });
    setText("");
  };
  return html`<div class="todo">
    <ul class="todo-list">
      ${list.map((t) => html`<li key=${t.id} class=${t.done ? "done" : ""}>
        <label><input type="checkbox" checked=${t.done} onChange=${(e) => store.updateTodo(tripId, t.id, { done: e.target.checked })} />
          <span>${t.text}</span></label>
        <button class="icon-btn" title="刪除" aria-label=${"刪除 " + t.text} onClick=${() => store.deleteTodo(tripId, t.id)}>×</button>
      </li>`)}
    </ul>
    <form class="todo-add" onSubmit=${add}>
      <input id=${"todo-add-" + tripId} value=${text} onInput=${(e) => setText(e.target.value)} placeholder="新增待辦，按 Enter" />
    </form>
  </div>`;
}

function Blocks({ trip, todos }) {
  const [collapsed, setCollapsed] = useState(() => local.get("blocks-collapsed", false));
  const toggle = () => {
    local.set("blocks-collapsed", !collapsed);
    setCollapsed(!collapsed);
  };
  const done = (todos || []).filter((t) => t.done).length;
  const total = (todos || []).length;
  if (collapsed)
    return html`<div class="blocks-collapsed">
      <button class="chip" onClick=${toggle}>待辦 ${done}/${total}</button>
      <button class="btn ghost small" onClick=${toggle}>展開區塊</button>
    </div>`;
  return html`<div class="blocks">
    <section class="block">
      <header class="block-h"><h3>待辦</h3><span class="muted mono">${done}/${total}</span></header>
      <div class="block-body"><${TodoList} tripId=${trip.id} todos=${todos} /></div>
    </section>
    <section class="block block-soon">
      <p>航班、票券、清單、每日穿搭、花費、地圖會在第二、三階段加入。</p>
      <button class="btn ghost small" onClick=${toggle}>收合區塊</button>
    </section>
  </div>`;
}

// ---------------------------------------------------------------- 看板

function CardChip({ card, onOpen }) {
  const t = typeOf(card.type);
  return html`<div class=${`bcard t-${card.type} st-${card.status || "normal"}`} data-id=${card.id}
      role="button" tabindex="0" onClick=${() => onOpen(card)}
      onKeyDown=${(e) => e.key === "Enter" && onOpen(card)}>
    <div class="bcard-top"><span class="tag">${t.icon} ${t.label}</span><${StatusBadge} status=${card.status} /></div>
    <div class="bcard-title">${card.title || "（未命名）"}</div>
    ${card.time && html`<div class="bcard-time mono">${timeText(card)}</div>`}
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

function Column({ trip, day, cards, onOpen, onMove, narrow, onToggleNarrow }) {
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
    <${QuickAdd} onAdd=${(title) => store.addCard(trip.id, { ...blankCard(day, endOrder(cards, day)), title })} />
  </div>`;
}

function Board({ trip, days, cards, onOpen }) {
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
    store.updateCard(trip.id, id, { day: toDay, order });
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
      ${["", ...days].map((d) => html`<${Column} key=${d || "pool"} trip=${trip} day=${d} cards=${groups[d]}
        onOpen=${onOpen} onMove=${onMove} narrow=${!!narrow[d || "pool"]} onToggleNarrow=${() => toggleNarrow(d || "pool")} />`)}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- 卡片編輯

function CardEditor({ trip, days, cards, card, onClose }) {
  const isNew = !card.id;
  const [d, setD] = useState(() => ({ ...blankCard("", 0), ...card, links: [...(card.links || [])] }));
  const [dirty, setDirty] = useState(false);
  const set = (k, v) => {
    setD((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const bind = (k) => ({ value: d[k] || "", onInput: (e) => set(k, e.target.value) });

  useEffect(() => {
    const f = (e) => e.key === "Escape" && !dirty && onClose();
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [dirty]);

  const save = (e) => {
    e && e.preventDefault();
    const { id, ...data } = d;
    data.title = (data.title || "").trim();
    data.links = data.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
    if (isNew) {
      data.order = endOrder(cards, data.day);
      store.addCard(trip.id, data);
    } else {
      if (data.day !== card.day) data.order = endOrder(cards, data.day, card.id);
      store.updateCard(trip.id, card.id, data);
    }
    onClose();
  };
  const setLink = (i, k, v) => set("links", d.links.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return html`<div class="overlay side" onClick=${(e) => e.target === e.currentTarget && !dirty && onClose()}>
    <form class="panel" onSubmit=${save}>
      <header class="panel-h">
        <h2>${isNew ? "新增卡片" : "編輯卡片"}</h2>
        <button type="button" class="icon-btn" aria-label="關閉" onClick=${onClose}>×</button>
      </header>
      <div class="panel-body">
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
        <div class="field"><span>連結</span>
          ${d.links.map((l, i) => html`<div class="link-row" key=${i}>
            <input id=${"link-label-" + i} value=${l.label} onInput=${(e) => setLink(i, "label", e.target.value)} placeholder="名稱（可空白）" />
            <input id=${"link-url-" + i} value=${l.url} onInput=${(e) => setLink(i, "url", e.target.value)} placeholder="https://…" />
            <button type="button" class="icon-btn" aria-label="移除連結" onClick=${() => set("links", d.links.filter((_, j) => j !== i))}>×</button>
          </div>`)}
          <button type="button" class="btn ghost small" onClick=${() => set("links", [...d.links, { label: "", url: "" }])}>＋ 新增連結</button>
        </div>
        <label class="field"><span>訂位資訊</span><textarea id="card-booking" rows="2" ...${bind("booking")} placeholder="訂位號碼、人數…"></textarea></label>
        <label class="field"><span>備註</span><textarea id="card-notes" rows="7" ...${bind("notes")} placeholder="可以用 **粗體**，「- 」開頭會變成清單"></textarea></label>
        <p class="hint">圖片上傳會在第二階段加入。</p>
      </div>
      <footer class="panel-f">
        ${!isNew && html`<${ConfirmButton} label="刪除" onConfirm=${() => { store.deleteCard(trip.id, card.id); onClose(); }} />`}
        <span class="spacer"></span>
        <button type="button" class="btn" onClick=${onClose}>取消</button>
        <button type="submit" class="btn primary">儲存</button>
      </footer>
    </form>
  </div>`;
}

// ---------------------------------------------------------------- 手機「今天」

function CardDetail({ card, onEdit }) {
  return html`<div class="detail">
    <${Notes} text=${card.notes} />
    ${card.booking && html`<p class="booking"><span class="muted">訂位：</span>${card.booking}</p>`}
    <div class="detail-actions">
      ${card.location && html`<a class="btn small" href=${mapsHref(card.location)} target="_blank" rel="noopener">📍 導航</a>`}
      ${(card.links || []).map((l, i) => html`<a key=${i} class="btn small" href=${l.url} target="_blank" rel="noopener">${l.label || "連結"} ↗</a>`)}
      <button class="btn ghost small" onClick=${onEdit}>編輯</button>
    </div>
  </div>`;
}

function TodayView({ trip, days, cards, onOpen }) {
  const today = todayStr();
  const [day, setDay] = useState(() => {
    if (days.includes(today)) return today;
    const saved = local.get("day:" + trip.id, "");
    return days.includes(saved) ? saved : days[0] || "";
  });
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(() => new Set(local.get("exp:" + trip.id, [])));
  const chipsRef = useRef();
  const touch = useRef(null);

  const pick = (d) => {
    setDay(d);
    local.set("day:" + trip.id, d);
  };
  useEffect(() => {
    chipsRef.current?.querySelector(".on")?.scrollIntoView({ inline: "center", block: "nearest" });
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
  const onTouchStart = (e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && idx < days.length - 1) pick(days[idx + 1]);
    if (dx > 0 && idx > 0) pick(days[idx - 1]);
  };

  return html`<div class="today">
    <div class="day-chips" ref=${chipsRef}>
      ${days.map((d) => html`<button key=${d} class=${"chip" + (d === day ? " on" : "")} onClick=${() => pick(d)}>
        ${shortDay(d)}${d === today ? " 今天" : ""}</button>`)}
    </div>
    <div class="today-h">
      <div>
        <b>${day ? `${shortDay(day)}（${weekday(day)}）` : ""}</b>
        <span class="muted"> ${(trip.dayLabels || {})[day] || ""}</span>
      </div>
      ${list.length > 0 && html`<button class="btn ghost small" onClick=${toggleAll}>${allOpen ? "全部收合" : "全部展開"}</button>`}
    </div>
    <div class="type-filter">
      <button class=${"chip" + (filter === "all" ? " on" : "")} onClick=${() => setFilter("all")}>全部</button>
      ${CARD_TYPES.map((t) => html`<button key=${t.id} class=${"chip" + (filter === t.id ? " on" : "")} onClick=${() => setFilter(t.id)}>${t.label}</button>`)}
    </div>
    <ol class="timeline" onTouchStart=${onTouchStart} onTouchEnd=${onTouchEnd}>
      ${list.map((c) => {
        const open = expanded.has(c.id);
        const t = typeOf(c.type);
        return html`<li key=${c.id} class="tl-item">
          <span class="tl-time mono">${c.time || ""}</span>
          <div class=${`tcard t-${c.type} st-${c.status || "normal"}` + (open ? " open" : "")}>
            <button class="tcard-h" aria-expanded=${open} onClick=${() => toggle(c.id)}>
              <span class="tag">${t.icon} ${t.label}</span><${StatusBadge} status=${c.status} />
              <span class="tcard-title">${c.title || "（未命名）"}</span>
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

// ---------------------------------------------------------------- 旅行頁

function TripPage({ id }) {
  const trip = useSub((cb) => store.onTrip(id, cb), [id]);
  const cards = useSub((cb) => store.onCards(id, cb), [id]);
  const todos = useSub((cb) => store.onTodos(id, cb), [id]);
  const wide = useMedia("(min-width: 768px)");
  const [editing, setEditing] = useState(null);
  const [editTrip, setEditTrip] = useState(false);
  const [tab, setTab] = useState(() => local.get("tab", "today"));
  const pickTab = (t) => {
    setTab(t);
    local.set("tab", t);
  };

  if (trip === undefined || cards === undefined) return html`<div class="center muted">載入中…</div>`;
  if (trip === null)
    return html`<div class="center"><p>找不到這趟旅行，可能已經被刪除。</p><a class="btn" href="#/">回旅行列表</a></div>`;

  const days = daysBetween(trip.startDate, trip.endDate);
  const header = html`<header class="topbar trip-top">
    <a class="icon-btn back" href="#/" aria-label="回旅行列表">‹</a>
    <div class="trip-title">
      <h1>${trip.title}</h1>
      <span class="muted mono small">${trip.startDate} → ${trip.endDate}・${days.length} 天</span>
    </div>
    <button class="btn ghost" onClick=${() => setEditTrip(true)}>編輯</button>
  </header>`;
  const editor = editing && html`<${CardEditor} trip=${trip} days=${days} cards=${cards} card=${editing} onClose=${() => setEditing(null)} />`;
  const tripForm = editTrip && html`<${TripForm} trip=${trip} onClose=${() => setEditTrip(false)} />`;

  if (wide)
    return html`<div class="page trip">
      ${header}
      <${Blocks} trip=${trip} todos=${todos} />
      <${Board} trip=${trip} days=${days} cards=${cards} onOpen=${setEditing} />
      ${editor}${tripForm}
    </div>`;

  return html`<div class="page trip mobile">
    ${header}
    <main class="mobile-main">
      ${tab === "today" && html`<${TodayView} trip=${trip} days=${days} cards=${cards} onOpen=${setEditing} />`}
      ${tab === "board" && html`<${Board} trip=${trip} days=${days} cards=${cards} onOpen=${setEditing} />`}
      ${tab === "todo" && html`<div class="mobile-pad"><h2 class="eyebrow">待辦</h2><${TodoList} tripId=${trip.id} todos=${todos} /></div>`}
    </main>
    <nav class="tabbar">
      <button class=${tab === "today" ? "on" : ""} onClick=${() => pickTab("today")}>今天</button>
      <button class=${tab === "board" ? "on" : ""} onClick=${() => pickTab("board")}>看板</button>
      <button class=${tab === "todo" ? "on" : ""} onClick=${() => pickTab("todo")}>待辦</button>
      <a href="#/">旅行</a>
    </nav>
    ${editor}${tripForm}
  </div>`;
}

// ---------------------------------------------------------------- 設定

function InviteRow({ inv }) {
  const url = location.origin + location.pathname + "#/join/" + inv.id;
  const ref = useRef();
  return html`<li class=${"invite" + (inv.active ? "" : " off")}>
    <div class="invite-top"><b>${inv.note || "邀請連結"}</b>
      <span class="muted small">${inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : ""}${inv.active ? "" : "・已停用"}</span></div>
    <div class="invite-url">
      <input ref=${ref} readonly value=${url} onFocus=${(e) => e.target.select()} aria-label="邀請連結" />
      <button class="btn small" onClick=${() => copyText(url, ref.current)}>複製</button>
      <button class="btn ghost small" onClick=${() => store.setInviteActive(inv.id, !inv.active)}>${inv.active ? "停用" : "啟用"}</button>
    </div>
  </li>`;
}

function Settings() {
  const invites = useSub((cb) => store.onInvites(cb), []);
  const members = useSub((cb) => store.onMembers(cb), []);
  const [note, setNote] = useState("");
  const me = (members || []).find((m) => m.uid === store.uid || m.id === store.uid);
  const [name, setName] = useState("");
  useEffect(() => me && setName(me.deviceName || ""), [me && me.deviceName]);

  return html`<div class="page settings">
    <header class="topbar"><a class="icon-btn back" href="#/" aria-label="回旅行列表">‹</a><h1>設定</h1></header>
    ${store.mode === "demo" && html`<section class="card-sec warn">
      <h2>示範模式</h2>
      <p>目前還沒設定 Firebase，資料只存在這台裝置的瀏覽器裡，家人看不到。照 README.md 的步驟建好 Firebase 專案後，就會變成全家同步。</p>
      <${ConfirmButton} label="重設示範資料" confirmLabel="確定清除並重設？" onConfirm=${() => { store.resetDemo(); pushToast("已重設示範資料"); }} />
    </section>`}
    <section class="card-sec">
      <h2>這台裝置</h2>
      <form class="inline-form" onSubmit=${(e) => { e.preventDefault(); store.renameDevice(name.trim() || "裝置"); pushToast("已更新名稱"); }}>
        <input id="device-name" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="例如：爸爸的 iPhone" />
        <button class="btn">儲存名稱</button>
      </form>
    </section>
    <section class="card-sec">
      <h2>邀請家人</h2>
      <p class="muted">產生一個連結，用 LINE 傳給家人。每台裝置第一次點開連結就會加入，之後直接打開網址就能用。</p>
      <form class="inline-form" onSubmit=${async (e) => { e.preventDefault(); await store.createInvite(note.trim() || "邀請連結"); setNote(""); }}>
        <input id="invite-note" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="備註，例如：給太太" />
        <button class="btn primary">產生邀請連結</button>
      </form>
      <ul class="invites">${(invites || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((inv) => html`<${InviteRow} key=${inv.id} inv=${inv} />`)}</ul>
    </section>
    <section class="card-sec">
      <h2>已加入的裝置</h2>
      <ul class="members">
        ${(members || []).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)).map((m) => {
          const uid = m.uid || m.id;
          return html`<li key=${uid}>
            <span>${m.deviceName || "裝置"}${uid === store.uid ? html` <span class="badge booked">這台</span>` : ""}</span>
            <span class="muted small">${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : ""}</span>
            ${uid !== store.uid && html`<${ConfirmButton} class="btn ghost small danger" label="移除" confirmLabel="確定移除？" onConfirm=${() => store.removeMember(uid)} />`}
          </li>`;
        })}
      </ul>
    </section>
    <section class="card-sec">
      <h2>加到主畫面</h2>
      <p class="muted">iPhone：用 Safari 打開，按分享 → 加入主畫面。Android：用 Chrome 打開，按右上角選單 → 安裝應用程式。加到主畫面後，沒網路也能打開看過的行程。</p>
    </section>
  </div>`;
}

// ---------------------------------------------------------------- 加入與進入點

function JoinPage({ token, onJoined }) {
  const [err, setErr] = useState("");
  useEffect(() => {
    store.join(token)
      .then(() => {
        history.replaceState(null, "", location.pathname + "#/");
        onJoined();
      })
      .catch((e) => {
        console.error(e);
        setErr(navigator.onLine ? "這個邀請連結無效或已停用，請向家人要一個新的。" : "第一次加入需要網路，請連上網路後再點一次連結。");
      });
  }, [token]);
  return html`<div class="center">
    ${err ? html`<p class="error">${err}</p>` : html`<p class="muted">加入中…</p>`}
  </div>`;
}

function Guest() {
  return html`<div class="center guest">
    <h1>我們家的旅行</h1>
    <p>這是私人的家庭旅遊工具。</p>
    <p class="muted">請用家人傳給你的邀請連結打開。</p>
  </div>`;
}

function App() {
  const hash = useHash();
  const online = useOnline();
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");

  const check = async () => setPhase((await store.isMember()) ? "member" : "guest");
  useEffect(() => {
    (async () => {
      try {
        await store.init();
        await check();
      } catch (e) {
        console.error(e);
        setError(navigator.onLine ? "連線失敗：" + (e.message || e) : "第一次使用需要網路，請連上網路後重新整理。");
        setPhase("error");
      }
    })();
  }, []);

  const parts = hash.replace(/^#\/?/, "").split("/");
  let body;
  if (phase === "loading") body = html`<div class="center muted">載入中…</div>`;
  else if (phase === "error") body = html`<div class="center"><p class="error">${error}</p></div>`;
  else if (parts[0] === "join" && parts[1] && phase !== "member") body = html`<${JoinPage} token=${parts[1]} onJoined=${check} />`;
  else if (phase !== "member") body = html`<${Guest} />`;
  else if (parts[0] === "trip" && parts[1]) body = html`<${TripPage} key=${parts[1]} id=${parts[1]} />`;
  else if (parts[0] === "settings") body = html`<${Settings} />`;
  else {
    if (parts[0] === "join") history.replaceState(null, "", location.pathname + "#/");
    body = html`<${Home} />`;
  }

  return html`
    ${store.mode === "demo" && phase === "member" && html`<div class="demo-bar">示範模式：資料只存在這台裝置。<a href="#/settings">了解</a></div>`}
    ${!online && html`<div class="offline-bar">離線中。看過的行程都能打開，修改會在恢復網路後同步。</div>`}
    ${body}
    <${Toasts} />`;
}

render(html`<${App} />`, document.getElementById("app"));
