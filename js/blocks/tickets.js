// 票券：門票、車票、船票；附電子票 PDF 或截圖
import { html, useState, useRef } from "../vendor/preact-htm.js";
import { store } from "../store.js";
import { shortDay } from "../utils.js";
import { useTrip, useSub, Panel, ConfirmButton, Notes } from "../ui.js";
import { FilePick, FileList, UrlOrPaste, openFile } from "../files.js";

function useTickets() {
  const { trip } = useTrip();
  const xs = useSub((cb) => store.onSub(trip.id, "tickets", cb), [trip.id]) || [];
  const key = (t) => `${t.date || "9999"} ${t.time || ""}`;
  return [...xs].sort((a, b) => key(a).localeCompare(key(b)));
}

function TicketEditor({ ticket, onClose }) {
  const { trip, days } = useTrip();
  const isNew = !ticket.id;
  const [d, setD] = useState(() => ({ title: "", date: "", time: "", bookingNo: "", note: "", files: [], ...ticket }));
  const added = useRef([]);
  const addFiles = (ids) => { added.current.push(...ids); setD((x) => ({ ...x, files: [...x.files, ...ids] })); };
  const bind = (k) => ({ value: d[k] || "", onInput: (e) => setD({ ...d, [k]: e.target.value }) });
  const cancel = () => {
    added.current.forEach((fid) => store.deleteFile(trip.id, fid));
    onClose();
  };
  const save = (e) => {
    e.preventDefault();
    (ticket.files || []).filter((x) => !d.files.includes(x)).forEach((fid) => store.deleteFile(trip.id, fid));
    const { id, ...data } = d;
    data.title = data.title.trim() || "票券";
    if (isNew) store.addSub(trip.id, "tickets", { ...data, order: Date.now() });
    else store.updateSub(trip.id, "tickets", ticket.id, data);
    onClose();
  };
  const remove = () => {
    (ticket.files || []).forEach((fid) => store.deleteFile(trip.id, fid));
    store.deleteSub(trip.id, "tickets", ticket.id);
    onClose();
  };
  return html`<${Panel} title=${isNew ? "新增票券" : "編輯票券"} onClose=${cancel} onSubmit=${save} guard=${true}
    footer=${html`${!isNew && html`<${ConfirmButton} label="刪除" onConfirm=${remove} />`}
      <span class="spacer"></span><button type="button" class="btn" onClick=${cancel}>取消</button>
      <button type="submit" class="btn primary">儲存</button>`}>
    <div class="field"><span>電子票券（PDF 或截圖）</span>
      <${FileList} ids=${d.files} onRemove=${(fid) => setD((x) => ({ ...x, files: x.files.filter((y) => y !== fid) }))} />
      <div class="row-start">
        <${FilePick} id="ticket-files" purpose="doc" onAdded=${addFiles} />
        <${UrlOrPaste} id="ticket-url" purpose="doc" onAdded=${addFiles}
          onLink=${(url) => setD((x) => ({ ...x, note: (x.note ? x.note + "\n" : "") + url }))} />
      </div>
      <p class="hint">可以直接貼上拷貝的截圖（⌘V／Ctrl+V）。PDF 保留原檔（QR code 才掃得到），上限 5MB。</p>
    </div>
    <label class="field"><span>名稱</span><input id="ticket-title" ...${bind("title")} placeholder="例如：Puffing Billy 蒸汽火車" /></label>
    <div class="row2">
      <label class="field"><span>日期</span>
        <select id="ticket-date" value=${d.date} onChange=${(e) => setD({ ...d, date: e.target.value })}>
          <option value="">未定</option>
          ${days.map((x) => html`<option value=${x}>${shortDay(x)}</option>`)}
        </select></label>
      <label class="field"><span>時間</span><input id="ticket-time" type="time" ...${bind("time")} /></label>
    </div>
    <label class="field"><span>訂位號碼</span><input id="ticket-booking" ...${bind("bookingNo")} /></label>
    <label class="field"><span>備註</span><textarea id="ticket-note" rows="3" ...${bind("note")} placeholder="例如：一小時前開始 check-in"></textarea></label>
  <//>`;
}

function Ticket({ t, onEdit }) {
  const { trip, files } = useTrip();
  const first = (t.files || []).map((id) => files[id]).find(Boolean);
  return html`<article class="ticket-card">
    <div class="ticket-main">
      <b>${t.title}</b>
      <span class="muted small mono">${t.date ? shortDay(t.date) : "日期未定"}${t.time ? " " + t.time : ""}</span>
      ${t.note && html`<${Notes} text=${t.note} />`}
      <${FileList} ids=${t.files} size="sm" />
    </div>
    <footer class="ticket-foot">
      <span class="muted small">訂位</span><b class="mono">${t.bookingNo || "—"}</b>
      <span class="spacer"></span>
      ${first && html`<button class="btn small primary" onClick=${() => openFile(trip.id, first)}>出示票券</button>`}
      ${onEdit && html`<button class="btn ghost small" onClick=${() => onEdit(t)}>編輯</button>`}
    </footer>
  </article>`;
}

export function Full() {
  const list = useTickets();
  const [editing, setEditing] = useState(null);
  return html`<div class="stack">
    ${list.map((t) => html`<${Ticket} key=${t.id} t=${t} onEdit=${setEditing} />`)}
    ${list.length === 0 && html`<p class="muted">還沒有票券。</p>`}
    <div><button class="btn" onClick=${() => setEditing({})}>＋ 新增票券</button></div>
    ${editing && html`<${TicketEditor} ticket=${editing} onClose=${() => setEditing(null)} />`}
  </div>`;
}

export function Summary() {
  const list = useTickets();
  const { files } = useTrip();
  if (!list.length) return html`<p class="muted small">還沒有票券。</p>`;
  return html`<div class="sum">
    ${list.slice(0, 4).map((t) => html`<div class="mini" key=${t.id}>
      <span>${t.title}${(t.files || []).some((id) => files[id]?.kind === "pdf") && html` <span class="pdf-tag">PDF</span>`}</span>
      <span class="mono muted small">${t.date ? shortDay(t.date) : ""}</span>
    </div>`)}
    ${list.length > 4 && html`<p class="muted small">還有 ${list.length - 4} 張…</p>`}
  </div>`;
}
