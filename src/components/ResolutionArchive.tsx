import React, { useState } from 'react';
import { History, ShieldCheck, CheckSquare, Search, Award, MapPin, Calendar, Compass, ShieldOff, Languages, Trash2 } from 'lucide-react';
import { FeederInterruption, stripBrackets, isFeederRestored } from '../types';
import { translateAmharicLocation } from '../utils/locationLanguage';
import { InterruptionTypeBadge } from './AgentView';
import { useInterruptions } from '../context/InterruptionContext';

interface ResolutionArchiveProps {
  interruptions: FeederInterruption[];
}

export default function ResolutionArchive({ interruptions }: ResolutionArchiveProps) {
  const [query, setQuery] = useState('');
  const { deleteInterruption, clearAllRestoredFeeders } = useInterruptions();
  const [isClearing, setIsClearing] = useState(false);
  
  // Filter for restored entries using robust status checking
  const restoredItems = interruptions.filter(item => {
    if (!isFeederRestored(item)) return false;
    const q = query.toLowerCase();
    const englishArea = translateAmharicLocation(item.affectedArea).toLowerCase();
    return (
      item.feederName.toLowerCase().includes(q) || 
      item.affectedArea.toLowerCase().includes(q) ||
      englishArea.includes(q) ||
      item.remark.toLowerCase().includes(q)
    );
  }).slice(0, 50);

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to permanently clear and purge all restored feeder records?')) {
      setIsClearing(true);
      try {
        await clearAllRestoredFeeders();
      } finally {
        setIsClearing(false);
      }
    }
  };

  return (
    <div id="resolution-archive-tab" className="space-y-6">
      
      {/* Search Header card */}
      <div className="glass-card rounded-3xl p-6 flex items-center justify-between gap-4 flex-wrap shadow-none">
        <div className="space-y-1">
          <h3 className="font-display font-semibold text-base text-gray-900 dark:text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-eeu-green" />
            <span>Restored Feeders Archive</span>
            <span className="text-xs bg-eeu-green/10 text-eeu-green px-2.5 py-0.5 rounded-full font-mono font-bold">
              {restoredItems.length}
            </span>
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Feeders that have been restored to active power (live grid). Excluded from the live interruption board.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-400" />
            <input
              id="archive-search"
              type="text"
              placeholder="Search by feeder or location (Amharic / English)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl glass-input text-gray-900 dark:text-white focus:outline-none focus:ring-1.5 focus:ring-eeu-green"
            />
          </div>

          {restoredItems.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={isClearing}
              className="px-3.5 py-2 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-500/10 hover:bg-red-500/20 border border-red-200 dark:border-red-900/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Permanently remove all restored feeder records"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isClearing ? 'Clearing...' : 'Clear All Restored'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid listing */}
      {restoredItems.length === 0 ? (
        <div id="archive-empty-panel" className="glass-card rounded-3xl p-12 text-center shadow-none">
          <ShieldOff className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="font-semibold text-sm text-gray-850 dark:text-gray-300">No Restored Feeders Found</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Either all active outages require investigation or the filter keywords didn't match.
          </p>
        </div>
      ) : (
        <div id="archive-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {restoredItems.map((item) => (
            <div
              id={`archive-item-${item.id}`}
              key={item.id}
              className="p-5 glass-card rounded-2xl flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold bg-eeu-green/10 text-eeu-green px-2 py-0.5 rounded-full uppercase">
                    RESOLVED & SUCCESSFUL
                  </span>
                  <div className="flex items-center gap-1.5">
                    <InterruptionTypeBadge type={item.type} />
                    <button
                      onClick={() => deleteInterruption(item.id)}
                      className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                      title="Permanently delete this record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h4 className="font-display font-semibold text-sm text-gray-900 dark:text-white leading-tight">
                  {stripBrackets(item.feederName)}
                </h4>

                <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
                  <span className="font-semibold text-gray-500 dark:text-gray-400 font-mono text-[9px] block uppercase">
                    Affected Communities (አማርኛ & English)
                  </span>
                  <div className="p-2 rounded-xl bg-gray-50/50 dark:bg-gray-900/40 border border-gray-150/40 dark:border-gray-800/40 space-y-1">
                    <p className="text-gray-850 dark:text-gray-200 text-xs leading-relaxed">{item.affectedArea}</p>
                    <p className="text-emerald-850 dark:text-emerald-300 text-[11px] font-medium leading-relaxed pt-1 border-t border-gray-100 dark:border-gray-800/60">
                      {translateAmharicLocation(item.affectedArea)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Timestamp outputs */}
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-850 grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400 dark:text-gray-500">
                <div>
                  <span className="block font-semibold text-gray-500 dark:text-gray-400 uppercase text-[9px]">Outage Duration Started</span>
                  <span className="text-gray-700 dark:text-gray-300 mt-0.5 block">{item.startTime}</span>
                </div>
                <div>
                  <span className="block font-semibold text-gray-500 dark:text-gray-400 uppercase text-[9px]">Energization Restored At</span>
                  <span className="text-gray-700 dark:text-gray-300 mt-0.5 block">{item.estimatedRestorationTime}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
