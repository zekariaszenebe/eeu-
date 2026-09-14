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
import { FeederInterruption, InterruptionStatus, InterruptionType, TeamLeaderNote, ContactItem, TeamLeaderUser } from '../types';
import { INITIAL_INTERRUPTIONS, INITIAL_FEEDERS_LIST, INITIAL_CUSTOMER_CONTACTS } from '../data/mockData';
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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as { code?: string })?.code;
  
  if (
    errCode === 'resource-exhausted' || 
    errMsg.includes('Quota limit exceeded') || 
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('Free daily write units')
  ) {
    setFirestoreQuotaExhausted();
    console.info(`Firestore operating seamlessly via local persistent storage (quota notice for ${path || 'database'}).`);
    return;
  }

  if (errCode === 'unavailable' || errMsg.includes('the client is offline') || errMsg.includes('unavailable')) {
    console.info(`Firestore [${operationType}] for path '${path}' operating in local offline cache mode.`);
    return;
  }

  console.info(`Firestore note [${operationType}] for path '${path}':`, errMsg);
}

// Firestore collection references
const interruptionsCol = collection(db, 'interruptions');
const presetFeedersCol = collection(db, 'presetFeeders');
const hubRecordsCol = collection(db, 'hubRecords');
const teamLeaderNotesCol = collection(db, 'teamLeaderNotes');
const customerContactsCol = collection(db, 'customerContacts');
const teamLeadersCol = collection(db, 'teamLeaders');

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
      district: 'Team A',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-b',
      username: '@team_b',
      password: 'Tl@1234',
      name: 'Team B Leader',
      district: 'Team B',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-c',
      username: '@team_c',
      password: 'Tl@1234',
      name: 'Team C Leader',
      district: 'Team C',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-d',
      username: '@team_d',
      password: 'Tl@1234',
      name: 'Zekarias Zenebe',
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

/**
 * Subscribes to interruptions updates in real-time.
 */
export function subscribeToInterruptions(onUpdate: (items: FeederInterruption[]) => void, onlyActive: boolean = false) {
  try {
    let q;
    if (onlyActive) {
      q = query(interruptionsCol, where('status', '==', InterruptionStatus.ACTIVE), limit(50));
    } else {
      q = query(interruptionsCol);
    }
    return onSnapshot(q, (snapshot) => {
      const list: FeederInterruption[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: data.id || doc.id,
          feederName: data.feederName,
          district: data.district,
          type: data.type,
          status: data.status,
          startTime: data.startTime,
          estimatedRestorationTime: data.estimatedRestorationTime,
          affectedArea: data.affectedArea,
          remark: data.remark,
          lastUpdated: data.lastUpdated
        } as FeederInterruption);
      });
      
      const sorted = [...list].sort((a, b) => {
        if (a.status === InterruptionStatus.ACTIVE && b.status !== InterruptionStatus.ACTIVE) return -1;
        if (a.status !== InterruptionStatus.ACTIVE && b.status === InterruptionStatus.ACTIVE) return 1;
        return (b.lastUpdated || '').localeCompare(a.lastUpdated || '');
      });
      
      onUpdate(sorted);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'interruptions');
      const cached = getLocal<FeederInterruption[]>('eeu-interruptions', []);
      onUpdate(cached);
    });
  } catch {
    const cached = getLocal<FeederInterruption[]>('eeu-interruptions', []);
    onUpdate(cached);
    return () => {};
  }
}

export function subscribeToFeedersList(onUpdate: (items: string[]) => void) {
  try {
    return onSnapshot(presetFeedersCol, (snapshot) => {
      const combined = [...INITIAL_FEEDERS_LIST];
      if (!snapshot.empty) {
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.feederStr && !combined.includes(data.feederStr)) {
            combined.push(data.feederStr);
          }
        });
      }
      
      const localCached = getLocal<string[]>('eeu-feeders-list-v4', []);
      if (Array.isArray(localCached)) {
        for (const item of localCached) {
          if (item && !combined.includes(item)) {
            combined.push(item);
          }
        }
      }

      combined.sort();
      onUpdate(combined);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'presetFeeders');
      const cached = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
      const mergedCached = [...INITIAL_FEEDERS_LIST];
      if (Array.isArray(cached)) {
        for (const item of cached) {
          if (item && !mergedCached.includes(item)) {
            mergedCached.push(item);
          }
        }
      }
      mergedCached.sort();
      onUpdate(mergedCached);
    });
  } catch {
    const cached = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
    const mergedCached = [...INITIAL_FEEDERS_LIST];
    if (Array.isArray(cached)) {
      for (const item of cached) {
        if (item && !mergedCached.includes(item)) {
          mergedCached.push(item);
        }
      }
    }
    mergedCached.sort();
    onUpdate(mergedCached);
    return () => {};
  }
}

