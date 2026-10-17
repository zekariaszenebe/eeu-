import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  enableNetwork, 
  setLogLevel 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence verbose internal Firestore backoff retry logs
try {
  setLogLevel('silent');
} catch {
  // ignore
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Always ensure network is active
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('eeu_firestore_quota_exhausted');
    sessionStorage.removeItem('eeu_firestore_quota_exhausted');
    enableNetwork(db).catch(() => {});
  } catch {
    // ignore
  }
}



