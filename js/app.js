// 進入點：登入檢查、路由、旅行列表
import { html, render, useState, useEffect } from "./vendor/preact-htm.js";
import { store } from "./store.js";
import { daysBetween, todayStr } from "./utils.js";
import { useSub, useHash, useOnline, Toasts, Lightbox, pushToast } from "./ui.js";
import { copyTrip, importTrip, COPY_MODES } from "./transfer.js";
import { PdfViewer } from "./files.js";
import { TripPage, TripForm, ImagePick } from "./trip.js";
import { Settings } from "./settings.js";

function CopyDialog({ trips, onClose }) {
  const sorted = [...trips].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
  const [srcId, setSrcId] = useState(sorted[0]?.id || "");
  const [mode, setMode] = useState("full");
  const src = trips.find((t) => t.id === srcId);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!src) return pushToast("請選要複製的旅行");
    if (!start) return pushToast("請選新的出發日期");
    setBusy(true);
    try {
      const id = await copyTrip(src, { mode, title: title.trim() || `${src.title}（複製）`, startDate: start });
      onClose();
      location.hash = "#/trip/" + id;
    } catch (err) {
      pushToast("複製失敗：" + (err.message || err));
      setBusy(false);
    }
  };
  return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <form class="dialog" onSubmit=${submit}>
      <h2>複製舊行程</h2>
      <label class="field"><span>從哪一趟複製</span>
        <select id="copy-src" value=${srcId} onChange=${(e) => setSrcId(e.target.value)}>
          ${sorted.map((t) => html`<option value=${t.id}>${t.title}（${t.startDate}）</option>`)}
        </select></label>
      <div class="field"><span>複製哪些</span>
        <div class="radio-list">${COPY_MODES.map((m) => html`<label key=${m.id} class=${"radio" + (mode === m.id ? " on" : "")}>
          <input type="radio" name="copy-mode" checked=${mode === m.id} onChange=${() => setMode(m.id)} />
          <span><b>${m.label}</b><span class="muted small">${m.hint}</span></span></label>`)}</div>
      </div>
      <label class="field"><span>新旅行名稱</span><input id="copy-title" value=${title} onInput=${(e) => setTitle(e.target.value)} placeholder=${src ? `${src.title}（複製）` : ""} /></label>
      <label class="field"><span>新的出發日期（天數和原本一樣：${src ? daysBetween(src.startDate, src.endDate).length : 0} 天）</span>
        <input id="copy-start" type="date" value=${start} onInput=${(e) => setStart(e.target.value)} /></label>
      <div class="dialog-actions"><span class="spacer"></span>
        <button type="button" class="btn" onClick=${onClose}>取消</button>
        <button class="btn primary" disabled=${busy}>${busy ? "複製中…" : "複製"}</button>
      </div>
    </form>
  </div>`;
}

function ImportButton() {
  const [busy, setBusy] = useState(false);
  const onChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const id = await importTrip(JSON.parse(await file.text()));
      pushToast("已匯入");
      location.hash = "#/trip/" + id;
    } catch (err) {
      pushToast("匯入失敗：" + (err.message || err));
    }
    setBusy(false);
  };
  return html`<label class="btn ghost small" for="import-file">${busy ? "匯入中…" : "匯入備份"}
    <input id="import-file" type="file" accept="application/json,.json" class="visually-hidden" onChange=${onChange} disabled=${busy} /></label>`;
}

// 搜尋行程內容：有打字才去讀所有旅行的卡片
function useCardIndex(trips, active) {
  const [index, setIndex] = useState(null);
  // 清空搜尋框時丟掉索引，下次搜尋重新讀，才會是最新的
  useEffect(() => {
    if (!active) setIndex(null);
  }, [active]);
  useEffect(() => {
    if (!active || index || !trips) return;
    (async () => {
      const out = [];
      for (const t of trips) {
        try {
          for (const c of await store.getSub(t.id, "cards")) out.push({ trip: t, card: c });
        } catch {}
      }
      setIndex(out);
    })();
  }, [active, trips?.length]);
  return index;
}

function Home() {
  const trips = useSub((cb) => store.onTrips(cb), []);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [copying, setCopying] = useState(false);
  const query = q.trim().toLowerCase();
  const index = useCardIndex(trips, !!query);
  if (!trips) return html`<div class="center muted">載入中…</div>`;
  const today = todayStr();
  const shown = trips.filter((t) => !query || (t.title || "").toLowerCase().includes(query));
  const hits = query && index
    ? index.filter(({ card: c }) => [c.title, c.notes, c.location, c.booking].some((s) => (s || "").toLowerCase().includes(query))).slice(0, 30)
    : [];
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
      <input id="trip-search" class="search" type="search" placeholder="搜尋旅行或行程內容，例如：企鵝" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <button class="btn primary" onClick=${() => setCreating(true)}>＋ 新旅行</button>
    </div>
    <div class="home-sub">
      ${trips.length > 0 && html`<button class="btn ghost small" onClick=${() => setCopying(true)}>複製舊行程</button>`}
      <${ImportButton} />
    </div>
    ${query && html`<section class="trip-group">
      <h2 class="eyebrow">行程內容</h2>
      ${!index && html`<p class="muted small">搜尋中…</p>`}
      ${index && !hits.length && html`<p class="muted small">沒有找到「${q.trim()}」。</p>`}
      ${hits.map(({ trip: t, card: c }) => html`<a class="hit" key=${t.id + c.id} href=${"#/trip/" + t.id}>
        <b>${c.title || "（未命名）"}</b>
        <span class="muted small">${t.title}${c.day ? `・${c.day.slice(5).replace("-", "/")}` : "・待排"}</span>
      </a>`)}
    </section>`}
    <section class="trip-group">
      <h2 class="eyebrow">即將出發與進行中</h2>
      ${upcoming.length ? upcoming.map(item) : html`<p class="muted">${query ? "沒有符合的旅行名稱。" : "還沒有排定的旅行。按「＋ 新旅行」開始規劃。"}</p>`}
    </section>
    ${past.length > 0 && html`<section class="trip-group">
      <h2 class="eyebrow">過去的旅行</h2>
      ${past.map(item)}
    </section>`}
    ${creating && html`<${TripForm} onClose=${() => setCreating(false)} />`}
    ${copying && html`<${CopyDialog} trips=${trips} onClose=${() => setCopying(false)} />`}
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

// 從邀請連結（或直接貼邀請碼）取出邀請碼
function tokenFrom(text) {
  const t = (text || "").trim();
  const m = t.match(/#\/join\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9]{16,}$/.test(t) ? t : "";
}

// iPhone「加入主畫面」後的 App 和 Safari 是分開的，要在 App 裡再加入一次：貼上邀請連結即可
function Guest({ onJoined }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const token = tokenFrom(text);
    if (!token) return setErr("看起來不是邀請連結，請貼上完整的連結。");
    setBusy(true);
    setErr("");
    try {
      await store.join(token);
      onJoined();
    } catch (e2) {
      console.error(e2);
      setErr(navigator.onLine ? "這個邀請連結無效或已停用，請向家人要一個新的。" : "加入需要網路，請連上網路後再試。");
    }
    setBusy(false);
  };
  return html`<div class="center guest">
    <h1>我們家的旅行</h1>
    <p>這是私人的家庭旅遊工具。</p>
    <p class="muted">請用家人傳給你的邀請連結打開。</p>
    <form class="guest-join" onSubmit=${submit}>
      <label class="field"><span>如果是從主畫面打開，請在這裡貼上邀請連結</span>
        <input id="join-link" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="https://…/#/join/…" autocomplete="off" autocapitalize="off" spellcheck="false" />
      </label>
      ${err && html`<p class="error">${err}</p>`}
      <button class="btn primary" disabled=${busy || !text.trim()}>${busy ? "加入中…" : "加入"}</button>
      <p class="hint">在 LINE 長按邀請連結 → 拷貝，再回到這裡貼上。</p>
    </form>
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
  else if (phase !== "member") body = html`<${Guest} onJoined=${check} />`;
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
