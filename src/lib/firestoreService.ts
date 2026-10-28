import { 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs, 
  writeBatch,
  query, 
  orderBy,
  limit,
  where,
  disableNetwork
} from 'firebase/firestore';
import { db } from './firebase';
import { FeederInterruption, InterruptionStatus, InterruptionType, normalizeInterruptionType, isFeederRestored, normalizeInterruptionStatus, TeamLeaderNote, ContactItem, TeamLeaderUser } from '../types';
import { getCardinalDirection } from '../utils/direction';
import { INITIAL_FEEDERS_LIST, INITIAL_CUSTOMER_CONTACTS } from '../data/mockData';
import { FEEDERS_VERSION } from '../data/feedersList';
import { HubRecord, HUB_RECORDS } from '../data/hubData';

// Operation types for FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Global in-memory circuit-breaker for Firestore write quota exhaustion
let quotaExhausted = false;

export function isFirestoreQuotaExhausted(): boolean {
  return quotaExhausted;
}

export function setFirestoreQuotaExhausted() {
  quotaExhausted = true;
}

type CloudStatusListener = (status: { connected: boolean; quotaExhausted: boolean }) => void;
const cloudStatusListeners = new Set<CloudStatusListener>();

export function subscribeCloudStatus(listener: CloudStatusListener) {
  cloudStatusListeners.add(listener);
  listener({ connected: !quotaExhausted, quotaExhausted });
  return () => {
    cloudStatusListeners.delete(listener);
  };
}

export function notifyCloudStatus(connected: boolean, isQuota: boolean) {
  if (isQuota) quotaExhausted = true;
  cloudStatusListeners.forEach(fn => fn({ connected, quotaExhausted: isQuota }));
}

export async function probeFirestoreConnection(): Promise<{ connected: boolean; quotaExhausted: boolean }> {
  try {
    const liveDocRef = doc(db, 'systemSettings', 'liveInterruptions');
    await getDoc(liveDocRef);
    quotaExhausted = false;
    notifyCloudStatus(true, false);
    return { connected: true, quotaExhausted: false };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errCode = (err as { code?: string })?.code;
    const isQuota = errCode === 'resource-exhausted' || errMsg.includes('Quota exceeded') || errMsg.includes('resource-exhausted');
    if (isQuota) {
      quotaExhausted = true;
    }
    notifyCloudStatus(!isQuota, isQuota);
    return { connected: false, quotaExhausted: isQuota };
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as { code?: string })?.code;
  
  if (
    errCode === 'resource-exhausted' || 
    errMsg.includes('Quota limit exceeded') || 
    errMsg.includes('Quota exceeded') || 
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('Free daily write units')
  ) {
    setFirestoreQuotaExhausted();
    notifyCloudStatus(false, true);
    console.info(`Firestore operating in local persistent storage mode (free tier daily quota reached for ${path || 'database'}).`);
    return;
  }

  if (errCode === 'unavailable' || errMsg.includes('the client is offline') || errMsg.includes('unavailable')) {
    notifyCloudStatus(false, false);
    console.info(`Firestore [${operationType}] for path '${path}' operating in local offline cache mode.`);
    return;
  }

  console.info(`Firestore note [${operationType}] for path '${path}':`, errMsg);
}

// Local storage persistent fallback helpers
function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Seeding helper to populate default master datasets in local storage.
 * This guarantees the application is instantly functional without triggering Firestore write quota limits.
 */
