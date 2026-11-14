import { html, useState } from "../vendor/preact-htm.js";
import { store } from "../store.js";
import { useTrip, useSub } from "../ui.js";

function useTodos() {
  const { trip } = useTrip();
  const todos = useSub((cb) => store.onSub(trip.id, "todos", cb), [trip.id]) || [];
  return [...todos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function Row({ t }) {
  const { trip } = useTrip();
  return html`<li class=${t.done ? "done" : ""}>
    <label><input type="checkbox" checked=${t.done} onChange=${(e) => store.updateSub(trip.id, "todos", t.id, { done: e.target.checked })} />
      <span>${t.text}</span></label>
    <button class="icon-btn" title="刪除" aria-label=${"刪除 " + t.text} onClick=${() => store.deleteSub(trip.id, "todos", t.id)}>×</button>
  </li>`;
}

export function Full() {
  const { trip } = useTrip();
  const list = useTodos();
  const [text, setText] = useState("");
  const add = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const last = list.length ? list[list.length - 1].order ?? 0 : 0;
    store.addSub(trip.id, "todos", { text: t, done: false, order: last + 1000 });
    setText("");
  };
  return html`<div class="todo">
    <ul class="todo-list">${list.map((t) => html`<${Row} key=${t.id} t=${t} />`)}</ul>
    <form class="todo-add" onSubmit=${add}>
      <input id="todo-add" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="新增待辦，按 Enter" />
    </form>
  </div>`;
}

export function Summary() {
  const list = useTodos();
  const done = list.filter((t) => t.done).length;
  const open = list.filter((t) => !t.done);
  return html`<div class="sum">
    <p class="sum-big mono">${done}/${list.length}<span class="muted small"> 完成</span></p>
    <ul class="todo-list compact">${open.slice(0, 4).map((t) => html`<${Row} key=${t.id} t=${t} />`)}</ul>
    ${open.length > 4 && html`<p class="muted small">還有 ${open.length - 4} 項…</p>`}
    ${list.length === 0 && html`<p class="muted small">還沒有待辦。</p>`}
  </div>`;
}

export const count = () => null;
