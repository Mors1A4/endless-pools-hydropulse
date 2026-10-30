import React from 'react';
import { SwimWorkout } from '../types/workout';
import { formatPaceDisplay, formatTimeLong } from '../services/protocolEngine';

interface SavedWorkoutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workouts: SwimWorkout[];
  onSelectWorkout: (workout: SwimWorkout) => void;
  onDeleteWorkout: (id: string) => void;
}

export const SavedWorkoutsModal: React.FC<SavedWorkoutsModalProps> = ({
  isOpen,
  onClose,
  workouts,
  onSelectWorkout,
  onDeleteWorkout
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md bg-white border border-water-300 rounded-2xl p-5 space-y-4 max-h-[85vh] flex flex-col text-slate-900 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-water-200">
          <h3 className="text-xl font-bold text-slate-900">Saved Swim Workouts</h3>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-water-50 text-slate-600 hover:text-slate-900 font-bold text-xs"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {workouts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-sm">No saved workouts yet.</p>
              <p className="text-xs mt-1">Configure a workout and click Save.</p>
            </div>
          ) : (
            workouts.map((w) => (
              <div
                key={w.id}
                className="p-4 rounded-xl bg-water-50 border border-water-200 flex items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <h4 className="font-bold text-base text-slate-900">{w.title}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-600 font-mono">
                    <span className="font-bold text-water-700">
                      {formatTimeLong(w.totalDurationSec)}
                    </span>
                    <span>Target: {formatPaceDisplay(w.targetPaceSec100m, 'pace100m')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-0.5">
                    {w.hasWarmup && <span className="text-sky-700 font-medium">1m Warm-up</span>}
                    {w.hasWarmup && w.hasMidBreak && <span>•</span>}
                    {w.hasMidBreak && <span className="text-emerald-700 font-medium">{w.midBreakDurationSec}s Mid-Break</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWorkout(w);
                      onClose();
                    }}
                    className="py-2 px-4 rounded-lg bg-water-600 hover:bg-water-700 text-white font-bold text-xs uppercase tracking-wider active:scale-95 transition-all"
                  >
                    Start
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteWorkout(w.id)}
                    className="py-2 px-3 rounded-lg bg-white hover:bg-red-50 text-slate-500 hover:text-red-700 border border-slate-200 text-xs font-bold"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