export async function seedInitialDataIfEmpty() {
  const SEED_STORAGE_KEY = 'eeu-local-seeded-v3';
  
  // Ensure local storage has baseline datasets ready
  if (!getLocal<string[] | null>('eeu-feeders-list-v4', null)) {
    setLocal('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
    setLocal('eeu-feeders-version', FEEDERS_VERSION);
  }

  if (!getLocal<HubRecord[] | null>('eeu-hub-records', null)) {
    setLocal('eeu-hub-records', HUB_RECORDS);
  }

  if (!getLocal<ContactItem[] | null>('eeu-customer-contacts', null)) {
    setLocal('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
  }

  const defaultTeamLeaders: TeamLeaderUser[] = [
    {
      id: 'tl-a',
      username: '@team_a',
      password: 'Tl@1234',
      name: 'Team A Leader',
      role: 'team_leader',
      district: 'Team A',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-b',
      username: '@team_b',
      password: 'Tl@1234',
      name: 'Team B Leader',
      role: 'team_leader',
      district: 'Team B',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-c',
      username: '@team_c',
      password: 'Tl@1234',
      name: 'Team C Leader',
      role: 'team_leader',
      district: 'Team C',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-d',
      username: '@team_d',
      password: 'Tl@1234',
      name: 'Zekarias Zenebe',
      role: 'team_leader',
      district: 'Team D',
      createdAt: new Date().toISOString()
    }
  ];

  if (!getLocal<TeamLeaderUser[] | null>('eeu-team-leaders', null)) {
    setLocal('eeu-team-leaders', defaultTeamLeaders);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(SEED_STORAGE_KEY, 'true');
  }
}

export function recordDeletedInterruptionId(id: string) {
  if (!id) return;
  const list = getLocal<string[]>('eeu-deleted-ids', []);
  if (!list.includes(id)) {
    list.push(id);
    setLocal('eeu-deleted-ids', list.slice(-300));
  }
}

export function isInterruptionDeleted(id: string): boolean {
  if (!id) return true;
  const legacyMockIds = new Set(['f-1','f-2','f-3','f-4','f-5','f-6','f-7','f-8','f-9','f-10','f-11','f-12','f-13']);
  if (legacyMockIds.has(id) || /^f-\d{1,2}$/.test(id)) return true;
  const list = getLocal<string[]>('eeu-deleted-ids', []);
  return list.includes(id);
}

/**
 * Sanitizes and cleans outage items: removes deleted items, deduplicates,
 * and normalizes status and type.
 */
export function cleanOutagesList(list: FeederInterruption[]): FeederInterruption[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: FeederInterruption[] = [];

  for (const item of list) {
    if (!item || !item.id) continue;
    if (isInterruptionDeleted(item.id)) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    result.push({
      ...item,
      type: normalizeInterruptionType(item.type),
      status: normalizeInterruptionStatus(item.status)
    });
  }

  return result.sort((a, b) => {
    const aRestored = isFeederRestored(a);
    const bRestored = isFeederRestored(b);
    if (!aRestored && bRestored) return -1;
    if (aRestored && !bRestored) return 1;
    return (b.lastUpdated || '').localeCompare(a.lastUpdated || '');
  });
}

// Singleton subscription manager to prevent redundant listeners
const subscriptionMap = new Map<string, { unsub: () => void, callbacks: Set<(data: any) => void> }>();

export function subscribeToInterruptions(onUpdate: (items: FeederInterruption[]) => void, onlyActive: boolean = true) {
  const docPath = 'systemSettings/liveInterruptions';
  
  if (!subscriptionMap.has(docPath)) {
    const liveDocRef = doc(db, 'systemSettings', 'liveInterruptions');
    const unsub = onSnapshot(liveDocRef, (snap) => {
      let outages: FeederInterruption[] = [];

      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.outages)) {
          outages = cleanOutagesList(data.outages as FeederInterruption[]);
        }
      } else {
        const localCached = cleanOutagesList(getLocal<FeederInterruption[]>('eeu-interruptions', []));
        outages = localCached;
        if (!isFirestoreQuotaExhausted()) {
          setDoc(liveDocRef, { outages: localCached, lastUpdated: new Date().toISOString() }).catch(() => {});
        }
      }

      notifyCloudStatus(true, false);
      setLocal('eeu-interruptions', outages);
      
      // Notify all registered callbacks
      subscriptionMap.get(docPath)?.callbacks.forEach(cb => cb(outages));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, docPath);
      const cached = cleanOutagesList(getLocal<FeederInterruption[]>('eeu-interruptions', []));
      subscriptionMap.get(docPath)?.callbacks.forEach(cb => cb(cached));
    });
    
    subscriptionMap.set(docPath, { unsub, callbacks: new Set() });
  }

  const manager = subscriptionMap.get(docPath)!;
  manager.callbacks.add(onUpdate);
  
  // Return initial data immediately
  onUpdate(cleanOutagesList(getLocal<FeederInterruption[]>('eeu-interruptions', [])));

  return () => {
    manager.callbacks.delete(onUpdate);
    if (manager.callbacks.size === 0) {
      manager.unsub();
      subscriptionMap.delete(docPath);
    }
  };
}

/**
 * Direct fetch for the latest interruptions from Firestore.
 */
export async function fetchLatestInterruptions(): Promise<FeederInterruption[]> {
  try {
    const liveDocRef = doc(db, 'systemSettings', 'liveInterruptions');
    const snap = await getDoc(liveDocRef);

    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.outages)) {
        const cleaned = cleanOutagesList(data.outages as FeederInterruption[]);
        setLocal('eeu-interruptions', cleaned);
        return cleaned;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'systemSettings/liveInterruptions');
  }
  return cleanOutagesList(getLocal<FeederInterruption[]>('eeu-interruptions', []));
}

/**
 * Direct fetch for preset feeders from Firestore (on-demand read, 0 continuous real-time sockets).
 */
export async function fetchFeedersList(): Promise<string[]> {
  try {
    const configDocRef = doc(db, 'systemSettings', 'presetFeeders');
    const snap = await getDoc(configDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.list) && data.list.length > 0) {
        const sorted = [...data.list].sort();
        setLocal('eeu-feeders-list-v4', sorted);
        return sorted;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'systemSettings/presetFeeders');
  }
  return getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
}

