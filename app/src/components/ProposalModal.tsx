import React from 'react';

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProposalModal: React.FC<ProposalModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-xl bg-white border border-water-300 rounded-2xl p-5 md:p-7 space-y-5 max-h-[88vh] overflow-y-auto text-slate-900 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-water-200">
          <div>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Endless Pools Acquisition Brief
            </h3>
            <p className="text-xs text-water-700 font-medium">Turnkey Software Modernization for Watkins Wellness</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-water-50 text-slate-600 hover:text-slate-900 font-bold text-xs"
          >
            Close
          </button>
        </div>

        {/* Executive Overview */}
        <div className="space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            Endless Pools manufactures premier counter-current swim machines, but customer satisfaction is undermined by the abandoned <strong>Fit@Home</strong> mobile app, which fails to operate on modern Android 14/15 flagships like the Google Pixel 8.
          </p>
          <div className="p-4 rounded-xl bg-water-50 border border-water-200 space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-water-800 block">
              Drop-In Compatibility
            </span>
            <p className="text-xs text-slate-600">
              HydroPulse communicates directly with existing deployed Fit@Home Wi-Fi controller kits over the reverse-engineered 44-byte/111-byte UDP binary protocol. Zero hardware changes required.
            </p>
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="space-y-2">
          <h4 className="text-xs uppercase font-bold tracking-wider text-slate-600">
            Feature Comparison
          </h4>
          <div className="overflow-x-auto rounded-xl border border-water-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-water-100 text-slate-700 font-bold">
                <tr>
                  <th className="p-3">Feature</th>
                  <th className="p-3 text-rose-700">Legacy Fit@Home</th>
                  <th className="p-3 text-water-800">HydroPulse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-water-200 bg-white font-medium text-slate-700">
                <tr>
                  <td className="p-3 font-bold text-slate-900">Pixel 8 / Android 15</td>
                  <td className="p-3 text-rose-700">Broken / Filtered</td>
                  <td className="p-3 text-emerald-700 font-bold">Native MulticastLock Supported</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-900">Voice Coaching</td>
                  <td className="p-3 text-slate-400">None</td>
                  <td className="p-3 text-emerald-700 font-bold">High-Clarity Natural Voice + Chimes</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-900">Workout Intervals</td>
                  <td className="p-3 text-slate-400">Manual / Clunky</td>
                  <td className="p-3 text-emerald-700 font-bold">Warm-up Ramps & Mid-Swim Breaks</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold text-slate-900">Poolside Visibility</td>
                  <td className="p-3 text-slate-400">Small low-contrast</td>
                  <td className="p-3 text-emerald-700 font-bold">Giant High-Contrast Digits</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Proposed Deal Structure */}
        <div className="space-y-3">
          <h4 className="text-xs uppercase font-bold tracking-wider text-slate-600">
            Acquisition Pathways
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-water-50 border border-water-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">Outright IP Buyout</span>
                <span className="text-water-700 font-mono font-bold">$450,000</span>
              </div>
              <p className="text-xs text-slate-600">
                Full source code transfer, copyright, protocol handlers, and engineering documentation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-water-50 border border-water-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900">OEM White-Label</span>
                <span className="text-water-700 font-mono font-bold">$75k + $18/yr</span>
              </div>
              <p className="text-xs text-slate-600">
                Endless Pools branding with ongoing app store maintenance and Android/iOS updates.
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-5 rounded-lg bg-water-600 hover:bg-water-700 text-white font-bold text-xs uppercase tracking-wider"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
