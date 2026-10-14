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
  apiKey: "AIzaSyAWX1q9Up79p8A7kEWtfofDDmq4WWJDh4c",
  authDomain: "billionairesxchange-e8162.firebaseapp.com",
  projectId: "billionairesxchange-e8162",
  storageBucket: "billionairesxchange-e8162.firebasestorage.app",
  messagingSenderId: "872942229296",
  appId: "1:872942229296:web:49af2cd9798dc1c0dfdaf5",
  measurementId: "G-JCZ6FCKF3M"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
auth.languageCode = "en";

const analytics = getAnalytics(app);

export { app, auth, db, analytics };