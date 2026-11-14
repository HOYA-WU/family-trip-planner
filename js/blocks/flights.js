// 航班：登機證樣式；可附上機票截圖或電子機票 PDF
import { html, useState, useRef } from "../vendor/preact-htm.js";
import { store } from "../store.js";
import { useTrip, useSub, Panel, ConfirmButton, Notes, pushToast } from "../ui.js";
import { askGemini, aiReady, fileForAI, FLIGHT_PROMPT } from "../ai.js";
import { FilePick, FileList } from "../files.js";

function useFlights() {
  const { trip } = useTrip();
  const xs = useSub((cb) => store.onSub(trip.id, "flights", cb), [trip.id]) || [];
  const first = (f) => f.segments?.[0]?.depart || "";
  return [...xs].sort((a, b) => first(a).localeCompare(first(b)) || (a.order ?? 0) - (b.order ?? 0));
}

const blankSeg = () => ({ flightNo: "", airline: "", from: "", fromTerminal: "", depart: "", depTz: "", to: "", toTerminal: "", arrive: "", arrTz: "", cabin: "" });

function when(dt, tz) {
  if (!dt) return "";
  const [d, t] = dt.split("T");
  const [, m, day] = d.split("-").map(Number);
  return `${m}/${day} ${t || ""}${tz ? ` (${tz})` : ""}`;
}

function Pass({ f, onEdit }) {
  const segs = f.segments || [];
  return html`<article class="pass">
    ${segs.map((s, i) => html`<div class="pass-seg" key=${i}>
      <div class="pass-top"><span class="mono">${s.flightNo}</span><span class="muted">${s.airline}</span>${s.cabin && html`<span class="muted">・${s.cabin}</span>`}</div>
      <div class="pass-route">
        <div><b class="mono">${s.from || "—"}</b><span class="muted small">${s.fromTerminal}</span></div>
        <span class="pass-plane" aria-hidden="true">✈</span>
        <div class="right"><b class="mono">${s.to || "—"}</b><span class="muted small">${s.toTerminal}</span></div>
      </div>
      <div class="pass-times mono"><span>${when(s.depart, s.depTz)}</span><span>${when(s.arrive, s.arrTz)}</span></div>
    </div>`)}
    ${f.note && html`<div class="pass-note"><${Notes} text=${f.note} /></div>`}
    <${FileList} ids=${f.files} size="sm" />
    <footer class="pass-foot">
      <span class="muted small">訂位代號</span><b class="mono">${f.pnr || "—"}</b>
      <span class="spacer"></span>
      ${onEdit && html`<button class="btn ghost small" onClick=${() => onEdit(f)}>編輯</button>`}
    </footer>
  </article>`;
}

