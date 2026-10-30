import React, { useState, useMemo, useEffect } from 'react';
import { AppSettings, SwimWorkout } from '../types/workout';
import { paceToNotch, notchToPace } from '../services/protocolEngine';
import { generateSmartWorkout, loadLastWorkoutConfig, saveLastWorkoutConfig } from '../services/storage';
import { voiceCommands, VoiceState, VoiceCommand } from '../services/voiceCommands';
import { audioCoach } from '../services/audioCoach';

interface QuickWorkoutBuilderProps {
  settings: AppSettings;
  onStartWorkout: (workout: SwimWorkout) => void;
  onSaveWorkout?: (workout: SwimWorkout) => void;
}

export const QuickWorkoutBuilder: React.FC<QuickWorkoutBuilderProps> = ({
  settings,
  onStartWorkout
}) => {
  // Load this phone's last workout configuration directly from local device storage
  const [initialConfig] = useState(() => loadLastWorkoutConfig());

  // 1. Target Speed in 1 to 52 Notches (1 = slowest, 52 = fastest)
  const [targetNotch, setTargetNotch] = useState<number>(() => {
    if (initialConfig.targetNotch) return Math.max(1, Math.min(52, initialConfig.targetNotch));
    return paceToNotch(initialConfig.targetPaceSec100m) || 28;
  });

  const targetPaceSec = useMemo(() => notchToPace(targetNotch), [targetNotch]);

  // 2. Total duration (minutes)
  const [durationMinutes, setDurationMinutes] = useState<number>(initialConfig.durationMinutes || 20);

  // 3. First minute slower toggle (Warm-up)
  const [hasWarmup, setHasWarmup] = useState<boolean>(initialConfig.hasWarmup ?? true);
  const warmupNotch = useMemo(() => Math.max(1, targetNotch - 12), [targetNotch]);
  const warmupPaceSec = useMemo(() => notchToPace(warmupNotch), [warmupNotch]);

  // 4. Mid-workout break toggle
  const [hasMidBreak, setHasMidBreak] = useState<boolean>(initialConfig.hasMidBreak ?? true);

  // Voice Command Listener State
  const [voiceState, setVoiceState] = useState<VoiceState>(() => voiceCommands.getState());

  // Auto-save this phone's settings whenever changed
  useEffect(() => {
    saveLastWorkoutConfig({
      targetPaceSec100m: targetPaceSec,
      targetNotch,
      durationMinutes,
      hasWarmup,
      warmupPaceSec100m: warmupPaceSec,
      warmupNotch,
      hasMidBreak,
      midBreakDurationSec: 60,
      hasCooldown: false
    });
  }, [targetNotch, targetPaceSec, durationMinutes, hasWarmup, warmupNotch, warmupPaceSec, hasMidBreak]);

  // Generate live workout
  const generatedWorkout = useMemo(() => {
    return generateSmartWorkout({
      targetPaceSec100m: targetPaceSec,
      totalMinutes: durationMinutes,
      hasWarmup,
      warmupDurationSec: 60,
      warmupPaceSec100m: warmupPaceSec,
      hasMidBreak,
      midBreakDurationSec: 60,
      hasCooldown: false,
      cooldownDurationSec: 0
    });
  }, [targetPaceSec, durationMinutes, hasWarmup, warmupPaceSec, hasMidBreak]);

  // Voice listener hook: Clean standby on home screen (prevents background microphone loop & UI lag)
  useEffect(() => {
    const unsubState = voiceCommands.subscribeState(s => setVoiceState(s));

    const unsubCmd = voiceCommands.subscribe((cmd: VoiceCommand) => {
      if (cmd === 'start') {
        audioCoach.speak('Starting swim');
        voiceCommands.stopListening();
        onStartWorkout(generatedWorkout);
      } else if (cmd === 'faster' || cmd === 'up5') {
        const delta = cmd === 'up5' ? 5 : 1;
        setTargetNotch(prev => {
          const next = Math.min(52, prev + delta);
          audioCoach.speak(`Notch ${next}`);
          return next;
        });
      } else if (cmd === 'slower' || cmd === 'down5') {
        const delta = cmd === 'down5' ? 5 : 1;
        setTargetNotch(prev => {
          const next = Math.max(1, prev - delta);
          audioCoach.speak(`Notch ${next}`);
          return next;
        });
      }
    });

    return () => {
      unsubState();
      unsubCmd();
      voiceCommands.stopListening();
    };
  }, [generatedWorkout, onStartWorkout]);

  const adjustNotch = (delta: number) => {
    setTargetNotch(prev => Math.max(1, Math.min(52, prev + delta)));
  };

  const adjustDuration = (delta: number) => {
    setDurationMinutes(prev => Math.max(5, Math.min(60, prev + delta)));
  };

  return (
    <div className="w-full flex flex-col gap-2 py-0.5">
      {/* 1. TOP START BUTTON: Big tactile action at top, zero scroll */}
      <div className="w-full space-y-1">
        <button
          type="button"
          onClick={() => onStartWorkout(generatedWorkout)}
          className="w-full h-12 sm:h-14 rounded-2xl bg-water-600 hover:bg-water-700 active:bg-water-800 text-white font-black text-base sm:text-lg tracking-wider flex items-center justify-center shadow-xs transition-all"
        >
          START SWIM
        </button>

        {/* Voice status banner: clear, intuitive, hands-free */}
        <div className="flex items-center justify-between px-2.5 py-1 rounded-xl bg-white border border-water-200 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 pr-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${voiceState.isListening ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            <span className="font-bold text-slate-700 text-[11px] sm:text-xs truncate">
              {voiceState.isListening
                ? (voiceState.hasVoiceProfile ? 'Voice Match: Say "Start"' : 'Voice Active: Say "Start"')
                : 'Voice Standby'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => voiceCommands.toggle()}
            className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border transition-all shrink-0 ${
              voiceState.isListening
                ? 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                : 'border-water-300 text-slate-700 bg-white hover:bg-water-50'
            }`}
          >
            {voiceState.isListening ? 'MUTE' : 'LISTEN'}
          </button>
        </div>
      </div>

      {/* 2. SPEED CARD */}
      <div className="w-full bg-white rounded-2xl p-2.5 sm:p-3.5 border border-water-200 shadow-xs space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            Speed
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-water-700">
            NOTCH {targetNotch}
          </span>
        </div>

        {/* Big Steppers */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => adjustNotch(-5)}
            className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all"
          >
            -5
          </button>
          <button
            type="button"
            onClick={() => adjustNotch(-1)}
            className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all"
          >
            -1
          </button>
          <button
            type="button"
            onClick={() => adjustNotch(1)}
            className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all"
          >
            +1
          </button>
          <button
            type="button"
            onClick={() => adjustNotch(5)}
            className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all"
          >
            +5
          </button>
        </div>

        {/* Quick Presets */}
        <div className="grid grid-cols-4 gap-1.5">
          {[15, 25, 35, 45].map((val) => {
            const isSelected = targetNotch === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setTargetNotch(val)}
                className={`h-8 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center border ${
                  isSelected
                    ? 'bg-water-600 text-white border-water-600 font-black'
                    : 'bg-white text-slate-600 border-water-200 hover:bg-water-50'
                }`}
              >
                {val}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. TIME CARD */}
      <div className="w-full bg-white rounded-2xl p-2.5 sm:p-3.5 border border-water-200 shadow-xs space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            Time
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-water-700">
            {durationMinutes} MIN
          </span>
        </div>

        {/* Big Steppers */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => adjustDuration(-5)}
            className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all"
          >
            -5
          </button>
          <button
            type="button"
            onClick={() => adjustDuration(-1)}
            className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all"
          >
            -1
          </button>
          <button
            type="button"
            onClick={() => adjustDuration(1)}
            className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all"
          >
            +1
          </button>
          <button
            type="button"
            onClick={() => adjustDuration(5)}
            className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs sm:text-sm font-mono flex items-center justify-center transition-all"
          >
            +5
          </button>
        </div>

        {/* Quick Presets */}
        <div className="grid grid-cols-4 gap-1.5">
          {[10, 15, 20, 30].map((val) => {
            const isSelected = durationMinutes === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setDurationMinutes(val)}
                className={`h-8 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center border ${
                  isSelected
                    ? 'bg-water-600 text-white border-water-600 font-black'
                    : 'bg-white text-slate-600 border-water-200 hover:bg-water-50'
                }`}
              >
                {val}m
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. INTERVAL OPTIONS */}
      <div className="w-full bg-white rounded-2xl p-2.5 sm:p-3.5 border border-water-200 shadow-xs space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 block">
              Warm Up
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              1 min gentle start
            </span>
          </div>

          <button
            type="button"
            onClick={() => setHasWarmup(!hasWarmup)}
            className={`h-8 px-3 rounded-xl text-[11px] font-black transition-all border ${
              hasWarmup
                ? 'bg-water-600 text-white border-water-600'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {hasWarmup ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="border-t border-water-100 my-0.5" />

        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 block">
              Rest Break
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              1 min midpoint rest
            </span>
          </div>

          <button
            type="button"
            onClick={() => setHasMidBreak(!hasMidBreak)}
            className={`h-8 px-3 rounded-xl text-[11px] font-black transition-all border ${
              hasMidBreak
                ? 'bg-water-600 text-white border-water-600'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {hasMidBreak ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  );
};
