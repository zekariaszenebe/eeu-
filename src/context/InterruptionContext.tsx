import React, { createContext, useContext, useState, useEffect } from 'react';
import { FeederInterruption, InterruptionStatus, normalizeInterruptionType, isFeederRestored } from '../types';
import { getCardinalDirection } from '../utils/direction';
import { 
  addInterruptionDoc, 
  updateInterruptionDoc, 
  deleteInterruptionDoc, 
  subscribeToInterruptions,
  fetchLatestInterruptions,
  cleanOutagesList,
  clearAllRestoredInterruptionsDoc,
  recordDeletedInterruptionId,
  subscribeCloudStatus,
  probeFirestoreConnection,
  isFirestoreQuotaExhausted
} from '../lib/firestoreService';

interface InterruptionContextType {
  interruptions: FeederInterruption[];
  setInterruptions: React.Dispatch<React.SetStateAction<FeederInterruption[]>>;
  addInterruption: (entry: Omit<FeederInterruption, 'id' | 'lastUpdated'>) => Promise<void>;
  updateInterruption: (id: string, entry: Partial<FeederInterruption>) => Promise<void>;
  deleteInterruption: (id: string) => Promise<void>;
  clearAllRestoredFeeders: () => Promise<void>;
  triggerToast: (title: string, desc: string, type?: 'info' | 'success' | 'warn') => void;
  liveToast: { title: string; desc: string; type: 'info' | 'success' | 'warn' } | null;
  setLiveToast: React.Dispatch<React.SetStateAction<{ title: string; desc: string; type: 'info' | 'success' | 'warn' } | null>>;
  isCloudSyncActive: boolean;
  isQuotaExhausted: boolean;
  retryCloudSync: () => Promise<boolean>;
  exportDataJson: () => string;
  importDataJson: (jsonStr: string) => { success: boolean; count: number; message: string };
}

const InterruptionContext = createContext<InterruptionContextType | undefined>(undefined);

const channel = (typeof window !== 'undefined' && 'BroadcastChannel' in window) 
  ? new BroadcastChannel('eeu_interruptions_channel') 
  : null;

export function useInterruptions() {
  const context = useContext(InterruptionContext);
  if (!context) {
    throw new Error('useInterruptions must be used within an InterruptionProvider');
  }
  return context;
}

