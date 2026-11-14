// AI 辨識：Google Gemini（免費額度）。金鑰存在全家共用設定裡，只有加入的裝置讀得到。
import { store } from "./store.js";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const aiReady = (family) => !!family?.geminiKey;

export async function askGemini(family, { prompt, file }) {
  if (!family?.geminiKey) throw new Error("還沒設定 AI 金鑰，請到「設定 → AI 辨識」填寫");
  if (!navigator.onLine) throw new Error("AI 辨識需要網路");
  const model = (family.geminiModel || DEFAULT_MODEL).trim();
  const parts = [];
  if (file) {
    const [head, b64] = file.data.split(",");
    parts.push({ inline_data: { mime_type: head.match(/data:([^;]+)/)?.[1] || "image/jpeg", data: b64 } });
  }
  parts.push({ text: prompt });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": family.geminiKey.trim() },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message || res.statusText;
    if (res.status === 400 && /API key/i.test(msg)) throw new Error("AI 金鑰不正確，請到設定重新貼上");
    if (res.status === 404) throw new Error(`找不到模型「${model}」，請到設定換一個模型名稱`);
    if (res.status === 429) throw new Error("今天的免費額度用完了，明天再試，或先手動輸入");
    throw new Error(msg);
  }
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
