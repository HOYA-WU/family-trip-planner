// 共用的畫面元件與 hooks
import { html, useState, useEffect, useRef, createContext, useContext } from "./vendor/preact-htm.js";
import { store } from "./store.js";

// ---------------------------------------------------------------- hooks

export function useSub(subscribe, deps) {
  const [value, setValue] = useState(undefined);
  useEffect(() => {
    setValue(undefined);
    const off = subscribe(setValue);
    return () => typeof off === "function" && off();
  }, deps);
  return value;
}
export function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  return hash;
}
export function useMedia(q) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}
export const useWide = () => useMedia("(min-width: 768px)");
export function useOnline() {
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

// 旅行頁的共用資料（旅行、全家設定、附件…），各區塊直接拿來用
export const TripCtx = createContext(null);
export const useTrip = () => useContext(TripCtx);

// ---------------------------------------------------------------- toast

let pushToastImpl = () => {};
export const pushToast = (text) => pushToastImpl(text);
export function Toasts() {
  const [items, setItems] = useState([]);
  pushToastImpl = (text) => {
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
  if (e && e.code === "permission-denied") pushToast("沒有權限。這台裝置可能被移除了，請重新點邀請連結。");
  else pushToast("儲存失敗：" + (e && e.message ? e.message : e));
};

// ---------------------------------------------------------------- 圖片放大

let showImageImpl = () => {};
export const showImage = (src) => showImageImpl(src);
export function Lightbox() {
  const [src, setSrc] = useState("");
  showImageImpl = setSrc;
  useEffect(() => {
    if (!src) return;
    const f = (e) => e.key === "Escape" && setSrc("");
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [src]);
  if (!src) return null;
  return html`<div class="lightbox" onClick=${() => setSrc("")} role="dialog" aria-label="圖片">
    <img src=${src} alt="" />
    <button class="icon-btn lightbox-close" aria-label="關閉">×</button>
  </div>`;
}

// ---------------------------------------------------------------- 小元件

export function ConfirmButton({ label, confirmLabel = "確定刪除？", onConfirm, class: cls = "btn danger" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return html`<button type="button" class=${cls + (armed ? " armed" : "")}
    onClick=${(e) => { e.stopPropagation(); armed ? onConfirm() : setArmed(true); }}>${armed ? confirmLabel : label}</button>`;
}

export async function copyText(text, inputEl) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast("已複製");
  } catch {
    if (inputEl) {
      inputEl.select();
      pushToast("請按複製（⌘C / 長按）");
    }
  }
}

// 對話框：電腦上從右側滑出，手機上全螢幕。可以疊好幾層，Esc 只關最上面那層
const panelStack = [];
export function Panel({ title, onClose, children, footer, wide = false, onSubmit, guard = false }) {
  const me = useRef({});
  useEffect(() => {
    panelStack.push(me.current);
    return () => panelStack.splice(panelStack.indexOf(me.current), 1);
  }, []);
  useEffect(() => {
    const f = (e) => e.key === "Escape" && !guard && panelStack.at(-1) === me.current && onClose();
    addEventListener("keydown", f);
    return () => removeEventListener("keydown", f);
  }, [guard, onClose]);
  const Body = onSubmit ? "form" : "div";
  return html`<div class="overlay side" onClick=${(e) => e.target === e.currentTarget && !guard && onClose()}>
    <${Body} class=${"panel" + (wide ? " wide" : "")} onSubmit=${onSubmit}>
      <header class="panel-h">
        <h2>${title}</h2>
        <button type="button" class="icon-btn" aria-label="關閉" onClick=${onClose}>×</button>
      </header>
      <div class="panel-body">${children}</div>
      ${footer && html`<footer class="panel-f">${footer}</footer>`}
    </${Body}>
  </div>`;
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
export function Notes({ text }) {
  if (!text) return null;
  const blocks = [];
  let bullets = null;
  const flush = () => {
    if (bullets) blocks.push(html`<ul>${bullets.map((x) => html`<li>${inline(x)}</li>`)}</ul>`);
    bullets = null;
  };
  for (const line of text.split("\n")) {
    const b = line.match(/^\s*[-•]\s+(.*)$/);
    if (b) {
      (bullets ||= []).push(b[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(html`<p>${inline(line)}</p>`);
  }
  flush();
  return html`<div class="notes">${blocks}</div>`;
}

export function StatusBadge({ status }) {
  if (status === "booked") return html`<span class="badge booked">已訂</span>`;
  if (status === "backup") return html`<span class="badge backup">備案</span>`;
  if (status === "cancelled") return html`<span class="badge cancelled">取消</span>`;
  return null;
}

// 文字欄位：停止打字約 1 秒或離開欄位時才寫入資料庫（減少寫入次數，也不會漏存）
export function LazyInput({ value, onSave, multiline = false, ...rest }) {
  const [v, setV] = useState(value || "");
  const editing = useRef(false);
  const pending = useRef(null);
  const timer = useRef(0);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current != null) {
      saveRef.current(pending.current);
      pending.current = null;
    }
  };
  useEffect(() => {
    if (!editing.current) setV(value || "");
  }, [value]);
  useEffect(() => flush, []);
  const props = {
    ...rest,
    value: v,
    onInput: (e) => {
      editing.current = true;
      setV(e.target.value);
      pending.current = e.target.value;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 900);
    },
    onBlur: () => {
      editing.current = false;
      flush();
    },
  };
  return multiline ? html`<textarea ...${props}></textarea>` : html`<input ...${props} />`;
}
