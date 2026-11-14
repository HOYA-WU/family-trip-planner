// 參考連結、筆記、附件
import { html, useState } from "../vendor/preact-htm.js";
import { store } from "../store.js";
import { useTrip, useSub, Notes, LazyInput } from "../ui.js";
import { FilePick, FileList } from "../files.js";

// ---------------------------------------------------------------- 參考連結

function useLinks() {
  const { trip } = useTrip();
  const xs = useSub((cb) => store.onSub(trip.id, "links", cb), [trip.id]) || [];
  return [...xs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export const Links = {
  Full() {
    const { trip } = useTrip();
    const list = useLinks();
    const [label, setLabel] = useState("");
    const [url, setUrl] = useState("");
    const add = (e) => {
      e.preventDefault();
      let u = url.trim();
      if (!u) return;
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      store.addSub(trip.id, "links", { label: label.trim(), url: u, order: (list.at(-1)?.order ?? 0) + 1000 });
      setLabel("");
      setUrl("");
    };
    return html`<div class="stack">
      <ul class="link-list">${list.map((l) => html`<li key=${l.id}>
        <a href=${l.url} target="_blank" rel="noopener"><b>${l.label || host(l.url)}</b><span class="muted small">${host(l.url)}</span></a>
        <button class="icon-btn" aria-label=${"刪除 " + (l.label || l.url)} onClick=${() => store.deleteSub(trip.id, "links", l.id)}>×</button>
      </li>`)}</ul>
      ${list.length === 0 && html`<p class="muted">還沒有連結。</p>`}
      <form class="link-add" onSubmit=${add}>
        <input id="link-new-label" value=${label} onInput=${(e) => setLabel(e.target.value)} placeholder="名稱（可空白）" />
        <input id="link-new-url" value=${url} onInput=${(e) => setUrl(e.target.value)} placeholder="貼上網址" />
        <button class="btn">新增</button>
      </form>
    </div>`;
  },
  Summary() {
    const list = useLinks();
    if (!list.length) return html`<p class="muted small">還沒有連結。</p>`;
    return html`<div class="sum">${list.slice(0, 4).map((l) => html`<div class="mini" key=${l.id}>
      <a href=${l.url} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>${l.label || host(l.url)}</a>
      <span class="muted small">${host(l.url)}</span></div>`)}</div>`;
  },
};

// ---------------------------------------------------------------- 筆記（每個筆記區塊一份）

function useNote(blockId) {
  const { trip } = useTrip();
  const xs = useSub((cb) => store.onSub(trip.id, "notes", cb), [trip.id]) || [];
  return xs.find((n) => n.id === blockId)?.text || "";
}

export const Note = {
  Full({ block }) {
    const { trip } = useTrip();
    const text = useNote(block.id);
    return html`<div class="stack">
      <${LazyInput} id=${"note-" + block.id} multiline=${true} rows="12" class="note-input" value=${text}
        onSave=${(v) => store.setSub(trip.id, "notes", block.id, { text: v })}
        placeholder="可以用 **粗體**，「- 」開頭會變成清單" aria-label=${block.title} />
      <p class="hint">離開輸入框就會自動儲存。</p>
    </div>`;
  },
  Summary({ block }) {
    const text = useNote(block.id);
    if (!text) return html`<p class="muted small">還沒有內容。</p>`;
    return html`<div class="sum note-sum"><${Notes} text=${text.split("\n").slice(0, 6).join("\n")} /></div>`;
  },
};

// ---------------------------------------------------------------- 附件（每個附件區塊一份）

function blockFiles(files, blockId) {
  return Object.values(files).filter((f) => f.blockId === blockId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((f) => f.id);
}

export const Files = {
  Full({ block }) {
    const { trip, files } = useTrip();
    const ids = blockFiles(files, block.id);
    return html`<div class="stack">
      <${FileList} ids=${ids} onRemove=${(fid) => store.deleteFile(trip.id, fid)} />
      ${ids.length === 0 && html`<p class="muted">還沒有附件。</p>`}
      <div><${FilePick} id=${"files-" + block.id} purpose="doc" extra=${{ blockId: block.id }} /></div>
    </div>`;
  },
  Summary({ block }) {
    const { files } = useTrip();
    const ids = blockFiles(files, block.id);
    if (!ids.length) return html`<p class="muted small">還沒有附件。</p>`;
    return html`<div class="sum"><${FileList} ids=${ids.slice(0, 6)} size="sm" /></div>`;
  },
};
