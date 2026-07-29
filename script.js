const MODEL = "gemini-flash-latest";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const KEY_STORAGE = "travel_itinerary_api_key";

const form = document.getElementById("trip-form");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const itineraryEl = document.getElementById("itinerary");
const apiKeyInput = document.getElementById("api-key");
const saveKeyBtn = document.getElementById("save-key-btn");
const keyStatus = document.getElementById("key-status");

const styleSelect = document.getElementById("style");
const styleOtherInput = document.getElementById("style-other");
const dreamSpotsList = document.getElementById("dream-spots-list");
const budgetInput = document.getElementById("budget");
const budgetPerPersonInput = document.getElementById("budget-per-person");
const peopleInput = document.getElementById("people");
const daysInput = document.getElementById("days");
const outboundArrivalInput = document.getElementById("outbound-arrival");
const returnDepartureInput = document.getElementById("return-departure");
const budgetLevelSlider = document.getElementById("budget-level");
const budgetLevelStatus = document.getElementById("budget-level-status");
const budgetLevelLive = document.getElementById("budget-level-live");
const printBtn = document.getElementById("print-btn");
const cancelBtn = document.getElementById("cancel-btn");
const revisePanel = document.getElementById("revise-panel");
const reviseInput = document.getElementById("revise-input");
const reviseBtn = document.getElementById("revise-btn");

let activeController = null;
let lastItineraryData = null;
let lastPayload = null;

function syncBudgetPerPerson() {
  const people = Number(peopleInput.value);
  if (!people || !budgetInput.value) return;
  budgetPerPersonInput.value = Math.round(Number(budgetInput.value) / people);
}

budgetInput.addEventListener("input", () => {
  syncBudgetPerPerson();
  syncSliderFromBudget();
});

budgetPerPersonInput.addEventListener("input", () => {
  const people = Number(peopleInput.value);
  if (!people || !budgetPerPersonInput.value) return;
  budgetInput.value = Math.round(Number(budgetPerPersonInput.value) * people);
  syncSliderFromBudget();
});

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function shiftDatetimeLocal(value, deltaDays) {
  const date = new Date(value);
  date.setDate(date.getDate() + deltaDays);
  return toDatetimeLocalValue(date);
}

outboundArrivalInput.addEventListener("change", () => {
  const days = Number(daysInput.value);
  if (!outboundArrivalInput.value || !days || days < 1) return;
  if (returnDepartureInput.value) return;
  returnDepartureInput.value = shiftDatetimeLocal(outboundArrivalInput.value, days - 1);
});

returnDepartureInput.addEventListener("change", () => {
  const days = Number(daysInput.value);
  if (!returnDepartureInput.value || !days || days < 1) return;
  if (outboundArrivalInput.value) return;
  outboundArrivalInput.value = shiftDatetimeLocal(returnDepartureInput.value, -(days - 1));
});

function loadSavedKey() {
  const saved = localStorage.getItem(KEY_STORAGE);
  if (saved) {
    apiKeyInput.value = saved;
    keyStatus.textContent = "已儲存金鑰";
  }
}

function getApiKey() {
  return localStorage.getItem(KEY_STORAGE) || apiKeyInput.value.trim();
}

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatus.textContent = "請先輸入金鑰";
    return;
  }
  localStorage.setItem(KEY_STORAGE, key);
  keyStatus.textContent = "已儲存金鑰";
});

styleSelect.addEventListener("change", () => {
  const isOther = styleSelect.value === "其他";
  styleOtherInput.hidden = !isOther;
  if (!isOther) {
    styleOtherInput.value = "";
  } else {
    styleOtherInput.focus();
  }
});

function createDreamSpotRow() {
  const row = document.createElement("div");
  row.className = "dream-spot-row";
  row.innerHTML = `
    <input type="text" class="dream-spot-input" placeholder="想去的景點，例如：晴空塔" />
    <button type="button" class="remove-spot-btn" aria-label="移除夢想景點">&minus;</button>
  `;
  return row;
}