/**
 * Creates a new interruption and a companion notification.
 */
export async function addInterruptionDoc(entry: Omit<FeederInterruption, 'id' | 'lastUpdated'>, customId?: string) {
  const suffix = Math.random().toString(36).substring(2, 9);
  const newId = customId || `f-${Date.now()}-${suffix}`;
  const timestampStr = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const record: FeederInterruption = {
    id: newId,
    feederName: entry.feederName || '',
    district: entry.district || 'Team A',
    type: entry.type || InterruptionType.EARTH_FAULT,
    status: entry.status || InterruptionStatus.ACTIVE,
    startTime: entry.startTime || timestampStr,
    estimatedRestorationTime: entry.estimatedRestorationTime || 'N/A',
    affectedArea: entry.affectedArea || '',
    remark: entry.remark || '',
    lastUpdated: timestampStr
  };

  // Local storage update
  const localList = getLocal<FeederInterruption[]>('eeu-interruptions', []);
  setLocal('eeu-interruptions', [record, ...localList.filter(i => i.id !== newId)]);

  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'interruptions', newId), record);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `interruptions/${newId}`);
    }
  }

  return record;
}

/**
 * Updates an interruption and conditionally adds a progress notification.
 */
export async function updateInterruptionDoc(id: string, entry: Partial<FeederInterruption>, existingRecord?: FeederInterruption) {
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
    type: InterruptionType.EARTH_FAULT,
    status: InterruptionStatus.ACTIVE,
    startTime: timestampStr,
    estimatedRestorationTime: 'N/A',
    affectedArea: '',
    remark: '',
    lastUpdated: timestampStr
  };

  const merged: FeederInterruption = {
    id: id,
    feederName: entry.feederName ?? safeExisting.feederName ?? '',
    district: entry.district ?? safeExisting.district ?? 'Team A',
    type: entry.type ?? safeExisting.type ?? InterruptionType.EARTH_FAULT,
    status: entry.status ?? safeExisting.status ?? InterruptionStatus.ACTIVE,
    startTime: entry.startTime ?? safeExisting.startTime ?? timestampStr,
    estimatedRestorationTime: entry.estimatedRestorationTime ?? safeExisting.estimatedRestorationTime ?? 'N/A',
    affectedArea: entry.affectedArea ?? safeExisting.affectedArea ?? '',
    remark: entry.remark ?? safeExisting.remark ?? '',
    lastUpdated: timestampStr
  };

  // Local storage update
  const localList = getLocal<FeederInterruption[]>('eeu-interruptions', []);
  setLocal('eeu-interruptions', localList.map(i => i.id === id ? merged : i));
  
  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'interruptions', id), merged);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `interruptions/${id}`);
    }
  }
}

/**
 * Deletes an interruption.
 */
