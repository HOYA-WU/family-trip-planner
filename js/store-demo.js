// 示範模式：資料存在這台裝置的瀏覽器（localStorage），不會同步給其他人。
// 介面和 store-firebase.js 一模一樣，App 不需要知道現在是哪一種。
import { newId } from "./utils.js";

const KEY = "ftp-demo-data-v1";

function seed() {
  const tripId = "demo-australia";
  const c = (day, order, type, title, extra = {}) => {
    const id = newId();
    return [id, { id, day, order, type, title, status: "normal", time: "", endTime: "", notes: "", location: "", links: [], booking: "", ...extra }];
  };
  const cards = Object.fromEntries([
    c("2026-02-07", 1000, "move", "家 → 桃園機場", { time: "21:00" }),
    c("2026-02-07", 2000, "move", "QF8728 台北 → 墨爾本", { time: "23:45", status: "booked" }),
    c("2026-02-08", 1000, "move", "機場取車", { time: "12:30" }),
    c("2026-02-08", 2000, "stay", "Lifestyle Apartments at Ferntree"),
    c("2026-02-08", 3000, "shop", "超市買隔天早餐和零食"),
    c("2026-02-08", 4000, "sight", "Brighton 彩虹小屋", { status: "cancelled", notes: "Brighton beach 和 Dendy Street Beach 之間，一排彩色木造小屋。" }),
    c("2026-02-08", 5000, "food", "FT Local Kitchen and Bar 晚餐", { time: "18:30", status: "booked" }),
    c("2026-02-09", 1000, "food", "早餐", { notes: "前一晚超市採買" }),
    c("2026-02-09", 2000, "sight", "Puffing Billy 蒸汽火車", { time: "10:00", status: "booked", notes: "9:00 開始 check-in\n10:00 Belgrave 出發，12:25 Lakeside", links: [{ label: "攻略", url: "https://minahaha.com/puffing-billy-railway/" }] }),
    c("2026-02-09", 3000, "food", "午餐 Lakeside coffee", { time: "12:30" }),
    c("2026-02-09", 4000, "sight", "無尾熊保育中心 Koala Conservation Centre", { time: "15:00", notes: "規模不大，停留 30 分鐘–1 小時就夠。" }),
    c("2026-02-09", 5000, "food", "Fish & Chips! Cowes General Store", { time: "17:00" }),
    c("2026-02-09", 6000, "sight", "菲利普島看企鵝歸巢", { time: "18:30", status: "booked", location: "1019 Ventnor Road, Summerlands", notes: "**穿什麼**\n- 全天候戶外活動，準備防風保暖衣物\n- 帶毯子、雙筒望遠鏡\n\n**注意**\n- 日落後禁止拍照\n- 依門票場次時間到達，停車後記得記車位", links: [{ label: "企鵝歸巢攻略", url: "https://yukigo.tw/penguin-parade/" }] }),
    c("2026-02-09", 7000, "stay", "NRMA Phillip Island Beachfront Holiday Park"),
    c("2026-02-10", 1000, "food", "Miss Marple's Tearoom 早午餐", { time: "11:00", notes: "11:00 開門，不可預約" }),
    c("2026-02-10", 2000, "shop", "Soap Opera 香氛店"),
    c("2026-02-10", 3000, "food", "BGM Burgers Geelong 晚餐"),
    c("2026-02-10", 4000, "move", "Spirit of Tasmania 渡輪", { time: "19:30", status: "booked", notes: "開船前 2.5 小時可以 check-in" }),
    c("2026-02-11", 1000, "food", "早餐 Drift", { time: "08:45", notes: "備案：Laneway" }),
    c("2026-02-11", 2000, "sight", "Mersey Bluff 燈塔"),
    c("2026-02-11", 3000, "food", "Ghost Rock Wines 午餐", { time: "12:30", status: "booked" }),
    c("2026-02-11", 4000, "stay", "Hawley House"),
    c("", 1000, "sight", "塔馬河濕地公園", { notes: "還沒決定要不要去" }),
  ]);
  const todos = Object.fromEntries(
    [["機票", true], ["飯店", true], ["訂船票", true], ["Puffing Billy 車票", true], ["企鵝歸巢門票", true], ["租車", true], ["e-sim", false], ["換澳幣", false], ["貓保母", false], ["買輕便防寒外套", false]].map(([text, done], i) => {
      const id = newId();
      return [id, { id, text, done, order: (i + 1) * 1000 }];
    })
  );
  return {
    trips: {
      [tripId]: { id: tripId, title: "2026 寒假澳洲之旅（示範）", startDate: "2026-02-07", endDate: "2026-02-20", dayLabels: { "2026-02-08": "墨爾本", "2026-02-09": "菲利普島", "2026-02-10": "搭船", "2026-02-11": "Devonport" }, createdAt: Date.now() },
    },
    cards: { [tripId]: cards },
    todos: { [tripId]: todos },
    invites: {},
    members: { "demo-device": { uid: "demo-device", deviceName: "這台裝置", joinedAt: Date.now() } },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return seed();
}

let db = load();
const listeners = new Set();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {}
  // 用 microtask 通知，模擬 Firestore 的非同步回呼
  queueMicrotask(() => listeners.forEach((fn) => fn()));
}
function watch(compute, cb) {
  const fn = () => cb(compute());
  listeners.add(fn);
  queueMicrotask(fn);
  return () => listeners.delete(fn);
}
const clone = (v) => JSON.parse(JSON.stringify(v));

