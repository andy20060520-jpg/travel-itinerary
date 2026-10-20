import { createStore, newId } from "./store.js";
import {
  splitEqual,
  computeBalances,
  computeSpending,
  settle,
  parseEuroToCents,
  formatEuro,
} from "./settle.js";

const RECENT_KEY = "splitbill-recent";
const ME_KEY_PREFIX = "splitbill-me-";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

const appEl = document.getElementById("app");
const bannerEl = document.getElementById("banner");
const modeBadge = document.getElementById("mode-badge");

let store = null;
let unsubscribers = [];
let trip = null;
let expenses = [];
let currentTab = "expenses";
let tripLoaded = false;

// ---------- 小工具 ----------

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 私密瀏覽等情況寫不進去，不影響主要功能。
  }
}

function showBanner(message, kind = "error") {
  bannerEl.textContent = message;
  bannerEl.className = `banner ${kind}`;
  bannerEl.hidden = !message;
}

// 清掉錯誤訊息；單機模式則保留提醒。
function resetBanner() {
  if (store?.mode === "local") {
    showBanner("目前是單機試用模式：資料只存在這支手機，不會和旅伴同步。設定 Firebase 後即可多人共用（見 README）。", "info");
  } else {
    showBanner("");
  }
}

function toMillis(ts) {
  if (!ts) return Date.now();
  if (typeof ts === "number") return ts;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return Date.now();
}

function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const week = "日一二三四五六"[date.getDay()];
  return `${m} 月 ${d} 日（${week}）`;
}

function memberName(id) {
  return trip?.members.find((m) => m.id === id)?.name ?? "（已移除）";
}

function getMe() {
  return trip ? safeGet(ME_KEY_PREFIX + trip.id, null) : null;
}

function rememberRecent(id, name) {
  const recent = safeGet(RECENT_KEY, []).filter((t) => t.id !== id);
  recent.unshift({ id, name, openedAt: Date.now() });
  safeSet(RECENT_KEY, recent.slice(0, 20));
}

function forgetRecent(id) {
  safeSet(RECENT_KEY, safeGet(RECENT_KEY, []).filter((t) => t.id !== id));
}

function shareUrl(tripId) {
  return `${location.origin}${location.pathname}#/trip/${tripId}`;
}

// ---------- 路由 ----------

function clearSubscriptions() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers = [];
  trip = null;
  expenses = [];
  tripLoaded = false;
}

function route() {
  clearSubscriptions();
  const match = location.hash.match(/^#\/trip\/([A-Za-z0-9]+)/);
  if (match) openTrip(match[1]);
  else renderHome();
}

// ---------- 首頁 ----------

function renderHome() {
  const recent = safeGet(RECENT_KEY, []);
  appEl.innerHTML = `
    ${recent.length ? `
      <section class="card">
        <h2>我的帳本</h2>
        <ul class="trip-list">
          ${recent.map((t) => `
            <li><a href="#/trip/${escapeHtml(t.id)}">
              <span>${escapeHtml(t.name)}</span><span class="chev">›</span>
            </a></li>`).join("")}
        </ul>
      </section>` : ""}

    <section class="card">
      <h2>建立新帳本</h2>
      <form id="create-form">
        <div class="field">
          <label for="trip-name">旅程名稱</label>
          <input id="trip-name" required maxlength="40" placeholder="例如：2026 巴黎・羅馬" />
        </div>
        <div class="field">
          <span class="label">旅伴（含自己）</span>
          <div id="member-inputs" class="member-inputs">
            ${memberInput("", "第 1 位，例如：我")}
            ${memberInput("", "第 2 位")}
          </div>
          <button type="button" id="add-member-input" class="text-btn">＋ 再加一位</button>
        </div>
        <p class="hint-small">幣別固定為歐元（€）。建立後可以隨時再加人。</p>
        <button type="submit" class="block">建立並開始記帳</button>
      </form>
    </section>

    <section class="card">
      <h2>加入朋友的帳本</h2>
      <form id="join-form" class="inline-form">
        <input id="join-input" required placeholder="貼上邀請連結" autocomplete="off" />
        <button type="submit">加入</button>
      </form>
    </section>
  `;

  const memberInputs = document.getElementById("member-inputs");
  document.getElementById("add-member-input").addEventListener("click", () => {
    const n = memberInputs.children.length + 1;
    memberInputs.insertAdjacentHTML("beforeend", memberInput("", `第 ${n} 位`));
    memberInputs.lastElementChild.focus();
  });

  document.getElementById("create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("trip-name").value.trim();
    const names = [...memberInputs.querySelectorAll("input")]
      .map((i) => i.value.trim())
      .filter(Boolean);
    if (!name) return;
    if (names.length < 2) {
      showBanner("至少需要兩位旅伴才能分帳喔");
      return;
    }
    if (new Set(names).size !== names.length) {
      showBanner("旅伴名字不能重複");
      return;
    }
    resetBanner();
    const button = e.submitter;
    button.disabled = true;
    try {
      const members = names.map((n) => ({ id: newId(), name: n }));
      const id = await store.createTrip({ name, members });
      // 建立的人預設是第一位。
      safeSet(ME_KEY_PREFIX + id, members[0].id);
      location.hash = `#/trip/${id}`;
    } catch (err) {
      showBanner(`建立失敗：${err.message}`);
      button.disabled = false;
    }
  });

  document.getElementById("join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = document.getElementById("join-input").value.trim();
    const match = value.match(/trip\/([A-Za-z0-9]+)/) || value.match(/^([A-Za-z0-9]{10,})$/);
    if (!match) {
      showBanner("看不懂這個連結，請確認是完整的邀請連結");
      return;
    }
    resetBanner();
    location.hash = `#/trip/${match[1]}`;
  });
}

