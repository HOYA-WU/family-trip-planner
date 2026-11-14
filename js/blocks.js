// 旅行頁上方的區塊：摘要格線、排序、隱藏、新增，點開看完整內容
import { html, useState, useEffect, useRef } from "./vendor/preact-htm.js";
import Sortable from "./vendor/sortable.esm.js";
import { store } from "./store.js";
import { newId, local } from "./utils.js";
import { useTrip, Panel, ConfirmButton } from "./ui.js";
import { tripBlocks, ADDABLE_BLOCKS, BUILTIN_BLOCKS } from "./model.js";
import * as Todo from "./blocks/todo.js";
import * as Flights from "./blocks/flights.js";
import * as Tickets from "./blocks/tickets.js";
import * as Lists from "./blocks/lists.js";
import * as Outfits from "./blocks/outfits.js";
import * as Expenses from "./blocks/expenses.js";
import { Links, Note, Files } from "./blocks/misc.js";
import * as MapBlock from "./blocks/map.js";

export const BLOCK_IMPL = { todo: Todo, flights: Flights, tickets: Tickets, lists: Lists, outfits: Outfits, expenses: Expenses, links: Links, map: MapBlock, note: Note, files: Files };

export function BlockFull({ block }) {
  const Impl = BLOCK_IMPL[block.type];
  return Impl ? html`<${Impl.Full} block=${block} />` : null;
}

export function BlockPanel({ block, onClose }) {
  return html`<${Panel} title=${block.title} onClose=${onClose} wide=${true}><${BlockFull} block=${block} /><//>`;
}

function saveBlocks(trip, blocks) {
  store.updateTrip(trip.id, { blocks: blocks.map(({ id, type, title, hidden }) => ({ id, type, ...(title ? { title } : {}), ...(hidden ? { hidden: true } : {}) })) });
}

// 新增區塊選單（也用來把隱藏的區塊叫回來）
export function AddBlockMenu({ onAdded }) {
  const { trip } = useTrip();
  const blocks = tripBlocks(trip);
  const hidden = blocks.filter((b) => b.hidden);
  const add = (type, title) => {
    const b = { id: newId(10), type, title };
    saveBlocks(trip, [...blocks, b]);
    onAdded && onAdded(b);
  };
  const show = (b) => saveBlocks(trip, blocks.map((x) => (x.id === b.id ? { ...x, hidden: false } : x)));
  return html`<details class="menu add-block">
    <summary class="btn ghost small">＋ 區塊</summary>
    <div class="menu-pop">
      ${ADDABLE_BLOCKS.map((a) => html`<button key=${a.type} onClick=${(e) => { e.target.closest("details").open = false; add(a.type, a.title); }}>
        <b>新增${a.title}</b><span class="muted small">${a.hint}</span></button>`)}
      ${hidden.length > 0 && html`<hr />${hidden.map((b) => html`<button key=${b.id} onClick=${(e) => { e.target.closest("details").open = false; show(b); }}>
        <b>顯示「${b.title}」</b><span class="muted small">之前隱藏的區塊</span></button>`)}`}
    </div>
  </details>`;
}

function BlockMenu({ block, blocks }) {
  const { trip } = useTrip();
  const builtin = BUILTIN_BLOCKS.some((b) => b.type === block.type);
  const [renaming, setRenaming] = useState(false);
  const close = (e) => (e.target.closest("details").open = false);
  const hide = (e) => {
    close(e);
    saveBlocks(trip, blocks.map((x) => (x.id === block.id ? { ...x, hidden: true } : x)));
  };
  const remove = () => {
    saveBlocks(trip, blocks.filter((x) => x.id !== block.id));
    if (block.type === "note") store.deleteSub(trip.id, "notes", block.id);
  };
  if (renaming)
    return html`<input class="block-rename" autofocus value=${block.title} aria-label="區塊名稱"
      onBlur=${(e) => { setRenaming(false); saveBlocks(trip, blocks.map((x) => (x.id === block.id ? { ...x, title: e.target.value.trim() || x.title } : x))); }}
      onKeyDown=${(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setRenaming(false); }} />`;
  return html`<details class="menu">
    <summary class="icon-btn" aria-label=${block.title + " 選項"}>⋯</summary>
    <div class="menu-pop right">
      <button onClick=${(e) => { close(e); setRenaming(true); }}>重新命名</button>
      ${builtin
        ? html`<button onClick=${hide}>隱藏這個區塊</button>`
        : html`<${ConfirmButton} class="menu-danger" label="刪除這個區塊" confirmLabel="確定刪除？內容也會刪掉" onConfirm=${remove} />`}
    </div>
  </details>`;
}

export function Blocks() {
  const { trip } = useTrip();
  const blocks = tripBlocks(trip);
  const visible = blocks.filter((b) => !b.hidden);
  const [collapsed, setCollapsed] = useState(() => local.get("blocks-collapsed", false));
  const [open, setOpen] = useState(null);
  const gridRef = useRef();
  const latest = useRef(blocks);
  latest.current = blocks;
  const toggle = () => {
    local.set("blocks-collapsed", !collapsed);
    setCollapsed(!collapsed);
  };

  useEffect(() => {
    if (!gridRef.current) return;
    const s = Sortable.create(gridRef.current, {
      animation: 150,
      handle: ".block-drag",
      draggable: ".block",
      ghostClass: "is-ghost",
      onEnd: ({ item, from, oldIndex, newIndex }) => {
        if (oldIndex === newIndex) return;
        item.remove();
        from.insertBefore(item, from.children[oldIndex] || null);
        // 只重排看得到的區塊，隱藏的留在原位
        const all = latest.current;
        const vis = all.filter((b) => !b.hidden);
        const [moved] = vis.splice(oldIndex, 1);
        vis.splice(newIndex, 0, moved);
        let k = 0;
        saveBlocks(trip, all.map((b) => (b.hidden ? b : vis[k++])));
      },
    });
    return () => s.destroy();
  }, [collapsed]);

  const panel = open && html`<${BlockPanel} block=${open} onClose=${() => setOpen(null)} />`;
  if (collapsed)
    return html`<div class="blocks-collapsed">
      ${visible.map((b) => html`<button key=${b.id} class="chip" onClick=${() => setOpen(b)}>${b.title}</button>`)}
      <button class="btn ghost small" onClick=${toggle}>展開區塊</button>
      ${panel}
    </div>`;

  return html`<div class="blocks-wrap">
    <div class="blocks-bar">
      <span class="muted small">拖曳 ⠿ 可以調整順序</span>
      <span class="spacer"></span>
      <${AddBlockMenu} />
      <button class="btn ghost small" onClick=${toggle}>收合區塊</button>
    </div>
    <div class="blocks" ref=${gridRef}>
      ${visible.map((b) => {
        const Impl = BLOCK_IMPL[b.type];
        return html`<section class="block" key=${b.id}>
          <header class="block-h">
            <span class="block-drag" title="拖曳調整順序" aria-hidden="true">⠿</span>
            <button class="block-title" onClick=${() => setOpen(b)}>${b.title}</button>
            <${BlockMenu} block=${b} blocks=${blocks} />
          </header>
          <div class="block-body">${Impl && html`<${Impl.Summary} block=${b} />`}</div>
          <button class="block-more" onClick=${() => setOpen(b)}>打開 →</button>
        </section>`;
      })}
    </div>
    ${panel}
  </div>`;
}
