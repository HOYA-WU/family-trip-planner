// 花費：記錄每筆花費，依旅遊國家預設當地貨幣，換算台幣小計
import { html, useState, useRef } from "../vendor/preact-htm.js";
import { store } from "../store.js";
import { shortDay, todayStr } from "../utils.js";
import { useTrip, Panel, ConfirmButton, pushToast } from "../ui.js";
import { FilePick, FileList } from "../files.js";
import { askGemini, aiReady, fileForAI, RECEIPT_PROMPT } from "../ai.js";
import { EXPENSE_CATEGORIES } from "../model.js";
import { tripCurrencies, mainCurrency, curLabel, fetchRates, toTWD, fmtMoney, CURRENCY_NAMES } from "../money.js";

const catLabel = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label || "其他";

function totals(expenses, rates) {
  const byCur = {};
  let twd = 0;
  let missing = false;
  for (const x of expenses) {
    byCur[x.currency] = (byCur[x.currency] || 0) + (Number(x.amount) || 0);
    const t = toTWD(x.amount, x.currency, rates);
    if (t == null) missing = true;
    else twd += t;
  }
  return { byCur, twd, missing };
}

const norm = (s) => String(s || "").replace(/[\s\-#]/g, "").toLowerCase();

// 找可能重複的花費：同一張收據照片、收據編號相同、同一天同幣別同金額（包含卡片上填的花費）
export function findDuplicates(d, expenses, files, selfId) {
  const out = [];
  const amt = parseFloat(d.amount);
  const myHash = files[d.receiptId]?.hash;
  for (const x of expenses) {
    if (x.id === selfId) continue;
    const why = [];
    if (myHash && x.receiptId && files[x.receiptId]?.hash === myHash) why.push("同一張收據照片");
    if (d.receiptNo && x.receiptNo && norm(d.receiptNo) === norm(x.receiptNo)) why.push("收據編號相同");
    if (amt > 0 && x.currency === d.currency && (x.date || "") === (d.date || "") && Math.abs((Number(x.amount) || 0) - amt) <= Math.max(1, amt * 0.005))
      why.push(x.cardId ? "和行程卡片上填的花費同一天、同金額" : "同一天、同金額");
    if (why.length) out.push({ x, why });
  }
  return out;
}

const CAT_IDS = EXPENSE_CATEGORIES.map((c) => c.id);

// 用 AI 讀收據，回傳可以直接填進表單的欄位
async function readReceipt(trip, family, file) {
  const r = await askGemini(family, { prompt: RECEIPT_PROMPT, file: await fileForAI(trip.id, file) });
  const out = {};
  if (r.store) out.title = String(r.store);
  if (Number(r.total) > 0) out.amount = String(r.total);
  if (r.currency && /^[A-Z]{3}$/.test(String(r.currency).toUpperCase())) out.currency = String(r.currency).toUpperCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) out.date = r.date;
  if (CAT_IDS.includes(r.category)) out.category = r.category;
  if (r.receiptNo) out.receiptNo = String(r.receiptNo);
  if (r.time) out.note = `收據時間 ${r.time}`;
  return out;
}

function ExpenseEditor({ exp, onClose, newReceipt = false }) {
  const { trip, days, family, files, expenses } = useTrip();
  const isNew = !exp.id;
  const [d, setD] = useState(() => ({
    date: days.includes(todayStr()) ? todayStr() : "", title: "", amount: "", currency: mainCurrency(trip), category: "food", note: "", receiptId: "", receiptNo: "", ...exp,
  }));
  const curs = [...new Set([...tripCurrencies(trip), "TWD", d.currency].filter(Boolean))];
  const [dismissed, setDismissed] = useState(false);
  const [reading, setReading] = useState(false);
  const bind = (k) => ({ value: d[k] ?? "", onInput: (e) => setD({ ...d, [k]: e.target.value }) });
  const dups = isNew && !dismissed ? findDuplicates(d, expenses, files, exp.id) : [];
  const discardReceipt = () => newReceipt && d.receiptId && store.deleteFile(trip.id, d.receiptId);
  const cancel = () => {
    discardReceipt();
    onClose();
  };
  const save = (e) => {
    e.preventDefault();
    const amount = parseFloat(d.amount);
    if (!(amount > 0)) return pushToast("請填金額");
    const { id, ...data } = d;
    data.amount = amount;
    data.title = data.title.trim() || catLabel(data.category);
    if (isNew) store.addSub(trip.id, "expenses", data);
    else store.updateSub(trip.id, "expenses", exp.id, data);
    onClose();
  };
  const reread = async () => {
    const f = files[d.receiptId];
    if (!f) return;
    setReading(true);
    try {
      setD({ ...d, ...(await readReceipt(trip, family, f)) });
      pushToast("已讀出收據內容，請檢查");
    } catch (e2) {
      pushToast(e2.message || String(e2));
    }
    setReading(false);
  };
  return html`<${Panel} title=${isNew ? (d.receiptId ? "確認收據" : "新增花費") : "編輯花費"} onClose=${cancel} onSubmit=${save} guard=${newReceipt}
    footer=${html`${!isNew && html`<${ConfirmButton} label="刪除" onConfirm=${() => { store.deleteSub(trip.id, "expenses", exp.id); if (exp.receiptId) store.deleteFile(trip.id, exp.receiptId); onClose(); }} />`}
      <span class="spacer"></span><button type="button" class="btn" onClick=${cancel}>取消</button>
      <button type="submit" class="btn primary">儲存</button>`}>
    ${dups.length > 0 && html`<div class="dup-warn">
      <b>可能重複</b>
      <ul>${dups.map(({ x, why }) => html`<li key=${x.id}>${x.date ? shortDay(x.date) + " " : ""}${x.title}・<span class="mono">${fmtMoney(x.amount, x.currency)}</span><br /><span class="small">${why.join("、")}</span></li>`)}</ul>
      <div class="row-start">
        <button type="button" class="btn small" onClick=${cancel}>不納入</button>
        <button type="button" class="btn ghost small" onClick=${() => setDismissed(true)}>仍要新增</button>
      </div>
    </div>`}
    ${d.receiptId && html`<div class="field"><span>收據</span>
      <div class="row-start"><${FileList} ids=${[d.receiptId]} size="sm" />
        ${aiReady(family) && html`<button type="button" class="btn small" onClick=${reread} disabled=${reading}>${reading ? "AI 辨識中…" : "🤖 重新辨識"}</button>`}</div>
    </div>`}
    ${exp.cardId && html`<p class="hint">這筆來自行程卡片，在卡片上修改金額也會同步到這裡。</p>`}
    <label class="field"><span>項目</span><input id="exp-title" ...${bind("title")} placeholder="例如：一蘭拉麵" autofocus=${isNew} /></label>
    <div class="money-row">
      <label class="field"><span>金額</span><input id="exp-amount" type="number" inputmode="decimal" min="0" step="any" ...${bind("amount")} /></label>
      <label class="field"><span>幣別</span>
        <select id="exp-cur" value=${d.currency} onChange=${(e) => setD({ ...d, currency: e.target.value })}>
          ${curs.map((c) => html`<option value=${c}>${curLabel(c)}</option>`)}
          <option disabled>──</option>
          ${Object.keys(CURRENCY_NAMES).filter((c) => !curs.includes(c)).map((c) => html`<option value=${c}>${curLabel(c)}</option>`)}
        </select></label>
    </div>
    <div class="row2">
      <label class="field"><span>日期</span><input id="exp-date" type="date" ...${bind("date")} /></label>
      <label class="field"><span>類別</span>
        <select id="exp-cat" value=${d.category} onChange=${(e) => setD({ ...d, category: e.target.value })}>
          ${EXPENSE_CATEGORIES.map((c) => html`<option value=${c.id}>${c.label}</option>`)}
        </select></label>
    </div>
    <label class="field"><span>備註</span><input id="exp-note" ...${bind("note")} /></label>
    ${d.receiptNo && html`<p class="hint">收據編號：${d.receiptNo}</p>`}
  <//>`;
}

// 拍收據：上傳 → AI 讀內容 → 打開確認畫面（含重複檢查）
function ReceiptButton({ onReady }) {
  const { trip, family, files } = useTrip();
  const [busy, setBusy] = useState(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  const onAdded = async ([fid]) => {
    if (!fid) return;
    let draft = { receiptId: fid };
    if (!aiReady(family)) pushToast("還沒設定 AI 金鑰，請手動填寫");
    else if (!navigator.onLine) pushToast("沒有網路，請先手動填寫，有網路時可以按「重新辨識」");
    else {
      setBusy(true);
      try {
        let f;
        for (let i = 0; i < 20 && !(f = filesRef.current[fid]); i++) await new Promise((r) => setTimeout(r, 250));
        draft = { ...draft, ...(await readReceipt(trip, family, f)) };
      } catch (e) {
        pushToast((e.message || String(e)) + "，請手動填寫");
      }
      setBusy(false);
    }
    onReady(draft);
  };
  return busy
    ? html`<span class="btn primary busy">AI 辨識中…</span>`
    : html`<${FilePick} id="receipt-pick" class="btn primary" label="🧾 拍收據" accept="image/*,application/pdf" multiple=${false} purpose="doc" extra=${{ receipt: true }} onAdded=${onAdded} />`;
}

function RateSettings() {
  const { trip } = useTrip();
  const curs = tripCurrencies(trip);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try {
      const { rates, date } = await fetchRates(curs);
      store.updateTrip(trip.id, { rates: { ...(trip.rates || {}), ...rates }, ratesDate: date });
      pushToast("已更新匯率");
    } catch (e) {
      pushToast(e.message);
    }
    setBusy(false);
  };
  if (!curs.length) return html`<p class="hint">在「編輯旅行」選擇旅遊國家後，就會預設用當地貨幣，並自動換算台幣。</p>`;
  return html`<details class="rate-box">
    <summary>匯率 ${curs.map((c) => html`<span class="mono small" key=${c}> 1 ${c} = ${trip.rates?.[c] ?? "?"} 台幣</span>`)}</summary>
    <p class="hint">${trip.ratesDate ? `參考匯率日期 ${trip.ratesDate}。` : ""}可以改成實際刷卡的匯率。</p>
    ${curs.map((c) => html`<label class="field inline" key=${c}><span>1 ${curLabel(c)} =</span>
      <input id=${"rate-" + c} type="number" step="any" min="0" value=${trip.rates?.[c] ?? ""}
        onChange=${(e) => store.updateTrip(trip.id, { rates: { ...(trip.rates || {}), [c]: parseFloat(e.target.value) || 0 } })} />
      <span>台幣</span></label>`)}
    <button class="btn small" onClick=${refresh} disabled=${busy}>${busy ? "抓取中…" : "抓今天的參考匯率"}</button>
  </details>`;
}

export function Full() {
  const { trip, expenses } = useTrip();
  const [editing, setEditing] = useState(null);
  const list = [...(expenses || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const t = totals(list, trip.rates);
  const groups = [];
  for (const x of list) {
    const g = groups.at(-1);
    if (g && g.date === (x.date || "")) g.xs.push(x);
    else groups.push({ date: x.date || "", xs: [x] });
  }
  return html`<div class="stack">
    <div class="exp-total">
      <div><span class="muted small">合計（換算台幣）</span><b class="mono exp-big">${fmtMoney(t.twd, "TWD")}</b>
        ${t.missing && html`<span class="hint">有幣別缺匯率，沒算進去</span>`}</div>
      <div class="exp-curs">${Object.entries(t.byCur).map(([c, v]) => html`<span class="mono small" key=${c}>${fmtMoney(v, c)}</span>`)}</div>
    </div>
    <${RateSettings} />
    <div class="row-start">
      <${ReceiptButton} onReady=${(draft) => setEditing({ exp: draft, newReceipt: true })} />
      <button class="btn" onClick=${() => setEditing({ exp: {} })}>＋ 手動新增</button>
    </div>
    ${groups.map((g) => html`<section key=${g.date}>
      <h4 class="exp-date">${g.date ? `${shortDay(g.date)}` : "未填日期"}</h4>
      <ul class="exp-list">${g.xs.map((x) => html`<li key=${x.id}>
        <button class="exp-row" onClick=${() => setEditing({ exp: x })}>
          <span class="exp-cat">${catLabel(x.category)}</span>
          <span class="exp-title">${x.title}${x.cardId && html` <span class="muted small">・卡片</span>`}${x.receiptId && html` <span class="muted small">🧾</span>`}</span>
          <span class="exp-amt mono">${fmtMoney(x.amount, x.currency)}
            ${x.currency !== "TWD" && toTWD(x.amount, x.currency, trip.rates) != null && html`<span class="muted small"> ≈ ${fmtMoney(toTWD(x.amount, x.currency, trip.rates), "TWD")}</span>`}</span>
        </button>
      </li>`)}</ul>
    </section>`)}
    ${list.length === 0 && html`<p class="muted">還沒有花費紀錄。</p>`}
    ${editing && html`<${ExpenseEditor} exp=${editing.exp} newReceipt=${!!editing.newReceipt} onClose=${() => setEditing(null)} />`}
  </div>`;
}

export function Summary() {
  const { trip, expenses } = useTrip();
  const list = [...(expenses || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const t = totals(list, trip.rates);
  return html`<div class="sum">
    <p class="sum-big mono">${fmtMoney(t.twd, "TWD")}</p>
    ${list.slice(0, 3).map((x) => html`<div class="mini" key=${x.id}><span>${x.title}</span><span class="mono muted small">${fmtMoney(x.amount, x.currency)}</span></div>`)}
    ${list.length === 0 && html`<p class="muted small">還沒有花費紀錄。</p>`}
  </div>`;
}
