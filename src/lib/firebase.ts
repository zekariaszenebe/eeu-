import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
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

// Initialize Firestore with auto-detect long polling to prevent ERR_TUNNEL_CONNECTION_FAILED behind corporate proxies
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
})();
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



