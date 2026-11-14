// 示範模式：資料存在這台裝置的瀏覽器（localStorage），不會同步給其他人。
// 介面和 store-firebase.js 一模一樣，App 不需要知道現在是哪一種。
import { newId } from "./utils.js";
import { SUBS, defaultFamily } from "./model.js";

const KEY = "ftp-demo-data-v2";

function seed() {
  const tripId = "demo-australia";
  const sub = Object.fromEntries(SUBS.map((s) => [s, {}]));
  const put = (s, data) => {
    const id = data.id || newId();
    sub[s][id] = { id, ...data };
    return id;
  };
  const c = (day, order, type, title, extra = {}) =>
    put("cards", { day, order, type, title, status: "normal", time: "", endTime: "", notes: "", location: "", links: [], booking: "", images: [], ...extra });
  c("2026-02-07", 1000, "move", "家 → 桃園機場", { time: "21:00" });
  c("2026-02-07", 2000, "move", "QF8728 台北 → 墨爾本", { time: "23:45", status: "booked" });
  c("2026-02-08", 1000, "move", "機場取車", { time: "12:30" });
  c("2026-02-08", 2000, "stay", "Lifestyle Apartments at Ferntree");
  c("2026-02-08", 3000, "shop", "超市買隔天早餐和零食");
  c("2026-02-08", 4000, "sight", "Brighton 彩虹小屋", { status: "cancelled", notes: "Brighton beach 和 Dendy Street Beach 之間，一排彩色木造小屋。" });
  c("2026-02-08", 5000, "food", "FT Local Kitchen and Bar 晚餐", { time: "18:30", status: "booked" });
  c("2026-02-09", 1000, "food", "早餐", { notes: "前一晚超市採買" });
  c("2026-02-09", 2000, "sight", "Puffing Billy 蒸汽火車", { time: "10:00", status: "booked", notes: "9:00 開始 check-in\n10:00 Belgrave 出發，12:25 Lakeside", links: [{ label: "攻略", url: "https://minahaha.com/puffing-billy-railway/" }] });
  c("2026-02-09", 3000, "food", "午餐 Lakeside coffee", { time: "12:30" });
  c("2026-02-09", 4000, "sight", "無尾熊保育中心 Koala Conservation Centre", { time: "15:00", notes: "規模不大，停留 30 分鐘–1 小時就夠。" });
  c("2026-02-09", 5000, "food", "Fish & Chips! Cowes General Store", { time: "17:00" });
  c("2026-02-09", 6000, "sight", "菲利普島看企鵝歸巢", { time: "18:30", status: "booked", location: "1019 Ventnor Road, Summerlands", notes: "**穿什麼**\n- 全天候戶外活動，準備防風保暖衣物\n- 帶毯子、雙筒望遠鏡\n\n**注意**\n- 日落後禁止拍照\n- 依門票場次時間到達，停車後記得記車位", links: [{ label: "企鵝歸巢攻略", url: "https://yukigo.tw/penguin-parade/" }] });
  c("2026-02-09", 7000, "stay", "NRMA Phillip Island Beachfront Holiday Park");
  c("2026-02-10", 1000, "food", "Miss Marple's Tearoom 早午餐", { time: "11:00", notes: "11:00 開門，不可預約" });
  c("2026-02-10", 2000, "shop", "Soap Opera 香氛店");
  c("2026-02-10", 3000, "food", "BGM Burgers Geelong 晚餐");
  c("2026-02-10", 4000, "move", "Spirit of Tasmania 渡輪", { time: "19:30", status: "booked", notes: "開船前 2.5 小時可以 check-in" });
  c("2026-02-11", 1000, "food", "早餐 Drift", { time: "08:45", notes: "備案：Laneway" });
  c("2026-02-11", 2000, "sight", "Mersey Bluff 燈塔");
  c("2026-02-11", 3000, "food", "Ghost Rock Wines 午餐", { time: "12:30", status: "booked" });
  c("2026-02-11", 4000, "stay", "Hawley House");
  c("", 1000, "sight", "塔馬河濕地公園", { notes: "還沒決定要不要去" });

  [["機票", true], ["飯店", true], ["訂船票", true], ["Puffing Billy 車票", true], ["企鵝歸巢門票", true], ["租車", true], ["e-sim", false], ["換澳幣", false], ["貓保母", false], ["買輕便防寒外套", false]]
    .forEach(([text, done], i) => put("todos", { text, done, order: (i + 1) * 1000 }));

  put("flights", {
    order: 1000, pnr: "DEMO12", note: "托運行李 30 公斤 x1", files: [],
    segments: [
      { flightNo: "QF8728", airline: "澳洲航空（華航營運）", from: "TPE", fromTerminal: "T2", depart: "2026-02-07T23:45", depTz: "+8", to: "MEL", toTerminal: "T2", arrive: "2026-02-08T12:05", arrTz: "+10", cabin: "經濟艙" },
    ],
  });
  put("flights", {
    order: 2000, pnr: "DEMO12", note: "新加坡轉機 3 小時 55 分", files: [],
    segments: [
      { flightNo: "QF37", airline: "澳洲航空", from: "MEL", fromTerminal: "T2", depart: "2026-02-19T16:55", depTz: "+10", to: "SIN", toTerminal: "T1", arrive: "2026-02-19T22:05", arrTz: "+8", cabin: "經濟艙" },
      { flightNo: "QF8741", airline: "澳洲航空（華航營運）", from: "SIN", fromTerminal: "T3", depart: "2026-02-20T02:00", depTz: "+8", to: "TPE", toTerminal: "T1", arrive: "2026-02-20T06:40", arrTz: "+8", cabin: "經濟艙" },
    ],
  });
  put("tickets", { order: 1000, title: "Puffing Billy 蒸汽火車", date: "2026-02-09", time: "10:00", bookingNo: "DEMO-001", note: "一小時前開始 check-in", files: [] });
  put("tickets", { order: 2000, title: "菲利普島企鵝歸巢", date: "2026-02-09", time: "18:30", bookingNo: "DEMO-002", note: "", files: [] });
  put("tickets", { order: 3000, title: "Spirit of Tasmania 去程", date: "2026-02-10", time: "22:00", bookingNo: "DEMO-003", note: "開船前 2.5 小時可以 check-in", files: [] });

  const fam = defaultFamily();
  const [me, wife, kid] = fam.people;
  const gifts = put("lists", { title: "伴手禮", kind: "gift", order: 3000 });
  const shop = put("lists", { title: "採購", kind: "shopping", order: 2000 });
  put("lists", { title: "行李", kind: "packing", order: 1000 });
  put("listItems", { listId: gifts, text: "Tim Tam", qty: 6, recipients: [fam.recipients[0].id], done: true, order: 1000 });
  put("listItems", { listId: gifts, text: "Aesop 護手霜", qty: 1, recipients: [fam.recipients[5].id], done: false, order: 2000 });
  put("listItems", { listId: shop, text: "UGG 拖鞋", owner: me.id, done: false, order: 1000 });
  put("listItems", { listId: shop, text: "Lululemon 瑜伽褲", owner: wife.id, done: false, order: 2000 });
  put("outfits", { id: `2026-02-09_${me.id}`, date: "2026-02-09", personId: me.id, text: "北極熊藍T＋白短褲" });
  put("outfits", { id: `2026-02-08_${me.id}`, date: "2026-02-08", personId: me.id, text: "藍T＋白長褲（Zara）" });
  put("expenses", { date: "2026-02-09", title: "Puffing Billy 車票", amount: 268, currency: "AUD", category: "ticket" });
  put("expenses", { date: "2026-02-11", title: "Ghost Rock 午餐", amount: 210, currency: "AUD", category: "food" });
  put("expenses", { date: "2026-01-10", title: "貓保母", amount: 3000, currency: "TWD", category: "other" });
  put("links", { order: 1000, label: "2025 澳洲必買伴手禮", url: "https://www.pandafisheat.com/" });

  return {
    trips: {
      [tripId]: {
        id: tripId, title: "2026 寒假澳洲之旅（示範）", startDate: "2026-02-07", endDate: "2026-02-20",
        countries: ["AU"], rates: { AUD: 21.3 }, travelerIds: [me.id, wife.id, kid.id],
        dayLabels: { "2026-02-08": "墨爾本", "2026-02-09": "菲利普島", "2026-02-10": "搭船", "2026-02-11": "Devonport" },
        createdAt: Date.now(),
      },
    },
    sub: { [tripId]: sub },
    family: fam,
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
  } catch (e) {
    store.onError(new Error("示範模式的瀏覽器空間滿了（大約 5MB），請刪掉一些附件"));
  }
  queueMicrotask(() => listeners.forEach((fn) => fn()));
}
function watch(compute, cb) {
  const fn = () => cb(compute());
  listeners.add(fn);
  queueMicrotask(fn);
  return () => listeners.delete(fn);
}
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const subOf = (tripId, s) => (((db.sub[tripId] ||= {})[s]) ||= {});