function memberInput(value, placeholder) {
  return `<input class="member-input" maxlength="20" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" />`;
}

// ---------- 帳本頁 ----------

function openTrip(tripId) {
  appEl.innerHTML = `<p class="muted center">載入帳本中…</p>`;
  const onError = (err) => {
    console.error(err);
    showBanner(`無法讀取帳本：${err.message}`);
  };
  unsubscribers.push(
    store.subscribeTrip(tripId, (data) => {
      tripLoaded = true;
      if (!data) {
        trip = null;
        forgetRecent(tripId);
        appEl.innerHTML = `
          <section class="card center">
            <h2>找不到這個帳本</h2>
            <p class="muted">連結可能不完整，或帳本是在另一支手機的「單機試用模式」建立的。</p>
            <a href="#/" class="button">回首頁</a>
          </section>`;
        return;
      }
      trip = data;
      rememberRecent(trip.id, trip.name);
      renderTrip();
    }, onError),
    store.subscribeExpenses(tripId, (list) => {
      expenses = list;
      if (trip) renderTrip();
    }, onError)
  );
}

function sortedExpenses() {
  return [...expenses].sort((a, b) =>
    b.date.localeCompare(a.date) || toMillis(b.createdAt) - toMillis(a.createdAt)
  );
}

function renderTrip() {
  if (!tripLoaded || !trip) return;
  const me = getMe();
  const total = expenses
    .filter((e) => e.type !== "transfer")
    .reduce((sum, e) => sum + e.amount, 0);
  const balances = computeBalances(trip.members, expenses);

  const myLine = me && me in balances
    ? balances[me] > 0
      ? `<span class="pos">別人共欠你 ${formatEuro(balances[me])}</span>`
      : balances[me] < 0
        ? `<span class="neg">你共欠別人 ${formatEuro(-balances[me])}</span>`
        : `<span class="muted">你目前不欠也不被欠</span>`
    : `<span class="muted">先選擇「我是誰」</span>`;

  appEl.innerHTML = `
    <section class="card trip-head">
      <div class="trip-title-row">
        <h1>${escapeHtml(trip.name)}</h1>
        <button type="button" data-action="share" class="secondary small">邀請</button>
      </div>
      <div class="stat-row">
        <div class="stat"><span class="stat-label">總花費</span><span class="stat-value">${formatEuro(total)}</span></div>
        <div class="stat"><span class="stat-label">人數</span><span class="stat-value">${trip.members.length}</span></div>
      </div>
      <div class="me-row">
        <label for="me-select">我是</label>
        <select id="me-select">
          <option value="">— 選擇 —</option>
          ${trip.members.map((m) => `
            <option value="${m.id}" ${m.id === me ? "selected" : ""}>${escapeHtml(m.name)}</option>`).join("")}
        </select>
        <span class="me-balance">${myLine}</span>
      </div>
    </section>

    <nav class="tabs">
      ${tabButton("expenses", "支出")}
      ${tabButton("settle", "結算")}
      ${tabButton("members", "成員")}
    </nav>

    <section id="tab-body">
      ${currentTab === "expenses" ? renderExpensesTab(me)
        : currentTab === "settle" ? renderSettleTab(balances)
        : renderMembersTab()}
    </section>

    ${currentTab === "expenses"
      ? `<button type="button" class="fab" data-action="add-expense">＋ 新增支出</button>`
      : ""}
  `;

  document.getElementById("me-select").addEventListener("change", (e) => {
    safeSet(ME_KEY_PREFIX + trip.id, e.target.value || null);
    renderTrip();
  });
}

