// 設定：家庭成員、送禮對象、邀請家人、裝置
import { html, useState, useEffect, useRef } from "./vendor/preact-htm.js";
import { store } from "./store.js";
import { newId } from "./utils.js";
import { useSub, ConfirmButton, copyText, pushToast, LazyInput } from "./ui.js";
import { recipientLabel } from "./model.js";

function People({ family }) {
  const people = family.people || [];
  const [name, setName] = useState("");
  const save = (next) => store.updateFamily({ people: next });
  return html`<section class="card-sec">
    <h2>家庭成員</h2>
    <p class="muted">每趟旅行可以選誰一起去；每日穿搭、清單分人會用到。這裡的名字只是標籤，跟誰能登入無關。</p>
    <ul class="fam-list">${people.map((p) => html`<li key=${p.id}>
      <${LazyInput} id=${"person-" + p.id} value=${p.name} onSave=${(v) => v.trim() && save(people.map((x) => (x.id === p.id ? { ...x, name: v.trim() } : x)))} aria-label="名字" />
      <${ConfirmButton} class="btn ghost small danger" label="移除" confirmLabel="確定移除？"
        onConfirm=${() => store.updateFamily({ people: people.filter((x) => x.id !== p.id), recipients: (family.recipients || []).filter((r) => r.ownerId !== p.id) })} />
    </li>`)}</ul>
    <form class="inline-form" onSubmit=${(e) => { e.preventDefault(); if (!name.trim()) return; save([...people, { id: newId(8), name: name.trim() }]); setName(""); }}>
      <input id="person-new" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="例如：兒子、女兒" />
      <button class="btn">新增成員</button>
    </form>
  </section>`;
}

function Recipients({ family }) {
  const people = family.people || [];
  const rs = family.recipients || [];
  const [d, setD] = useState({ ownerId: people[0]?.id || "", group: "同事", name: "" });
  useEffect(() => {
    if (!d.ownerId && people[0]) setD((x) => ({ ...x, ownerId: people[0].id }));
  }, [people.length]);
  const save = (next) => store.updateFamily({ recipients: next });
  const add = (e) => {
    e.preventDefault();
    if (!d.group.trim() && !d.name.trim()) return pushToast("請填群組或名字");
    save([...rs, { id: newId(8), ownerId: d.ownerId, group: d.group.trim(), name: d.name.trim() }]);
    setD({ ...d, name: "" });
  };
  return html`<section class="card-sec">
    <h2>送禮對象</h2>
    <p class="muted">伴手禮清單可以指定送給誰。全家共用一份，每趟旅行都能沿用。</p>
    <ul class="fam-list">${rs.map((r) => html`<li key=${r.id}>
      <span class="rec-label">${recipientLabel(family, r)}</span>
      <${ConfirmButton} class="btn ghost small danger" label="移除" confirmLabel="確定移除？" onConfirm=${() => save(rs.filter((x) => x.id !== r.id))} />
    </li>`)}</ul>
    <form class="rec-add" onSubmit=${add}>
      <select id="rec-owner" value=${d.ownerId} onChange=${(e) => setD({ ...d, ownerId: e.target.value })} aria-label="誰的">
        ${people.map((p) => html`<option value=${p.id}>${p.name}的</option>`)}
      </select>
      <input id="rec-group" list="rec-groups" value=${d.group} onInput=${(e) => setD({ ...d, group: e.target.value })} placeholder="群組：同事、朋友、家人" aria-label="群組" />
      <datalist id="rec-groups"><option value="同事"></option><option value="朋友"></option><option value="家人"></option></datalist>
      <input id="rec-name" value=${d.name} onInput=${(e) => setD({ ...d, name: e.target.value })} placeholder="個人（可空白），例如：爸爸" aria-label="個人" />
      <button class="btn">新增</button>
    </form>
  </section>`;
}