/**
 * Subscribes to preset feeders using a single consolidated configuration document
 * in 'systemSettings/presetFeeders'. This reduces document reads from ~248 reads to 1 read.
 */
export function subscribeToFeedersList(onUpdate: (items: string[]) => void) {
  try {
    const configDocRef = doc(db, 'systemSettings', 'presetFeeders');
    return onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.list) && data.list.length > 0) {
          const list = [...data.list].sort();
          setLocal('eeu-feeders-list-v4', list);
          onUpdate(list);
          return;
        }
      }

      // If document doesn't exist yet, seed it once to save reads for all future clients
      const localCached = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
      const sorted = [...localCached].sort();
      onUpdate(sorted);
      setDoc(configDocRef, { list: sorted }).catch(() => {});
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'systemSettings/presetFeeders');
      const cached = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
      onUpdate(cached);
    });
  } catch {
    const cached = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
    onUpdate(cached);
    return () => {};
  }
}

// ==========================================
// OPTIMIZATION 3: WRITE DEBOUNCER FOR OUTAGES
// Rapid updates, keystrokes, and status changes
// collapse into a single atomic write to minimize
// writes and real-time echo reads.
// ==========================================
let liveOutagesWriteTimer: ReturnType<typeof setTimeout> | null = null;
let pendingOutagesList: FeederInterruption[] | null = null;
let pendingTimestamp: string = '';

export async function flushPendingOutagesWrite(): Promise<void> {
  if (liveOutagesWriteTimer) {
    clearTimeout(liveOutagesWriteTimer);
    liveOutagesWriteTimer = null;
  }
  if (!pendingOutagesList) return;
  const listToWrite = pendingOutagesList;
  const timeToWrite = pendingTimestamp || new Date().toISOString();
  pendingOutagesList = null;

  if (isFirestoreQuotaExhausted()) return;

  try {
    const liveDocRef = doc(db, 'systemSettings', 'liveInterruptions');
    await setDoc(liveDocRef, { outages: listToWrite, lastUpdated: timeToWrite });
    notifyCloudStatus(true, false);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'systemSettings/liveInterruptions');
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushPendingOutagesWrite();
  });
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushPendingOutagesWrite();
    }
  });
}

export function queueOutagesWriteToCloud(list: FeederInterruption[], timestampStr: string, immediate: boolean = false): void {
  pendingOutagesList = list;
  pendingTimestamp = timestampStr;

  if (liveOutagesWriteTimer) {
    clearTimeout(liveOutagesWriteTimer);
    liveOutagesWriteTimer = null;
  }

  if (immediate) {
    flushPendingOutagesWrite();
  } else {
    // Debounce by 800ms
    liveOutagesWriteTimer = setTimeout(() => {
      flushPendingOutagesWrite();
    }, 800);
  }
}

/**
 * Helper to ensure no undefined fields are passed to Firestore setDoc
 */
function sanitizeInterruptionDoc(item: FeederInterruption): Record<string, any> {
  const feederName = (item.feederName || '').trim();
  const district = item.district || 'Team A';
  const direction = item.direction || getCardinalDirection(district, feederName);
  const type = normalizeInterruptionType(item.type);
  const status = item.status || InterruptionStatus.ACTIVE;
  const startTime = item.startTime || new Date().toLocaleString('en-US');
  const estimatedRestorationTime = item.estimatedRestorationTime || 'N/A';
  const affectedArea = (item.affectedArea || '').trim();
  const remark = (item.remark || '').trim();
  const lastUpdated = item.lastUpdated || startTime;

  return {
    id: item.id,
    feederName,
    district,
    direction,
    type,
    status,
    startTime,
    estimatedRestorationTime,
    affectedArea,
    remark,
    lastUpdated
  };
}

export interface InterruptionMutationResult {
  record: FeederInterruption;
  syncedToCloud: boolean;
  quotaExhausted: boolean;
}

/**
 * Creates a new interruption and updates Firestore/local storage.
 */
export async function addInterruptionDoc(entry: Omit<FeederInterruption, 'id' | 'lastUpdated'>, customId?: string): Promise<InterruptionMutationResult> {
  const suffix = Math.random().toString(36).substring(2, 9);
  const newId = customId || `f-${Date.now()}-${suffix}`;
  const timestampStr = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const rawRecord: FeederInterruption = {
    id: newId,
    feederName: entry.feederName || '',
    district: entry.district || 'Team A',
    direction: entry.direction || getCardinalDirection(entry.district || 'Team A', entry.feederName || ''),
    type: normalizeInterruptionType(entry.type),
    status: entry.status || InterruptionStatus.ACTIVE,
    startTime: entry.startTime || timestampStr,
    estimatedRestorationTime: entry.estimatedRestorationTime || 'N/A',
    affectedArea: entry.affectedArea || '',
    remark: entry.remark || '',
    lastUpdated: timestampStr
  };

  const record = sanitizeInterruptionDoc(rawRecord) as unknown as FeederInterruption;

  // Local storage update
  const localList = getLocal<FeederInterruption[]>('eeu-interruptions', []);
  const updatedList = [record, ...localList.filter(i => i.id !== newId)];
  setLocal('eeu-interruptions', updatedList);

  if (isFirestoreQuotaExhausted()) {
    return { record, syncedToCloud: false, quotaExhausted: true };
  }

  // Queue debounced cloud write (avoids duplicate bursts)
  queueOutagesWriteToCloud(updatedList, timestampStr, false);
  return { record, syncedToCloud: true, quotaExhausted: false };
}