export const store = {
  mode: "demo",
  uid: "demo-device",
  onError: (e) => console.error(e),
  async init() {},
  async isMember() {
    return true;
  },
  async join() {},

  onTrips: (cb) => watch(() => clone(Object.values(db.trips)), cb),
  onTrip: (id, cb) => watch(() => (db.trips[id] ? clone(db.trips[id]) : null), cb),
  async createTrip(data) {
    const id = newId();
    db.trips[id] = { id, dayLabels: {}, createdAt: Date.now(), ...clone(data) };
    save();
    return id;
  },
  async updateTrip(id, patch) {
    Object.assign(db.trips[id], clone(patch));
    save();
  },
  async deleteTrip(id) {
    delete db.trips[id];
    delete db.sub[id];
    save();
  },

  // 旅行底下的各種資料（卡片、待辦、航班、清單…）共用這一組
  onSub: (tripId, s, cb) => watch(() => clone(Object.values(subOf(tripId, s))), cb),
  async getSub(tripId, s) {
    return clone(Object.values(subOf(tripId, s)));
  },
  async getTrips() {
    return clone(Object.values(db.trips));
  },
  async addSub(tripId, s, data) {
    const id = newId();
    subOf(tripId, s)[id] = { id, ...clone(data) };
    save();
    return id;
  },
  async setSub(tripId, s, id, data) {
    subOf(tripId, s)[id] = { id, ...(subOf(tripId, s)[id] || {}), ...clone(data) };
    save();
  },
  async updateSub(tripId, s, id, patch) {
    const doc = subOf(tripId, s)[id];
    if (doc) Object.assign(doc, clone(patch));
    save();
  },
  async deleteSub(tripId, s, id) {
    delete subOf(tripId, s)[id];
    save();
  },

  // 附件（圖片、PDF）：data 是 data URL
  async putFile(tripId, meta, data) {
    const id = newId();
    subOf(tripId, "files")[id] = { id, ...meta, createdAt: Date.now(), data };
    save();
    return id;
  },
  async getFileData(tripId, file) {
    return subOf(tripId, "files")[file.id]?.data || file.data || "";
  },
  async prefetchFile() {},
  async deleteFile(tripId, id) {
    delete subOf(tripId, "files")[id];
    save();
  },

  // 全家共用的設定：家庭成員、送禮對象
  onFamily: (cb) => watch(() => clone(db.family || defaultFamily()), cb),
  async updateFamily(patch) {
    db.family = { ...(db.family || defaultFamily()), ...clone(patch) };
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