document.getElementById("add-spot-btn").addEventListener("click", () => {
  dreamSpotsList.appendChild(createDreamSpotRow());
});

dreamSpotsList.addEventListener("click", (e) => {
  if (e.target.classList.contains("remove-spot-btn")) {
    e.target.closest(".dream-spot-row").remove();
  }
});

function formatDateTime(value) {
  return value ? value.replace("T", " ") : "";
}

function buildPrompt({
  destination,
  people,
  days,
  budget,
  style,
  outboundFlight,
  outboundArrival,
  returnFlight,
  returnDeparture,
  notes,
  dreamSpots,
}) {
  const extraLines = [];

  if (outboundFlight || outboundArrival) {
    extraLines.push(
      `- 去程班機：${outboundFlight || "未提供班機號"}，抵達當地時間：${
        outboundArrival ? formatDateTime(outboundArrival) : "未提供"
      }（請讓第 1 天行程從抵達時間之後開始安排；並依此日期的季節/是否為假期，合理估算這趟去程交通的實際票價）`
    );
  }

  if (returnFlight || returnDeparture) {
    extraLines.push(
      `- 回程班機：${returnFlight || "未提供班機號"}，離開當地時間：${
        returnDeparture ? formatDateTime(returnDeparture) : "未提供"
      }（請讓最後一天行程在此時間之前結束，並預留前往機場的交通時間；並依此日期合理估算回程交通的實際票價）`
    );
  }

  if (dreamSpots && dreamSpots.length) {
    extraLines.push(`- 使用者的夢想景點（務必安排進行程中）：${dreamSpots.join("、")}`);
  }

  if (notes) {
    extraLines.push(`- 備註／特殊需求：${notes}`);
  }

  return `你是一位專業旅遊行程規劃師。請根據以下條件規劃一份完整旅遊行程：

- 目的地：${destination}
- 人數：${people} 人
- 天數：${days} 天
- 總預算：新台幣 ${budget} 元（所有人合計）
- 旅遊風格：${style || "不指定，請自行安排均衡行程"}
${extraLines.join("\n")}

請務必將往返交通費（飛機、高鐵、火車、客運等，視目的地與移動方式而定）計入總預算，若有提供班機與日期，請依實際季節/日期估算合理票價；若沒提供，也請依目的地距離給出合理的來回交通費估計，並在 summary.transportationCost 中列出（所有人合計）。

請只回傳一個 JSON 物件，不要任何其他文字、不要 markdown code fence。JSON 結構如下：

{
  "destination": "目的地名稱",
  "days": [
    {
      "day": 1,
      "title": "當天主題（例如：抵達與市區漫遊）",
      "budgetNote": "當天預估花費說明",
      "accommodation": {
        "area": "當晚住宿的合理地點/區域（不需具體飯店名稱，例如：新宿區域）",
        "estimatedCost": "當晚住宿預估花費（新台幣，含幣別文字，所有人合計）"
      },
      "activities": [
        {
          "time": "09:00",
          "name": "活動或景點名稱",
          "description": "簡短說明（30字以內）",
          "estimatedCost": "預估花費（新台幣，含幣別文字）"
        }
      ]
    }
  ],
  "summary": {
    "transportationCost": "往返交通費預估（新台幣，含幣別文字，所有人合計，簡短說明依據）",
    "totalEstimatedCost": "總預估花費（新台幣）",
    "tips": ["實用小提醒1", "實用小提醒2", "實用小提醒3"]
  }
}

每天請安排 4 到 6 個活動（含用餐），花費需盡量貼近並控制在總預算內。每天請依行程動線標出合理的住宿地點/區域與預估費用（最後一天若當天直接返程、不過夜，accommodation 可設為 null）；所有住宿費用務必加總計入 summary.totalEstimatedCost。`;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function parseRetryDelayMs(errBody) {
  try {
    const data = JSON.parse(errBody);
    const detail = (data?.error?.details || []).find((d) => d["@type"]?.includes("RetryInfo"));
    const seconds = parseFloat(detail?.retryDelay);
    if (!Number.isNaN(seconds)) return Math.min(seconds * 1000 + 500, 15000);
  } catch {
    // response wasn't JSON or didn't include retry info; fall back to default backoff
  }
  return null;
}

const MAX_RATE_LIMIT_RETRIES = 2;

async function callGemini(prompt, apiKey, signal, onRetry) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }

    const errBody = await res.text();

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const delayMs = parseRetryDelayMs(errBody) ?? (attempt + 1) * 4000;
      onRetry?.(attempt + 1, MAX_RATE_LIMIT_RETRIES, delayMs);
      await wait(delayMs, signal);
      continue;
    }

    throw new Error(`API 錯誤 (${res.status}): ${errBody}`);
  }
}