/**
 * Updates an interruption and conditionally adds a progress notification.
 */
export async function updateInterruptionDoc(id: string, entry: Partial<FeederInterruption>, existingRecord?: FeederInterruption): Promise<InterruptionMutationResult> {
  const timestampStr = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const safeExisting = existingRecord || {
    id,
    feederName: '',
    district: 'Team A',
    direction: 'North',
    type: InterruptionType.EARTH_FAULT,
    status: InterruptionStatus.ACTIVE,
    startTime: timestampStr,
    estimatedRestorationTime: 'N/A',
    affectedArea: '',
    remark: '',
    lastUpdated: timestampStr
  };

  const rawMerged: FeederInterruption = {
    id: id,
    feederName: entry.feederName ?? safeExisting.feederName ?? '',
    district: entry.district ?? safeExisting.district ?? 'Team A',
    direction: entry.direction ?? safeExisting.direction ?? getCardinalDirection(entry.district || safeExisting.district || 'Team A', entry.feederName || safeExisting.feederName || ''),
    type: normalizeInterruptionType(entry.type ?? safeExisting.type),
    status: entry.status ?? safeExisting.status ?? InterruptionStatus.ACTIVE,
    startTime: entry.startTime ?? safeExisting.startTime ?? timestampStr,
    estimatedRestorationTime: entry.estimatedRestorationTime ?? safeExisting.estimatedRestorationTime ?? 'N/A',
    affectedArea: entry.affectedArea ?? safeExisting.affectedArea ?? '',
    remark: entry.remark ?? safeExisting.remark ?? '',
    lastUpdated: timestampStr
  };

  const merged = sanitizeInterruptionDoc(rawMerged) as unknown as FeederInterruption;

  // Local storage update
  const localList = getLocal<FeederInterruption[]>('eeu-interruptions', []);
  const updatedList = localList.map(i => i.id === id ? merged : i);
  setLocal('eeu-interruptions', updatedList);
  
  if (isFirestoreQuotaExhausted()) {
    return { record: merged, syncedToCloud: false, quotaExhausted: true };
  }

  // Queue debounced cloud write (avoids duplicate bursts on rapid edits)
  queueOutagesWriteToCloud(updatedList, timestampStr, false);
  return { record: merged, syncedToCloud: true, quotaExhausted: false };
}

/**
 * Deletes an interruption and records its ID tombstone so it never resurrects.
 */
export async function deleteInterruptionDoc(id: string): Promise<{ syncedToCloud: boolean; quotaExhausted: boolean }> {
  recordDeletedInterruptionId(id);
  const localList = cleanOutagesList(getLocal<FeederInterruption[]>('eeu-interruptions', []));
  const updatedList = localList.filter(i => i.id !== id);
  setLocal('eeu-interruptions', updatedList);

  if (isFirestoreQuotaExhausted()) {
    return { syncedToCloud: false, quotaExhausted: true };
  }

  // Flushes immediately on deletion
  queueOutagesWriteToCloud(updatedList, new Date().toISOString(), true);
  return { syncedToCloud: true, quotaExhausted: false };
}

/**
 * Permanently deletes all restored feeder records from both Firestore and local storage.
 */
export async function clearAllRestoredInterruptionsDoc(): Promise<{ count: number; syncedToCloud: boolean; quotaExhausted: boolean }> {
  const localList = cleanOutagesList(getLocal<FeederInterruption[]>('eeu-interruptions', []));
  const restoredItems = localList.filter(i => isFeederRestored(i));
  restoredItems.forEach(i => recordDeletedInterruptionId(i.id));

  const activeOnly = localList.filter(i => !isFeederRestored(i));
  setLocal('eeu-interruptions', activeOnly);

  if (isFirestoreQuotaExhausted()) {
    return { count: restoredItems.length, syncedToCloud: false, quotaExhausted: true };
  }

  // Flushes immediately on clearing
  queueOutagesWriteToCloud(activeOnly, new Date().toISOString(), true);
  return { count: restoredItems.length, syncedToCloud: true, quotaExhausted: false };
}