export const InterruptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [interruptions, setInterruptions] = useState<FeederInterruption[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('eeu-interruptions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return cleanOutagesList(parsed);
        }
      } catch (e) {
        console.error('Failed to parse interruptions from localStorage', e);
      }
    }
    return [];
  });

  const [liveToast, setLiveToast] = useState<{ title: string; desc: string; type: 'info' | 'success' | 'warn' } | null>(null);

  const triggerToast = (title: string, desc: string, type: 'info' | 'success' | 'warn' = 'info') => {
    setLiveToast({ title, desc, type });
    setTimeout(() => {
      setLiveToast(null);
    }, 4500);
  };

  const [cloudStatus, setCloudStatus] = useState<{ connected: boolean; quotaExhausted: boolean }>({
    connected: !isFirestoreQuotaExhausted(),
    quotaExhausted: isFirestoreQuotaExhausted()
  });

  useEffect(() => {
    const unsub = subscribeCloudStatus((status) => {
      setCloudStatus(status);
    });
    return unsub;
  }, []);

  // Tab Leader Election: Ensures only ONE active Firestore snapshot listener per workstation
  // Follower tabs receive updates via BroadcastChannel (0 Firestore reads)
  const [isLeaderTab, setIsLeaderTab] = useState<boolean>(() => {
    return !channel; // If no BroadcastChannel, this tab acts as its own leader
  });

  const tabIdRef = React.useRef<string>(`tab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const lastLeaderHeartbeatRef = React.useRef<number>(0);
  const currentLeaderIdRef = React.useRef<string | null>(null);

  // Broadcast channel message listener for instant cross-tab state syncing & tab leader election
  useEffect(() => {
    if (!channel) return;
    const myTabId = tabIdRef.current;

    const handleMessage = (event: MessageEvent) => {
      const { type, data } = event.data || {};

      if (type === 'DELETE_INTERRUPTION' && data && data.id) {
        recordDeletedInterruptionId(data.id);
        setInterruptions(prev => {
          const next = prev.filter(i => i.id !== data.id);
          try {
            localStorage.setItem('eeu-interruptions', JSON.stringify(next));
          } catch {}
          return next;
        });
      } else if (type === 'SYNC_INTERRUPTIONS' && Array.isArray(data)) {
        const cleaned = cleanOutagesList(data);
        setInterruptions(cleaned);
        try {
          localStorage.setItem('eeu-interruptions', JSON.stringify(cleaned));
        } catch (e) {
          console.error('Failed to persist synced data to localStorage', e);
        }
      } else if (type === 'LEADER_HEARTBEAT' && data && data.leaderId) {
        lastLeaderHeartbeatRef.current = Date.now();
        if (data.leaderId !== myTabId) {
          if (currentLeaderIdRef.current !== data.leaderId) {
            currentLeaderIdRef.current = data.leaderId;
            setIsLeaderTab(false);
          }
        }
      } else if (type === 'PING_LEADER') {
        if (currentLeaderIdRef.current === myTabId) {
          channel.postMessage({
            type: 'LEADER_HEARTBEAT',
            data: { leaderId: myTabId, timestamp: Date.now() }
          });
        }
      } else if (type === 'LEADER_RESIGN') {
        if (currentLeaderIdRef.current === data?.leaderId) {
          // The previous leader tab was closed; claim leadership immediately
          currentLeaderIdRef.current = myTabId;
          lastLeaderHeartbeatRef.current = Date.now();
          setIsLeaderTab(true);
          channel.postMessage({
            type: 'LEADER_HEARTBEAT',
            data: { leaderId: myTabId, timestamp: Date.now() }
          });
        }
      }
    };

    channel.addEventListener('message', handleMessage);

    // Announce presence and query if an existing leader tab is running
    channel.postMessage({ type: 'PING_LEADER', data: { tabId: myTabId } });

    // Periodic heartbeat loop
    const heartbeatInterval = setInterval(() => {
      if (currentLeaderIdRef.current === myTabId) {
        channel.postMessage({
          type: 'LEADER_HEARTBEAT',
          data: { leaderId: myTabId, timestamp: Date.now() }
        });
      } else {
        // Follower tab: if no heartbeat received for > 5 seconds, take over
        const elapsed = Date.now() - lastLeaderHeartbeatRef.current;
        if (lastLeaderHeartbeatRef.current > 0 && elapsed > 5000) {
          currentLeaderIdRef.current = myTabId;
          lastLeaderHeartbeatRef.current = Date.now();
          setIsLeaderTab(true);
          channel.postMessage({
            type: 'LEADER_HEARTBEAT',
            data: { leaderId: myTabId, timestamp: Date.now() }
          });
        }
      }
    }, 2000);

    // Initial election delay: If no heartbeat arrives within 400ms after mount, claim leadership
    const initialElectionTimeout = setTimeout(() => {
      if (!currentLeaderIdRef.current || currentLeaderIdRef.current === myTabId) {
        currentLeaderIdRef.current = myTabId;
        lastLeaderHeartbeatRef.current = Date.now();
        setIsLeaderTab(true);
        channel.postMessage({
          type: 'LEADER_HEARTBEAT',
          data: { leaderId: myTabId, timestamp: Date.now() }
        });
      }
    }, 400);

    const handleBeforeUnload = () => {
      if (currentLeaderIdRef.current === myTabId) {
        channel.postMessage({ type: 'LEADER_RESIGN', data: { leaderId: myTabId } });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      clearTimeout(initialElectionTimeout);
      channel.removeEventListener('message', handleMessage);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (currentLeaderIdRef.current === myTabId) {
        channel.postMessage({ type: 'LEADER_RESIGN', data: { leaderId: myTabId } });
      }
    };
  }, []);

  // Storage event listener to sync across tabs if broadcast channel is inactive
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'eeu-interruptions' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setInterruptions(cleanOutagesList(parsed));
          }
        } catch (err) {
          console.error('Storage sync parsing error:', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Continuous real-time subscription to Firestore live interruptions
  // CRITICAL READ OPTIMIZATION:
  // Only the elected Leader Tab opens this Firestore snapshot listener!
  // Sibling tabs on the same computer receive updates via BroadcastChannel (0 Firestore reads).
  useEffect(() => {
    if (!isLeaderTab) {
      return;
    }

    const unsub = subscribeToInterruptions((items) => {
      setInterruptions(prev => {
        const serializedPrev = JSON.stringify(prev);
        const serializedNext = JSON.stringify(items);
        if (serializedPrev === serializedNext) return prev;
        
        try {
          localStorage.setItem('eeu-interruptions', serializedNext);
        } catch (e) {
          console.error('Failed to write Firestore updates to localStorage', e);
        }
        channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: items });
        return items;
      });
    });

    return () => {
      unsub();
    };
  }, [isLeaderTab]);

  // Keep active local state clean and bounded
  useEffect(() => {
    const restored = interruptions.filter(item => item && item.status === InterruptionStatus.RESTORED);
    if (restored.length > 30) {
      const sortedRestored = [...restored].sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''));
      const excessIds = new Set(sortedRestored.slice(30).map(item => item.id));
      setInterruptions(prev => {
        const next = prev.filter(item => !excessIds.has(item.id));
        try {
          localStorage.setItem('eeu-interruptions', JSON.stringify(next));
        } catch (e) {}
        channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: next });
        return next;
      });
    }
  }, [interruptions]);

  // Create interruption with local persistence & truthful sync feedback
  const addInterruption = async (entry: Omit<FeederInterruption, 'id' | 'lastUpdated'>) => {
    const tempId = `f-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const timestampStr = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const dist = entry.district || 'Team A';
    const optimisticRecord: FeederInterruption = {
      id: tempId,
      feederName: entry.feederName,
      district: dist,
      direction: entry.direction || getCardinalDirection(dist, entry.feederName),
      type: normalizeInterruptionType(entry.type),
      status: entry.status,
      startTime: entry.startTime,
      estimatedRestorationTime: entry.estimatedRestorationTime,
      affectedArea: entry.affectedArea,
      remark: entry.remark,
      lastUpdated: timestampStr
    };

    setInterruptions(prev => {
      const nextList = [optimisticRecord, ...prev.filter(i => i.id !== tempId)];
      try {
        localStorage.setItem('eeu-interruptions', JSON.stringify(nextList));
      } catch (e) {}
      channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: nextList });
      return nextList;
    });

    try {
      const result = await addInterruptionDoc(entry, tempId);
      if (result.syncedToCloud) {
        triggerToast('New Outage Added & Synced', `${entry.feederName} synchronized across all call center terminals`, 'success');
      } else if (result.quotaExhausted) {
        triggerToast('Saved in Local Browser Only', `${entry.feederName} stored locally. Firebase free tier daily quota is currently reached, so other terminals cannot pull it yet.`, 'warn');
      } else {
        triggerToast('Saved Locally (Offline)', `${entry.feederName} saved on this machine. Waiting for cloud connection.`, 'info');
      }
    } catch (e) {
      console.error('Firestore addInterruptionDoc failed, using local offline fallback:', e);
      triggerToast('Saved Locally', `${entry.feederName} saved in your browser.`, 'info');
    }
  };

  // Update interruption with local persistence & quota-aware feedback
  const updateInterruption = async (id: string, entry: Partial<FeederInterruption>) => {
    let existing: FeederInterruption | undefined;

    setInterruptions(prev => {
      existing = prev.find(item => item.id === id);
      if (!existing) return prev;

      const timestampStr = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const updatedRecord: FeederInterruption = {
        ...existing,
        ...entry,
        type: entry.type ? normalizeInterruptionType(entry.type) : existing.type,
        direction: entry.direction || existing.direction || getCardinalDirection(entry.district || existing.district, entry.feederName || existing.feederName),
        lastUpdated: timestampStr
      };

      const nextList = prev.map(item => item.id === id ? updatedRecord : item);
      try {
        localStorage.setItem('eeu-interruptions', JSON.stringify(nextList));
      } catch (e) {}
      channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: nextList });
      return nextList;
    });

    if (!existing) return;

    // Zero-latency UI toast feedback
    if (entry.status && entry.status !== existing.status) {
      const titleText = entry.status === InterruptionStatus.RESTORED ? 'Feeder Line Cleared' : 'Operational Status Changed';
      const messageText = entry.status === InterruptionStatus.RESTORED 
        ? `${existing.feederName} restored to active grid status and re-energized successfully.`
        : `${existing.feederName} reassessed as ${entry.status}.`;
      triggerToast(titleText, messageText, entry.status === InterruptionStatus.RESTORED ? 'success' : 'info');
    } else {
      triggerToast('Record Updated', `Successfully updated grid data for ${existing.feederName}`, 'success');
    }

    try {
      const res = await updateInterruptionDoc(id, entry, existing);
      if (res && res.quotaExhausted) {
        triggerToast('Saved Locally (Quota Reached)', `${existing.feederName} updated locally. Firebase cloud quota limit reached.`, 'warn');
      }
    } catch (e) {
      console.error('Firestore updateInterruptionDoc failed, using local offline fallback:', e);
    }
  };

  // Delete interruption with permanent tombstone and instant broadcast
  const deleteInterruption = async (id: string) => {
    let target: FeederInterruption | undefined;
    recordDeletedInterruptionId(id);

    setInterruptions(prev => {
      target = prev.find(i => i.id === id);
      const nextList = prev.filter(i => i.id !== id);
      try {
        localStorage.setItem('eeu-interruptions', JSON.stringify(nextList));
      } catch (e) {}
      channel?.postMessage({ type: 'DELETE_INTERRUPTION', data: { id } });
      channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: nextList });
      return nextList;
    });

    try {
      const res = await deleteInterruptionDoc(id);
      if (target) {
        if (res && res.quotaExhausted) {
          triggerToast('Deleted Locally (Quota Reached)', `${target.feederName} cleared locally. Firebase cloud quota limit reached.`, 'warn');
        } else {
          triggerToast('Record Removed', `${target.feederName} interruption permanently cleared.`, 'info');
        }
      }
    } catch (e) {
      console.error('Firestore deleteInterruptionDoc failed, keeping deletion locally:', e);
      if (target) {
        triggerToast('Deleted Locally', `${target.feederName} removed locally.`, 'info');
      }
    }
  };

  // Permanently clear all restored feeders from active lists & database
  const clearAllRestoredFeeders = async () => {
    try {
      const res = await clearAllRestoredInterruptionsDoc();
      const count = typeof res === 'object' ? res.count : res;
      setInterruptions(prev => {
        const nextList = prev.filter(i => !isFeederRestored(i));
        try {
          localStorage.setItem('eeu-interruptions', JSON.stringify(nextList));
        } catch {}
        channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: nextList });
        return nextList;
      });
      if (res && typeof res === 'object' && res.quotaExhausted) {
        triggerToast('Restored Records Cleared Locally', `Purged ${count} restored feeders locally. (Firebase cloud quota reached)`, 'info');
      } else {
        triggerToast('Restored Records Cleared', `Successfully purged ${count} restored feeders. Grid is clean and live.`, 'success');
      }
    } catch (e) {
      console.error('Failed to clear restored feeders:', e);
      triggerToast('Clear Failed', 'Could not clear restored feeder records.', 'warn');
    }
  };

  const retryCloudSync = async (): Promise<boolean> => {
    const res = await probeFirestoreConnection();
    if (res.connected) {
      triggerToast('Cloud Sync Connected', 'Successfully reconnected to Firebase Firestore backend!', 'success');
      return true;
    } else if (res.quotaExhausted) {
      triggerToast('Quota Still Exhausted', 'Firebase free tier daily read/write limit is still active. Quota resets daily at midnight PST.', 'warn');
      return false;
    } else {
      triggerToast('Reconnection Failed', 'Could not reach Firebase Firestore. Operating in local mode.', 'warn');
      return false;
    }
  };

  const exportDataJson = () => {
    return JSON.stringify(interruptions, null, 2);
  };

  const importDataJson = (jsonStr: string): { success: boolean; count: number; message: string } => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return { success: false, count: 0, message: 'Invalid data format: expected an array of interruptions.' };
      }
      const cleaned = cleanOutagesList(parsed);
      setInterruptions(cleaned);
      try {
        localStorage.setItem('eeu-interruptions', JSON.stringify(cleaned));
      } catch {}
      channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: cleaned });
      triggerToast('Data Imported', `Successfully loaded ${cleaned.length} interruption records!`, 'success');
      return { success: true, count: cleaned.length, message: `Imported ${cleaned.length} records successfully.` };
    } catch (e) {
      return { success: false, count: 0, message: 'Failed to parse JSON: ' + (e instanceof Error ? e.message : String(e)) };
    }
  };

  return (
    <InterruptionContext.Provider value={{
      interruptions,
      setInterruptions,
      addInterruption,
      updateInterruption,
      deleteInterruption,
      clearAllRestoredFeeders,
      triggerToast,
      liveToast,
      setLiveToast,
      isCloudSyncActive: cloudStatus.connected && !cloudStatus.quotaExhausted,
      isQuotaExhausted: cloudStatus.quotaExhausted,
      retryCloudSync,
      exportDataJson,
      importDataJson
    }}>
      {children}
    </InterruptionContext.Provider>
  );
};