function InviteRow({ inv }) {
  const url = location.origin + location.pathname + "#/join/" + inv.id;
  const ref = useRef();
  return html`<li class=${"invite" + (inv.active ? "" : " off")}>
    <div class="invite-top"><b>${inv.note || "邀請連結"}</b>
      <span class="muted small">${inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : ""}${inv.active ? "" : "・已停用"}</span></div>
    <div class="invite-url">
      <input ref=${ref} readonly value=${url} onFocus=${(e) => e.target.select()} aria-label="邀請連結" />
      <button class="btn small" onClick=${() => copyText(url, ref.current)}>複製</button>
      <button class="btn ghost small" onClick=${() => store.setInviteActive(inv.id, !inv.active)}>${inv.active ? "停用" : "啟用"}</button>
    </div>
  </li>`;
}

export function Settings() {
  const invites = useSub((cb) => store.onInvites(cb), []);
  const members = useSub((cb) => store.onMembers(cb), []);
  const family = useSub((cb) => store.onFamily(cb), []);
  const [note, setNote] = useState("");
  const me = (members || []).find((m) => (m.uid || m.id) === store.uid);
  const [name, setName] = useState("");
  useEffect(() => me && setName(me.deviceName || ""), [me && me.deviceName]);

  return html`<div class="page settings">
    <header class="topbar"><a class="icon-btn back" href="#/" aria-label="回旅行列表">‹</a><h1>設定</h1></header>
    ${store.mode === "demo" && html`<section class="card-sec warn">
      <h2>示範模式</h2>
      <p>目前是示範模式，資料只存在這台裝置的瀏覽器裡，家人看不到。</p>
      <${ConfirmButton} label="重設示範資料" confirmLabel="確定清除並重設？" onConfirm=${() => { store.resetDemo(); pushToast("已重設示範資料"); }} />
    </section>`}
    ${family && html`<${People} family=${family} />`}
    ${family && html`<${Recipients} family=${family} />`}
    <section class="card-sec">
      <h2>邀請家人</h2>
      <p class="muted">產生一個連結，用 LINE 傳給家人。每台裝置第一次點開連結就會加入，之後直接打開網址就能用。</p>
      <form class="inline-form" onSubmit=${async (e) => { e.preventDefault(); await store.createInvite(note.trim() || "邀請連結"); setNote(""); }}>
        <input id="invite-note" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder="備註，例如：給太太" />
        <button class="btn primary">產生邀請連結</button>
      </form>
      <ul class="invites">${(invites || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((inv) => html`<${InviteRow} key=${inv.id} inv=${inv} />`)}</ul>
    </section>
    <section class="card-sec">
      <h2>這台裝置</h2>
      <form class="inline-form" onSubmit=${(e) => { e.preventDefault(); store.renameDevice(name.trim() || "裝置"); pushToast("已更新名稱"); }}>
        <input id="device-name" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="例如：爸爸的 iPhone" />
        <button class="btn">儲存名稱</button>
      </form>
    </section>
    <section class="card-sec">
      <h2>已加入的裝置</h2>
      <ul class="members">
        ${(members || []).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)).map((m) => {
          const uid = m.uid || m.id;
          return html`<li key=${uid}>
            <span>${m.deviceName || "裝置"}${uid === store.uid ? html` <span class="badge booked">這台</span>` : ""}</span>
            <span class="muted small">${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : ""}</span>
            ${uid !== store.uid && html`<${ConfirmButton} class="btn ghost small danger" label="移除" confirmLabel="確定移除？" onConfirm=${() => store.removeMember(uid)} />`}
          </li>`;
        })}
      </ul>
    </section>
    <section class="card-sec">
      <h2>加到主畫面</h2>
      <p class="muted">iPhone：用 Safari 打開，按分享 → 加入主畫面。Android：用 Chrome 打開，按右上角選單 → 安裝應用程式。加到主畫面後，沒網路也能打開看過的行程。</p>
    </section>
  </div>`;
}