/**
 * Saves and persists the complete list of preset feeder lines directly to Firestore.
 * When an admin edits Feeder Name, Direction, Feeder Number, and Affected Areas,
 * this function atomically writes the updated list to 'systemSettings/presetFeeders'.
 */
export async function savePresetFeedersList(newList: string[]): Promise<boolean> {
  const sorted = [...newList].sort();
  setLocal('eeu-feeders-list-v4', sorted);

  try {
    const configDocRef = doc(db, 'systemSettings', 'presetFeeders');
    await setDoc(configDocRef, { list: sorted, lastUpdated: new Date().toISOString() });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'systemSettings/presetFeeders');
    return false;
  }
}

/**
 * Adds a new preset feeder line.
 */
export async function addPresetFeederDoc(feederStr: string): Promise<boolean> {
  const localFeeders = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
  let updated = [...localFeeders];
  if (!updated.includes(feederStr)) {
    updated.push(feederStr);
    updated.sort();
    setLocal('eeu-feeders-list-v4', updated);
  }

  try {
    const configDocRef = doc(db, 'systemSettings', 'presetFeeders');
    await setDoc(configDocRef, { list: updated, lastUpdated: new Date().toISOString() });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'systemSettings/presetFeeders');
    return false;
  }
}

/**
 * Deletes a preset feeder line using single consolidated document (0 extra reads).
 */
export async function deletePresetFeederDoc(feederStr: string): Promise<boolean> {
  const localFeeders = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
  const updated = localFeeders.filter(f => f !== feederStr).sort();
  setLocal('eeu-feeders-list-v4', updated);

  try {
    const configDocRef = doc(db, 'systemSettings', 'presetFeeders');
    await setDoc(configDocRef, { list: updated, lastUpdated: new Date().toISOString() });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'systemSettings/presetFeeders');
    return false;
  }
}

/**
 * Updates a preset feeder line using single consolidated document (0 extra reads).
 */
export async function updatePresetFeederDoc(oldFeederStr: string, newFeederStr: string): Promise<boolean> {
  const localFeeders = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
  const updated = localFeeders.map(f => f === oldFeederStr ? newFeederStr : f).sort();
  setLocal('eeu-feeders-list-v4', updated);

  try {
    const configDocRef = doc(db, 'systemSettings', 'presetFeeders');
    await setDoc(configDocRef, { list: updated, lastUpdated: new Date().toISOString() });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'systemSettings/presetFeeders');
    return false;
  }
}

/**
 * Resets and overwrites preset feeders with the complete 248 master list in a single write.
 */
export async function resetAllPresetFeedersToMaster(): Promise<boolean> {
  setLocal('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
  setLocal('eeu-feeders-version', FEEDERS_VERSION);

  try {
    const configDocRef = doc(db, 'systemSettings', 'presetFeeders');
    await setDoc(configDocRef, { list: INITIAL_FEEDERS_LIST, lastUpdated: new Date().toISOString() });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'systemSettings/presetFeeders');
    return false;
  }
}

/**
 * Direct fetch for HubRecords from Firestore (on-demand read, 0 continuous real-time sockets).
 */
export async function fetchHubRecords(): Promise<HubRecord[]> {
  try {
    const configDocRef = doc(db, 'systemSettings', 'hubRecords');
    const snap = await getDoc(configDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.list) && data.list.length > 0) {
        const list = data.list as HubRecord[];
        list.sort((a, b) => a.no - b.no);
        setLocal('eeu-hub-records', list);
        return list;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'systemSettings/hubRecords');
  }
  return getLocal<HubRecord[]>('eeu-hub-records', HUB_RECORDS);
}

/**
 * Subscribes to HubRecords (CSC Address directory) updates in real-time using Single State Document.
 * Reduces reads from ~245 documents down to 1 document.
 */
export function subscribeToHubRecords(onUpdate: (items: HubRecord[]) => void) {
  try {
    const configDocRef = doc(db, 'systemSettings', 'hubRecords');
    return onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.list) && data.list.length > 0) {
          const list = data.list as HubRecord[];
          list.sort((a, b) => a.no - b.no);
          setLocal('eeu-hub-records', list);
          onUpdate(list);
          return;
        }
      }

      // Seed once if document doesn't exist
      const localCached = getLocal<HubRecord[]>('eeu-hub-records', HUB_RECORDS);
      localCached.sort((a, b) => a.no - b.no);
      onUpdate(localCached);
      setDoc(configDocRef, { list: localCached }).catch(() => {});
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'systemSettings/hubRecords');
      const cached = getLocal<HubRecord[]>('eeu-hub-records', HUB_RECORDS);
      onUpdate(cached);
    });
  } catch {
    const cached = getLocal<HubRecord[]>('eeu-hub-records', HUB_RECORDS);
    onUpdate(cached);
    return () => {};
  }
}

