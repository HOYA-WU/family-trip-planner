// 旅行頁：上方區塊＋行程看板（電腦）；今天／票券／清單／花費／更多（手機）
import { html, useState, useEffect } from "./vendor/preact-htm.js";
import { store } from "./store.js";
import { daysBetween, local, compressImage } from "./utils.js";
import { useSub, useWide, useTrip, TripCtx, ConfirmButton, pushToast } from "./ui.js";
import { tripBlocks } from "./model.js";
import { COUNTRIES, fetchRates, tripCurrencies } from "./money.js";
import { Board, CardEditor } from "./board.js";
import { TodayView } from "./today.js";
import { Blocks, BlockFull, BlockPanel, AddBlockMenu } from "./blocks.js";
import * as Flights from "./blocks/flights.js";
import * as Tickets from "./blocks/tickets.js";
import * as Lists from "./blocks/lists.js";
import * as Expenses from "./blocks/expenses.js";

// 選圖片 → 壓縮 → 回傳 data URL（封面圖用）
export function ImagePick({ id, label, onPick, class: cls = "btn small" }) {
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

export function TripForm({ trip, onClose }) {
  const family = useSub((cb) => store.onFamily(cb), []);
  const people = family?.people || [];
  const [title, setTitle] = useState(trip?.title || "");
  const [start, setStart] = useState(trip?.startDate || "");
  const [end, setEnd] = useState(trip?.endDate || "");
  const [cover, setCover] = useState(trip?.cover || "");
  const [countries, setCountries] = useState(trip?.countries || []);
  const [travelerIds, setTravelerIds] = useState(trip?.travelerIds || null);
  const [err, setErr] = useState("");
  const tids = travelerIds || people.map((p) => p.id);
  const toggleT = (id) => setTravelerIds(tids.includes(id) ? tids.filter((x) => x !== id) : [...tids, id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErr("請填旅行名稱");
    if (!start || !end) return setErr("請選出發和回程日期");
    if (end < start) return setErr("回程日期要在出發日期之後");
    if (daysBetween(start, end).length > 90) return setErr("一趟旅行最多 90 天");
    const data = { title: title.trim(), startDate: start, endDate: end, cover, countries, travelerIds: tids };
    // 新的幣別自動抓參考匯率（失敗也沒關係，之後可以在花費區塊再抓或手動填）
    const need = tripCurrencies({ countries }).filter((c) => !trip?.rates?.[c]);
    if (need.length && navigator.onLine) {
      try {
        const { rates, date } = await fetchRates(need);
        data.rates = { ...(trip?.rates || {}), ...rates };
        data.ratesDate = date;
      } catch {}
    }
    if (trip) {
      store.updateTrip(trip.id, data);
      onClose();
    } else {
      const id = await store.createTrip(data);
      onClose();
      location.hash = "#/trip/" + id;
    }
  };
  const addCountry = (code) => code && !countries.includes(code) && setCountries([...countries, code]);
  return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <form class="dialog" onSubmit=${submit}>
      <h2>${trip ? "編輯旅行" : "新旅行"}</h2>
      <label class="field"><span>旅行名稱</span>
        <input id="trip-title" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="例如：2026 寒假澳洲之旅" autofocus /></label>
      <div class="row2">
        <label class="field"><span>出發</span><input id="trip-start" type="date" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
        <label class="field"><span>回程</span><input id="trip-end" type="date" value=${end} onInput=${(e) => setEnd(e.target.value)} /></label>
      </div>
      <div class="field"><span>旅遊國家（花費會預設用當地貨幣）</span>
        <div class="chips">
          ${countries.map((code) => html`<button type="button" key=${code} class="chip on" onClick=${() => setCountries(countries.filter((c) => c !== code))}
            aria-label=${"移除 " + (COUNTRIES.find((c) => c.code === code)?.name || code)}>${COUNTRIES.find((c) => c.code === code)?.name || code} ×</button>`)}
          <select id="trip-country" value="" onChange=${(e) => { addCountry(e.target.value); e.target.value = ""; }} aria-label="新增國家">
            <option value="">＋ 加國家</option>
            ${COUNTRIES.filter((c) => !countries.includes(c.code)).map((c) => html`<option value=${c.code}>${c.name}（${c.cur}）</option>`)}
          </select>
        </div>
      </div>
      ${people.length > 0 && html`<div class="field"><span>這趟的旅伴（穿搭、清單分人用）</span>
        <div class="chips">${people.map((p) => html`<button type="button" key=${p.id} class=${"chip" + (tids.includes(p.id) ? " on" : "")} onClick=${() => toggleT(p.id)}>${p.name}</button>`)}</div>
      </div>`}
      <div class="field"><span>封面圖</span>
        <div class="cover-edit">
          ${cover ? html`<img class="cover-preview" src=${cover} alt="封面預覽" />` : html`<div class="cover-preview empty">還沒有封面圖</div>`}
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

// 手機「更多」：其他區塊與看板
function MorePage({ onOpen, onEditTrip }) {
  const { trip } = useTrip();
  const [view, setView] = useState(null);
  const blocks = tripBlocks(trip).filter((b) => !b.hidden);
  if (view === "board") return html`<div class="stack"><button class="btn ghost small back-link" onClick=${() => setView(null)}>‹ 更多</button><${Board} onOpen=${onOpen} /></div>`;
  const b = blocks.find((x) => x.id === view);
  if (b) return html`<div class="mobile-pad"><button class="btn ghost small back-link" onClick=${() => setView(null)}>‹ 更多</button><h2 class="eyebrow">${b.title}</h2><${BlockFull} block=${b} /></div>`;
  return html`<div class="mobile-pad">
    <ul class="more-list">
      <li><button onClick=${() => setView("board")}><b>行程看板</b><span class="muted small">每天一欄，可拖曳排序</span></button></li>
      ${blocks.map((x) => html`<li key=${x.id}><button onClick=${() => setView(x.id)}><b>${x.title}</b></button></li>`)}
      <li><button onClick=${onEditTrip}><b>編輯旅行</b><span class="muted small">名稱、日期、國家、旅伴、封面</span></button></li>
    </ul>
    <${AddBlockMenu} onAdded=${(nb) => setView(nb.id)} />
  </div>`;
}

// 手機「今天」上方：所有區塊的捷徑，點了直接打開
function MobileBlockBar() {
  const { trip } = useTrip();
  const [open, setOpen] = useState(null);
  const blocks = tripBlocks(trip).filter((b) => !b.hidden);
  return html`<nav class="block-bar" aria-label="區塊">
      ${blocks.map((b) => html`<button key=${b.id} class="block-chip" onClick=${() => setOpen(b)}>${b.title}</button>`)}
    </nav>
    ${open && html`<${BlockPanel} block=${open} onClose=${() => setOpen(null)} />`}`;
}

export function TripPage({ id }) {
  const trip = useSub((cb) => store.onTrip(id, cb), [id]);
  const cards = useSub((cb) => store.onSub(id, "cards", cb), [id]);
  const fileList = useSub((cb) => store.onSub(id, "files", cb), [id]);
  const expenses = useSub((cb) => store.onSub(id, "expenses", cb), [id]);
  const family = useSub((cb) => store.onFamily(cb), []);
  const wide = useWide();
  const [editing, setEditing] = useState(null);
  const [editTrip, setEditTrip] = useState(false);
  const [tab, setTab] = useState(() => local.get("tab", "today"));
  const pickTab = (t) => {
    setTab(t);
    local.set("tab", t);
    scrollTo(0, 0);
  };

  // 有網路時把 PDF 附件先下載到這台裝置，離線也能打開
  useEffect(() => {
    (fileList || []).filter((f) => f.kind === "pdf").forEach((f) => store.prefetchFile(id, f));
  }, [fileList]);

  if (trip === undefined || cards === undefined) return html`<div class="center muted">載入中…</div>`;
  if (trip === null) return html`<div class="center"><p>找不到這趟旅行，可能已經被刪除。</p><a class="btn" href="#/">回旅行列表</a></div>`;

  const days = daysBetween(trip.startDate, trip.endDate);
  const people = family?.people || [];
  const travelers = trip.travelerIds ? people.filter((p) => trip.travelerIds.includes(p.id)) : people;
  const files = Object.fromEntries((fileList || []).map((f) => [f.id, f]));
  const ctx = { trip, days, cards, files, expenses: expenses || [], family, travelers };

  const header = html`<header class="topbar trip-top">
    <a class="icon-btn back" href="#/" aria-label="回旅行列表">‹</a>
    <div class="trip-title">
      <h1>${trip.title}</h1>
      <span class="muted mono small">${trip.startDate} → ${trip.endDate}・${days.length} 天</span>
    </div>
    <button class="btn ghost" onClick=${() => setEditTrip(true)}>編輯</button>
  </header>`;
  const editor = editing && html`<${CardEditor} card=${editing} onClose=${() => setEditing(null)} />`;
  const tripForm = editTrip && html`<${TripForm} trip=${trip} onClose=${() => setEditTrip(false)} />`;

  if (wide)
    return html`<${TripCtx.Provider} value=${ctx}><div class="page trip">
      ${header}
      <${Blocks} />
      <${Board} onOpen=${setEditing} />
      ${editor}${tripForm}
    </div><//>`;

  const tabs = [["today", "今天"], ["tickets", "票券"], ["lists", "清單"], ["expenses", "花費"], ["more", "更多"]];
  return html`<${TripCtx.Provider} value=${ctx}><div class="page trip mobile">
    ${header}
    <main class="mobile-main">
      ${tab === "today" && html`<${MobileBlockBar} /><${TodayView} onOpen=${setEditing} />`}
      ${tab === "tickets" && html`<div class="mobile-pad">
        <h2 class="eyebrow">航班</h2><${Flights.Full} />
        <h2 class="eyebrow">票券</h2><${Tickets.Full} />
      </div>`}
      ${tab === "lists" && html`<div class="mobile-pad"><${Lists.Full} /></div>`}
      ${tab === "expenses" && html`<div class="mobile-pad"><${Expenses.Full} /></div>`}
      ${tab === "more" && html`<${MorePage} onOpen=${setEditing} onEditTrip=${() => setEditTrip(true)} />`}
    </main>
    <nav class="tabbar five">
      ${tabs.map(([k, label]) => html`<button key=${k} class=${tab === k ? "on" : ""} onClick=${() => pickTab(k)}>${label}</button>`)}
    </nav>
    ${editor}${tripForm}
  </div><//>`;
}
