// 清單：行李、採購（可分人）、伴手禮（指定送給誰）、一般
import { html, useState } from "../vendor/preact-htm.js";
import { store } from "../store.js";
import { local } from "../utils.js";
import { useTrip, useSub, ConfirmButton } from "../ui.js";
import { LIST_KINDS, personName, recipientLabel } from "../model.js";
import { FilePick, FileList, UrlOrPaste } from "../files.js";

function useLists() {
  const { trip } = useTrip();
  const lists = useSub((cb) => store.onSub(trip.id, "lists", cb), [trip.id]) || [];
  const items = useSub((cb) => store.onSub(trip.id, "listItems", cb), [trip.id]) || [];
  return { lists: [...lists].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), items };
}
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const kindLabel = (k) => LIST_KINDS.find((x) => x.id === k)?.label || "一般";

// ---- 新增清單 ----
function NewList({ lists, onCreated }) {
  const { trip } = useTrip();
  const [kind, setKind] = useState("packing");
  const [title, setTitle] = useState("");
  const create = async (k = kind, t = title) => {
    const id = await store.addSub(trip.id, "lists", { title: (t || kindLabel(k)).trim(), kind: k, order: (lists.at(-1)?.order ?? 0) + 1000 });
    setTitle("");
    onCreated(id);
  };
  const createDefaults = async () => {
    let order = (lists.at(-1)?.order ?? 0) + 1000;
    let first;
    for (const k of ["packing", "shopping", "gift"]) {
      const id = await store.addSub(trip.id, "lists", { title: kindLabel(k), kind: k, order });
      first ||= id;
      order += 1000;
    }
    onCreated(first);
  };
  return html`<div class="new-list">
    ${lists.length === 0 && html`<button class="btn primary" onClick=${createDefaults}>建立「行李、採購、伴手禮」三個清單</button>`}
    <form class="inline-form" onSubmit=${(e) => { e.preventDefault(); create(); }}>
      <select id="new-list-kind" value=${kind} onChange=${(e) => setKind(e.target.value)} aria-label="清單種類">
        ${LIST_KINDS.map((k) => html`<option value=${k.id}>${k.label}（${k.hint}）</option>`)}
      </select>
      <input id="new-list-title" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder="名稱（可空白）" />
      <button class="btn">＋ 新清單</button>
    </form>
  </div>`;
}

// ---- 分人用的選單 ----
function OwnerSelect({ value, onChange, id }) {
  const { travelers } = useTrip();
  return html`<select id=${id} class="owner-select" value=${value || "shared"} onChange=${(e) => onChange(e.target.value)} aria-label="屬於誰">
    ${travelers.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
    <option value="shared">共用</option>
  </select>`;
}

function RecipientChips({ value = [], onChange }) {
  const { family } = useTrip();
  const rs = family?.recipients || [];
  if (!rs.length) return html`<p class="hint">還沒有送禮對象，請到「設定 → 送禮對象」新增。</p>`;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return html`<div class="chips">${rs.map((r) => html`<button type="button" key=${r.id}
    class=${"chip" + (value.includes(r.id) ? " on" : "")} onClick=${() => toggle(r.id)}>${recipientLabel(family, r)}</button>`)}</div>`;
}