/**
 * Updates a HubRecord (CSC Address directory item) in Firestore and local cache.
 */
export async function updateHubRecordDoc(record: HubRecord) {
  const localList = getLocal<HubRecord[]>('eeu-hub-records', HUB_RECORDS);
  const updated = localList.map(item => item.no === record.no ? record : item).sort((a, b) => a.no - b.no);
  setLocal('eeu-hub-records', updated);

  try {
    const configDocRef = doc(db, 'systemSettings', 'hubRecords');
    await setDoc(configDocRef, { list: updated }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `systemSettings/hubRecords`);
  }
}

/**
 * Direct fetch for TeamLeaderNotes from Firestore (on-demand read, 0 continuous real-time sockets).
 */
export async function fetchTeamLeaderNotes(): Promise<TeamLeaderNote[]> {
  try {
    const configDocRef = doc(db, 'systemSettings', 'teamLeaderNotes');
    const snap = await getDoc(configDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.list)) {
        const list = data.list as TeamLeaderNote[];
        const sorted = [...list].sort((a, b) => {
          if (a.isUrgent && !b.isUrgent) return -1;
          if (!a.isUrgent && b.isUrgent) return 1;
          return (b.timestamp || '').localeCompare(a.timestamp || '');
        });
        setLocal('eeu-team-leader-notes', sorted);
        return sorted;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'systemSettings/teamLeaderNotes');
  }
  return getLocal<TeamLeaderNote[]>('eeu-team-leader-notes', []);
}

/**
 * Subscribes to TeamLeaderNotes in real-time using Single State Document.
 * Reduces reads from N documents down to 1 single document.
 */
export function subscribeToTeamLeaderNotes(onUpdate: (items: TeamLeaderNote[]) => void) {
  try {
    const configDocRef = doc(db, 'systemSettings', 'teamLeaderNotes');
    return onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.list)) {
          const list = data.list as TeamLeaderNote[];
          const sorted = [...list].sort((a, b) => {
            if (a.isUrgent && !b.isUrgent) return -1;
            if (!a.isUrgent && b.isUrgent) return 1;
            return (b.timestamp || '').localeCompare(a.timestamp || '');
          });
          setLocal('eeu-team-leader-notes', sorted);
          onUpdate(sorted);
          return;
        }
      }

      const cached = getLocal<TeamLeaderNote[]>('eeu-team-leader-notes', []);
      onUpdate(cached);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'systemSettings/teamLeaderNotes');
      const cached = getLocal<TeamLeaderNote[]>('eeu-team-leader-notes', []);
      onUpdate(cached);
    });
  } catch {
    const cached = getLocal<TeamLeaderNote[]>('eeu-team-leader-notes', []);
    onUpdate(cached);
    return () => {};
  }
}

/**
 * Adds a new TeamLeaderNote.
 */
export async function addTeamLeaderNoteDoc(content: string, author: string, isUrgent: boolean) {
  const cleanId = 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
  const timestampStr = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const record: TeamLeaderNote = {
    id: cleanId,
    content,
    author: author || "Team Leader",
    timestamp: timestampStr,
    isUrgent
  };

  const localNotes = getLocal<TeamLeaderNote[]>('eeu-team-leader-notes', []);
  const updatedList = [record, ...localNotes];
  setLocal('eeu-team-leader-notes', updatedList);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'teamLeaderNotes');
      await setDoc(configDocRef, { list: updatedList, lastUpdated: timestampStr });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `systemSettings/teamLeaderNotes`);
    }
  }

  return record;
}

/**
 * Updates an existing TeamLeaderNote.
 */
export async function updateTeamLeaderNoteDoc(id: string, content: string, isUrgent: boolean) {
  const timestampStr = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const localNotes = getLocal<TeamLeaderNote[]>('eeu-team-leader-notes', []);
  const updatedList = localNotes.map(n => n.id === id ? { ...n, content, isUrgent, timestamp: timestampStr } : n);
  setLocal('eeu-team-leader-notes', updatedList);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'teamLeaderNotes');
      await setDoc(configDocRef, { list: updatedList, lastUpdated: timestampStr });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `systemSettings/teamLeaderNotes`);
    }
  }
}

/**
 * Deletes a TeamLeaderNote.
 */
export async function deleteTeamLeaderNoteDoc(id: string) {
  const localNotes = getLocal<TeamLeaderNote[]>('eeu-team-leader-notes', []);
  const updatedList = localNotes.filter(n => n.id !== id);
  setLocal('eeu-team-leader-notes', updatedList);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'teamLeaderNotes');
      await setDoc(configDocRef, { list: updatedList, lastUpdated: new Date().toISOString() });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `systemSettings/teamLeaderNotes`);
    }
  }
}

/**
 * Clears all TeamLeaderNotes.
 */
