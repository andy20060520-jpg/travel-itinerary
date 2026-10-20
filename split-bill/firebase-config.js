// 把 Firebase 主控台「專案設定 → 你的應用程式 → SDK 設定和配置」裡的 firebaseConfig 貼到這裡。
// 保持 apiKey 為空字串時，網頁會以「單機試用模式」執行（資料只存在這支手機，不會同步）。
// 這組設定本來就會公開在網頁上，安全性由 firestore.rules 控制，不需要保密。
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
