import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore,
  memoryLocalCache
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyApU1ayHJvQnvN0OCh9_8MBHu0gaaTvyPQ',
  authDomain: 'auth-verify-fa0f6.firebaseapp.com',
  projectId: 'auth-verify-fa0f6',
  storageBucket: 'auth-verify-fa0f6.firebasestorage.app',
  messagingSenderId: '450216403893',
  appId: '1:450216403893:web:78534dbaf95805d62d2ffc'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: memoryLocalCache()
});

auth.languageCode = 'en';

export { app, auth, db };
