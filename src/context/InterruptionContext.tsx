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
  recordDeletedInterruptionId
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

  // Broadcast channel message listener for instant cross-tab state syncing
  useEffect(() => {
    if (!channel) return;
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
      }
    };
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
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

  // Continuous real-time subscription to Firestore live interruptions + Instant focus & interval sync
  useEffect(() => {
    // 1. Primary real-time onSnapshot listener
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

    // 2. Cooldown-throttled sync when window/tab is focused or becomes visible (e.g. after computer sleep)
    let lastFocusSyncTime = 0;
    const handleSync = async () => {
      const now = Date.now();
      // Enforce at least 60 seconds between manual focus checks to avoid burning reads
      if (now - lastFocusSyncTime < 60000) return;
      lastFocusSyncTime = now;

      try {
        const latest = await fetchLatestInterruptions();
        setInterruptions(prev => {
          const serializedPrev = JSON.stringify(prev);
          const serializedNext = JSON.stringify(latest);
          if (serializedPrev === serializedNext) return prev;
          try {
            localStorage.setItem('eeu-interruptions', serializedNext);
          } catch {}
          channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: latest });
          return latest;
        });
      } catch (err) {
        console.error('Focus sync error:', err);
      }
    };

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleSync();
      }
    };

    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsub();
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

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

  // Create interruption with local persistence fallback
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
      await addInterruptionDoc(entry, tempId);
      triggerToast('New Outage Added', `${entry.feederName} has been synchronized across agent terminals`, 'warn');
    } catch (e) {
      console.error('Firestore addInterruptionDoc failed, using local offline fallback:', e);
      triggerToast('Saved Offline', `${entry.feederName} saved locally. Will sync with backend when network is restored.`, 'info');
    }
  };

  // Update interruption with local persistence fallback
  const updateInterruption = async (id: string, entry: Partial<FeederInterruption>) => {
    let existing: FeederInterruption | undefined;
    let backupList: FeederInterruption[] = [];

    setInterruptions(prev => {
      backupList = prev;
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

    // Instant zero-latency UI toast feedback
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
      await updateInterruptionDoc(id, entry, existing);
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
      await deleteInterruptionDoc(id);
      if (target) {
        triggerToast('Record Removed', `${target.feederName} interruption permanently cleared.`, 'info');
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
      const count = await clearAllRestoredInterruptionsDoc();
      setInterruptions(prev => {
        const nextList = prev.filter(i => !isFeederRestored(i));
        try {
          localStorage.setItem('eeu-interruptions', JSON.stringify(nextList));
        } catch {}
        channel?.postMessage({ type: 'SYNC_INTERRUPTIONS', data: nextList });
        return nextList;
      });
      triggerToast('Restored Records Cleared', `Successfully purged ${count} restored feeders. Grid is clean and live.`, 'success');
    } catch (e) {
      console.error('Failed to clear restored feeders:', e);
      triggerToast('Clear Failed', 'Could not clear restored feeder records.', 'warn');
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
      setLiveToast
    }}>
      {children}
    </InterruptionContext.Provider>
  );
};
