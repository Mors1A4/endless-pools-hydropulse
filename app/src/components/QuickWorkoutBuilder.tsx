import React, { useState, useMemo, useEffect } from 'react';
import { AppSettings, SwimWorkout } from '../types/workout';
import { formatPaceDisplay, formatTimeLong, paceToNotch, notchToPace, EP_NOTCHES } from '../services/protocolEngine';
import { generateSmartWorkout, loadLastWorkoutConfig, saveLastWorkoutConfig } from '../services/storage';
import { voiceCommands, VoiceState, VoiceCommand } from '../services/voiceCommands';
import { audioCoach } from '../services/audioCoach';
import { TimelineBar } from './TimelineBar';

interface QuickWorkoutBuilderProps {
  settings: AppSettings;
  onStartWorkout: (workout: SwimWorkout) => void;
  onSaveWorkout: (workout: SwimWorkout) => void;
}

export const QuickWorkoutBuilder: React.FC<QuickWorkoutBuilderProps> = ({
  settings,
  onStartWorkout,
  onSaveWorkout
}) => {
  // Load this phone's last workout configuration directly from local device storage
  const [initialConfig] = useState(() => loadLastWorkoutConfig());

  // 1. Target Speed in 1 to 52 Notches (1 = slowest, 52 = fastest)
  const [targetNotch, setTargetNotch] = useState<number>(() => {
    if (initialConfig.targetNotch) return Math.max(1, Math.min(52, initialConfig.targetNotch));
    return paceToNotch(initialConfig.targetPaceSec100m) || 29;
  });

  // Target pace derived from notch
  const targetPaceSec = useMemo(() => notchToPace(targetNotch), [targetNotch]);

  // 2. Total duration q (minutes)
  const [durationMinutes, setDurationMinutes] = useState<number>(initialConfig.durationMinutes || 20);

  // 3. First minute slower toggle (Warm-up)
  const [hasWarmup, setHasWarmup] = useState<boolean>(initialConfig.hasWarmup ?? true);
  const [warmupNotch, setWarmupNotch] = useState<number>(() => {
    if (initialConfig.warmupNotch) return Math.max(1, Math.min(52, initialConfig.warmupNotch));
    return Math.max(1, (initialConfig.targetNotch || 29) - 12);
  });
  const warmupPaceSec = useMemo(() => notchToPace(warmupNotch), [warmupNotch]);

  // 4. Mid-workout break toggle & Quick Selector
  const [hasMidBreak, setHasMidBreak] = useState<boolean>(initialConfig.hasMidBreak ?? true);
  const [midBreakDurationSec, setMidBreakDurationSec] = useState<number>(
    initialConfig.midBreakDurationSec || settings.defaultBreakDurationSec || 60
  );

  // 5. Cool-down toggle
  const [hasCooldown, setHasCooldown] = useState<boolean>(initialConfig.hasCooldown ?? false);

  // Voice Command Listener State
  const [voiceState, setVoiceState] = useState<VoiceState>(() => voiceCommands.getState());

  // Auto-save this phone's settings whenever any slider or toggle is adjusted
  useEffect(() => {
    saveLastWorkoutConfig({
      targetPaceSec100m: targetPaceSec,
      targetNotch,
      durationMinutes,
      hasWarmup,
      warmupPaceSec100m: warmupPaceSec,
      warmupNotch,
      hasMidBreak,
      midBreakDurationSec,
      hasCooldown
    });
  }, [targetNotch, targetPaceSec, durationMinutes, hasWarmup, warmupNotch, warmupPaceSec, hasMidBreak, midBreakDurationSec, hasCooldown]);

  // Discrete Notch selector chips (e.g. 10, 15, 20, 28, 36, 48)
  const notchChips = [
    { label: 'N10', notch: 10, pace: '3:06' },
    { label: 'N15', notch: 15, pace: '2:53' },
    { label: 'N20', notch: 20, pace: '2:39' },
    { label: 'N28', notch: 28, pace: '2:18' },
    { label: 'N36', notch: 36, pace: '1:56' },
    { label: 'N48', notch: 48, pace: '1:25' },
  ];

  // Duration quick selector chips (q minutes)
  const durationChips = [10, 15, 20, 25, 30, 45];

  // Break duration quick selector chips
  const breakDurationChips = [
    { label: '30s', sec: 30 },
    { label: '45s', sec: 45 },
    { label: '60s', sec: 60 },
    { label: '90s', sec: 90 },
    { label: '120s', sec: 120 },
  ];

  // Generate live preview workout
  const generatedWorkout = useMemo(() => {
    return generateSmartWorkout({
      targetPaceSec100m: targetPaceSec,
      totalMinutes: durationMinutes,
      hasWarmup,
      warmupDurationSec: 60,
      warmupPaceSec100m: warmupPaceSec,
      hasMidBreak,
      midBreakDurationSec,
      hasCooldown,
      cooldownDurationSec: 60
    });
  }, [targetPaceSec, durationMinutes, hasWarmup, warmupPaceSec, hasMidBreak, midBreakDurationSec, hasCooldown]);

  // Voice listener hook
  useEffect(() => {
    if (settings.voiceCommandsEnabled) {
      voiceCommands.startListening();
    }

    const unsubState = voiceCommands.subscribeState(s => setVoiceState(s));

    const unsubCmd = voiceCommands.subscribe((cmd: VoiceCommand) => {
      if (cmd === 'start') {
        audioCoach.speak('Voice command recognized: Starting swim workout');
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
    };
  }, [generatedWorkout, settings.voiceCommandsEnabled, onStartWorkout]);

  const adjustNotch = (delta: number) => {
    setTargetNotch(prev => {
      const next = Math.max(1, Math.min(52, prev + delta));
      setWarmupNotch(Math.max(1, next - 12));
      return next;
    });
  };

  const toggleVoice = () => {
    voiceCommands.toggle();
  };

  return (
    <div className="w-full space-y-2 bg-white p-3 sm:p-4 rounded-2xl border border-water-200 shadow-sm">
      {/* 1. TOP ACTION BAR: Big Start & Save buttons at the very top (never scroll, avoids bottom back button) */}
      <div className="flex items-center gap-2 w-full pb-1 border-b border-water-200">
        <button
          type="button"
          onClick={() => onStartWorkout(generatedWorkout)}
          className="flex-1 min-w-0 h-13 rounded-xl bg-water-600 hover:bg-water-700 active:scale-[0.99] text-white font-black text-sm tracking-wide flex items-center justify-center transition-all shadow-sm"
        >
          START SWIM WORKOUT
        </button>

        <button
          type="button"
          onClick={() => onSaveWorkout(generatedWorkout)}
          className="shrink-0 w-20 sm:w-24 h-13 rounded-xl bg-white hover:bg-water-50 text-water-800 border border-water-300 font-bold text-xs uppercase tracking-wider active:scale-[0.99] transition-all flex items-center justify-center"
        >
          SAVE
        </button>
      </div>

      {/* 2. HANDS-FREE VOICE BAR: Wet hands listening banner with mic toggle */}
      <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-water-50 border border-water-200 text-xs">
        <div className="flex items-center gap-2 min-w-0 pr-1">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${voiceState.isListening ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          <span className="font-bold text-slate-800 truncate text-[11px] sm:text-xs">
            {voiceState.isListening
              ? 'Voice Active: Say "Start" or "Stop"'
              : 'Voice Commands: Paused'}
          </span>
          {voiceState.lastHeard && (
            <span className="hidden sm:inline text-[10px] text-slate-500 italic truncate font-mono">
              (Heard: "{voiceState.lastHeard}")
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleVoice}
          className={`h-7 px-2.5 rounded-lg text-[11px] font-bold transition-all border shrink-0 ${
            voiceState.isListening
              ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
        >
          {voiceState.isListening ? '[ MIC: ON ]' : '[ MIC: OFF ]'}
        </button>
      </div>

      {/* 3. Setup Header & Total Time */}
      <div className="flex items-center justify-between pt-1 pb-1">
        <div className="min-w-0 pr-2">
          <h2 className="text-sm font-black tracking-tight text-slate-900 leading-none truncate">
            Workout Setup
          </h2>
          <p className="text-[10px] text-slate-400 font-medium leading-none mt-1 truncate">
            Auto-saved on this phone
          </p>
        </div>

        <span className="text-xs font-mono font-black px-2 py-0.5 rounded-full bg-water-100 text-water-900 border border-water-300 shrink-0">
          {formatTimeLong(generatedWorkout.totalDurationSec)}
        </span>
      </div>

      {/* 4. Target Swim Speed: NOTCHES (1 to 52) */}
      <div className="bg-water-50/70 p-2 sm:p-2.5 rounded-xl border border-water-200 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">
              Target Speed (Notch 1 to 52)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Level {targetNotch} of 52 ({formatPaceDisplay(targetPaceSec, 'pace100m')})
            </span>
          </div>

          <span className="text-xl sm:text-2xl font-black text-water-700 font-mono tracking-tight leading-none">
            NOTCH {targetNotch}
          </span>
        </div>

        {/* Notch Adjustment Step Buttons ([-5] [-1] [+1] [+5]) */}
        <div className="grid grid-cols-4 gap-1 w-full pt-0.5">
          <button
            type="button"
            onClick={() => adjustNotch(-5)}
            className="h-8 rounded-lg bg-white hover:bg-water-100 text-slate-800 border border-water-300 font-bold text-xs font-mono flex items-center justify-center transition-all"
          >
            -5 Notches
          </button>
          <button
            type="button"
            onClick={() => adjustNotch(-1)}
            className="h-8 rounded-lg bg-white hover:bg-water-100 text-slate-800 border border-water-300 font-bold text-xs font-mono flex items-center justify-center transition-all"
          >
            -1 Notch
          </button>
          <button
            type="button"
            onClick={() => adjustNotch(1)}
            className="h-8 rounded-lg bg-white hover:bg-water-100 text-slate-800 border border-water-300 font-bold text-xs font-mono flex items-center justify-center transition-all"
          >
            +1 Notch
          </button>
          <button
            type="button"
            onClick={() => adjustNotch(5)}
            className="h-8 rounded-lg bg-white hover:bg-water-100 text-slate-800 border border-water-300 font-bold text-xs font-mono flex items-center justify-center transition-all"
          >
            +5 Notches
          </button>
        </div>

        {/* Quick Notch Chips */}
        <div className="grid grid-cols-6 gap-1 w-full">
          {notchChips.map((chip) => {
            const isSelected = targetNotch === chip.notch;
            return (
              <button
                key={chip.notch}
                type="button"
                onClick={() => {
                  setTargetNotch(chip.notch);
                  setWarmupNotch(Math.max(1, chip.notch - 12));
                }}
                className={`h-8 min-w-0 w-full rounded-lg text-[11px] sm:text-xs font-bold font-mono transition-all flex items-center justify-center ${
                  isSelected
                    ? 'bg-water-600 text-white font-black shadow-xs'
                    : 'bg-white text-slate-700 border border-water-200 hover:bg-water-100'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Notch Slider (1 to 52) */}
        <div className="pt-0.5">
          <input
            type="range"
            min={1}
            max={52}
            step={1}
            value={targetNotch}
            onChange={(e) => {
              const val = Number(e.target.value);
              setTargetNotch(val);
              setWarmupNotch(Math.max(1, val - 12));
            }}
            className="w-full accent-water-600 cursor-pointer h-1.5 bg-water-200 rounded-lg block"
          />
          <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-0.5 leading-none">
            <span>Notch 1 (Slowest)</span>
            <span>52 Clicks</span>
            <span>Notch 52 (Fastest)</span>
          </div>
        </div>
      </div>

      {/* 5. Workout Duration q (Minutes) */}
      <div className="bg-water-50/70 p-2 sm:p-2.5 rounded-xl border border-water-200 space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">
            Workout Duration
          </span>
          <span className="text-base font-black text-water-700 font-mono leading-none">
            {durationMinutes} min
          </span>
        </div>

        {/* Quick Duration Chips: Fixed h-8, min-w-0 */}
        <div className="grid grid-cols-6 gap-1 w-full">
          {durationChips.map((mins) => {
            const isSelected = durationMinutes === mins;
            return (
              <button
                key={mins}
                type="button"
                onClick={() => setDurationMinutes(mins)}
                className={`h-8 min-w-0 w-full rounded-lg text-[11px] sm:text-xs font-bold font-mono transition-all flex items-center justify-center ${
                  isSelected
                    ? 'bg-water-600 text-white font-black shadow-xs'
                    : 'bg-white text-slate-700 border border-water-200 hover:bg-water-100'
                }`}
              >
                {mins}m
              </button>
            );
          })}
        </div>

        {/* Minutes Slider */}
        <div className="pt-0.5">
          <input
            type="range"
            min={5}
            max={60}
            step={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="w-full accent-water-600 cursor-pointer h-1.5 bg-water-200 rounded-lg block"
          />
        </div>
      </div>

      {/* 6. Interval Settings Panel (Warmup, Break, Cooldown) */}
      <div className="bg-water-50/60 rounded-xl border border-water-200 divide-y divide-water-200/80">
        {/* Warm-up Row */}
        <div className="p-2 sm:p-2.5 flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-800">Warm-up (First Minute Slower)</span>
              {hasWarmup && (
                <span className="text-[9px] font-mono font-bold text-water-700 bg-water-100 px-1 py-0.2 rounded border border-water-200">
                  Notch {warmupNotch}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">60s gentle drift, then ramps up to Notch {targetNotch}</p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={hasWarmup}
              onChange={(e) => setHasWarmup(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-water-600"></div>
          </label>
        </div>

        {/* Mid-Workout Break Row */}
        <div className="p-2 sm:p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-xs font-bold text-slate-800 block">Mid-Workout Break</span>
              <p className="text-[10px] text-slate-500 leading-tight">Current stops at midpoint to rest</p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={hasMidBreak}
                onChange={(e) => setHasMidBreak(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Quick Selector for Break Duration: Matching height h-8 */}
          {hasMidBreak && (
            <div className="grid grid-cols-5 gap-1 pt-1 w-full">
              {breakDurationChips.map((chip) => {
                const isSelected = midBreakDurationSec === chip.sec;
                return (
                  <button
                    key={chip.sec}
                    type="button"
                    onClick={() => setMidBreakDurationSec(chip.sec)}
                    className={`h-8 min-w-0 w-full rounded-lg text-[11px] sm:text-xs font-bold font-mono transition-all flex items-center justify-center ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-black shadow-xs'
                        : 'bg-white text-slate-700 border border-water-200 hover:bg-water-100'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cool-down Row */}
        <div className="p-2 sm:p-2.5 flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <span className="text-xs font-bold text-slate-800 block">Cool-down (1 Min Easy)</span>
            <p className="text-[10px] text-slate-500 leading-tight">Gentle easy flow at finish</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={hasCooldown}
              onChange={(e) => setHasCooldown(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-water-600"></div>
          </label>
        </div>
      </div>

      {/* 7. Timeline Bar: Compact */}
      <div className="space-y-1 pt-0.5">
        <div className="flex justify-between items-center text-[10px] font-bold text-slate-600">
          <span>Workout Segments</span>
          <span className="text-water-700 font-mono">{generatedWorkout.segments.length} Steps</span>
        </div>
        <TimelineBar segments={generatedWorkout.segments} />
      </div>

      {/* 8. Secondary Start Button (Convenience at bottom, identical to top) */}
      <div className="pt-1 flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => onStartWorkout(generatedWorkout)}
          className="flex-1 min-w-0 h-11 rounded-xl bg-water-600 hover:bg-water-700 active:scale-[0.99] text-white font-black text-xs sm:text-sm tracking-wide flex items-center justify-center transition-all shadow-sm"
        >
          START SWIM WORKOUT
        </button>
      </div>
    </div>
  );
};
