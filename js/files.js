// 附件：圖片（自動壓縮）與 PDF（保留原檔）
import { html, useState } from "./vendor/preact-htm.js";
import { store } from "./store.js";
import { compressImage } from "./utils.js";
import { pushToast, showImage, useTrip } from "./ui.js";

const MAX_PDF = 5 * 1024 * 1024;

function readDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// purpose: "photo"（一般照片）或 "doc"（票券、截圖，要看得清字）
export async function addFile(tripId, file, extra = {}, purpose = "photo") {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > MAX_PDF) throw new Error(`「${file.name}」超過 5MB，請先壓縮再上傳`);
    const data = await readDataURL(file);
    return store.putFile(tripId, { name: file.name, kind: "pdf", mime: "application/pdf", size: file.size, ...extra }, data);
  }
  if (!file.type.startsWith("image/")) throw new Error(`「${file.name}」不是圖片或 PDF`);
  const data = purpose === "doc"
    ? await compressImage(file, { maxW: 1600, maxH: 2400, quality: 0.82, maxBytes: 450_000 })
    : await compressImage(file, { maxW: 1200, maxH: 1200, quality: 0.75, maxBytes: 250_000 });
  const thumb = await compressImage(file, { maxW: 320, maxH: 320, quality: 0.6, maxBytes: 30_000 });
  return store.putFile(tripId, { name: file.name, kind: "image", mime: "image/jpeg", size: Math.round(data.length * 0.75), thumb, ...extra }, data);
}

// 選檔按鈕：可以多選；選好後回傳新附件的 id
export function FilePick({ id, label = "＋ 圖片或 PDF", accept = "image/*,application/pdf", multiple = true, purpose = "photo", extra, onAdded, class: cls = "btn small" }) {
  const { trip } = useTrip();
  const [busy, setBusy] = useState(false);
  const onChange = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    const ids = [];
    for (const f of files) {
      try {
        ids.push(await addFile(trip.id, f, extra, purpose));
      } catch (err) {
        pushToast(err.message || String(err));
      }
    }
    setBusy(false);
    if (ids.length) onAdded && onAdded(ids);
  };
  return html`<label class=${cls + (busy ? " busy" : "")} for=${id}>
    ${busy ? "處理中…" : label}
    <input id=${id} type="file" accept=${accept} multiple=${multiple} class="visually-hidden" onChange=${onChange} disabled=${busy} />
  </label>`;
}

function dataToBlobUrl(data) {
  const [head, b64] = data.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

// PDF 檢視：在 App 裡顯示，另外提供「開新分頁」看全部頁面
let showPdfImpl = () => {};
export function PdfViewer() {
  const [doc, setDoc] = useState(null);
  showPdfImpl = setDoc;
  if (!doc) return null;
  const close = () => {
    URL.revokeObjectURL(doc.url);
    setDoc(null);
  };
  return html`<div class="pdf-viewer" role="dialog" aria-label=${doc.name}>
    <header class="pdf-h">
      <b>${doc.name}</b>
      <span class="spacer"></span>
      <a class="btn small" href=${doc.url} target="_blank" rel="noopener">開新分頁</a>
      <a class="btn small" href=${doc.url} download=${doc.name}>下載</a>
      <button class="btn small" onClick=${close}>關閉</button>
    </header>
    <iframe src=${doc.url} title=${doc.name}></iframe>
  </div>`;
}

export async function openFile(tripId, file) {
  try {
    const data = await store.getFileData(tripId, file);
    if (!data) return pushToast("這個附件還沒下載到這台裝置，請連上網路再試");
    if (file.kind === "pdf") showPdfImpl({ name: file.name, url: dataToBlobUrl(data) });
    else showImage(data);
  } catch (e) {
    pushToast("打不開這個附件：" + (e.message || e));
  }
}

// 顯示一串附件：圖片縮圖、PDF 標籤；可以移除
export function FileList({ ids, onRemove, size = "md" }) {
  const { trip, files } = useTrip();
  const list = (ids || []).map((id) => files[id]).filter(Boolean);
  if (!list.length) return null;
  return html`<div class=${"file-list " + size}>
    ${list.map((f) => html`<div class="file-item" key=${f.id}>
      <button type="button" class=${"file-open " + f.kind} onClick=${() => openFile(trip.id, f)} title=${f.name}>
        ${f.kind === "image"
          ? html`<img src=${f.thumb || f.data} alt=${f.name} loading="lazy" />`
          : html`<span class="pdf-chip"><b>PDF</b><span>${f.name}</span></span>`}
      </button>
      ${onRemove && html`<button type="button" class="file-remove" aria-label=${"移除 " + f.name} onClick=${() => onRemove(f.id)}>×</button>`}
    </div>`)}
  </div>`;
}
