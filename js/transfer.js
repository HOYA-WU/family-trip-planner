// 複製舊行程、匯出／匯入整趟旅行
import { store } from "./store.js";
import { daysBetween, parseDate, fmtDate } from "./utils.js";
import { SUBS } from "./model.js";

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const strip = ({ id, ...rest }) => rest;

export const COPY_MODES = [
  { id: "full", label: "完整複製", hint: "卡片、待辦、清單、連結、筆記都複製，日期自動平移；訂位資訊、花費、附件不複製" },
  { id: "lists", label: "只複製清單類", hint: "待辦、行李、採購、伴手禮清單（全部改回未勾選）" },
  { id: "structure", label: "只複製架構", hint: "區塊設定、每天的地點、清單名稱；卡片和項目都是空的" },
];

export async function copyTrip(src, { mode, title, startDate }) {
  const len = daysBetween(src.startDate, src.endDate).length;
  const offset = dayDiff(src.startDate, startDate);
  const shift = (d) => (d ? addDays(d, offset) : d);
  const dayLabels = mode === "lists" ? {} : Object.fromEntries(Object.entries(src.dayLabels || {}).map(([k, v]) => [shift(k), v]));
  const id = await store.createTrip({
    title, startDate, endDate: addDays(startDate, len - 1),
    countries: src.countries || [], travelerIds: src.travelerIds || null,
    rates: src.rates || {}, ratesDate: src.ratesDate || "",
    blocks: src.blocks || [], dayLabels, mapUrl: src.mapUrl || "", cover: src.cover || "",
  });

  const listMap = {};
  for (const l of await store.getSub(src.id, "lists")) listMap[l.id] = await store.addSub(id, "lists", strip(l));
  if (mode !== "structure") {
    for (const it of await store.getSub(src.id, "listItems"))
      if (listMap[it.listId]) await store.addSub(id, "listItems", { ...strip(it), listId: listMap[it.listId], done: false });
    for (const t of await store.getSub(src.id, "todos")) await store.addSub(id, "todos", { ...strip(t), done: false });
  }
  if (mode === "full") {
    for (const c of await store.getSub(src.id, "cards"))
      await store.addSub(id, "cards", { ...strip(c), day: shift(c.day), images: [], booking: "", status: c.status === "booked" ? "normal" : c.status || "normal" });
    for (const l of await store.getSub(src.id, "links")) await store.addSub(id, "links", strip(l));
    for (const n of await store.getSub(src.id, "notes")) await store.setSub(id, "notes", n.id, strip(n));
  }
  return id;
}

// ---- 匯出：整趟旅行（含附件）存成一個 JSON 檔 ----
export async function exportTrip(trip) {
  const subs = {};
  for (const s of SUBS) if (s !== "files") subs[s] = await store.getSub(trip.id, s);
  const files = [];
  for (const f of await store.getSub(trip.id, "files")) {
    const data = await store.getFileData(trip.id, f);
    const { chunks, ...meta } = f;
    files.push({ ...meta, data });
  }
  const json = { app: "family-trip-planner", version: 1, exportedAt: new Date().toISOString(), trip, subs, files };
  const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${trip.title || "trip"}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
}

// ---- 匯入：建立一趟新的旅行，所有 id 重新編號 ----
export async function importTrip(json) {
  if (!json || json.app !== "family-trip-planner" || !json.trip) throw new Error("這不是本工具匯出的備份檔");
  const { id: _old, ...t } = json.trip;
  const id = await store.createTrip({ ...t, title: t.title || "匯入的旅行" });
  const subs = json.subs || {};
  const fileMap = {};
  for (const f of json.files || []) {
    const { id: oldId, data, createdAt, ...meta } = f;
    if (data) fileMap[oldId] = await store.putFile(id, meta, data);
  }
  const mapFiles = (xs) => (xs || []).map((x) => fileMap[x]).filter(Boolean);

  const listMap = {};
  for (const l of subs.lists || []) listMap[l.id] = await store.addSub(id, "lists", strip(l));
  for (const it of subs.listItems || []) if (listMap[it.listId]) await store.addSub(id, "listItems", { ...strip(it), listId: listMap[it.listId] });
  const cardMap = {};
  for (const c of subs.cards || []) cardMap[c.id] = await store.addSub(id, "cards", { ...strip(c), images: mapFiles(c.images) });
  for (const s of ["flights", "tickets"]) for (const x of subs[s] || []) await store.addSub(id, s, { ...strip(x), files: mapFiles(x.files) });
  for (const o of subs.outfits || []) await store.setSub(id, "outfits", o.id, { ...strip(o), imageId: fileMap[o.imageId] || "" });
  for (const x of subs.expenses || []) {
    const data = { ...strip(x), receiptId: fileMap[x.receiptId] || "" };
    if (x.cardId && cardMap[x.cardId]) await store.setSub(id, "expenses", "c_" + cardMap[x.cardId], { ...data, cardId: cardMap[x.cardId] });
    else await store.addSub(id, "expenses", { ...data, cardId: "" });
  }
  for (const n of subs.notes || []) await store.setSub(id, "notes", n.id, strip(n));
  for (const s of ["todos", "links"]) for (const x of subs[s] || []) await store.addSub(id, s, strip(x));
  return id;
}