export async function deleteInterruptionDoc(id: string) {
  const localList = getLocal<FeederInterruption[]>('eeu-interruptions', []);
  setLocal('eeu-interruptions', localList.filter(i => i.id !== id));

  if (!isFirestoreQuotaExhausted()) {
    try {
      await deleteDoc(doc(db, 'interruptions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `interruptions/${id}`);
    }
  }
}

/**
 * Adds a new preset feeder line.
 */
export async function addPresetFeederDoc(feederStr: string) {
  const localFeeders = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
  if (!localFeeders.includes(feederStr)) {
    const updated = [...localFeeders, feederStr].sort();
    setLocal('eeu-feeders-list-v4', updated);
  }


  const cleanId = 'feeder-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
  try {
    await setDoc(doc(db, 'presetFeeders', cleanId), { feederStr });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `presetFeeders/${cleanId}`);
  }
}

/**
 * Deletes a preset feeder line.
 */
export async function deletePresetFeederDoc(feederStr: string) {
  const localFeeders = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
  setLocal('eeu-feeders-list-v4', localFeeders.filter(f => f !== feederStr));


  try {
    const q = query(presetFeedersCol);
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let deletedCount = 0;
    snapshot.forEach((doc) => {
      if (doc.data().feederStr === feederStr) {
        batch.delete(doc.ref);
        deletedCount++;
      }
    });
    if (deletedCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'presetFeeders');
  }
}

/**
 * Updates a preset feeder line.
 */
export async function updatePresetFeederDoc(oldFeederStr: string, newFeederStr: string) {
  const localFeeders = getLocal<string[]>('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
  setLocal('eeu-feeders-list-v4', localFeeders.map(f => f === oldFeederStr ? newFeederStr : f).sort());


  try {
    const q = query(presetFeedersCol);
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let updatedCount = 0;
    snapshot.forEach((doc) => {
      if (doc.data().feederStr === oldFeederStr) {
        batch.update(doc.ref, { feederStr: newFeederStr });
        updatedCount++;
      }
    });
    if (updatedCount > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'presetFeeders');
  }
}

/**
 * Resets and overwrites all preset feeders in Firestore with the complete 248 master feeder database.
 */
export async function resetAllPresetFeedersToMaster() {
  setLocal('eeu-feeders-list-v4', INITIAL_FEEDERS_LIST);
  setLocal('eeu-feeders-version', FEEDERS_VERSION);


  try {
    const feedersSnap = await getDocs(presetFeedersCol);
    const existingDocs = feedersSnap.docs;
    
    // Clear old docs
    for (let i = 0; i < existingDocs.length; i += 450) {
      const batch = writeBatch(db);
      existingDocs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Set full 248 master list
    for (let i = 0; i < INITIAL_FEEDERS_LIST.length; i += 450) {
      const batch = writeBatch(db);
      INITIAL_FEEDERS_LIST.slice(i, i + 450).forEach((feederStr, index) => {
        const docId = `feeder-${i + index}`;
        const docRef = doc(db, 'presetFeeders', docId);
        batch.set(docRef, { feederStr });
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'presetFeeders');
  }
}

/**
 * Subscribes to HubRecords (CSC Address directory) updates in real-time.
 */
export function subscribeToHubRecords(onUpdate: (items: HubRecord[]) => void) {
  try {
    return onSnapshot(hubRecordsCol, (snapshot) => {
      if (snapshot.empty) {
        onUpdate(HUB_RECORDS);
        return;
      }
      const list: HubRecord[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          no: Number(data.no),
          region: data.region || '',
          csc: data.csc || '',
          address: data.address || '',
          dummyBp: data.dummyBp || '',
          rsg: data.rsg || '',
          dispatcherName: data.dispatcherName || '',
          dispatcherId: data.dispatcherId || '',
          customerServiceTlId: data.customerServiceTlId || '',
          officeLocation: data.officeLocation || ''
        });
      });
      list.sort((a, b) => a.no - b.no);
      setLocal('eeu-hub-records', list);
      onUpdate(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'hubRecords');
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
  setLocal('eeu-hub-records', localList.map(item => item.no === record.no ? record : item));


  try {
    const docRef = doc(db, 'hubRecords', String(record.no));
    await setDoc(docRef, record);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `hubRecords/${record.no}`);
  }
}

/**
 * Subscribes to TeamLeaderNotes in real-time.
 */
export function subscribeToTeamLeaderNotes(onUpdate: (items: TeamLeaderNote[]) => void) {
  try {
    return onSnapshot(teamLeaderNotesCol, (snapshot) => {
      const list: TeamLeaderNote[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: data.id || doc.id,
          content: data.content,
          author: data.author,
          timestamp: data.timestamp,
          isUrgent: data.isUrgent
        } as TeamLeaderNote);
      });

      const sorted = [...list].sort((a, b) => {
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        return (b.timestamp || '').localeCompare(a.timestamp || '');
      });

      setLocal('eeu-team-leader-notes', sorted);
      onUpdate(sorted);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'teamLeaderNotes');
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
  setLocal('eeu-team-leader-notes', [record, ...localNotes]);

  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'teamLeaderNotes', cleanId), record);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `teamLeaderNotes/${cleanId}`);
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
  setLocal('eeu-team-leader-notes', localNotes.map(n => n.id === id ? { ...n, content, isUrgent, timestamp: timestampStr } : n));

  if (!isFirestoreQuotaExhausted()) {
    try {
      await updateDoc(doc(db, 'teamLeaderNotes', id), { 
        content, 
        isUrgent,
        timestamp: timestampStr 
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `teamLeaderNotes/${id}`);
    }
  }
}

/**
 * Deletes a TeamLeaderNote.
 */
export async function deleteTeamLeaderNoteDoc(id: string) {
  const localNotes = getLocal<TeamLeaderNote[]>('eeu-team-leader-notes', []);
  setLocal('eeu-team-leader-notes', localNotes.filter(n => n.id !== id));

  if (!isFirestoreQuotaExhausted()) {
    try {
      await deleteDoc(doc(db, 'teamLeaderNotes', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `teamLeaderNotes/${id}`);
    }
  }
}

/**
 * Clears all TeamLeaderNotes.
 */
export async function clearTeamLeaderNotes() {
  setLocal('eeu-team-leader-notes', []);


  try {
    const snap = await getDocs(teamLeaderNotesCol);
    const batch = writeBatch(db);
    snap.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'teamLeaderNotes');
  }
}

/**
 * Subscribes to CustomerContacts in real-time.
 */
export function subscribeToCustomerContacts(onUpdate: (items: ContactItem[]) => void) {
  try {
    return onSnapshot(customerContactsCol, (snapshot) => {
      const list: ContactItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: data.id || doc.id,
          name: data.name,
          phone: data.phone,
          category: data.category as any,
          locationInfo: data.locationInfo,
          hotlineShortCode: data.hotlineShortCode
        } as ContactItem);
      });

      list.sort((a, b) => {
        const catOrder = { 'head_regional': 0, 'sheger_city': 1, 'regional_hotline': 2 };
        const aOrder = catOrder[a.category] ?? 3;
        const bOrder = catOrder[b.category] ?? 3;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      });

      setLocal('eeu-customer-contacts', list);
      onUpdate(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'customerContacts');
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
  setLocal('eeu-customer-contacts', [record, ...localContacts]);

  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'customerContacts', newId), record);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `customerContacts/${newId}`);
    }
  }

  return record;
}

