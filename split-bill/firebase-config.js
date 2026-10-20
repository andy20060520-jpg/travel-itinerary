// Firebase 主控台「專案設定 → 你的應用程式 → SDK 設定和配置」裡的 firebaseConfig。
// 把 apiKey 改回空字串，網頁就會以「單機試用模式」執行（資料只存在這支手機，不會同步）。
// 這組設定本來就會公開在網頁上，安全性由 firestore.rules 控制，不需要保密。
export const firebaseConfig = {
  apiKey: "AIzaSyDpT_li_Ao5VucMJsa9X-bocGI1EGY3pQA",
  authDomain: "split-bill-68150.firebaseapp.com",
  projectId: "split-bill-68150",
  storageBucket: "split-bill-68150.firebasestorage.app",
  messagingSenderId: "75875902184",
  appId: "1:75875902184:web:dd99d3a518f3c8020d1f5d",
};
