// Firebase 設定。
// 留空時，App 會以「示範模式」執行：資料只存在這台裝置的瀏覽器裡，方便先試用。
// 建好 Firebase 專案後，把專案設定貼進來（步驟見 README.md）。
// 這些值本來就會出現在網頁裡，放在公開的 GitHub 上沒有問題；資料的安全由 firestore.rules 把關。
export const firebaseConfig = {
  apiKey: "AIzaSyDawEC9I4z84VNv37mPtuA7sarSpFvobP4",
  authDomain: "family-trip-3ae20.firebaseapp.com",
  projectId: "family-trip-3ae20",
  storageBucket: "family-trip-3ae20.firebasestorage.app",
  messagingSenderId: "808002627764",
  appId: "1:808002627764:web:c8f95b14a467f442098fe1",
};

export const FIREBASE_VERSION = "11.0.2";
