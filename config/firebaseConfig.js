import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 請將下方的內容替換為你從 Firebase 網頁複製的內容
const firebaseConfig = {
  apiKey: "AIzaSyDiW_gGpasw2JCEKRYeUHMPXbpabxo4VMY",
  authDomain: "appmidtermproject.firebaseapp.com",
  projectId: "appmidtermproject",
  storageBucket: "appmidtermproject.firebasestorage.app",
  messagingSenderId: "835534921497",
  appId: "1:835534921497:web:3bff46acbf35c22cfcef88",
  measurementId: "G-7F6D40Y34E"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

signInAnonymously(auth).catch((error) => {
  console.warn("Firebase anonymous sign-in failed:", error);
});

// 匯出資料庫，讓 App.js 可以使用
const db = getFirestore(app);
const storage = getStorage(app);
export { auth, db, storage };