function tabButton(id, label) {
  return `<button type="button" data-tab="${id}" class="${currentTab === id ? "active" : ""}">${label}</button>`;
}

function renderExpensesTab(me) {
  if (!expenses.length) {
    return `<div class="card empty">
      <p>還沒有任何支出</p>
      <p class="muted">按下方「新增支出」開始記第一筆。</p>
    </div>`;
  }
  const groups = new Map();
  for (const e of sortedExpenses()) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  return [...groups].map(([date, list]) => `
    <h3 class="date-head">${formatDateLabel(date)}</h3>
    <ul class="card expense-list">
      ${list.map((e) => expenseItem(e, me)).join("")}
    </ul>
  `).join("");
}

function expenseItem(e, me) {
  if (e.type === "transfer") {
    const to = Object.keys(e.shares)[0];
    return `<li data-action="edit-expense" data-id="${e.id}" class="transfer">
      <div class="exp-main">
        <span class="exp-title">💸 ${escapeHtml(memberName(e.paidBy))} 還給 ${escapeHtml(memberName(to))}</span>
        <span class="exp-sub">還款紀錄</span>
      </div>
      <span class="exp-amount">${formatEuro(e.amount)}</span>
    </li>`;
  }
  const count = Object.keys(e.shares).length;
  const myShare = me && e.shares[me] ? `・我的份 ${formatEuro(e.shares[me])}` : "";
  return `<li data-action="edit-expense" data-id="${e.id}">
    <div class="exp-main">
      <span class="exp-title">${escapeHtml(e.title)}</span>
      <span class="exp-sub">${escapeHtml(memberName(e.paidBy))} 付・${count} 人分${myShare}</span>
    </div>
    <span class="exp-amount">${formatEuro(e.amount)}</span>
  </li>`;
}

