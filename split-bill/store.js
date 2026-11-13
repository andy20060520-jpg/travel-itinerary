// 資料層：有 Firebase 設定時用 Firestore 即時同步，否則用 localStorage 單機試用。
// 兩種實作提供相同的介面，app.js 不需要知道底下是哪一種。
import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.2";
const FIREBASE_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

export function newId(length = 10) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

const CONNECT_TIMEOUT_MS = 20000;

export async function createStore() {
  if (!firebaseConfig.apiKey) return createLocalStore();
  // 連線卡住時不要永遠停在「載入中」，逾時就讓畫面顯示錯誤。
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([createFirebaseStore(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// LINE 等 App 的內建瀏覽器有時 IndexedDB 開不起來也不回應，Firebase 會一直等下去。
// 先試開一次，幾秒內沒成功就當作不能用。
function indexedDbWorks(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    const done = (ok) => {
      clearTimeout(timer);
      resolve(ok);
    };
    try {
      const req = indexedDB.open("splitbill-probe");
      req.onsuccess = () => {
        req.result.close();
        done(true);
      };
      req.onerror = () => done(false);
      req.onblocked = () => done(false);
    } catch {
      done(false);
    }
  });
}

async function createFirebaseStore() {
  const [{ initializeApp }, auth, fs, persistent] = await Promise.all([
    import(`${FIREBASE_BASE}/firebase-app.js`),
    import(`${FIREBASE_BASE}/firebase-auth.js`),
    import(`${FIREBASE_BASE}/firebase-firestore.js`),
    indexedDbWorks(),
  ]);

  if (!persistent) {
    // Firebase 內部的使用統計（heartbeat）也會開 IndexedDB 並等它回應，登入時會跟著卡住。
    // 把 IndexedDB 藏起來，Firebase 就會直接略過它。
    try {
      Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true });
    } catch {
      // 藏不起來就算了，最後還有連線逾時會顯示錯誤。
    }
  }

  const app = initializeApp(firebaseConfig);
  // 離線快取：在國外沒網路時也能記帳，連上網後自動上傳。IndexedDB 不能用時改存在記憶體。
  const db = fs.initializeFirestore(app, {
    localCache: persistent
      ? fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
      : fs.memoryLocalCache(),
  });
  // 已登入過的手機沿用原本的匿名身分，離線時也能直接使用。
  const authInstance = auth.initializeAuth(app, {
    persistence: persistent
      ? [auth.indexedDBLocalPersistence, auth.browserLocalPersistence]
      : [auth.browserLocalPersistence, auth.inMemoryPersistence],
  });
  await authInstance.authStateReady();
  if (!authInstance.currentUser) await auth.signInAnonymously(authInstance);

  const tripRef = (tripId) => fs.doc(db, "trips", tripId);
  const expensesRef = (tripId) => fs.collection(db, "trips", tripId, "expenses");

  return {
    mode: "firebase",

    async createTrip({ name, members, currency = "EUR" }) {
      const id = newId(20);
      await fs.setDoc(tripRef(id), {
        name,
        currency,
        members,
        createdAt: fs.serverTimestamp(),
      });
      return id;
    },

    subscribeTrip(tripId, onData, onError) {
      return fs.onSnapshot(
        tripRef(tripId),
        { includeMetadataChanges: true },
        (snap) => {
          // 帳本不在手機快取、又還沒連上伺服器時，Firestore 會先從快取回報「不存在」。
          // 這時還不能斷定帳本不存在，要等伺服器確認。
          if (!snap.exists() && snap.metadata.fromCache) return;
          onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        },
        onError
      );
    },

    subscribeExpenses(tripId, onData, onError) {
      return fs.onSnapshot(
        expensesRef(tripId),
        (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        onError
      );
    },

    async setMembers(tripId, members) {
      await fs.updateDoc(tripRef(tripId), { members });
    },

    async saveExpense(tripId, expense, expenseId) {
      const data = { ...expense, updatedAt: fs.serverTimestamp() };
      if (expenseId) {
        await fs.setDoc(fs.doc(expensesRef(tripId), expenseId), data);
      } else {
        await fs.addDoc(expensesRef(tripId), { ...data, createdAt: fs.serverTimestamp() });
      }
    },

    async deleteExpense(tripId, expenseId) {
      await fs.deleteDoc(fs.doc(expensesRef(tripId), expenseId));
    },
  };
}

const LOCAL_KEY = "splitbill-local-v1";

function createLocalStore() {
  const listeners = new Set();

  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { trips: {} };
    } catch {
      return { trips: {} };
    }
  };
  const write = (data) => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    listeners.forEach((fn) => fn());
  };
  // 同一支手機開多個分頁時也能互相更新。
  window.addEventListener("storage", (e) => {
    if (e.key === LOCAL_KEY) listeners.forEach((fn) => fn());
  });

  const listen = (fn) => {
    fn();
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  const updateTrip = (tripId, mutate) => {
    const data = read();
    const trip = data.trips[tripId];
    if (!trip) throw new Error("找不到這個帳本");
    mutate(trip);
    write(data);
  };

  return {
    mode: "local",

    async createTrip({ name, members, currency = "EUR" }) {
      const id = newId(20);
      const data = read();
      data.trips[id] = { name, currency, members, createdAt: Date.now(), expenses: {} };
      write(data);
      return id;
    },

    subscribeTrip(tripId, onData) {
      return listen(() => {
        const trip = read().trips[tripId];
        if (!trip) return onData(null);
        const { expenses, ...rest } = trip;
        onData({ id: tripId, ...rest });
      });
    },

    subscribeExpenses(tripId, onData) {
      return listen(() => {
        const expenses = read().trips[tripId]?.expenses || {};
        onData(Object.entries(expenses).map(([id, e]) => ({ id, ...e })));
      });
    },

    async setMembers(tripId, members) {
      updateTrip(tripId, (trip) => {
        trip.members = members;
      });
    },

    async saveExpense(tripId, expense, expenseId) {
      updateTrip(tripId, (trip) => {
        const id = expenseId || newId(20);
        const createdAt = trip.expenses[id]?.createdAt || Date.now();
        trip.expenses[id] = { ...expense, createdAt, updatedAt: Date.now() };
      });
    },

    async deleteExpense(tripId, expenseId) {
      updateTrip(tripId, (trip) => {
        delete trip.expenses[expenseId];
      });
    },
  };
}