// ---- 清單內容 ----
function ItemRow({ it, list, expanded, onExpand, hideWho = false }) {
  const { trip, family } = useTrip();
  const up = (patch) => store.updateSub(trip.id, "listItems", it.id, patch);
  const imgs = it.images || [];
  const addImgs = (ids) => up({ images: [...imgs, ...ids] });
  const removeImg = (fid) => { store.deleteFile(trip.id, fid); up({ images: imgs.filter((x) => x !== fid) }); };
  const who = hideWho ? "" : list.kind === "gift"
    ? (it.recipients || []).map((rid) => family?.recipients?.find((r) => r.id === rid)).filter(Boolean).map((r) => recipientLabel(family, r)).join("、")
    : (list.kind === "packing" || list.kind === "shopping") ? personName(family, it.owner || "shared") : "";
  return html`<li class=${"item" + (it.done ? " done" : "")}>
    <div class="item-row">
      <input type="checkbox" checked=${it.done} onChange=${(e) => up({ done: e.target.checked })} aria-label=${it.text} />
      <button class="item-text" onClick=${() => onExpand(expanded ? null : it.id)}>
        <span class="item-main"><span>${it.text}${it.qty > 1 && html` <span class="muted">×${it.qty}</span>`}</span>
          ${it.note && !expanded && html`<span class="item-note">${it.note}</span>`}</span>
        ${who && html`<span class="item-who">${who}</span>`}
      </button>
      ${!expanded && imgs.length > 0 && html`<${FileList} ids=${imgs.slice(0, 1)} size="xs" />`}
    </div>
    ${expanded && html`<div class="item-edit">
      <div class="row2">
        <label class="field"><span>名稱</span><input id=${"it-text-" + it.id} value=${it.text} onChange=${(e) => up({ text: e.target.value })} /></label>
        <label class="field"><span>數量</span><input id=${"it-qty-" + it.id} type="number" min="1" value=${it.qty || 1} onChange=${(e) => up({ qty: Number(e.target.value) || 1 })} /></label>
      </div>
      ${list.kind === "gift" && html`<div class="field"><span>送給誰（可多選）</span>
        <${RecipientChips} value=${it.recipients} onChange=${(v) => up({ recipients: v })} /></div>`}
      ${(list.kind === "packing" || list.kind === "shopping") && html`<label class="field"><span>屬於誰</span>
        <${OwnerSelect} id=${"it-owner-" + it.id} value=${it.owner} onChange=${(v) => up({ owner: v })} /></label>`}
      <label class="field"><span>備註</span><textarea id=${"it-note-" + it.id} rows="2" value=${it.note || ""}
        onChange=${(e) => up({ note: e.target.value })} placeholder="例如：哪裡買、口味、價格"></textarea></label>
      <div class="field"><span>圖片（方便辨認）</span>
        <${FileList} ids=${imgs} size="sm" onRemove=${removeImg} />
        <div class="row-start">
          <${FilePick} id=${"it-img-" + it.id} label="＋ 圖片" accept="image/*" onAdded=${addImgs} />
          <${UrlOrPaste} id=${"it-url-" + it.id} onAdded=${addImgs}
            onLink=${(url) => up({ note: (it.note ? it.note + "\n" : "") + url })} />
        </div>
      </div>
      <div class="row-end">
        <${ConfirmButton} class="btn ghost small danger" label="刪除" onConfirm=${() => { imgs.forEach((fid) => store.deleteFile(trip.id, fid)); store.deleteSub(trip.id, "listItems", it.id); }} />
        <button class="btn small" onClick=${() => onExpand(null)}>完成</button>
      </div>
    </div>`}
  </li>`;
}

function AddItem({ list, items, defaultOwner }) {
  const { trip } = useTrip();
  const [text, setText] = useState("");
  const [recipients, setRecipients] = useState([]);
  const [owner, setOwner] = useState(defaultOwner);
  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const data = { listId: list.id, text: t, done: false, qty: 1, order: (items.at(-1)?.order ?? 0) + 1000 };
    if (list.kind === "gift") data.recipients = recipients;
    if (list.kind === "packing" || list.kind === "shopping") data.owner = owner || "shared";
    store.addSub(trip.id, "listItems", data);
    setText("");
  };
  return html`<form class="add-item" onSubmit=${add}>
    <div class="inline-form">
      <input id=${"add-item-" + list.id} value=${text} onInput=${(e) => setText(e.target.value)} placeholder="新增項目，按 Enter" />
      ${(list.kind === "packing" || list.kind === "shopping") && html`<${OwnerSelect} id=${"add-owner-" + list.id} value=${owner} onChange=${setOwner} />`}
    </div>
    ${list.kind === "gift" && html`<div class="field"><span>送給誰（新增的項目會套用）</span><${RecipientChips} value=${recipients} onChange=${setRecipients} /></div>`}
  </form>`;
}

