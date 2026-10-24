import React, { useState } from 'react';
import { 
  CloudOff, 
  Cloud, 
  RefreshCw, 
  ExternalLink, 
  Download, 
  Upload, 
  Copy, 
  Check, 
  AlertTriangle, 
  X, 
  Info, 
  ShieldCheck,
  Server
} from 'lucide-react';
import { useInterruptions } from '../context/InterruptionContext';

interface CloudSyncStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncStatusModal: React.FC<CloudSyncStatusModalProps> = ({ isOpen, onClose }) => {
  const { 
    isCloudSyncActive, 
    isQuotaExhausted, 
    retryCloudSync, 
    interruptions, 
    exportDataJson, 
    importDataJson 
  } = useInterruptions();

  const [isRetrying, setIsRetrying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'share'>('status');

  if (!isOpen) return null;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await retryCloudSync();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCopyExport = () => {
    const data = exportDataJson();
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadExport = () => {
    const data = exportDataJson();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eeu-feeder-outages-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRunImport = () => {
    setImportError(null);
    setImportSuccess(null);
    if (!importText.trim()) {
      setImportError('Please paste the outage JSON text first.');
      return;
    }
    const res = importDataJson(importText);
    if (res.success) {
      setImportSuccess(res.message);
      setImportText('');
    } else {
      setImportError(res.message);
    }
  };

  const upgradeUrl = "https://console.firebase.google.com/project/proven-chain-7txfk/firestore/databases/ai-studio-d19b31fb-3861-4cc0-933d-23f035c442da/data?openUpgradeDialog=true";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-900 flex items-center justify-between bg-gray-50/60 dark:bg-gray-900/40">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isCloudSyncActive 
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
            }`}>
              {isCloudSyncActive ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-gray-950 dark:text-white">
                Backend Cloud Sync Diagnostics
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Firebase Firestore Real-Time Network Status
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-5 pt-3 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('status')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'status'
                ? 'border-eeu-green text-eeu-green font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Connection & Quota Details
          </button>
          <button
            onClick={() => setActiveTab('share')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'share'
                ? 'border-eeu-green text-eeu-green font-bold'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <span>Direct Agent Share (Export / Import)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-eeu-green/15 text-eeu-green font-bold">Offline Ready</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-left text-sm">
          {activeTab === 'status' ? (
            <>
              {/* Status Banner */}
              <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                isCloudSyncActive
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                  : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200'
              }`}>
                <div className="shrink-0 mt-0.5">
                  {isCloudSyncActive ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider mb-1">
                    {isCloudSyncActive 
                      ? 'Live Multi-Terminal Sync Active' 
                      : isQuotaExhausted 
                        ? 'Backend Paused: Firebase Free Daily Quota Limit Reached' 
                        : 'Offline Browser Mode Active'}
                  </h4>
                  <p className="text-xs leading-relaxed opacity-90">
                    {isCloudSyncActive ? (
                      'Your application is connected directly to Google Firebase Cloud Firestore. Outages added on this terminal are instantly pushed live to all other call center agents in real time.'
                    ) : (
                      'The Google Firebase Spark free plan daily quota (50,000 reads and 20,000 writes/day) has been reached on this database instance. Cloud operations are temporarily rejected with "resource-exhausted".'
                    )}
                  </p>
                </div>
              </div>

              {/* Offline Protection Notice */}
              <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-300">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Zero Data Loss Protection is Active</span>
                </div>
                <p className="text-xs text-blue-800 dark:text-blue-200/80 leading-relaxed">
                  When you add or update an outage while the cloud backend is paused, your entry is safely saved in your browser&apos;s local memory (currently storing <strong className="font-semibold">{interruptions.length}</strong> records). You can continue logging outages without losing any work!
                </p>
              </div>

              {/* What Happens Next & How to Resolve */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  How This Resolves
                </h5>
                <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                    <span><strong>Automatic 24h Daily Reset:</strong> Firebase&apos;s free tier daily write and read units reset automatically every day at midnight Pacific Time (PST) / 10:00 AM Ethiopian Time (EAT).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                    <span><strong>Direct Agent Sharing:</strong> Use the &quot;Direct Agent Share&quot; tab above to export/import outages between call center agent computers without consuming any cloud quota.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                    <span><strong>Instant Cloud Upgrade:</strong> To remove all daily quota limits permanently for 60+ concurrent agents, you can upgrade the Firebase project to the pay-as-you-go Blaze plan ($0.06 per 100,000 reads beyond the free 50k).</span>
                  </li>
                </ul>
              </div>

              {/* Active Read Optimizations */}
              <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/60 dark:border-emerald-900/40 text-[11px] space-y-1.5 text-emerald-900 dark:text-emerald-300">
                <div className="font-bold flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Real-Time Read Minimization Active</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-emerald-800/90 dark:text-emerald-300/80">
                  <div>• <strong>Single State Doc:</strong> 1 doc read per update</div>
                  <div>• <strong>Tab Leader Election:</strong> 0 reads on 2nd+ tabs</div>
                  <div>• <strong>On-Demand Tabs:</strong> CSC & Contacts only read when viewed</div>
                  <div>• <strong>Local Fast Cache:</strong> 0 reads for static feeder lists</div>
                </div>
              </div>

              {/* Database Reference Info */}
              <div className="p-3 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200/60 dark:border-gray-800 text-[11px] space-y-1 font-mono text-gray-600 dark:text-gray-400">
                <div>Project ID: <span className="font-semibold text-gray-900 dark:text-gray-200">proven-chain-7txfk</span></div>
                <div>Database ID: <span className="font-semibold text-gray-900 dark:text-gray-200">ai-studio-d19b31fb-3861-4cc0-933d-23f035c442da</span></div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="px-4 py-2 bg-eeu-green hover:bg-eeu-dark text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  <span>{isRetrying ? 'Checking Connection...' : 'Test & Reconnect Cloud'}</span>
                </button>

                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-gray-200 dark:border-gray-800"
                >
                  <span>Open Firebase Upgrade</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </>
          ) : (
            <>
              {/* Share Outages Panel */}
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      Export Outages ({interruptions.length} records)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyExport}
                        className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:text-eeu-green cursor-pointer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                        <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
                      </button>
                      <button
                        onClick={handleDownloadExport}
                        className="px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:text-eeu-green cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-gray-500" />
                        <span>Download JSON</span>
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Share this file or text with other team leaders or agents so they can import it on their machines.
                  </p>
                </div>

                {/* Import Outages Panel */}
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-bold text-gray-900 dark:text-white block">
                    Import Outages From Another Agent
                  </label>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Paste the JSON text exported from another agent terminal to immediately synchronize your local grid board:
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder='Paste exported JSON array here (e.g. [{"id": "f-...", "feederName": "..."}])'
                    rows={4}
                    className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-eeu-green text-gray-900 dark:text-gray-100"
                  />

                  {importError && (
                    <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-medium">
                      {importError}
                    </div>
                  )}

                  {importSuccess && (
                    <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                      {importSuccess}
                    </div>
                  )}

                  <button
                    onClick={handleRunImport}
                    className="w-full py-2 bg-eeu-green hover:bg-eeu-dark text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Load & Apply Outages</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-900 bg-gray-50/60 dark:bg-gray-900/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
