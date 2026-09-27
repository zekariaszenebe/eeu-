import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
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

const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID from config and multi-tab offline cache
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);

// Always ensure the network is active on startup and clear any stale quota exhaustion flags
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('eeu_firestore_quota_exhausted');
    sessionStorage.removeItem('eeu_firestore_quota_exhausted');
    enableNetwork(db).catch(() => {});
  } catch {
    // ignore
  }
}



