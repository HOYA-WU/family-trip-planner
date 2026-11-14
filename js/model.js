// 資料結構的共用定義
import { newId } from "./utils.js";

// 每趟旅行底下的資料集合（Firestore 子集合）
export const SUBS = ["cards", "todos", "flights", "tickets", "lists", "listItems", "outfits", "expenses", "links", "notes", "files"];

// 區塊：內建的每趟各一個；筆記、附件可以新增多個
export const BUILTIN_BLOCKS = [
  { type: "todo", title: "待辦" },
  { type: "flights", title: "航班" },
  { type: "tickets", title: "票券" },
  { type: "lists", title: "清單" },
  { type: "outfits", title: "每日穿搭" },
  { type: "expenses", title: "花費" },
  { type: "links", title: "參考連結" },
];
export const ADDABLE_BLOCKS = [
  { type: "note", title: "筆記", hint: "自由寫文字，例如小費習慣、插座規格" },
  { type: "files", title: "附件", hint: "放圖片和 PDF，例如保險單、簽證" },
];

// 旅行的區塊清單（順序、隱藏），沒設定過就用預設
export function tripBlocks(trip) {
  const saved = Array.isArray(trip.blocks) ? trip.blocks : [];
  const out = saved.filter((b) => b && b.type);
  for (const b of BUILTIN_BLOCKS) if (!out.some((x) => x.type === b.type)) out.push({ id: b.type, type: b.type });
  return out.map((b) => ({ ...b, title: b.title || blockTitle(b.type) }));
}
export function blockTitle(type) {
  return [...BUILTIN_BLOCKS, ...ADDABLE_BLOCKS].find((b) => b.type === type)?.title || "區塊";
}

// 全家共用設定的預設值
export function defaultFamily() {
  const me = { id: newId(8), name: "我" };
  const wife = { id: newId(8), name: "太太" };
  const kid = { id: newId(8), name: "小朋友" };
  const r = (ownerId, group, name = "") => ({ id: newId(8), ownerId, group, name });
  return {
    people: [me, wife, kid],
    recipients: [
      r(me.id, "同事"), r(me.id, "朋友"), r(me.id, "家人", "爸爸"), r(me.id, "家人", "弟弟"),
      r(wife.id, "同事"), r(wife.id, "家人", "爸爸"), r(wife.id, "朋友"), r(wife.id, "家人", "弟弟"),
    ],
  };
}

export function personName(family, id) {
  if (id === "shared") return "共用";
  return family?.people?.find((p) => p.id === id)?.name || "";
}
export function recipientLabel(family, r) {
  const owner = personName(family, r.ownerId);
  const who = r.name || r.group;
  if (!owner) return who;
  return owner === "我" ? `我的${who}` : `${owner}的${who}`;
}

export const LIST_KINDS = [
  { id: "packing", label: "行李", hint: "可以分人" },
  { id: "shopping", label: "採購", hint: "可以分人" },
  { id: "gift", label: "伴手禮", hint: "可以指定送給誰" },
  { id: "general", label: "一般", hint: "單純的勾選清單" },
];

export const EXPENSE_CATEGORIES = [
  { id: "food", label: "餐飲" },
  { id: "transport", label: "交通" },
  { id: "stay", label: "住宿" },
  { id: "ticket", label: "門票" },
  { id: "shopping", label: "購物" },
  { id: "flight", label: "機票" },
  { id: "other", label: "其他" },
];
