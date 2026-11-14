// 進入點：登入檢查、路由、旅行列表
import { html, render, useState, useEffect } from "./vendor/preact-htm.js";
import { store } from "./store.js";
import { daysBetween, todayStr } from "./utils.js";
import { useSub, useHash, useOnline, Toasts, Lightbox } from "./ui.js";
import { PdfViewer } from "./files.js";
import { TripPage, TripForm, ImagePick } from "./trip.js";
import { Settings } from "./settings.js";

function Home() {
  const trips = useSub((cb) => store.onTrips(cb), []);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  if (!trips) return html`<div class="center muted">載入中…</div>`;
  const today = todayStr();
  const shown = trips.filter((t) => !q || (t.title || "").toLowerCase().includes(q.toLowerCase()));
  const upcoming = shown.filter((t) => (t.endDate || "") >= today).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  const past = shown.filter((t) => (t.endDate || "") < today).sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  const item = (t) => {
    const n = daysBetween(t.startDate, t.endDate).length;
    const now = t.startDate <= today && today <= t.endDate;
    return html`<div class="trip-item" key=${t.id}>
      <a class="trip-item-main" href=${"#/trip/" + t.id}>
        <span class="trip-item-title">${t.title}${now && html` <span class="badge booked">旅行中</span>`}</span>
        <span class="trip-item-date">${t.startDate} → ${t.endDate}・${n} 天</span>
      </a>
      ${t.cover
        ? html`<a class="trip-cover" href=${"#/trip/" + t.id} tabindex="-1" aria-hidden="true"><img src=${t.cover} alt="" /></a>`
        : html`<${ImagePick} id=${"cover-" + t.id} class="trip-cover empty" label="＋ 封面圖" onPick=${(c) => store.updateTrip(t.id, { cover: c })} />`}
    </div>`;
  };
  return html`<div class="page home">
    <header class="topbar">
      <h1>我們家的旅行</h1>
      <a class="btn ghost" href="#/settings">設定</a>
    </header>
    <div class="home-tools">
      <input id="trip-search" class="search" type="search" placeholder="搜尋旅行名稱" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <button class="btn primary" onClick=${() => setCreating(true)}>＋ 新旅行</button>
    </div>
    <section class="trip-group">
      <h2 class="eyebrow">即將出發與進行中</h2>
      ${upcoming.length ? upcoming.map(item) : html`<p class="muted">還沒有排定的旅行。按「＋ 新旅行」開始規劃。</p>`}
    </section>
    ${past.length > 0 && html`<section class="trip-group">
      <h2 class="eyebrow">過去的旅行</h2>
      ${past.map(item)}
    </section>`}
    ${creating && html`<${TripForm} onClose=${() => setCreating(false)} />`}
  </div>`;
}

function JoinPage({ token, onJoined }) {
  const [err, setErr] = useState("");
  useEffect(() => {
    store.join(token)
      .then(() => {
        history.replaceState(null, "", location.pathname + location.search + "#/");
        onJoined();
      })
      .catch((e) => {
        console.error(e);
        setErr(navigator.onLine ? "這個邀請連結無效或已停用，請向家人要一個新的。" : "第一次加入需要網路，請連上網路後再點一次連結。");
      });
  }, [token]);
  return html`<div class="center">${err ? html`<p class="error">${err}</p>` : html`<p class="muted">加入中…</p>`}</div>`;
}

function Guest() {
  return html`<div class="center guest">
    <h1>我們家的旅行</h1>
    <p>這是私人的家庭旅遊工具。</p>
    <p class="muted">請用家人傳給你的邀請連結打開。</p>
  </div>`;
}

function App() {
  const hash = useHash();
  const online = useOnline();
  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState("");

  const check = async () => setPhase((await store.isMember()) ? "member" : "guest");
  useEffect(() => {
    (async () => {
      try {
        await store.init();
        await check();
      } catch (e) {
        console.error(e);
        setError(navigator.onLine ? "連線失敗：" + (e.message || e) : "第一次使用需要網路，請連上網路後重新整理。");
        setPhase("error");
      }
    })();
  }, []);

  const parts = hash.replace(/^#\/?/, "").split("/");
  let body;
  if (phase === "loading") body = html`<div class="center muted">載入中…</div>`;
  else if (phase === "error") body = html`<div class="center"><p class="error">${error}</p></div>`;
  else if (parts[0] === "join" && parts[1] && phase !== "member") body = html`<${JoinPage} token=${parts[1]} onJoined=${check} />`;
  else if (phase !== "member") body = html`<${Guest} />`;
  else if (parts[0] === "trip" && parts[1]) body = html`<${TripPage} key=${parts[1]} id=${parts[1]} />`;
  else if (parts[0] === "settings") body = html`<${Settings} />`;
  else {
    if (parts[0] === "join") history.replaceState(null, "", location.pathname + location.search + "#/");
    body = html`<${Home} />`;
  }

  return html`
    ${store.mode === "demo" && phase === "member" && html`<div class="demo-bar">示範模式：資料只存在這台裝置。<a href="#/settings">了解</a></div>`}
    ${!online && html`<div class="offline-bar">離線中。看過的行程都能打開，修改會在恢復網路後同步。</div>`}
    ${body}
    <${Toasts} /><${Lightbox} /><${PdfViewer} />`;
}

render(html`<${App} />`, document.getElementById("app"));