function parseItineraryJson(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

let budgetEstimateCache = null;
let budgetEstimateKey = "";

async function estimateBudgetLevels(destination, people, days, apiKey, flightContext) {
  const flightLines = [];
  if (flightContext?.outboundArrival) {
    flightLines.push(`- 去程抵達時間：${formatDateTime(flightContext.outboundArrival)}`);
  }
  if (flightContext?.returnDeparture) {
    flightLines.push(`- 回程離開時間：${formatDateTime(flightContext.returnDeparture)}`);
  }
  const flightNote = flightLines.length
    ? `\n${flightLines.join("\n")}\n請依這些日期的季節/是否為假期，合理反映來回交通費（機票、高鐵、火車等）在旺季或淡季的價格差異。`
    : "";

  const prompt = `你是旅遊預算顧問。請針對以下旅遊條件，估算「低、中、高」三種預算等級的總花費（新台幣，含往返交通、住宿、餐飲、活動等所有人合計費用）：
- 目的地：${destination}
- 人數：${people} 人
- 天數：${days} 天${flightNote}

低＝省錢玩法，中＝一般水準，高＝舒適寬裕。請只回傳 JSON，不要任何其他文字：
{"low": 數字, "medium": 數字, "high": 數字}
數字為新台幣整數，不含逗號或文字。`;

  const rawText = await callGemini(prompt, apiKey, undefined, (attempt, max, delayMs) => {
    budgetLevelStatus.textContent = `Gemini 額度限制，${Math.ceil(delayMs / 1000)} 秒後自動重試（第 ${attempt}/${max} 次）...`;
  });
  return parseItineraryJson(rawText);
}

function interpolateBudget(pct, estimate) {
  const value =
    pct <= 50
      ? estimate.low + (estimate.medium - estimate.low) * (pct / 50)
      : estimate.medium + (estimate.high - estimate.medium) * ((pct - 50) / 50);
  return Math.round(value / 100) * 100;
}

function levelLabelForPct(pct) {
  if (pct <= 20) return "低";
  if (pct <= 40) return "中低";
  if (pct <= 60) return "中";
  if (pct <= 80) return "中高";
  return "高";
}

function budgetToPct(value, estimate) {
  const pct =
    value <= estimate.medium
      ? estimate.medium === estimate.low
        ? 50
        : ((value - estimate.low) / (estimate.medium - estimate.low)) * 50
      : estimate.high === estimate.medium
      ? 50
      : 50 + ((value - estimate.medium) / (estimate.high - estimate.medium)) * 50;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

function syncSliderFromBudget() {
  const { key } = currentTripKey();
  const value = Number(budgetInput.value);
  if (!value) return;
  if (!budgetEstimateCache || budgetEstimateKey !== key) {
    budgetLevelStatus.textContent = "先拖曳一次滑塊估算基準，之後輸入金額才會同步滑塊位置";
    return;
  }
  const pct = budgetToPct(value, budgetEstimateCache);
  budgetLevelSlider.value = pct;
  setSliderLive(`NT$${value.toLocaleString()}`);
  budgetLevelStatus.textContent = `已依輸入金額同步滑塊位置：${levelLabelForPct(pct)}（低 NT$${Number(
    budgetEstimateCache.low
  ).toLocaleString()} / 中 NT$${Number(budgetEstimateCache.medium).toLocaleString()} / 高 NT$${Number(
    budgetEstimateCache.high
  ).toLocaleString()}）`;
}

function positionSliderLive() {
  const min = Number(budgetLevelSlider.min);
  const max = Number(budgetLevelSlider.max);
  const val = Number(budgetLevelSlider.value);
  const pct = (val - min) / (max - min);
  const thumbWidth = 18;
  const trackWidth = budgetLevelSlider.offsetWidth;
  const leftPx = thumbWidth / 2 + pct * (trackWidth - thumbWidth);
  budgetLevelLive.style.left = `${leftPx}px`;
}

function setSliderLive(text) {
  budgetLevelLive.textContent = text;
  positionSliderLive();
}

window.addEventListener("resize", positionSliderLive);

function currentTripKey() {
  const destination = document.getElementById("destination").value.trim();
  const people = document.getElementById("people").value;
  const days = document.getElementById("days").value;
  const flightContext = {
    outboundArrival: outboundArrivalInput.value,
    returnDeparture: returnDepartureInput.value,
  };
  return {
    destination,
    people,
    days,
    flightContext,
    key: `${destination}|${people}|${days}|${flightContext.outboundArrival}|${flightContext.returnDeparture}`,
  };
}

budgetLevelSlider.addEventListener("input", () => {
  const pct = Number(budgetLevelSlider.value);
  const { key } = currentTripKey();
  if (budgetEstimateCache && budgetEstimateKey === key) {
    setSliderLive(`NT$${interpolateBudget(pct, budgetEstimateCache).toLocaleString()}`);
  } else {
    setSliderLive(levelLabelForPct(pct));
  }
});

budgetLevelSlider.addEventListener("change", async () => {
  const pct = Number(budgetLevelSlider.value);
  const { destination, people, days, flightContext, key: cacheKey } = currentTripKey();

  if (!destination || !people || !days) {
    budgetLevelStatus.textContent = "請先填寫目的地、人數、天數，才能估算預算";
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    budgetLevelStatus.textContent = "請先在下方「API 金鑰設定」輸入並儲存金鑰";
    return;
  }

  try {
    if (budgetEstimateKey !== cacheKey || !budgetEstimateCache) {
      budgetLevelStatus.textContent = "AI 估算中...";
      setSliderLive("估算中");
      budgetEstimateCache = await estimateBudgetLevels(destination, people, days, apiKey, flightContext);
      budgetEstimateKey = cacheKey;
    }

    const value = interpolateBudget(pct, budgetEstimateCache);
    budgetInput.value = value;
    syncBudgetPerPerson();
    setSliderLive(`NT$${value.toLocaleString()}`);
    budgetLevelStatus.textContent = `已套用「${levelLabelForPct(pct)}」：NT$${value.toLocaleString()}（低 NT$${Number(
      budgetEstimateCache.low
    ).toLocaleString()} / 中 NT$${Number(budgetEstimateCache.medium).toLocaleString()} / 高 NT$${Number(
      budgetEstimateCache.high
    ).toLocaleString()}，可持續拖曳微調）`;
  } catch (err) {
    console.error(err);
    budgetLevelStatus.textContent = `估算失敗：${err.message}`;
  }
});

function escapeHtml(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}

function renderItinerary(data, { people, budget }) {
  itineraryEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "itinerary-header";
  header.innerHTML = `
    <span class="badge">${escapeHtml(data.destination)}</span>
    <span class="badge">${escapeHtml(people)} 人</span>
    <span class="badge">${escapeHtml(data.days.length)} 天</span>
    <span class="badge">預算 NT$${Number(budget).toLocaleString()}</span>
  `;
  itineraryEl.appendChild(header);

  data.days.forEach((day) => {
    const card = document.createElement("div");
    card.className = "day-card";
    const activitiesHtml = day.activities
      .map((a) => {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${data.destination || ""} ${a.name || ""}`
        )}`;
        return `
        <div class="activity">
          <div class="time">${escapeHtml(a.time)}</div>
          <div class="detail">
            <div class="name">${escapeHtml(a.name)}</div>
            <div class="desc">${escapeHtml(a.description)}</div>
            <div class="cost">${escapeHtml(a.estimatedCost)}</div>
            <a class="maps-link" href="${mapsUrl}" target="_blank" rel="noopener">📍 在 Google Maps 開啟</a>
          </div>
        </div>`;
      })
      .join("");

    let accommodationHtml = "";
    if (day.accommodation && day.accommodation.area) {
      const accMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${data.destination || ""} ${day.accommodation.area}`
      )}`;
      accommodationHtml = `
        <div class="accommodation">
          <span class="accommodation-icon">🏨</span>
          <div class="detail">
            <div class="name">住宿：${escapeHtml(day.accommodation.area)}</div>
            <div class="cost">${escapeHtml(day.accommodation.estimatedCost)}</div>
            <a class="maps-link" href="${accMapsUrl}" target="_blank" rel="noopener">📍 在 Google Maps 開啟</a>
          </div>
        </div>`;
    }

    card.innerHTML = `
      <h3>Day ${escapeHtml(day.day)}：${escapeHtml(day.title)}</h3>
      <div class="day-budget">${escapeHtml(day.budgetNote)}</div>
      ${activitiesHtml}
      ${accommodationHtml}
    `;
    itineraryEl.appendChild(card);
  });

  if (data.summary) {
    const summaryCard = document.createElement("div");
    summaryCard.className = "summary-card";
    const tipsHtml = (data.summary.tips || [])
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
    const transportationHtml = data.summary.transportationCost
      ? `<p><strong>往返交通費：</strong>${escapeHtml(data.summary.transportationCost)}</p>`
      : "";
    summaryCard.innerHTML = `
      <h3>行程總覽</h3>
      ${transportationHtml}
      <p><strong>總預估花費：</strong>${escapeHtml(data.summary.totalEstimatedCost) || "-"}</p>
      <ul>${tipsHtml}</ul>
    `;
    itineraryEl.appendChild(summaryCard);
  }
}

function showPlaceholder() {
  itineraryEl.innerHTML = `<div class="placeholder">填寫左側表單，按下「產生行程」開始規劃。</div>`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const apiKey = getApiKey();
  if (!apiKey) {
    statusEl.textContent = "請先在下方「API 金鑰設定」輸入並儲存你的 Google Gemini API Key。";
    statusEl.className = "status error";
    return;
  }

  const dreamSpots = Array.from(document.querySelectorAll(".dream-spot-input"))
    .map((el) => el.value.trim())
    .filter(Boolean);

  const payload = {
    destination: document.getElementById("destination").value.trim(),
    people: document.getElementById("people").value,
    days: document.getElementById("days").value,
    budget: document.getElementById("budget").value,
    style: styleSelect.value === "其他" ? styleOtherInput.value.trim() : styleSelect.value,
    outboundFlight: document.getElementById("outbound-flight").value.trim(),
    outboundArrival: document.getElementById("outbound-arrival").value,
    returnFlight: document.getElementById("return-flight").value.trim(),
    returnDeparture: document.getElementById("return-departure").value,
    notes: document.getElementById("notes").value.trim(),
    dreamSpots,
  };

  submitBtn.disabled = true;
  statusEl.className = "status";
  statusEl.textContent = "正在為你規劃行程，請稍候...";
  itineraryEl.innerHTML = "";
  printBtn.hidden = true;
  revisePanel.hidden = true;
  cancelBtn.hidden = false;
  activeController = new AbortController();

  try {
    const prompt = buildPrompt(payload);
    const rawText = await callGemini(prompt, apiKey, activeController.signal, (attempt, max, delayMs) => {
      statusEl.textContent = `Gemini 額度限制，${Math.ceil(delayMs / 1000)} 秒後自動重試（第 ${attempt}/${max} 次）...`;
    });
    const data = parseItineraryJson(rawText);
    renderItinerary(data, payload);
    lastItineraryData = data;
    lastPayload = payload;
    statusEl.textContent = "行程已產生完成。";
    printBtn.hidden = false;
    revisePanel.hidden = false;
  } catch (err) {
    if (err.name === "AbortError") {
      statusEl.textContent = "已取消產生行程。";
      showPlaceholder();
    } else {
      console.error(err);
      statusEl.className = "status error";
      statusEl.textContent = `發生錯誤：${err.message}`;
    }
  } finally {
    submitBtn.disabled = false;
    cancelBtn.hidden = true;
    activeController = null;
  }
});

printBtn.addEventListener("click", () => {
  window.print();
});

cancelBtn.addEventListener("click", () => {
  if (activeController) activeController.abort();
});

function buildRevisionPrompt(currentData, instruction) {
  return `你是一位專業旅遊行程規劃師。以下是目前已經產生的行程 JSON：

${JSON.stringify(currentData)}

使用者想針對這份行程做以下調整：
「${instruction}」

請依照這個調整需求修改行程，盡量只變動需要調整的部分，維持原本天數與整體結構不變（除非使用者要求變更天數）。請只回傳修改後完整的 JSON 物件，結構需與原本相同，不要任何其他文字、不要 markdown code fence：

{
  "destination": "目的地名稱",
  "days": [
    {
      "day": 1,
      "title": "當天主題",
      "budgetNote": "當天預估花費說明",
      "accommodation": {
        "area": "當晚住宿的合理地點/區域（不需具體飯店名稱，例如：新宿區域）",
        "estimatedCost": "當晚住宿預估花費（新台幣，含幣別文字，所有人合計）"
      },
      "activities": [
        {
          "time": "09:00",
          "name": "活動或景點名稱",
          "description": "簡短說明（30字以內）",
          "estimatedCost": "預估花費（新台幣，含幣別文字）"
        }
      ]
    }
  ],
  "summary": {
    "transportationCost": "往返交通費預估（新台幣，含幣別文字，所有人合計）",
    "totalEstimatedCost": "總預估花費（新台幣）",
    "tips": ["實用小提醒1", "實用小提醒2", "實用小提醒3"]
  }
}

最後一天若當天直接返程、不過夜，accommodation 可設為 null；所有住宿費用務必加總計入 summary.totalEstimatedCost。`;
}

reviseBtn.addEventListener("click", async () => {
  const instruction = reviseInput.value.trim();
  if (!instruction || !lastItineraryData) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    statusEl.textContent = "請先在上方「API 金鑰設定」輸入並儲存你的 Google Gemini API Key。";
    statusEl.className = "status error";
    return;
  }

  reviseBtn.disabled = true;
  reviseInput.disabled = true;
  statusEl.className = "status";
  statusEl.textContent = "正在依照你的需求調整行程，請稍候...";
  printBtn.hidden = true;
  cancelBtn.hidden = false;
  activeController = new AbortController();

  try {
    const prompt = buildRevisionPrompt(lastItineraryData, instruction);
    const rawText = await callGemini(prompt, apiKey, activeController.signal, (attempt, max, delayMs) => {
      statusEl.textContent = `Gemini 額度限制，${Math.ceil(delayMs / 1000)} 秒後自動重試（第 ${attempt}/${max} 次）...`;
    });
    const data = parseItineraryJson(rawText);
    renderItinerary(data, lastPayload);
    lastItineraryData = data;
    reviseInput.value = "";
    statusEl.textContent = "行程已依需求調整完成。";
    printBtn.hidden = false;
  } catch (err) {
    if (err.name === "AbortError") {
      statusEl.textContent = "已取消調整，行程維持原樣。";
      printBtn.hidden = false;
    } else {
      console.error(err);
      statusEl.className = "status error";
      statusEl.textContent = `發生錯誤：${err.message}`;
      printBtn.hidden = false;
    }
  } finally {
    reviseBtn.disabled = false;
    reviseInput.disabled = false;
    cancelBtn.hidden = true;
    activeController = null;
  }
});

loadSavedKey();
showPlaceholder();