export const store = {
  mode: "demo",
  uid: "demo-device",
  async init() {},
  async isMember() {
    return true;
  },
  async join() {},

  onTrips: (cb) => watch(() => clone(Object.values(db.trips)), cb),
  onTrip: (id, cb) => watch(() => (db.trips[id] ? clone(db.trips[id]) : null), cb),
  async createTrip(data) {
    const id = newId();
    db.trips[id] = { id, dayLabels: {}, createdAt: Date.now(), ...data };
    db.cards[id] = {};
    db.todos[id] = {};
    save();
    return id;
  },
  async updateTrip(id, patch) {
    Object.assign(db.trips[id], patch);
    save();
  },
  async deleteTrip(id) {
    delete db.trips[id];
    delete db.cards[id];
    delete db.todos[id];
    save();
  },

  onCards: (tripId, cb) => watch(() => clone(Object.values(db.cards[tripId] || {})), cb),
  async addCard(tripId, data) {
    const id = newId();
    (db.cards[tripId] ||= {})[id] = { id, ...data };
    save();
    return id;
  },
  async updateCard(tripId, id, patch) {
    Object.assign(db.cards[tripId][id], patch);
    save();
  },
  async deleteCard(tripId, id) {
    delete db.cards[tripId][id];
    save();
  },

  onTodos: (tripId, cb) => watch(() => clone(Object.values(db.todos[tripId] || {})), cb),
  async addTodo(tripId, data) {
    const id = newId();
    (db.todos[tripId] ||= {})[id] = { id, ...data };
    save();
  },
  async updateTodo(tripId, id, patch) {
    Object.assign(db.todos[tripId][id], patch);
    save();
  },
  async deleteTodo(tripId, id) {
    delete db.todos[tripId][id];
    save();
  },

  onInvites: (cb) => watch(() => clone(Object.values(db.invites)), cb),
  async createInvite(note) {
    const token = newId(32);
    db.invites[token] = { id: token, note, active: true, createdAt: Date.now() };
    save();
    return token;
  },
  async setInviteActive(token, active) {
    db.invites[token].active = active;
    save();
  },
  onMembers: (cb) => watch(() => clone(Object.values(db.members)), cb),
  async removeMember(uid) {
    delete db.members[uid];
    save();
  },
  async renameDevice(name) {
    db.members[this.uid].deviceName = name;
    save();
  },

  resetDemo() {
    db = seed();
    save();
  },
};
