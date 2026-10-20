import { createStore, newId } from "./store.js";
import {
  splitEqual,
  computeBalances,
  computeSpending,
  settle,
  DEFAULT_CURRENCY,
  CURRENCIES,
  currencyDecimals,
  parseAmount,
  toInputValue,
  formatMoney,
  expenseCurrency,
  groupByCurrency,
} from "./settle.js";
import { t, getLang, setLang, getLocale, applyStaticText } from "./i18n.js";

const RECENT_KEY = "splitbill-recent";
const ME_KEY_PREFIX = "splitbill-me-";
const LAST_CURRENCY_PREFIX = "splitbill-cur-";
const QR_LIB = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

const appEl = document.getElementById("app");
const bannerEl = document.getElementById("banner");
const modeBadge = document.getElementById("mode-badge");

let store = null;
let unsubscribers = [];
let trip = null;
let expenses = [];
let currentTab = "expenses";
// home / loading / trip / notfound：切換語言時用來決定要重畫哪個畫面。
let view = "loading";

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
  if (store?.mode === "local") showBanner(t("trialBanner"), "info");
  else showBanner("");
}

function money(amount, currency) {
  return formatMoney(amount, currency, getLocale());
}

function currencyName(code) {
  try {
    return new Intl.DisplayNames([getLocale()], { type: "currency" }).of(code);
  } catch {
    return code;
  }
}

function currencyOptions(selected) {
  return CURRENCIES.map((c) =>
    `<option value="${c}" ${c === selected ? "selected" : ""}>${c} – ${escapeHtml(currencyName(c))}</option>`
  ).join("");
}

function tripCurrency() {
  return trip?.currency || DEFAULT_CURRENCY;
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
  return new Intl.DateTimeFormat(getLocale(), { month: "short", day: "numeric", weekday: "short" })
    .format(new Date(y, m - 1, d));
}

function memberName(id) {
  return trip?.members.find((m) => m.id === id)?.name ?? t("removedMember");
}

function getMe() {
  return trip ? safeGet(ME_KEY_PREFIX + trip.id, null) : null;
}

function rememberRecent(id, name) {
  const recent = safeGet(RECENT_KEY, []).filter((r) => r.id !== id);
  recent.unshift({ id, name, openedAt: Date.now() });
  safeSet(RECENT_KEY, recent.slice(0, 20));
}

function forgetRecent(id) {
  safeSet(RECENT_KEY, safeGet(RECENT_KEY, []).filter((r) => r.id !== id));
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
}