function renderSettleTab(balances) {
  const spending = computeSpending(trip.members, expenses);
  const transfers = settle(balances);
  return `
    <div class="card">
      <h2>該怎麼還</h2>
      ${transfers.length ? `
        <ul class="transfer-list">
          ${transfers.map((t) => `
            <li>
              <div><strong>${escapeHtml(memberName(t.from))}</strong> → <strong>${escapeHtml(memberName(t.to))}</strong></div>
              <div class="transfer-right">
                <span class="exp-amount">${formatEuro(t.amount)}</span>
                <button type="button" class="small secondary" data-action="mark-paid"
                  data-from="${t.from}" data-to="${t.to}" data-amount="${t.amount}">已還</button>
              </div>
            </li>`).join("")}
        </ul>
        <p class="hint-small">已用最少的轉帳次數計算。實際還錢後按「已還」，會留下一筆還款紀錄。</p>`
      : `<p class="muted">🎉 大家已經互不相欠</p>`}
    </div>

    <div class="card">
      <h2>每人明細</h2>
      <table class="balance-table">
        <thead><tr><th>成員</th><th>花費</th><th>差額</th></tr></thead>
        <tbody>
          ${trip.members.map((m) => {
            const b = balances[m.id] || 0;
            const cls = b > 0 ? "pos" : b < 0 ? "neg" : "muted";
            return `<tr>
              <td>${escapeHtml(m.name)}</td>
              <td>${formatEuro(spending[m.id] || 0)}</td>
              <td class="${cls}">${b > 0 ? "+" : ""}${formatEuro(b)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <p class="hint-small">差額為正代表別人欠他，為負代表他要付給別人。</p>
    </div>
  `;
}

function renderMembersTab() {
  const used = new Set();
  for (const e of expenses) {
    used.add(e.paidBy);
    Object.keys(e.shares).forEach((id) => used.add(id));
  }
  return `
    <div class="card">
      <h2>成員</h2>
      <ul class="member-list">
        ${trip.members.map((m) => `
          <li>
            <span>${escapeHtml(m.name)}</span>
            <span class="member-actions">
              <button type="button" class="text-btn" data-action="rename-member" data-id="${m.id}">改名</button>
              ${used.has(m.id)
                ? `<span class="hint-small">有帳目，不能移除</span>`
                : `<button type="button" class="danger-link" data-action="remove-member" data-id="${m.id}">移除</button>`}
            </span>
          </li>`).join("")}
      </ul>
      <form id="add-member-form" class="inline-form">
        <input id="new-member" maxlength="20" placeholder="新成員名字" required />
        <button type="submit">加入</button>
      </form>
    </div>
    <div class="card">
      <button type="button" class="secondary block" data-action="leave">從「我的帳本」列表移除</button>
      <p class="hint-small">只會從這支手機的列表移除，帳本本身和其他人的資料不受影響。</p>
    </div>
  `;
}

// 帳本頁的按鈕統一在這裡處理，避免每次重繪都重新綁事件。
appEl.addEventListener("click", async (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) {
    currentTab = tab.dataset.tab;
    renderTrip();
    return;
  }
  const el = e.target.closest("[data-action]");
  if (!el || !trip) return;
  const { action, id } = el.dataset;

  try {
    if (action === "share") openShare();
    else if (action === "add-expense") openExpense(null);
    else if (action === "edit-expense") openExpense(expenses.find((x) => x.id === id));
    else if (action === "mark-paid") await markPaid(el.dataset);
    else if (action === "rename-member") await renameMember(id);
    else if (action === "remove-member") await removeMember(id);
    else if (action === "leave") {
      forgetRecent(trip.id);
      location.hash = "#/";
    }
  } catch (err) {
    showBanner(`操作失敗：${err.message}`);
  }
});

appEl.addEventListener("submit", async (e) => {
  if (e.target.id !== "add-member-form") return;
  e.preventDefault();
  const input = document.getElementById("new-member");
  const name = input.value.trim();
  if (!name) return;
  if (trip.members.some((m) => m.name === name)) {
    showBanner("已經有同名的成員了");
    return;
  }
  resetBanner();
  try {
    await store.setMembers(trip.id, [...trip.members, { id: newId(), name }]);
  } catch (err) {
    showBanner(`加入失敗：${err.message}`);
  }
});

async function markPaid({ from, to, amount }) {
  const cents = Number(amount);
  if (!confirm(`確認 ${memberName(from)} 已經還給 ${memberName(to)} ${formatEuro(cents)}？`)) return;
  await store.saveExpense(trip.id, {
    type: "transfer",
    title: "還款",
    amount: cents,
    date: todayIso(),
    paidBy: from,
    splitMode: "custom",
    shares: { [to]: cents },
  });
}

async function renameMember(id) {
  const current = memberName(id);
  const name = prompt("新的名字", current)?.trim();
  if (!name || name === current) return;
  if (trip.members.some((m) => m.name === name)) {
    showBanner("已經有同名的成員了");
    return;
  }
  await store.setMembers(trip.id, trip.members.map((m) => (m.id === id ? { ...m, name } : m)));
}

async function removeMember(id) {
  if (!confirm(`確定移除 ${memberName(id)}？`)) return;
  await store.setMembers(trip.id, trip.members.filter((m) => m.id !== id));
}

// ---------- 支出表單 ----------

const expenseDialog = document.getElementById("expense-dialog");
const expenseForm = document.getElementById("expense-form");
const expTitle = document.getElementById("exp-title");
const expAmount = document.getElementById("exp-amount");
const expDate = document.getElementById("exp-date");
const expPayer = document.getElementById("exp-payer");
const splitListEl = document.getElementById("split-list");
const splitHint = document.getElementById("split-hint");
const expError = document.getElementById("expense-error");
const expDelete = document.getElementById("exp-delete");
let editingId = null;
let splitMode = "equal";

function setSplitMode(mode) {
  splitMode = mode;
  expenseDialog.querySelectorAll("[data-split-mode]").forEach((b) =>
    b.classList.toggle("active", b.dataset.splitMode === mode)
  );
  splitListEl.classList.toggle("custom", mode === "custom");
  updateSplitHint();
}

function openExpense(expense) {
  if (expense?.type === "transfer") {
    if (confirm(`刪除這筆還款紀錄（${formatEuro(expense.amount)}）？`)) {
      store.deleteExpense(trip.id, expense.id).catch((err) => showBanner(`刪除失敗：${err.message}`));
    }
    return;
  }
  editingId = expense?.id ?? null;
  const me = getMe();
  document.getElementById("expense-dialog-title").textContent = expense ? "編輯支出" : "新增支出";
  expTitle.value = expense?.title ?? "";
  expAmount.value = expense ? (expense.amount / 100).toFixed(2) : "";
  expDate.value = expense?.date ?? todayIso();
  expPayer.innerHTML = trip.members
    .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
    .join("");
  expPayer.value = expense?.paidBy ?? (me && trip.members.some((m) => m.id === me) ? me : trip.members[0].id);

  const shares = expense?.shares ?? null;
  splitListEl.innerHTML = trip.members.map((m) => {
    const checked = shares ? m.id in shares : true;
    const value = shares?.[m.id] != null ? (shares[m.id] / 100).toFixed(2) : "";
    return `<label class="split-row">
      <input type="checkbox" value="${m.id}" ${checked ? "checked" : ""} />
      <span class="split-name">${escapeHtml(m.name)}</span>
      <input class="split-amount" data-id="${m.id}" inputmode="decimal" placeholder="0.00" value="${value}" />
    </label>`;
  }).join("");

  expDelete.hidden = !expense;
  expError.hidden = true;
  setSplitMode(expense?.splitMode ?? "equal");
  expenseDialog.showModal();
  if (!expense) expTitle.focus();
}

function selectedParticipants() {
  return [...splitListEl.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.value);
}

function updateSplitHint() {
  const total = parseEuroToCents(expAmount.value);
  const ids = selectedParticipants();
  if (splitMode === "equal") {
    splitHint.textContent = ids.length && total > 0
      ? `${ids.length} 人平均，每人約 ${formatEuro(Math.round(total / ids.length))}`
      : "勾選要一起分攤的人";
    return;
  }
  let assigned = 0;
  for (const input of splitListEl.querySelectorAll(".split-amount")) {
    const v = parseEuroToCents(input.value);
    if (ids.includes(input.dataset.id) && v > 0) assigned += v;
  }
  const left = (total > 0 ? total : 0) - assigned;
  splitHint.textContent = `已分配 ${formatEuro(assigned)}，${left >= 0 ? `還剩 ${formatEuro(left)}` : `超出 ${formatEuro(-left)}`}`;
}

expenseDialog.addEventListener("click", (e) => {
  const modeBtn = e.target.closest("[data-split-mode]");
  if (modeBtn) setSplitMode(modeBtn.dataset.splitMode);
});
expenseForm.addEventListener("input", (e) => {
  // 在自訂金額欄輸入時自動勾選該成員。
  if (e.target.classList.contains("split-amount") && e.target.value) {
    e.target.closest(".split-row").querySelector("input[type=checkbox]").checked = true;
  }
  updateSplitHint();
});
document.getElementById("exp-cancel").addEventListener("click", () => expenseDialog.close());

expDelete.addEventListener("click", async () => {
  if (!editingId || !confirm("確定刪除這筆支出？")) return;
  try {
    await store.deleteExpense(trip.id, editingId);
    expenseDialog.close();
  } catch (err) {
    showExpenseError(`刪除失敗：${err.message}`);
  }
});

function showExpenseError(message) {
  expError.textContent = message;
  expError.hidden = false;
}

expenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = expTitle.value.trim();
  const amount = parseEuroToCents(expAmount.value);
  const ids = selectedParticipants();
  if (!title) return showExpenseError("請填寫項目");
  if (!(amount > 0)) return showExpenseError("金額格式不正確，例如 12.50");
  if (!ids.length) return showExpenseError("至少要勾選一位分攤的人");

  let shares;
  if (splitMode === "equal") {
    shares = splitEqual(amount, ids);
  } else {
    shares = {};
    let sum = 0;
    for (const id of ids) {
      const input = splitListEl.querySelector(`.split-amount[data-id="${id}"]`);
      const v = input.value.trim() ? parseEuroToCents(input.value) : 0;
      if (Number.isNaN(v)) return showExpenseError(`${memberName(id)} 的金額格式不正確`);
      if (v > 0) shares[id] = v;
      sum += v;
    }
    if (sum !== amount) {
      return showExpenseError(`各人金額加總 ${formatEuro(sum)}，與總額 ${formatEuro(amount)} 不符`);
    }
    if (!Object.keys(shares).length) return showExpenseError("至少要有一位分攤金額大於 0");
  }

  const saveBtn = document.getElementById("exp-save");
  saveBtn.disabled = true;
  try {
    await store.saveExpense(trip.id, {
      type: "expense",
      title,
      amount,
      date: expDate.value || todayIso(),
      paidBy: expPayer.value,
      splitMode,
      shares,
    }, editingId);
    expenseDialog.close();
  } catch (err) {
    showExpenseError(`儲存失敗：${err.message}`);
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- 分享 ----------

const shareDialog = document.getElementById("share-dialog");
let qrLibPromise = null;

function loadQrLib() {
  if (window.QRCode) return Promise.resolve();
  qrLibPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = QR_LIB;
    s.onload = resolve;
    s.onerror = () => {
      qrLibPromise = null;
      reject(new Error("QR Code 載入失敗"));
    };
    document.head.appendChild(s);
  });
  return qrLibPromise;
}

async function openShare() {
  const url = shareUrl(trip.id);
  document.getElementById("share-url").value = url;
  document.getElementById("native-share").hidden = !navigator.share;
  const qrEl = document.getElementById("qr");
  qrEl.innerHTML = "";
  shareDialog.showModal();
  try {
    await loadQrLib();
    new window.QRCode(qrEl, { text: url, width: 200, height: 200, correctLevel: window.QRCode.CorrectLevel.M });
  } catch (err) {
    qrEl.innerHTML = `<p class="muted">${escapeHtml(err.message)}，請改用下方連結。</p>`;
  }
}

document.getElementById("copy-link").addEventListener("click", async (e) => {
  const input = document.getElementById("share-url");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  e.target.textContent = "已複製";
  setTimeout(() => (e.target.textContent = "複製"), 1500);
});
document.getElementById("native-share").addEventListener("click", () => {
  navigator.share({ title: `旅行分帳：${trip.name}`, url: shareUrl(trip.id) }).catch(() => {});
});
document.getElementById("share-close").addEventListener("click", () => shareDialog.close());

// ---------- 啟動 ----------

async function main() {
  try {
    store = await createStore();
  } catch (err) {
    console.error(err);
    appEl.innerHTML = `<section class="card center">
      <h2>無法連線</h2>
      <p class="muted">${escapeHtml(err.message)}</p>
      <p class="hint-small">請確認網路連線，以及 Firebase 已啟用「匿名登入」。</p>
      <button type="button" onclick="location.reload()">重試</button>
    </section>`;
    return;
  }
  if (store.mode === "local") {
    modeBadge.textContent = "單機試用";
    modeBadge.hidden = false;
  }
  resetBanner();
  window.addEventListener("hashchange", () => {
    resetBanner();
    currentTab = "expenses";
    route();
  });
  route();
}

main();