/**
 * Updates an existing Customer Contact.
 */
export async function updateCustomerContactDoc(item: ContactItem) {
  const localContacts = getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
  setLocal('eeu-customer-contacts', localContacts.map(c => c.id === item.id ? item : c));

  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'customerContacts', item.id), item);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `customerContacts/${item.id}`);
    }
  }
}

/**
 * Deletes a Customer Contact.
 */
export async function deleteCustomerContactDoc(id: string) {
  const localContacts = getLocal<ContactItem[]>('eeu-customer-contacts', INITIAL_CUSTOMER_CONTACTS);
  setLocal('eeu-customer-contacts', localContacts.filter(c => c.id !== id));

  if (!isFirestoreQuotaExhausted()) {
    try {
      await deleteDoc(doc(db, 'customerContacts', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customerContacts/${id}`);
    }
  }
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
      district: 'Team A',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-b',
      username: '@team_b',
      password: 'Tl@1234',
      name: 'Team B Leader',
      district: 'Team B',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-c',
      username: '@team_c',
      password: 'Tl@1234',
      name: 'Team C Leader',
      district: 'Team C',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tl-d',
      username: '@team_d',
      password: 'Tl@1234',
      name: 'Zekarias Zenebe',
      district: 'Team D',
      createdAt: new Date().toISOString()
    }
  ];

  try {
    return onSnapshot(teamLeadersCol, (snapshot) => {
      const list: TeamLeaderUser[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: data.id || doc.id,
          username: data.username,
          password: data.password,
          name: data.name,
          district: data.district,
          mustChangePassword: data.mustChangePassword,
          createdAt: data.createdAt || new Date().toISOString()
        } as TeamLeaderUser);
      });

      list.sort((a, b) => a.name.localeCompare(b.name));
      setLocal('eeu-team-leaders', list);
      onUpdate(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'teamLeaders');
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

  const record: Record<string, any> = {
    id: newId,
    username: cleanUsername,
    password: item.password.trim(),
    name: item.name.trim(),
    createdAt: new Date().toISOString()
  };
  if (item.district) record.district = item.district;
  if (typeof item.mustChangePassword === 'boolean') record.mustChangePassword = item.mustChangePassword;

  const localLeaders = getLocal<TeamLeaderUser[]>('eeu-team-leaders', []);
  setLocal('eeu-team-leaders', [...localLeaders, record as TeamLeaderUser]);

  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'teamLeaders', newId), record);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `teamLeaders/${newId}`);
    }
  }

  return record as TeamLeaderUser;
}

/**
 * Updates an existing Team Leader's username, password, name, or district.
 */
export async function updateTeamLeaderDoc(item: TeamLeaderUser) {
  const cleanUsername = item.username.trim();
  const record: Record<string, any> = {
    id: item.id,
    username: cleanUsername,
    password: item.password.trim(),
    name: item.name.trim(),
    createdAt: item.createdAt || new Date().toISOString()
  };
  if (item.district) record.district = item.district;
  if (typeof item.mustChangePassword === 'boolean') record.mustChangePassword = item.mustChangePassword;

  const localLeaders = getLocal<TeamLeaderUser[]>('eeu-team-leaders', []);
  setLocal('eeu-team-leaders', localLeaders.map(tl => tl.id === item.id ? { ...tl, ...record } : tl));

  if (!isFirestoreQuotaExhausted()) {
    try {
      await setDoc(doc(db, 'teamLeaders', item.id), record);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `teamLeaders/${item.id}`);
    }
  }
}

/**
 * Deletes a Team Leader account.
 */
export async function deleteTeamLeaderDoc(id: string) {
  const localLeaders = getLocal<TeamLeaderUser[]>('eeu-team-leaders', []);
  setLocal('eeu-team-leaders', localLeaders.filter(tl => tl.id !== id));

  if (!isFirestoreQuotaExhausted()) {
    try {
      await deleteDoc(doc(db, 'teamLeaders', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `teamLeaders/${id}`);
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
