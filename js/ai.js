// AI 辨識：Google Gemini（免費額度）。金鑰存在全家共用設定裡，只有加入的裝置讀得到。
import { store } from "./store.js";
import { local } from "./utils.js";

// Google 會陸續淘汰舊模型；依序試這些，用成功的那個（記在這台裝置上）
export const DEFAULT_MODEL = "gemini-3.5-flash";
const FALLBACKS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.8-flash"];
export const aiReady = (family) => !!family?.geminiKey;

async function callModel(key, model, parts) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
    });
    return { res, json: await res.json().catch(() => ({})) };
  } catch (e) {
    return { res: { ok: false, status: 0 }, json: { error: { message: e.name === "AbortError" ? "等太久沒有回應" : e.message } } };
  } finally {
    clearTimeout(timer);
  }
}

export async function askGemini(family, { prompt, file }) {
  if (!family?.geminiKey) throw new Error("還沒設定 AI 金鑰，請到「設定 → AI 辨識」填寫");
  if (!navigator.onLine) throw new Error("AI 辨識需要網路");
  const key = family.geminiKey.trim();
  const parts = [];
  if (file) {
    const [head, b64] = file.data.split(",");
    parts.push({ inline_data: { mime_type: head.match(/data:([^;]+)/)?.[1] || "image/jpeg", data: b64 } });
  }
  parts.push({ text: prompt });

  const queue = [...new Set([family.geminiModel, local.get("ai-model", ""), ...FALLBACKS].filter(Boolean).map((m) => m.trim()))];
  const tried = new Set();
  let json;
  let lastErr = "";
  while (queue.length) {
    const model = queue.shift();
    if (tried.has(model)) continue;
    tried.add(model);
    const r = await callModel(key, model, parts);
    if (r.res.ok) {
      local.set("ai-model", model);
      json = r.json;
      break;
    }
    const msg = r.json.error?.message || r.res.statusText || "";
    if (r.res.status === 400 && /API key/i.test(msg)) throw new Error("AI 金鑰不正確，請到設定重新貼上");
    if (r.res.status === 403) throw new Error("這個金鑰沒有權限使用 Gemini，請重新申請一組");
    // 模型被淘汰時，Google 常會在訊息裡建議新模型，優先試它
    const suggested = msg.match(/models\/([\w.\-]+)/g)?.map((s) => s.replace("models/", "")).filter((m) => m !== model);
    if (suggested?.length) queue.unshift(...suggested);
    lastErr = r.res.status === 429 ? "今天的免費額度用完了，明天再試，或先手動輸入"
      : r.res.status === 503 ? "AI 服務暫時太忙，請稍後再試"
      : msg;
    // 其他錯誤（找不到模型、太忙、額度、逾時）就換下一個模型試
  }
  if (!json) throw new Error(lastErr || "AI 辨識失敗");
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  try {
    return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
  } catch {
    throw new Error("AI 回傳的格式看不懂，請再試一次或手動輸入");
  }
}

export async function fileForAI(tripId, file) {
  return { data: await store.getFileData(tripId, file) };
}

export const FLIGHT_PROMPT = `這是一張機票、電子機票或訂位確認的截圖或 PDF。請讀出所有航段，只回傳 JSON，格式：
{"pnr":"訂位代號","note":"行李額度、退改票規則等重點，沒有就空字串","segments":[{"flightNo":"航班號如 QF8728","airline":"航空公司（有中文就用中文）","from":"出發機場三碼","fromTerminal":"出發航廈如 T2","depart":"出發當地時間 YYYY-MM-DDTHH:MM","depTz":"出發地時區如 +8","to":"抵達機場三碼","toTerminal":"抵達航廈","arrive":"抵達當地時間 YYYY-MM-DDTHH:MM","arrTz":"抵達地時區如 +10","cabin":"艙等"}]}
看不到的欄位填空字串，不要猜。`;

export const RECEIPT_PROMPT = `這是一張收據或發票（可能是日文、英文或其他語言）。請讀出內容，只回傳 JSON，格式：
{"store":"店名（保留原文，若有常見中文名稱可附在後面）","date":"YYYY-MM-DD","time":"HH:MM","total":實付總金額數字,"currency":"ISO 幣別代碼如 JPY","receiptNo":"收據或交易編號，沒有就空字串","category":"food|transport|stay|ticket|shopping|other 擇一"}
看不到的欄位填空字串，total 看不到填 0，不要猜。`;
