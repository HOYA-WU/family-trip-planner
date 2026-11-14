// Firebase 模式：資料存在 Firestore，家人之間即時同步；開啟離線快取，沒網路也能看、能改。
import { firebaseConfig, FIREBASE_VERSION } from "./config.js";
import { newId, local } from "./utils.js";
import { SUBS, defaultFamily } from "./model.js";

const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
// Firestore 每筆資料上限 1MB；大的 PDF 拆成多段存
const CHUNK = 700_000;
let F;
let db;
let auth;

function deviceGuess() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android 手機";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows 電腦";
  return "裝置";
}

const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const subCol = (tripId, s) => F.collection(db, "trips", tripId, s);
const subDoc = (tripId, s, id) => F.doc(db, "trips", tripId, s, id);
const familyDoc = () => F.doc(db, "family", "settings");

export const store = {
  mode: "firebase",
  uid: null,
  onError: (e) => console.error(e),

  // 寫入不等伺服器回應：離線時 Firestore 會先存在手機上，恢復網路再送出。
  fire(promise) {
    promise.catch((e) => this.onError(e));
  },

  async init() {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(BASE + "firebase-app.js"),
      import(BASE + "firebase-auth.js"),
      import(BASE + "firebase-firestore.js"),
    ]);
    F = fsMod;
    const app = appMod.initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({
        tabManager: F.persistentMultipleTabManager(),
        // 不限制快取大小：票券 PDF 等附件要能一直離線打開
        cacheSizeBytes: F.CACHE_SIZE_UNLIMITED,
      }),
    });
    const user = await new Promise((resolve) => {
      const off = authMod.onAuthStateChanged(auth, (u) => {
        off();
        resolve(u);
      });
    });
    if (user) this.uid = user.uid;
    else if (navigator.onLine) this.uid = (await authMod.signInAnonymously(auth)).user.uid;
  },

  async isMember() {
    if (!this.uid) return false;
    try {
      const ok = (await F.getDoc(F.doc(db, "members", this.uid))).exists();
      local.set("member", ok);
      return ok;
    } catch {
      return local.get("member", false);
    }
  },

  async join(token) {
    if (!this.uid) throw new Error("需要網路才能完成第一次登入");
    await F.setDoc(F.doc(db, "members", this.uid), { uid: this.uid, token, deviceName: deviceGuess(), joinedAt: Date.now() });
    local.set("member", true);
  },

  // ---- 旅行 ----
  onTrips(cb) {
    return F.onSnapshot(F.collection(db, "trips"), (s) => cb(list(s)), this.onError);
  },
  onTrip(id, cb) {
    return F.onSnapshot(F.doc(db, "trips", id), (s) => cb(s.exists() ? { id: s.id, ...s.data() } : null), this.onError);
  },
  async createTrip(data) {
    const ref = F.doc(F.collection(db, "trips"));
    this.fire(F.setDoc(ref, { dayLabels: {}, createdAt: Date.now(), ...data }));
    return ref.id;
  },
  async updateTrip(id, patch) {
    this.fire(F.updateDoc(F.doc(db, "trips", id), patch));
  },
  async deleteTrip(id) {
    const refs = [];
    for (const s of SUBS) {
      const snap = await F.getDocs(subCol(id, s));
      for (const d of snap.docs) {
        refs.push(d.ref);
        if (s === "files") {
          const chunks = await F.getDocs(F.collection(d.ref, "chunks"));
          chunks.docs.forEach((c) => refs.push(c.ref));
        }
      }
    }
    refs.push(F.doc(db, "trips", id));
    // 一批最多 500 筆
    for (let i = 0; i < refs.length; i += 400) {
      const batch = F.writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      this.fire(batch.commit());
    }
  },

  // ---- 旅行底下的各種資料 ----
  onSub(tripId, s, cb) {
    return F.onSnapshot(subCol(tripId, s), (snap) => cb(list(snap)), this.onError);
  },
  async getSub(tripId, s) {
    return list(await F.getDocs(subCol(tripId, s)));
  },
  async getTrips() {
    return list(await F.getDocs(F.collection(db, "trips")));
  },
  async addSub(tripId, s, data) {
    const ref = F.doc(subCol(tripId, s));
    this.fire(F.setDoc(ref, data));
    return ref.id;
  },
  async setSub(tripId, s, id, data) {
    this.fire(F.setDoc(subDoc(tripId, s, id), data, { merge: true }));
  },
  async updateSub(tripId, s, id, patch) {
    this.fire(F.updateDoc(subDoc(tripId, s, id), patch));
  },
  async deleteSub(tripId, s, id) {
    this.fire(F.deleteDoc(subDoc(tripId, s, id)));
  },

  // ---- 附件 ----
  // 小的（壓縮過的圖片）直接放在 data；大的（PDF）拆成 chunks 子集合
  async putFile(tripId, meta, data) {
    const ref = F.doc(subCol(tripId, "files"));
    const batch = F.writeBatch(db);
    if (data.length <= CHUNK) {
      batch.set(ref, { ...meta, createdAt: Date.now(), chunks: 0, data });
    } else {
      const n = Math.ceil(data.length / CHUNK);
      batch.set(ref, { ...meta, createdAt: Date.now(), chunks: n });
      for (let i = 0; i < n; i++) {
        batch.set(F.doc(ref, "chunks", String(i).padStart(3, "0")), { d: data.slice(i * CHUNK, (i + 1) * CHUNK) });
      }
    }
    this.fire(batch.commit());
    return ref.id;
  },
  async getFileData(tripId, file) {
    if (file.data) return file.data;
    if (!file.chunks) return "";
    const snap = await F.getDocs(F.collection(subDoc(tripId, "files", file.id), "chunks"));
    return snap.docs.sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.data().d).join("");
  },
  // 有網路時先把大附件讀一次，存進離線快取
  async prefetchFile(tripId, file) {
    if (!file.chunks || !navigator.onLine || local.get("pf:" + file.id, false)) return;
    try {
      await F.getDocsFromServer(F.collection(subDoc(tripId, "files", file.id), "chunks"));
      local.set("pf:" + file.id, true);
    } catch {}
  },
  async deleteFile(tripId, id) {
    const ref = subDoc(tripId, "files", id);
    const batch = F.writeBatch(db);
    try {
      const chunks = await F.getDocs(F.collection(ref, "chunks"));
      chunks.docs.forEach((c) => batch.delete(c.ref));
    } catch {}
    batch.delete(ref);
    this.fire(batch.commit());
  },

  // ---- 全家共用設定 ----
  onFamily(cb) {
    return F.onSnapshot(familyDoc(), (s) => {
      if (s.exists()) return cb(s.data());
      // 離線又還沒讀過：先顯示空的，不要寫入（避免蓋掉雲端上的設定）
      if (s.metadata.fromCache) return cb({ people: [], recipients: [] });
      // 第一次使用：建立預設值
      const fam = defaultFamily();
      this.fire(F.setDoc(familyDoc(), fam));
      cb(fam);
    }, this.onError);
  },
  async updateFamily(patch) {
    this.fire(F.setDoc(familyDoc(), patch, { merge: true }));
  },

  // ---- 邀請與裝置 ----
  onInvites(cb) {
    return F.onSnapshot(F.collection(db, "invites"), (s) => cb(list(s)), this.onError);
  },
  async createInvite(note) {
    const token = newId(32);
    this.fire(F.setDoc(F.doc(db, "invites", token), { note, active: true, createdAt: Date.now(), createdBy: this.uid }));
    return token;
  },
  async setInviteActive(token, active) {
    this.fire(F.updateDoc(F.doc(db, "invites", token), { active }));
  },
  onMembers(cb) {
    return F.onSnapshot(F.collection(db, "members"), (s) => cb(list(s)), this.onError);
  },
  async removeMember(uid) {
    this.fire(F.deleteDoc(F.doc(db, "members", uid)));
  },
  async renameDevice(name) {
    this.fire(F.updateDoc(F.doc(db, "members", this.uid), { deviceName: name }));
  },
};
