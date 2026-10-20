// 分帳計算：金額一律以該幣別的最小單位整數處理，避免浮點誤差。

// 把總額平均分給 ids，除不盡的零頭依序分給前面的人。
export function splitEqual(totalCents, ids) {
  const shares = {};
  if (!ids.length) return shares;
  const base = Math.floor(totalCents / ids.length);
  let remainder = totalCents - base * ids.length;
  for (const id of ids) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
  }
  return shares;
}

// 每人淨額：正數 = 別人欠他，負數 = 他欠別人。
export function computeBalances(members, expenses) {
  const balances = {};
  for (const m of members) balances[m.id] = 0;
  for (const e of expenses) {
    if (!(e.paidBy in balances)) balances[e.paidBy] = 0;
    balances[e.paidBy] += e.amount;
    for (const [id, share] of Object.entries(e.shares || {})) {
      if (!(id in balances)) balances[id] = 0;
      balances[id] -= share;
    }
  }
  return balances;
}

// 每人實際花費（只算消費，不含還款紀錄）。
export function computeSpending(members, expenses) {
  const spent = {};
  for (const m of members) spent[m.id] = 0;
  for (const e of expenses) {
    if (e.type === "transfer") continue;
    for (const [id, share] of Object.entries(e.shares || {})) {
      spent[id] = (spent[id] || 0) + share;
    }
  }
  return spent;
}

// 貪婪法：每次讓欠最多的人還給被欠最多的人，轉帳次數最多 n-1 次。
export function settle(balances) {
  const debtors = [];
  const creditors = [];
  for (const [id, amount] of Object.entries(balances)) {
    if (amount < 0) debtors.push({ id, amount: -amount });
    else if (amount > 0) creditors.push({ id, amount });
  }
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return transfers;
}

// ---------- 幣別 ----------
// 金額一律存成該幣別的最小單位整數（歐元存歐分、日圓存日圓），各幣別分開結算，不換算匯率。

export const DEFAULT_CURRENCY = "EUR";

export const CURRENCIES = [
  "EUR", "TWD", "USD", "GBP", "CHF", "JPY", "KRW", "CZK", "HUF", "PLN",
  "SEK", "NOK", "DKK", "ISK", "TRY", "HKD", "CNY", "THB", "SGD", "AUD", "CAD",
];

const decimalsCache = {};

// 每個幣別有幾位小數（EUR 2、JPY 0），依 Intl 的 ISO 4217 資料。
export function currencyDecimals(currency) {
  if (!(currency in decimalsCache)) {
    decimalsCache[currency] = new Intl.NumberFormat("en", { style: "currency", currency })
      .resolvedOptions().maximumFractionDigits;
  }
  return decimalsCache[currency];
}

// 「12,50」「12.5」「€ 12」都接受；回傳最小單位整數，無效則回傳 NaN。
// 沒有小數的幣別（JPY 等）接受「1,000」「1.000」這種千分位寫法。
export function parseAmount(text, currency = DEFAULT_CURRENCY) {
  const decimals = currencyDecimals(currency);
  let cleaned = String(text).replace(/[^\d.,]/g, "");
  if (decimals === 0) {
    if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) cleaned = cleaned.replace(/[.,]/g, "");
    if (!/^\d+$/.test(cleaned)) return NaN;
    return parseInt(cleaned, 10);
  }
  cleaned = cleaned.replace(",", ".");
  if (!new RegExp(`^\\d+(\\.\\d{0,${decimals}})?$`).test(cleaned)) return NaN;
  return Math.round(parseFloat(cleaned) * 10 ** decimals);
}

// 給輸入框用的純數字字串，例如 1250 EUR → "12.50"。
export function toInputValue(amount, currency = DEFAULT_CURRENCY) {
  const decimals = currencyDecimals(currency);
  return (amount / 10 ** decimals).toFixed(decimals);
}

export function formatMoney(amount, currency = DEFAULT_CURRENCY, locale = "zh-TW") {
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 10 ** decimals);
}

// 舊資料沒有 currency 欄位，一律當成歐元。
export function expenseCurrency(expense) {
  return expense.currency || DEFAULT_CURRENCY;
}

// 依幣別分組，預設幣別排最前面，其餘依字母排序。
export function groupByCurrency(expenses, preferred = DEFAULT_CURRENCY) {
  const groups = new Map();
  for (const e of expenses) {
    const c = expenseCurrency(e);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(e);
  }
  return new Map([...groups].sort(([a], [b]) =>
    (a === preferred ? -1 : b === preferred ? 1 : a.localeCompare(b))
  ));
}
