import React, { useEffect, useState } from 'react';
import { PoolConnectionStatus, poolConnection } from '../services/poolConnection';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose
}) => {
  const [status, setStatus] = useState<PoolConnectionStatus>(poolConnection.getStatus());

  useEffect(() => {
    if (!isOpen) return;
    const unSubStatus = poolConnection.addStatusListener((s) => setStatus(s));
    return () => unSubStatus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-white rounded-3xl p-5 space-y-4 text-slate-900 shadow-xl border border-water-200 text-center">
        <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">
          Pool Connection
        </h3>

        <div className="p-4 rounded-2xl bg-water-50 border border-water-200 space-y-1">
          <span className="text-sm font-bold text-slate-800 block">
            {status.connected ? 'Connected' : 'Searching...'}
          </span>
          <span className="text-xs text-slate-500 block">
            {status.connected
              ? 'Ready to swim'
              : 'Checking Wi-Fi for Endless Pool'}
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-2xl bg-water-600 hover:bg-water-700 text-white font-black text-xs uppercase tracking-wider transition-all"
        >
          OK
        </button>
      </div>
    </div>
  );
};
