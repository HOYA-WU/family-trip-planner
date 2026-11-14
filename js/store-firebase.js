// Firebase 模式：資料存在 Firestore，家人之間即時同步；開啟離線快取，沒網路也能看、能改。
import { firebaseConfig, FIREBASE_VERSION } from "./config.js";
import { newId, local } from "./utils.js";

const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
let F; // firestore 模組
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
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
    const user = await new Promise((resolve) => {
      const off = authMod.onAuthStateChanged(auth, (u) => {
        off();
        resolve(u);
      });
    });
    if (user) {
      this.uid = user.uid;
    } else if (navigator.onLine) {
      const cred = await authMod.signInAnonymously(auth);
      this.uid = cred.user.uid;
    }
  },

  async isMember() {
    if (!this.uid) return false;
    try {
      const snap = await F.getDoc(F.doc(db, "members", this.uid));
      const ok = snap.exists();
      local.set("member", ok);
      return ok;
    } catch (e) {
      // 離線又沒有快取時，相信上次的結果
      return local.get("member", false);
    }
  },

  async join(token) {
    if (!this.uid) throw new Error("需要網路才能完成第一次登入");
    await F.setDoc(F.doc(db, "members", this.uid), {
      uid: this.uid,
      token,
      deviceName: deviceGuess(),
      joinedAt: Date.now(),
    });
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
    const batch = F.writeBatch(db);
    for (const sub of ["cards", "todos"]) {
      const snap = await F.getDocs(F.collection(db, "trips", id, sub));
      snap.docs.forEach((d) => batch.delete(d.ref));
    }
    batch.delete(F.doc(db, "trips", id));
    this.fire(batch.commit());
  },

  // ---- 行程卡片 ----
  onCards(tripId, cb) {
    return F.onSnapshot(F.collection(db, "trips", tripId, "cards"), (s) => cb(list(s)), this.onError);
  },
  async addCard(tripId, data) {
    const ref = F.doc(F.collection(db, "trips", tripId, "cards"));
    this.fire(F.setDoc(ref, data));
    return ref.id;
  },
  async updateCard(tripId, id, patch) {
    this.fire(F.updateDoc(F.doc(db, "trips", tripId, "cards", id), patch));
  },
  async deleteCard(tripId, id) {
    this.fire(F.deleteDoc(F.doc(db, "trips", tripId, "cards", id)));
  },

  // ---- 待辦 ----
  onTodos(tripId, cb) {
    return F.onSnapshot(F.collection(db, "trips", tripId, "todos"), (s) => cb(list(s)), this.onError);
  },
  async addTodo(tripId, data) {
    this.fire(F.addDoc(F.collection(db, "trips", tripId, "todos"), data));
  },
  async updateTodo(tripId, id, patch) {
    this.fire(F.updateDoc(F.doc(db, "trips", tripId, "todos", id), patch));
  },
  async deleteTodo(tripId, id) {
    this.fire(F.deleteDoc(F.doc(db, "trips", tripId, "todos", id)));
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
