// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBue8CgOU3cd8wjt9oeMDqaNkpBiraDNYw",
  authDomain: "billionaires-87519.firebaseapp.com",
  projectId: "billionaires-87519",
  storageBucket: "billionaires-87519.firebasestorage.app",
  messagingSenderId: "799625535151",
  appId: "1:799625535151:web:283629136b45f40afc7e5a",
  measurementId: "G-X16NGMSE4B"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
auth.languageCode = "en";

const analytics = getAnalytics(app);

export { app, auth, db, analytics };