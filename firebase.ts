// Import the functions you need from the SDKs you need
// @ts-expect-error Firebase is loaded by the project's runtime configuration.
import { initializeApp } from "firebase/app";
// @ts-expect-error Firebase is loaded by the project's runtime configuration.
import { getAuth } from "firebase/auth";
// @ts-expect-error Firebase is loaded by the project's runtime configuration.
import { getFirestore } from "firebase/firestore";
// @ts-expect-error Firebase is loaded by the project's runtime configuration.
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyApU1ayHJvQnvN0OCh9_8MBHu0gaaTvyPQ",
  authDomain: "auth-verify-fa0f6.firebaseapp.com",
  projectId: "auth-verify-fa0f6",
  storageBucket: "auth-verify-fa0f6.firebasestorage.app",
  messagingSenderId: "450216403893",
  appId: "1:450216403893:web:78534dbaf95805d62d2ffc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
auth.languageCode = "en";

const analytics = getAnalytics(app);

export { app, auth, db, analytics };