function ListView({ list, items }) {
  const { trip, family, travelers } = useTrip();
  const [expanded, setExpanded] = useState(null);
  const [who, setWho] = useState("all");
  const [view, setView] = useState("recipient");
  const mine = items.filter((i) => i.listId === list.id).sort(byOrder);
  const byPerson = list.kind === "packing" || list.kind === "shopping";
  const shown = byPerson && who !== "all" ? mine.filter((i) => (i.owner || "shared") === who) : mine;
  const done = mine.filter((i) => i.done).length;

  let body;
  if (list.kind === "gift" && view === "recipient") {
    // 依對象：每個人送什麼
    const groups = (family?.recipients || []).map((r) => ({ r, xs: mine.filter((i) => (i.recipients || []).includes(r.id)) })).filter((g) => g.xs.length);
    const none = mine.filter((i) => !(i.recipients || []).length);
    body = html`${groups.map(({ r, xs }) => html`<section class="gift-group" key=${r.id}>
        <h4>${recipientLabel(family, r)} <span class="muted small">${xs.filter((i) => i.done).length}/${xs.length}</span></h4>
        <ul class="items">${xs.map((it) => html`<${ItemRow} key=${it.id} it=${it} list=${list} hideWho=${true} expanded=${expanded === it.id + r.id} onExpand=${(v) => setExpanded(v && v + r.id)} />`)}</ul>
      </section>`)}
      ${none.length > 0 && html`<section class="gift-group"><h4>還沒指定對象</h4>
        <ul class="items">${none.map((it) => html`<${ItemRow} key=${it.id} it=${it} list=${list} expanded=${expanded === it.id} onExpand=${setExpanded} />`)}</ul></section>`}`;
  } else if (list.kind === "gift") {
    // 依品項：同名的合計數量，逛街時用
    const map = new Map();
    for (const it of mine) {
      const k = it.text.trim();
      const g = map.get(k) || { text: k, qty: 0, done: 0, n: 0 };
      g.qty += it.qty || 1;
      g.n += 1;
      g.done += it.done ? 1 : 0;
      map.set(k, g);
    }
    body = html`<ul class="items">${[...map.values()].map((g) => html`<li class=${"item" + (g.done === g.n ? " done" : "")} key=${g.text}>
      <div class="item-row"><span class="item-text static"><span>${g.text}</span><span class="item-who">共 ${g.qty} 個${g.n > 1 ? `・${g.n} 份` : ""}</span></span></div></li>`)}</ul>`;
  } else {
    body = html`<ul class="items">${shown.map((it) => html`<${ItemRow} key=${it.id} it=${it} list=${list} expanded=${expanded === it.id} onExpand=${setExpanded} />`)}</ul>`;
  }

  return html`<div class="list-view">
    <div class="list-tools">
      <span class="muted small">${kindLabel(list.kind)}・${done}/${mine.length}</span>
      ${byPerson && html`<div class="chips">
        <button class=${"chip" + (who === "all" ? " on" : "")} onClick=${() => setWho("all")}>全部</button>
        ${travelers.map((p) => html`<button key=${p.id} class=${"chip" + (who === p.id ? " on" : "")} onClick=${() => setWho(p.id)}>${p.name}</button>`)}
        <button class=${"chip" + (who === "shared" ? " on" : "")} onClick=${() => setWho("shared")}>共用</button>
      </div>`}
      ${list.kind === "gift" && html`<div class="chips">
        <button class=${"chip" + (view === "recipient" ? " on" : "")} onClick=${() => setView("recipient")}>依對象</button>
        <button class=${"chip" + (view === "item" ? " on" : "")} onClick=${() => setView("item")}>依品項</button>
      </div>`}
    </div>
    ${body}
    ${mine.length === 0 && html`<p class="muted small">還沒有項目。</p>`}
    <${AddItem} key=${list.id} list=${list} items=${mine} defaultOwner=${who === "all" ? (travelers[0]?.id || "shared") : who} />
    <details class="list-settings">
      <summary>清單設定</summary>
      <div class="inline-form">
        <input id=${"list-title-" + list.id} value=${list.title} onChange=${(e) => store.updateSub(trip.id, "lists", list.id, { title: e.target.value })} aria-label="清單名稱" />
        <${ConfirmButton} class="btn ghost small danger" label="刪除清單" confirmLabel="連同項目一起刪除？"
          onConfirm=${() => { mine.forEach((i) => { (i.images || []).forEach((fid) => store.deleteFile(trip.id, fid)); store.deleteSub(trip.id, "listItems", i.id); }); store.deleteSub(trip.id, "lists", list.id); }} />
      </div>
    </details>
  </div>`;
}

export function Full() {
  const { trip } = useTrip();
  const { lists, items } = useLists();
  const [active, setActive] = useState(() => local.get("list:" + trip.id, ""));
  const pick = (id) => {
    setActive(id);
    local.set("list:" + trip.id, id);
  };
  const cur = lists.find((l) => l.id === active) || lists[0];
  return html`<div class="stack">
    ${lists.length > 0 && html`<div class="tabs-row">
      ${lists.map((l) => html`<button key=${l.id} class=${"tab" + (cur?.id === l.id ? " on" : "")} onClick=${() => pick(l.id)}>${l.title}</button>`)}
    </div>`}
    ${cur && html`<${ListView} key=${cur.id} list=${cur} items=${items} />`}
    <${NewList} lists=${lists} onCreated=${pick} />
  </div>`;
}

export function Summary() {
  const { lists, items } = useLists();
  if (!lists.length) return html`<p class="muted small">還沒有清單。</p>`;
  return html`<div class="sum">
    ${lists.slice(0, 5).map((l) => {
      const xs = items.filter((i) => i.listId === l.id);
      return html`<div class="mini" key=${l.id}><span>${l.title}</span><span class="mono muted small">${xs.filter((i) => i.done).length}/${xs.length}</span></div>`;
    })}
  </div>`;
}
