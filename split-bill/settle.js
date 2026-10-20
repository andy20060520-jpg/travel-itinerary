// 分帳計算：金額一律以「歐分」整數處理，避免浮點誤差。

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

// 「12,50」「12.5」「€ 12」都接受；回傳歐分整數，無效則回傳 NaN。
export function parseEuroToCents(text) {
  const cleaned = String(text).replace(/[€\s]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return NaN;
  return Math.round(parseFloat(cleaned) * 100);
}

const euroFormat = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "EUR" });

export function formatEuro(cents) {
  return euroFormat.format(cents / 100);
}