function route() {
  clearSubscriptions();
  const match = location.hash.match(/^#\/trip\/([A-Za-z0-9]+)/);
  if (match) openTrip(match[1]);
  else renderHome();
}

function rerender() {
  if (view === "home") renderHome();
  else if (view === "trip") renderTrip();
  else if (view === "notfound") renderNotFound();
  else if (view === "loading") renderLoading();
}

// ---------- 首頁 ----------

function renderHome() {
  view = "home";
  const recent = safeGet(RECENT_KEY, []);
  appEl.innerHTML = `
    ${recent.length ? `
      <section class="card">
        <h2>${t("myTrips")}</h2>
        <ul class="trip-list">
          ${recent.map((r) => `
            <li><a href="#/trip/${escapeHtml(r.id)}">
              <span>${escapeHtml(r.name)}</span><span class="chev">›</span>
            </a></li>`).join("")}
        </ul>
      </section>` : ""}

    <section class="card">
      <h2>${t("createTitle")}</h2>
      <form id="create-form">
        <div class="field">
          <label for="trip-name">${t("tripName")}</label>
          <input id="trip-name" required maxlength="40" placeholder="${escapeHtml(t("tripNamePh"))}" />
        </div>
        <div class="field">
          <span class="label">${t("companions")}</span>
          <div id="member-inputs" class="member-inputs">
            ${memberInput(t("memberPhFirst"))}
            ${memberInput(t("memberPh", { n: 2 }))}
          </div>
          <button type="button" id="add-member-input" class="text-btn">${t("addAnother")}</button>
        </div>
        <div class="field">
          <label for="trip-currency">${t("defaultCurrency")}</label>
          <select id="trip-currency">${currencyOptions(DEFAULT_CURRENCY)}</select>
        </div>
        <p class="hint-small">${t("currencyHint")}</p>
        <button type="submit" class="block">${t("createBtn")}</button>
      </form>
    </section>

    <section class="card">
      <h2>${t("joinTitle")}</h2>
      <form id="join-form" class="inline-form">
        <input id="join-input" required placeholder="${escapeHtml(t("joinPh"))}" autocomplete="off" />
        <button type="submit">${t("joinBtn")}</button>
      </form>
    </section>
  `;

  const memberInputs = document.getElementById("member-inputs");
  document.getElementById("add-member-input").addEventListener("click", () => {
    const n = memberInputs.children.length + 1;
    memberInputs.insertAdjacentHTML("beforeend", memberInput(t("memberPh", { n })));
    memberInputs.lastElementChild.focus();
  });

  document.getElementById("create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("trip-name").value.trim();
    const currency = document.getElementById("trip-currency").value;
    const names = [...memberInputs.querySelectorAll("input")]
      .map((i) => i.value.trim())
      .filter(Boolean);
    if (!name) return;
    if (names.length < 2) {
      showBanner(t("errMinMembers"));
      return;
    }
    if (new Set(names).size !== names.length) {
      showBanner(t("errDupMembers"));
      return;
    }
    resetBanner();
    const button = e.submitter;
    button.disabled = true;
    try {
      const members = names.map((n) => ({ id: newId(), name: n }));
      const id = await store.createTrip({ name, members, currency });
      // 建立的人預設是第一位。
      safeSet(ME_KEY_PREFIX + id, members[0].id);
      location.hash = `#/trip/${id}`;
    } catch (err) {
      showBanner(t("errCreate", { msg: err.message }));
      button.disabled = false;
    }
  });

  document.getElementById("join-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const value = document.getElementById("join-input").value.trim();
    const match = value.match(/trip\/([A-Za-z0-9]+)/) || value.match(/^([A-Za-z0-9]{10,})$/);
    if (!match) {
      showBanner(t("errJoinLink"));
      return;
    }
    resetBanner();
    location.hash = `#/trip/${match[1]}`;
  });
}

function memberInput(placeholder) {
  return `<input class="member-input" maxlength="20" placeholder="${escapeHtml(placeholder)}" />`;
}

// ---------- 帳本頁 ----------

function renderLoading() {
  view = "loading";
  appEl.innerHTML = `<p class="muted center">${t("loadingTrip")}</p>`;
}

function renderNotFound() {
  view = "notfound";
  appEl.innerHTML = `
    <section class="card center">
      <h2>${t("notFound")}</h2>
      <p class="muted">${t("notFoundHint")}</p>
      <a href="#/" class="button">${t("backHome")}</a>
    </section>`;
}

function openTrip(tripId) {
  renderLoading();
  let tripLoaded = false;
  const onError = (err) => {
    console.error(err);
    showBanner(t("errLoad", { msg: err.message }));
  };
  unsubscribers.push(
    store.subscribeTrip(tripId, (data) => {
      tripLoaded = true;
      if (!data) {
        trip = null;
        forgetRecent(tripId);
        renderNotFound();
        return;
      }
      trip = data;
      rememberRecent(trip.id, trip.name);
      renderTrip();
    }, onError),
    store.subscribeExpenses(tripId, (list) => {
      expenses = list;
      if (tripLoaded && trip) renderTrip();
    }, onError)
  );
}

function sortedExpenses() {
  return [...expenses].sort((a, b) =>
    b.date.localeCompare(a.date) || toMillis(b.createdAt) - toMillis(a.createdAt)
  );
}

// 每個幣別各自計算差額：Map<幣別, { 成員ID: 差額 }>
function balancesByCurrency() {
  const result = new Map();
  for (const [currency, list] of groupByCurrency(expenses, tripCurrency())) {
    result.set(currency, computeBalances(trip.members, list));
  }
  return result;
}

