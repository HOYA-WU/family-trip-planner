// 選擇資料來源：有 Firebase 設定就用 Firebase，否則（或網址加 ?demo）用示範模式
import { firebaseConfig } from "./config.js";

export const USE_FIREBASE = !!firebaseConfig.projectId && !new URLSearchParams(location.search).has("demo");
export const { store } = await import(USE_FIREBASE ? "./store-firebase.js" : "./store-demo.js");