export async function clearTeamLeaderNotes() {
  setLocal('eeu-team-leader-notes', []);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'teamLeaderNotes');
      await setDoc(configDocRef, { list: [], lastUpdated: new Date().toISOString() });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `systemSettings/teamLeaderNotes`);
    }
  }
}

/**
 * Direct fetch for CustomerContacts from Firestore (on-demand read, 0 continuous real-time sockets).
 */
export async function fetchCustomerContacts(): Promise<ContactItem[]> {
  try {
    const configDocRef = doc(db, 'systemSettings', 'customerContacts');
    const snap = await getDoc(configDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.list) && data.list.length > 0) {
        const list = data.list as ContactItem[];
        setLocal('eeu-customer-contacts', list);
        return list;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'systemSettings/customerContacts');
  }
  return getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
}

/**
 * Subscribes to CustomerContacts in real-time using Single State Document.
 */
export function subscribeToCustomerContacts(onUpdate: (items: ContactItem[]) => void) {
  try {
    const configDocRef = doc(db, 'systemSettings', 'customerContacts');
    return onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.list) && data.list.length > 0) {
          const list = data.list as ContactItem[];
          list.sort((a, b) => {
            const catOrder = { 'head_regional': 0, 'sheger_city': 1, 'regional_hotline': 2 };
            const aOrder = catOrder[a.category] ?? 3;
            const bOrder = catOrder[b.category] ?? 3;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.name.localeCompare(b.name);
          });
          setLocal('eeu-customer-contacts', list);
          onUpdate(list);
          return;
        }
      }

      // Seed once if document doesn't exist
      const localCached = getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
      onUpdate(localCached);
      setDoc(configDocRef, { list: localCached }).catch(() => {});
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'systemSettings/customerContacts');
      const cached = getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
      onUpdate(cached);
    });
  } catch {
    const cached = getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
    onUpdate(cached);
    return () => {};
  }
}

/**
 * Adds a new Customer Contact.
 */
export async function addCustomerContactDoc(item: Omit<ContactItem, 'id'>) {
  const newId = `cc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const record: ContactItem = {
    ...item,
    id: newId
  };

  const localContacts = getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
  const updated = [record, ...localContacts];
  setLocal('eeu-customer-contacts', updated);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'customerContacts');
      await setDoc(configDocRef, { list: updated }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `systemSettings/customerContacts`);
    }
  }

  return record;
}

/**
 * Updates an existing Customer Contact.
 */
export async function updateCustomerContactDoc(item: ContactItem) {
  const localContacts = getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
  const updated = localContacts.map(c => c.id === item.id ? item : c);
  setLocal('eeu-customer-contacts', updated);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'customerContacts');
      await setDoc(configDocRef, { list: updated }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `systemSettings/customerContacts`);
    }
  }
}

/**
 * Deletes a Customer Contact.
 */
export async function deleteCustomerContactDoc(id: string) {
  const localContacts = getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
  const updated = localContacts.filter(c => c.id !== id);
  setLocal('eeu-customer-contacts', updated);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'customerContacts');
      await setDoc(configDocRef, { list: updated }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `systemSettings/customerContacts`);
    }
  }
}

/**
 * Direct fetch for Team Leaders from Firestore (on-demand read, 0 continuous real-time sockets).
 */
export async function fetchTeamLeaders(): Promise<TeamLeaderUser[]> {
  const defaultLeaders: TeamLeaderUser[] = [
    { id: 'tl-a', username: '@team_a', password: 'Tl@1234', name: 'Team A Leader', role: 'team_leader', district: 'Team A', createdAt: new Date().toISOString() },
    { id: 'tl-b', username: '@team_b', password: 'Tl@1234', name: 'Team B Leader', role: 'team_leader', district: 'Team B', createdAt: new Date().toISOString() },
    { id: 'tl-c', username: '@team_c', password: 'Tl@1234', name: 'Team C Leader', role: 'team_leader', district: 'Team C', createdAt: new Date().toISOString() },
    { id: 'tl-d', username: '@team_d', password: 'Tl@1234', name: 'Zekarias Zenebe', role: 'team_leader', district: 'Team D', createdAt: new Date().toISOString() }
  ];

  try {
    const configDocRef = doc(db, 'systemSettings', 'teamLeaders');
    const snap = await getDoc(configDocRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.list) && data.list.length > 0) {
        const list = data.list as TeamLeaderUser[];
        list.sort((a, b) => a.name.localeCompare(b.name));
        setLocal('eeu-team-leaders', list);
        return list;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'systemSettings/teamLeaders');
  }
  return getLocal<TeamLeaderUser[]>('eeu-team-leaders', defaultLeaders);
}

/**
 * Subscribes to Team Leaders in real-time.
 */
export function subscribeToTeamLeaders(onUpdate: (items: TeamLeaderUser[]) => void) {
  const defaultLeaders: TeamLeaderUser[] = [
    {
      id: 'tl-a',
      username: '@team_a',
      password: 'Tl@1234',
      name: 'Team A Leader',
      role: 'team_leader',
      district: 'Team A',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-b',
      username: '@team_b',
      password: 'Tl@1234',
      name: 'Team B Leader',
      role: 'team_leader',
      district: 'Team B',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-c',
      username: '@team_c',
      password: 'Tl@1234',
      name: 'Team C Leader',
      role: 'team_leader',
      district: 'Team C',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-d',
      username: '@team_d',
      password: 'Tl@1234',
      name: 'Zekarias Zenebe',
      role: 'team_leader',
      district: 'Team D',
      createdAt: new Date().toISOString()
    }
  ];

  try {
    const configDocRef = doc(db, 'systemSettings', 'teamLeaders');
    return onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.list) && data.list.length > 0) {
          const list = data.list as TeamLeaderUser[];
          list.sort((a, b) => a.name.localeCompare(b.name));
          setLocal('eeu-team-leaders', list);
          onUpdate(list);
          return;
        }
      }

      // Seed once if document doesn't exist
      const localCached = getLocal<TeamLeaderUser[]>('eeu-team-leaders', defaultLeaders);
      onUpdate(localCached);
      setDoc(configDocRef, { list: localCached }).catch(() => {});
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'systemSettings/teamLeaders');
      const cached = getLocal<TeamLeaderUser[]>('eeu-team-leaders', defaultLeaders);
      onUpdate(cached);
    });
  } catch {
    const cached = getLocal<TeamLeaderUser[]>('eeu-team-leaders', defaultLeaders);
    onUpdate(cached);
    return () => {};
  }
}

/**
 * Adds a new Team Leader.
 */
export async function addTeamLeaderDoc(item: Omit<TeamLeaderUser, 'id' | 'createdAt'>) {
  const newId = `tl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const cleanUsername = item.username.trim();

  const record: TeamLeaderUser = {
    id: newId,
    username: cleanUsername,
    password: item.password.trim(),
    name: item.name.trim(),
    createdAt: new Date().toISOString(),
    ...(item.district ? { district: item.district } : {}),
    ...(typeof item.mustChangePassword === 'boolean' ? { mustChangePassword: item.mustChangePassword } : {})
  };

  const localLeaders = getLocal<TeamLeaderUser[]>('eeu-team-leaders', []);
  const updated = [...localLeaders, record];
  setLocal('eeu-team-leaders', updated);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'teamLeaders');
      await setDoc(configDocRef, { list: updated }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `systemSettings/teamLeaders`);
    }
  }

  return record;
}