function myBalanceLine(me, balances) {
  if (!me || !trip.members.some((m) => m.id === me)) {
    return `<span class="muted">${t("pickMe")}</span>`;
  }
  const owed = [];
  const owe = [];
  for (const [currency, b] of balances) {
    const v = b[me] || 0;
    if (v > 0) owed.push(money(v, currency));
    else if (v < 0) owe.push(money(-v, currency));
  }
  if (!owed.length && !owe.length) return `<span class="muted">${t("settledMe")}</span>`;
  const parts = [];
  if (owed.length) parts.push(`<span class="pos">${t("owedToYou", { amounts: owed.join(t("listSep")) })}</span>`);
  if (owe.length) parts.push(`<span class="neg">${t("youOwe", { amounts: owe.join(t("listSep")) })}</span>`);
  return parts.join("<br />");
}

function renderTrip() {
  if (!trip) return;
  view = "trip";
  const me = getMe();
  const balances = balancesByCurrency();

  const totals = [];
  for (const [currency, list] of groupByCurrency(expenses.filter((e) => e.type !== "transfer"), tripCurrency())) {
    totals.push(money(list.reduce((sum, e) => sum + e.amount, 0), currency));
  }
  if (!totals.length) totals.push(money(0, tripCurrency()));

  appEl.innerHTML = `
    <section class="card trip-head">
      <div class="trip-title-row">
        <h1>${escapeHtml(trip.name)}</h1>
        <button type="button" data-action="share" class="secondary small">${t("invite")}</button>
      </div>
      <div class="stat-row">
        <div class="stat stat-wide">
          <span class="stat-label">${t("totalSpent")}</span>
          ${totals.map((x) => `<span class="stat-value">${x}</span>`).join("")}
        </div>
        <div class="stat">
          <span class="stat-label">${t("people")}</span>
          <span class="stat-value">${trip.members.length}</span>
        </div>
      </div>
      <div class="me-row">
        <label for="me-select">${t("iAm")}</label>
        <select id="me-select">
          <option value="">${t("choose")}</option>
          ${trip.members.map((m) => `
            <option value="${m.id}" ${m.id === me ? "selected" : ""}>${escapeHtml(m.name)}</option>`).join("")}
        </select>
        <span class="me-balance">${myBalanceLine(me, balances)}</span>
      </div>
    </section>

    <nav class="tabs">
      ${tabButton("expenses", t("tabExpenses"))}
      ${tabButton("settle", t("tabSettle"))}
      ${tabButton("members", t("tabMembers"))}
    </nav>

    <section id="tab-body">
      ${currentTab === "expenses" ? renderExpensesTab(me)
        : currentTab === "settle" ? renderSettleTab(balances)
        : renderMembersTab()}
    </section>

    ${currentTab === "expenses"
      ? `<button type="button" class="fab" data-action="add-expense">${t("addExpenseFab")}</button>`
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
      <p>${t("emptyTitle")}</p>
      <p class="muted">${t("emptyHint")}</p>
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
  const currency = expenseCurrency(e);
  if (e.type === "transfer") {
    const to = Object.keys(e.shares)[0];
    return `<li data-action="edit-expense" data-id="${e.id}" class="transfer">
      <div class="exp-main">
        <span class="exp-title">💸 ${escapeHtml(t("transferTitle", { from: memberName(e.paidBy), to: memberName(to) }))}</span>
        <span class="exp-sub">${t("transferSub")}</span>
      </div>
      <span class="exp-amount">${money(e.amount, currency)}</span>
    </li>`;
  }
  const count = Object.keys(e.shares).length;
  const myShare = me && e.shares[me] ? t("myShare", { amount: money(e.shares[me], currency) }) : "";
  return `<li data-action="edit-expense" data-id="${e.id}">
    <div class="exp-main">
      <span class="exp-title">${escapeHtml(e.title)}</span>
      <span class="exp-sub">${escapeHtml(t("expenseSub", { payer: memberName(e.paidBy), n: count }))}${myShare}</span>
    </div>
    <span class="exp-amount">${money(e.amount, currency)}</span>
  </li>`;
}

function renderSettleTab(balances) {
  if (!balances.size) {
    return `<div class="card"><h2>${t("howToSettle")}</h2><p class="muted">${t("allSettled")}</p></div>`;
  }
  const multi = balances.size > 1;
  const sections = [...balances].map(([currency, b]) => {
    const list = expenses.filter((e) => expenseCurrency(e) === currency);
    const spending = computeSpending(trip.members, list);
    const transfers = settle(b);
    const label = `${currency} – ${currencyName(currency)}`;
    return `
      <div class="card">
        <h2>${multi ? t("howToSettleCur", { currency: escapeHtml(label) }) : t("howToSettle")}</h2>
        ${transfers.length ? `
          <ul class="transfer-list">
            ${transfers.map((tr) => `
              <li>
                <div><strong>${escapeHtml(memberName(tr.from))}</strong> → <strong>${escapeHtml(memberName(tr.to))}</strong></div>
                <div class="transfer-right">
                  <span class="exp-amount">${money(tr.amount, currency)}</span>
                  <button type="button" class="small secondary" data-action="mark-paid"
                    data-from="${tr.from}" data-to="${tr.to}" data-amount="${tr.amount}" data-currency="${currency}">${t("markPaid")}</button>
                </div>
              </li>`).join("")}
          </ul>`
        : `<p class="muted">${t("allSettled")}</p>`}
      </div>

      <div class="card">
        <h2>${multi ? t("perPersonCur", { currency }) : t("perPerson")}</h2>
        <table class="balance-table">
          <thead><tr><th>${t("colMember")}</th><th>${t("colSpent")}</th><th>${t("colBalance")}</th></tr></thead>
          <tbody>
            ${trip.members.map((m) => {
              const v = b[m.id] || 0;
              const cls = v > 0 ? "pos" : v < 0 ? "neg" : "muted";
              return `<tr>
                <td>${escapeHtml(m.name)}</td>
                <td>${money(spending[m.id] || 0, currency)}</td>
                <td class="${cls}">${v > 0 ? "+" : ""}${money(v, currency)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }).join("");
  return `${sections}
    <p class="hint-small settle-foot">${t("settleHint")}</p>
    <p class="hint-small settle-foot">${t("balanceHint")}</p>`;
}

function renderMembersTab() {
  const used = new Set();
  for (const e of expenses) {
    used.add(e.paidBy);
    Object.keys(e.shares).forEach((id) => used.add(id));
  }
  return `
    <div class="card">
      <h2>${t("membersTitle")}</h2>
      <ul class="member-list">
        ${trip.members.map((m) => `
          <li>
            <span>${escapeHtml(m.name)}</span>
            <span class="member-actions">
              <button type="button" class="text-btn" data-action="rename-member" data-id="${m.id}">${t("rename")}</button>
              ${used.has(m.id)
                ? `<span class="hint-small">${t("cantRemove")}</span>`
                : `<button type="button" class="danger-link" data-action="remove-member" data-id="${m.id}">${t("remove")}</button>`}
            </span>
          </li>`).join("")}
      </ul>
      <form id="add-member-form" class="inline-form">
        <input id="new-member" maxlength="20" placeholder="${escapeHtml(t("newMemberPh"))}" required />
        <button type="submit">${t("add")}</button>
      </form>
    </div>
    <div class="card">
      <button type="button" class="secondary block" data-action="leave">${t("leave")}</button>
      <p class="hint-small">${t("leaveHint")}</p>
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
    showBanner(t("errAction", { msg: err.message }));
  }
});

appEl.addEventListener("submit", async (e) => {
  if (e.target.id !== "add-member-form") return;
  e.preventDefault();
  const input = document.getElementById("new-member");
  const name = input.value.trim();
  if (!name) return;
  if (trip.members.some((m) => m.name === name)) {
    showBanner(t("errDupName"));
    return;
  }
  resetBanner();
  try {
    await store.setMembers(trip.id, [...trip.members, { id: newId(), name }]);
  } catch (err) {
    showBanner(t("errAdd", { msg: err.message }));
  }
});

async function markPaid({ from, to, amount, currency }) {
  const value = Number(amount);
  if (!confirm(t("confirmPaid", { from: memberName(from), to: memberName(to), amount: money(value, currency) }))) return;
  await store.saveExpense(trip.id, {
    type: "transfer",
    title: "repayment",
    amount: value,
    currency,
    date: todayIso(),
    paidBy: from,
    splitMode: "custom",
    shares: { [to]: value },
  });
}

async function renameMember(id) {
  const current = memberName(id);
  const name = prompt(t("renamePrompt"), current)?.trim();
  if (!name || name === current) return;
  if (trip.members.some((m) => m.name === name)) {
    showBanner(t("errDupName"));
    return;
  }
  await store.setMembers(trip.id, trip.members.map((m) => (m.id === id ? { ...m, name } : m)));
}

async function removeMember(id) {
  if (!confirm(t("confirmRemove", { name: memberName(id) }))) return;
  await store.setMembers(trip.id, trip.members.filter((m) => m.id !== id));
}

// ---------- 支出表單 ----------

const expenseDialog = document.getElementById("expense-dialog");
const expenseForm = document.getElementById("expense-form");
const expTitle = document.getElementById("exp-title");
const expAmount = document.getElementById("exp-amount");
const expCurrency = document.getElementById("exp-currency");
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

// 依幣別調整輸入框：日圓等沒有小數的幣別用數字鍵盤。
function applyCurrencyToInputs() {
  const decimals = currencyDecimals(expCurrency.value);
  const placeholder = decimals ? `0.${"0".repeat(decimals)}` : "0";
  const mode = decimals ? "decimal" : "numeric";
  for (const input of [expAmount, ...splitListEl.querySelectorAll(".split-amount")]) {
    input.placeholder = placeholder;
    input.inputMode = mode;
  }
}

function openExpense(expense) {
  if (expense?.type === "transfer") {
    const amount = money(expense.amount, expenseCurrency(expense));
    if (confirm(t("confirmDeleteTransfer", { amount }))) {
      store.deleteExpense(trip.id, expense.id).catch((err) => showBanner(t("errDelete", { msg: err.message })));
    }
    return;
  }
  editingId = expense?.id ?? null;
  const me = getMe();
  const currency = expense
    ? expenseCurrency(expense)
    : safeGet(LAST_CURRENCY_PREFIX + trip.id, null) || tripCurrency();

  document.getElementById("expense-dialog-title").textContent = t(expense ? "expenseEdit" : "expenseNew");
  expTitle.value = expense?.title ?? "";
  expCurrency.innerHTML = currencyOptions(currency);
  expAmount.value = expense ? toInputValue(expense.amount, currency) : "";
  expDate.value = expense?.date ?? todayIso();
  expPayer.innerHTML = trip.members
    .map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`)
    .join("");
  expPayer.value = expense?.paidBy ?? (me && trip.members.some((m) => m.id === me) ? me : trip.members[0].id);

  const shares = expense?.shares ?? null;
  splitListEl.innerHTML = trip.members.map((m) => {
    const checked = shares ? m.id in shares : true;
    const value = shares?.[m.id] != null ? toInputValue(shares[m.id], currency) : "";
    return `<label class="split-row">
      <input type="checkbox" value="${m.id}" ${checked ? "checked" : ""} />
      <span class="split-name">${escapeHtml(m.name)}</span>
      <input class="split-amount" data-id="${m.id}" value="${value}" />
    </label>`;
  }).join("");

  expDelete.hidden = !expense;
  expError.hidden = true;
  applyCurrencyToInputs();
  setSplitMode(expense?.splitMode ?? "equal");
  expenseDialog.showModal();
  if (!expense) expTitle.focus();
}

function selectedParticipants() {
  return [...splitListEl.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.value);
}

function updateSplitHint() {
  const currency = expCurrency.value || tripCurrency();
  const total = parseAmount(expAmount.value, currency);
  const ids = selectedParticipants();
  if (splitMode === "equal") {
    splitHint.textContent = ids.length && total > 0
      ? t("hintEqual", { n: ids.length, amount: money(Math.round(total / ids.length), currency) })
      : t("hintPick");
    return;
  }
  let assigned = 0;
  for (const input of splitListEl.querySelectorAll(".split-amount")) {
    const v = parseAmount(input.value, currency);
    if (ids.includes(input.dataset.id) && v > 0) assigned += v;
  }
  const left = (total > 0 ? total : 0) - assigned;
  const rest = left >= 0
    ? t("hintLeft", { amount: money(left, currency) })
    : t("hintOver", { amount: money(-left, currency) });
  splitHint.textContent = t("hintAssigned", { assigned: money(assigned, currency), rest });
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
expCurrency.addEventListener("change", () => {
  applyCurrencyToInputs();
  updateSplitHint();
});
document.getElementById("exp-cancel").addEventListener("click", () => expenseDialog.close());

expDelete.addEventListener("click", async () => {
  if (!editingId || !confirm(t("confirmDelete"))) return;
  try {
    await store.deleteExpense(trip.id, editingId);
    expenseDialog.close();
  } catch (err) {
    showExpenseError(t("errDelete", { msg: err.message }));
  }
});

function showExpenseError(message) {
  expError.textContent = message;
  expError.hidden = false;
}

expenseForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const currency = expCurrency.value;
  const title = expTitle.value.trim();
  const amount = parseAmount(expAmount.value, currency);
  const ids = selectedParticipants();
  if (!title) return showExpenseError(t("errTitle"));
  if (!(amount > 0)) {
    const example = currencyDecimals(currency) ? "12.50" : "1500";
    return showExpenseError(t("errAmount", { example }));
  }
  if (!ids.length) return showExpenseError(t("errNoOne"));

  let shares;
  if (splitMode === "equal") {
    shares = splitEqual(amount, ids);
  } else {
    shares = {};
    let sum = 0;
    for (const id of ids) {
      const input = splitListEl.querySelector(`.split-amount[data-id="${id}"]`);
      const v = input.value.trim() ? parseAmount(input.value, currency) : 0;
      if (Number.isNaN(v)) return showExpenseError(t("errMemberAmount", { name: memberName(id) }));
      if (v > 0) shares[id] = v;
      sum += v;
    }
    if (sum !== amount) {
      return showExpenseError(t("errSumMismatch", { sum: money(sum, currency), total: money(amount, currency) }));
    }
    if (!Object.keys(shares).length) return showExpenseError(t("errAllZero"));
  }

  const saveBtn = document.getElementById("exp-save");
  saveBtn.disabled = true;
  try {
    await store.saveExpense(trip.id, {
      type: "expense",
      title,
      amount,
      currency,
      date: expDate.value || todayIso(),
      paidBy: expPayer.value,
      splitMode,
      shares,
    }, editingId);
    safeSet(LAST_CURRENCY_PREFIX + trip.id, currency);
    expenseDialog.close();
  } catch (err) {
    showExpenseError(t("errSave", { msg: err.message }));
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
      reject(new Error("QR"));
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
  } catch {
    qrEl.innerHTML = `<p class="muted">${t("qrFail")}</p>`;
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
  e.target.textContent = t("copied");
  setTimeout(() => (e.target.textContent = t("copy")), 1500);
});
document.getElementById("native-share").addEventListener("click", () => {
  navigator.share({ title: t("shareText", { name: trip.name }), url: shareUrl(trip.id) }).catch(() => {});
});
document.getElementById("share-close").addEventListener("click", () => shareDialog.close());

// ---------- 語言 ----------

const langToggle = document.getElementById("lang-toggle");

function applyLanguage() {
  applyStaticText();
  langToggle.setAttribute("aria-label", t("langToggleLabel"));
}

langToggle.addEventListener("click", () => {
  setLang(getLang() === "zh" ? "en" : "zh");
  applyLanguage();
  if (store) resetBanner();
  rerender();
});

// ---------- 啟動 ----------

async function main() {
  applyLanguage();
  try {
    store = await createStore();
  } catch (err) {
    console.error(err);
    appEl.innerHTML = `<section class="card center">
      <h2>${t("connFail")}</h2>
      <p class="muted">${escapeHtml(err.message)}</p>
      <p class="hint-small">${t("connHint")}</p>
      <button type="button" onclick="location.reload()">${t("retry")}</button>
    </section>`;
    return;
  }
  if (store.mode === "local") modeBadge.hidden = false;
  resetBanner();
  window.addEventListener("hashchange", () => {
    resetBanner();
    currentTab = "expenses";
    route();
  });
  route();
}

main();