function FlightEditor({ flight, onClose }) {
  const { trip, family, files } = useTrip();
  const isNew = !flight.id;
  const [d, setD] = useState(() => ({ pnr: "", note: "", files: [], ...flight, segments: (flight.segments?.length ? flight.segments : [blankSeg()]).map((s) => ({ ...s })) }));
  const added = useRef([]);
  const [reading, setReading] = useState(false);
  const filesRef = useRef(files);
  filesRef.current = files;
  // AI 讀截圖／PDF：每個附件的航段合併起來，填進表單讓人檢查
  const recognize = async (ids = d.files) => {
    let list = [];
    for (let i = 0; i < 20; i++) {
      list = ids.map((id) => filesRef.current[id]).filter(Boolean);
      if (list.length === ids.length) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!list.length) return;
    setReading(true);
    try {
      let pnr = "";
      const notes = [];
      const segs = [];
      for (const f of list) {
        const r = await askGemini(family, { prompt: FLIGHT_PROMPT, file: await fileForAI(trip.id, f) });
        pnr ||= r.pnr || "";
        if (r.note) notes.push(r.note);
        for (const s of r.segments || []) segs.push({ ...blankSeg(), ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v == null ? "" : String(v)])) });
      }
      if (!segs.length) throw new Error("沒有讀到航班資料，請換一張清楚一點的截圖");
      segs.sort((a, b) => (a.depart || "").localeCompare(b.depart || ""));
      setD((x) => ({ ...x, pnr: pnr || x.pnr, note: [x.note, ...notes].filter(Boolean).join("\n"), segments: segs }));
      pushToast(`讀到 ${segs.length} 段航班，請檢查一下再儲存`);
    } catch (e) {
      pushToast(e.message || String(e));
    }
    setReading(false);
  };
  const setSeg = (i, k, v) => setD((x) => ({ ...x, segments: x.segments.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const cancel = () => {
    added.current.forEach((fid) => store.deleteFile(trip.id, fid));
    onClose();
  };
  const save = (e) => {
    e.preventDefault();
    (flight.files || []).filter((x) => !d.files.includes(x)).forEach((fid) => store.deleteFile(trip.id, fid));
    const { id, ...data } = d;
    data.segments = data.segments.map((s) => ({ ...s, from: s.from.toUpperCase(), to: s.to.toUpperCase(), flightNo: s.flightNo.toUpperCase() }));
    if (isNew) store.addSub(trip.id, "flights", { ...data, order: Date.now() });
    else store.updateSub(trip.id, "flights", flight.id, data);
    onClose();
  };
  const remove = () => {
    (flight.files || []).forEach((fid) => store.deleteFile(trip.id, fid));
    store.deleteSub(trip.id, "flights", flight.id);
    onClose();
  };
  const inp = (i, k, ph, extra = {}) => html`<input id=${`seg-${i}-${k}`} value=${d.segments[i][k]} placeholder=${ph}
    onInput=${(e) => setSeg(i, k, e.target.value)} ...${extra} />`;
  return html`<${Panel} title=${isNew ? "新增航班" : "編輯航班"} onClose=${cancel} onSubmit=${save} guard=${true}
    footer=${html`${!isNew && html`<${ConfirmButton} label="刪除" onConfirm=${remove} />`}
      <span class="spacer"></span><button type="button" class="btn" onClick=${cancel}>取消</button>
      <button type="submit" class="btn primary">儲存</button>`}>
    <div class="field"><span>機票截圖或電子機票</span>
      <${FileList} ids=${d.files} onRemove=${(fid) => setD((x) => ({ ...x, files: x.files.filter((y) => y !== fid) }))} />
      <div class="row-start">
        <${FilePick} id="flight-files" purpose="doc" onAdded=${(ids) => {
          added.current.push(...ids);
          setD((x) => ({ ...x, files: [...x.files, ...ids] }));
          if (aiReady(family)) recognize(ids);
        }} />
        ${aiReady(family) && d.files.length > 0 && html`<button type="button" class="btn small" onClick=${() => recognize()} disabled=${reading}>${reading ? "AI 辨識中…" : "🤖 AI 辨識"}</button>`}
      </div>
      <p class="hint">${aiReady(family)
        ? "上傳後會自動辨識，結果填進下面的欄位，請檢查後再儲存。"
        : "到「設定 → AI 辨識」填入金鑰後，上傳截圖就能自動填好下面的欄位。"}</p>
    </div>
    <label class="field"><span>訂位代號</span><input id="flight-pnr" value=${d.pnr} onInput=${(e) => setD({ ...d, pnr: e.target.value.toUpperCase() })} placeholder="例如 FAZCX7" /></label>
    ${d.segments.map((s, i) => html`<fieldset class="seg-box" key=${i}>
      <legend>第 ${i + 1} 段${d.segments.length > 1 && html` <button type="button" class="btn ghost small danger" onClick=${() => setD((x) => ({ ...x, segments: x.segments.filter((_, j) => j !== i) }))}>移除這段</button>`}</legend>
      <div class="row2">
        <label class="field"><span>航班號</span>${inp(i, "flightNo", "QF8728")}</label>
        <label class="field"><span>航空公司</span>${inp(i, "airline", "澳洲航空")}</label>
      </div>
      <div class="row3b">
        <label class="field"><span>出發機場</span>${inp(i, "from", "TPE", { maxlength: 4 })}</label>
        <label class="field"><span>航廈</span>${inp(i, "fromTerminal", "T2")}</label>
        <label class="field"><span>時區</span>${inp(i, "depTz", "+8")}</label>
      </div>
      <label class="field"><span>出發時間（當地）</span>${inp(i, "depart", "", { type: "datetime-local" })}</label>
      <div class="row3b">
        <label class="field"><span>抵達機場</span>${inp(i, "to", "MEL", { maxlength: 4 })}</label>
        <label class="field"><span>航廈</span>${inp(i, "toTerminal", "T2")}</label>
        <label class="field"><span>時區</span>${inp(i, "arrTz", "+10")}</label>
      </div>
      <label class="field"><span>抵達時間（當地）</span>${inp(i, "arrive", "", { type: "datetime-local" })}</label>
      <label class="field"><span>艙等</span>${inp(i, "cabin", "經濟艙")}</label>
    </fieldset>`)}
    <div><button type="button" class="btn ghost small" onClick=${() => setD((x) => ({ ...x, segments: [...x.segments, blankSeg()] }))}>＋ 加一段（轉機）</button></div>
    <label class="field"><span>備註</span><textarea id="flight-note" rows="3" value=${d.note} onInput=${(e) => setD({ ...d, note: e.target.value })} placeholder="行李額度、退改票規則…"></textarea></label>
  <//>`;
}

export function Full() {
  const list = useFlights();
  const [editing, setEditing] = useState(null);
  return html`<div class="stack">
    ${list.map((f) => html`<${Pass} key=${f.id} f=${f} onEdit=${setEditing} />`)}
    ${list.length === 0 && html`<p class="muted">還沒有航班。</p>`}
    <div><button class="btn" onClick=${() => setEditing({})}>＋ 新增航班</button></div>
    ${editing && html`<${FlightEditor} flight=${editing} onClose=${() => setEditing(null)} />`}
  </div>`;
}

export function Summary() {
  const list = useFlights();
  if (!list.length) return html`<p class="muted small">還沒有航班。</p>`;
  return html`<div class="sum">
    ${list.slice(0, 3).map((f) => {
      const a = f.segments?.[0] || {};
      const z = f.segments?.[f.segments.length - 1] || {};
      return html`<div class="sum-pass" key=${f.id}>
        <b class="mono">${a.from || "—"} → ${z.to || "—"}</b>
        <span class="mono muted small">${a.flightNo} ${when(a.depart)}</span>
      </div>`;
    })}
  </div>`;
}
