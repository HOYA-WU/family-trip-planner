// 地圖：嵌入 Google 我的地圖（地圖本身還是在 Google 那邊編輯）
import { html } from "../vendor/preact-htm.js";
import { store } from "../store.js";
import { useTrip, useOnline, LazyInput } from "../ui.js";

export function myMapsId(url) {
  try {
    return new URL(url).searchParams.get("mid") || "";
  } catch {
    return "";
  }
}

export function Full() {
  const { trip } = useTrip();
  const mid = myMapsId(trip.mapUrl || "");
  return html`<div class="stack">
    ${mid
      ? html`<iframe class="mymap" src=${`https://www.google.com/maps/d/embed?mid=${encodeURIComponent(mid)}&hl=zh-TW`} title="Google 我的地圖" loading="lazy"></iframe>
        <div class="row-start">
          <a class="btn primary" href=${`https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(mid)}`} target="_blank" rel="noopener">在 Google 地圖開啟</a>
          <a class="btn ghost" href=${`https://www.google.com/maps/d/edit?mid=${encodeURIComponent(mid)}`} target="_blank" rel="noopener">編輯地圖</a>
        </div>`
      : html`<p class="muted">貼上這趟的「Google 我的地圖」連結，就會顯示在這裡。</p>`}
    <label class="field"><span>我的地圖連結</span>
      <${LazyInput} id="map-url" value=${trip.mapUrl || ""} placeholder="https://www.google.com/maps/d/…mid=…"
        onSave=${(v) => store.updateTrip(trip.id, { mapUrl: v.trim() })} />
    </label>
    ${trip.mapUrl && !mid && html`<p class="error">這個連結裡找不到地圖編號（mid），請從我的地圖的網址列複製完整連結。</p>`}
    <p class="hint">地圖要設成「知道連結的人可以檢視」才看得到（我的地圖 → 分享）。地圖沒網路時無法顯示，出發前建議在 Google Maps 下載當地的離線地圖。</p>
  </div>`;
}

export function Summary({ onOpen }) {
  const { trip } = useTrip();
  const online = useOnline();
  const mid = myMapsId(trip.mapUrl || "");
  if (!mid) return html`<p class="muted small">還沒有設定地圖。打開後貼上 Google 我的地圖連結。</p>`;
  return html`<div class="sum">
    ${online
      ? html`<button class="map-mini" onClick=${onOpen} aria-label="打開地圖">
          <iframe src=${`https://www.google.com/maps/d/embed?mid=${encodeURIComponent(mid)}&hl=zh-TW`} title="地圖預覽" loading="lazy" tabindex="-1"></iframe>
        </button>`
      : html`<div class="map-ph">🗺 沒網路時無法顯示地圖</div>`}
    <a class="btn small" href=${`https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(mid)}`} target="_blank" rel="noopener" onClick=${(e) => e.stopPropagation()}>在 Google 地圖開啟</a>
  </div>`;
}
