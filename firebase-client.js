import { getApp, getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore,
  memoryLocalCache
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAWX1q9Up79p8A7kEWtfofDDmq4WWJDh4c',
  authDomain: 'billionairesxchange-e8162.firebaseapp.com',
  projectId: 'billionairesxchange-e8162',
  storageBucket: 'billionairesxchange-e8162.firebasestorage.app',
  messagingSenderId: '872942229296',
  appId: '1:872942229296:web:49af2cd9798dc1c0dfdaf5',
  measurementId: 'G-JCZ6FCKF3M'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: memoryLocalCache()
});

auth.languageCode = 'en';

export { app, auth, db };
