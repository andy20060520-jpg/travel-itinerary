// 介面文字（繁中 / English）。t("key", { name: "..." }) 會把 {name} 換成對應值。

const LANG_KEY = "splitbill-lang";

const messages = {
  zh: {
    appName: "旅行分帳",
    langToggle: "EN",
    langToggleLabel: "Switch to English",
    trialBadge: "單機試用",
    trialBanner: "目前是單機試用模式：資料只存在這支手機，不會和旅伴同步。設定 Firebase 後即可多人共用（見 README）。",
    loading: "載入中…",
    listSep: "、",

    myTrips: "我的帳本",
    createTitle: "建立新帳本",
    tripName: "旅程名稱",
    tripNamePh: "例如：2026 巴黎・羅馬",
    companions: "旅伴（含自己）",
    memberPhFirst: "第 1 位，例如：我",
    memberPh: "第 {n} 位",
    addAnother: "＋ 再加一位",
    defaultCurrency: "預設幣別",
    currencyHint: "每筆支出都能選不同幣別，各幣別分開結算，不換算匯率。建立後可以隨時再加人。",
    createBtn: "建立並開始記帳",
    joinTitle: "加入朋友的帳本",
    joinPh: "貼上邀請連結",
    joinBtn: "加入",
    errMinMembers: "至少需要兩位旅伴才能分帳喔",
    errDupMembers: "旅伴名字不能重複",
    errCreate: "建立失敗：{msg}",
    errJoinLink: "看不懂這個連結，請確認是完整的邀請連結",

    loadingTrip: "載入帳本中…",
    errLoad: "無法讀取帳本：{msg}",
    notFound: "找不到這個帳本",
    notFoundHint: "連結可能不完整，或帳本是在另一支手機的「單機試用模式」建立的。",
    backHome: "回首頁",
    invite: "邀請",
    totalSpent: "總花費",
    people: "人數",
    iAm: "我是",
    choose: "— 選擇 —",
    pickMe: "先選擇「我是誰」",
    owedToYou: "別人欠你 {amounts}",
    youOwe: "你欠別人 {amounts}",
    settledMe: "你目前不欠也不被欠",
    tabExpenses: "支出",
    tabSettle: "結算",
    tabMembers: "成員",
    addExpenseFab: "＋ 新增支出",
    emptyTitle: "還沒有任何支出",
    emptyHint: "按下方「新增支出」開始記第一筆。",
    transferTitle: "{from} 還給 {to}",
    transferSub: "還款紀錄",
    expenseSub: "{payer} 付・{n} 人分",
    myShare: "・我的份 {amount}",
    removedMember: "（已移除）",

    howToSettle: "該怎麼還",
    howToSettleCur: "該怎麼還（{currency}）",
    markPaid: "已還",
    settleHint: "已用最少的轉帳次數計算，各幣別分開結算。實際還錢後按「已還」，會留下一筆還款紀錄。",
    allSettled: "🎉 大家已經互不相欠",
    perPerson: "每人明細",
    perPersonCur: "每人明細（{currency}）",
    colMember: "成員",
    colSpent: "花費",
    colBalance: "差額",
    balanceHint: "差額為正代表別人欠他，為負代表他要付給別人。",

    membersTitle: "成員",
    rename: "改名",
    cantRemove: "有帳目，不能移除",
    remove: "移除",
    newMemberPh: "新成員名字",
    add: "加入",
    leave: "從「我的帳本」列表移除",
    leaveHint: "只會從這支手機的列表移除，帳本本身和其他人的資料不受影響。",
    errDupName: "已經有同名的成員了",
    errAdd: "加入失敗：{msg}",
    errAction: "操作失敗：{msg}",
    confirmPaid: "確認 {from} 已經還給 {to} {amount}？",
    renamePrompt: "新的名字",
    confirmRemove: "確定移除 {name}？",

    expenseNew: "新增支出",
    expenseEdit: "編輯支出",
    fTitle: "項目",
    fTitlePh: "例如：巴黎晚餐",
    fAmount: "金額",
    fCurrency: "幣別",
    fDate: "日期",
    fPayer: "誰付的錢",
    fSplit: "分給誰",
    equal: "平均分",
    custom: "自訂金額",
    delete: "刪除",
    cancel: "取消",
    save: "儲存",
    hintEqual: "{n} 人平均，每人約 {amount}",
    hintPick: "勾選要一起分攤的人",
    hintAssigned: "已分配 {assigned}，{rest}",
    hintLeft: "還剩 {amount}",
    hintOver: "超出 {amount}",
    confirmDeleteTransfer: "刪除這筆還款紀錄（{amount}）？",
    errDelete: "刪除失敗：{msg}",
    confirmDelete: "確定刪除這筆支出？",
    errTitle: "請填寫項目",
    errAmount: "金額格式不正確，例如 {example}",
    errNoOne: "至少要勾選一位分攤的人",
    errMemberAmount: "{name} 的金額格式不正確",
    errSumMismatch: "各人金額加總 {sum}，與總額 {total} 不符",
    errAllZero: "至少要有一位分攤金額大於 0",
    errSave: "儲存失敗：{msg}",

    shareTitle: "邀請旅伴",
    shareHint: "用手機掃描 QR Code，或把連結傳到群組。打開連結的人都能一起記帳。",
    copy: "複製",
    copied: "已複製",
    shareOther: "用其他 App 分享",
    done: "完成",
    qrFail: "QR Code 載入失敗，請改用下方連結。",
    shareText: "旅行分帳：{name}",

    connFail: "無法連線",
    connHint: "請確認網路連線，以及 Firebase 已啟用「匿名登入」。",
    retry: "重試",
  },

  en: {
    appName: "Trip Split",
    langToggle: "中文",
    langToggleLabel: "切換成中文",
    trialBadge: "Trial",
    trialBanner: "Trial mode: data stays on this phone only and won't sync with your friends. Set up Firebase to share (see README).",
    loading: "Loading…",
    listSep: ", ",

    myTrips: "My trips",
    createTitle: "New trip",
    tripName: "Trip name",
    tripNamePh: "e.g. Paris & Rome 2026",
    companions: "Travelers (including you)",
    memberPhFirst: "Person 1, e.g. Me",
    memberPh: "Person {n}",
    addAnother: "+ Add another",
    defaultCurrency: "Default currency",
    currencyHint: "Each expense can use its own currency. Currencies are settled separately — no exchange rates. You can add people later.",
    createBtn: "Create and start",
    joinTitle: "Join a friend's trip",
    joinPh: "Paste the invite link",
    joinBtn: "Join",
    errMinMembers: "You need at least two travelers to split",
    errDupMembers: "Names must be unique",
    errCreate: "Couldn't create trip: {msg}",
    errJoinLink: "That doesn't look like a full invite link",

    loadingTrip: "Loading trip…",
    errLoad: "Couldn't load trip: {msg}",
    notFound: "Trip not found",
    notFoundHint: "The link may be incomplete, or the trip was created in trial mode on another phone.",
    backHome: "Back to home",
    invite: "Invite",
    totalSpent: "Total spent",
    people: "People",
    iAm: "I am",
    choose: "— Select —",
    pickMe: "Select who you are",
    owedToYou: "You're owed {amounts}",
    youOwe: "You owe {amounts}",
    settledMe: "You're all settled",
    tabExpenses: "Expenses",
    tabSettle: "Settle up",
    tabMembers: "Members",
    addExpenseFab: "+ Add expense",
    emptyTitle: "No expenses yet",
    emptyHint: "Tap “Add expense” below to record the first one.",
    transferTitle: "{from} paid back {to}",
    transferSub: "Repayment",
    expenseSub: "{payer} paid · split {n} ways",
    myShare: " · my share {amount}",
    removedMember: "(removed)",

    howToSettle: "Who pays whom",
    howToSettleCur: "Who pays whom ({currency})",
    markPaid: "Paid",
    settleHint: "Uses the fewest transfers; each currency is settled separately. After paying, tap “Paid” to record it.",
    allSettled: "🎉 Everyone is settled up",
    perPerson: "Per person",
    perPersonCur: "Per person ({currency})",
    colMember: "Member",
    colSpent: "Spent",
    colBalance: "Balance",
    balanceHint: "Positive means others owe them; negative means they owe others.",

    membersTitle: "Members",
    rename: "Rename",
    cantRemove: "Has expenses",
    remove: "Remove",
    newMemberPh: "New member's name",
    add: "Add",
    leave: "Remove from “My trips”",
    leaveHint: "Only removes it from this phone's list. The trip and everyone else's data stay intact.",
    errDupName: "Someone already has that name",
    errAdd: "Couldn't add: {msg}",
    errAction: "Something went wrong: {msg}",
    confirmPaid: "Confirm {from} paid {to} {amount}?",
    renamePrompt: "New name",
    confirmRemove: "Remove {name}?",

    expenseNew: "Add expense",
    expenseEdit: "Edit expense",
    fTitle: "What",
    fTitlePh: "e.g. Dinner in Paris",
    fAmount: "Amount",
    fCurrency: "Currency",
    fDate: "Date",
    fPayer: "Paid by",
    fSplit: "Split between",
    equal: "Equally",
    custom: "Custom",
    delete: "Delete",
    cancel: "Cancel",
    save: "Save",
    hintEqual: "{n} people, about {amount} each",
    hintPick: "Select who shares this",
    hintAssigned: "Assigned {assigned}, {rest}",
    hintLeft: "{amount} left",
    hintOver: "{amount} over",
    confirmDeleteTransfer: "Delete this repayment ({amount})?",
    errDelete: "Couldn't delete: {msg}",
    confirmDelete: "Delete this expense?",
    errTitle: "Enter what it was for",
    errAmount: "Invalid amount, e.g. {example}",
    errNoOne: "Select at least one person",
    errMemberAmount: "Invalid amount for {name}",
    errSumMismatch: "Shares add up to {sum}, but the total is {total}",
    errAllZero: "At least one share must be above 0",
    errSave: "Couldn't save: {msg}",

    shareTitle: "Invite travelers",
    shareHint: "Scan the QR code, or send the link to your group chat. Anyone with the link can add expenses.",
    copy: "Copy",
    copied: "Copied",
    shareOther: "Share via…",
    done: "Done",
    qrFail: "QR code failed to load — use the link below.",
    shareText: "Trip Split: {name}",

    connFail: "Can't connect",
    connHint: "Check your connection, and that Anonymous sign-in is enabled in Firebase.",
    retry: "Retry",
  },
};

function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && saved in messages) return saved;
  } catch {
    // 讀不到就依瀏覽器語言判斷。
  }
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

let lang = detectLang();

export function getLang() {
  return lang;
}

// 給 Intl 用的地區代碼，影響日期與金額格式。
export function getLocale() {
  return lang === "zh" ? "zh-TW" : "en-US";
}

export function setLang(next) {
  lang = next in messages ? next : "zh";
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // 私密瀏覽等情況寫不進去，只影響下次開啟的預設語言。
  }
}

export function t(key, params = {}) {
  const text = messages[lang][key] ?? messages.zh[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in params ? params[name] : `{${name}}`));
}

// 把 HTML 裡標了 data-i18n / data-i18n-placeholder 的元素換成目前語言。
export function applyStaticText(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
  document.title = t("appName");
}
