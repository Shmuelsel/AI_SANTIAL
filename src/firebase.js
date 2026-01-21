// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// הוספנו את שני הייבואים האלו כדי לעבוד עם משתמשים ודאטה
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDoALNZuXoxBzZ_o82-CFtMbndYVptiK_k",
  authDomain: "smart-eye-49d8b.firebaseapp.com",
  databaseURL: "https://smart-eye-49d8b-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "smart-eye-49d8b",
  storageBucket: "smart-eye-49d8b.firebasestorage.app",
  messagingSenderId: "981085290180",
  appId: "1:981085290180:web:d60049897ac684f5419391",
  measurementId: "G-RMNSEF3YJZ"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// אתחול וייצוא השירותים לשימוש בשאר האפליקציה (כמו ב-Login.jsx)
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;