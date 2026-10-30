import React, { useEffect, useState } from 'react';
import { PoolConnectionStatus, poolConnection } from '../services/poolConnection';
import { EPTelemetry } from '../types/protocol';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose
}) => {
  const [status, setStatus] = useState<PoolConnectionStatus>(poolConnection.getStatus());
  const [telemetry, setTelemetry] = useState<EPTelemetry | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const unSubStatus = poolConnection.addStatusListener((s) => setStatus(s));
    const unSubTelem = poolConnection.addTelemetryListener((t) => setTelemetry(t));

    return () => {
      unSubStatus();
      unSubTelem();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-water-300 rounded-2xl p-6 space-y-5 text-slate-900 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-water-200">
          <h3 className="text-xl font-bold text-slate-900">Pool Controller Connection</h3>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-water-50 text-slate-600 hover:text-slate-900 font-bold text-xs"
          >
            Close
          </button>
        </div>

        {/* Current Real Status */}
        <div className="p-4 rounded-xl bg-water-50 border border-water-200 space-y-1">
          <span className="text-xs uppercase font-bold text-slate-500 block">Link Status</span>
          <div className="flex items-center justify-between">
            <span className="font-bold text-base text-slate-900">
              {status.connected ? 'Connected to Endless Pool' : 'Searching for pool...'}
            </span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              status.connected
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}>
              {status.connected ? 'ONLINE' : 'LISTENING'}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono pt-1">
            Mode: {status.mode === 'native_udp' ? 'Pixel 8 Native UDP (MulticastLock Active)' : 'LAN WebSocket Bridge'}
          </p>
        </div>

        {/* Telemetry info */}
        <div className="space-y-2 p-3.5 rounded-xl bg-water-50 border border-water-200 font-mono text-xs">
          <div className="text-slate-500 font-bold pb-1 border-b border-water-200">
            Network Telemetry
          </div>
          <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
            <div>Packets Received: <strong className="text-slate-900">{status.packetsReceived}</strong></div>
            <div>Packets Sent: <strong className="text-slate-900">{status.packetsSent}</strong></div>
            <div>Multicast Group: <strong className="text-slate-900">239.255.0.1</strong></div>
            <div>Control Port: <strong className="text-slate-900">9750</strong></div>
          </div>
        </div>

        {telemetry && (
          <div className="space-y-2 p-3.5 rounded-xl bg-water-50 border border-water-200 font-mono text-xs">
            <div className="text-slate-500 font-bold pb-1 border-b border-water-200">
              Machine Status
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
              <div>State: <strong className="text-slate-900">{telemetry.statusText}</strong></div>
              <div>Current Flow: <strong className="text-water-700">{telemetry.curSpeed}%</strong></div>
              <div>Pace: <strong className="text-slate-900">{telemetry.paceFormatted}</strong></div>
              <div>Motor: <strong className={telemetry.isMotorOn ? 'text-emerald-700' : 'text-slate-500'}>{telemetry.isMotorOn ? 'ON' : 'OFF'}</strong></div>
            </div>
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-water-600 hover:bg-water-700 text-white font-bold text-sm uppercase tracking-wider active:scale-95 transition-all"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