/**
 * Updates an existing Team Leader's username, password, name, or district.
 */
export async function updateTeamLeaderDoc(item: TeamLeaderUser) {
  const cleanUsername = item.username.trim();
  const record: TeamLeaderUser = {
    ...item,
    username: cleanUsername,
    password: item.password.trim(),
    name: item.name.trim(),
    createdAt: item.createdAt || new Date().toISOString()
  };

  const localLeaders = getLocal<TeamLeaderUser[]>('eeu-team-leaders', []);
  const updated = localLeaders.map(tl => tl.id === item.id ? { ...tl, ...record } : tl);
  setLocal('eeu-team-leaders', updated);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'teamLeaders');
      await setDoc(configDocRef, { list: updated }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `systemSettings/teamLeaders`);
    }
  }
}

/**
 * Deletes a Team Leader account.
 */
export async function deleteTeamLeaderDoc(id: string) {
  const localLeaders = getLocal<TeamLeaderUser[]>('eeu-team-leaders', []);
  const updated = localLeaders.filter(tl => tl.id !== id);
  setLocal('eeu-team-leaders', updated);

  if (!isFirestoreQuotaExhausted()) {
    try {
      const configDocRef = doc(db, 'systemSettings', 'teamLeaders');
      await setDoc(configDocRef, { list: updated }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `systemSettings/teamLeaders`);
    }
  }
}

export interface FeedbackRecord {
  id: string;
  rating: number;
  category: string;
  feedbackText: string;
  submittedBy: string;
  targetEmail: string;
  timestamp: string;
}

/**
 * Stores feedback in Firestore
 */
export async function addFeedbackDoc(feedback: {
  rating: number;
  category: string;
  feedbackText: string;
  submittedBy: string;
  targetEmail: string;
}): Promise<FeedbackRecord> {
  const newId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const record: FeedbackRecord = {
    id: newId,
    rating: feedback.rating,
    category: feedback.category,
    feedbackText: feedback.feedbackText.trim(),
    submittedBy: feedback.submittedBy.trim(),
    targetEmail: feedback.targetEmail.trim(),
    timestamp: new Date().toISOString()
  };

  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'feedbacks', newId), record);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `feedbacks/${newId}`);
    }
  }

  return record;
}
