import React, { useEffect, useState, useRef } from 'react';
import { AppSettings, SwimSegment, SwimWorkout } from '../types/workout';
import { formatDurationDisplay, paceToNotch, notchToPace, EP_NOTCHES } from '../services/protocolEngine';
import { audioCoach } from '../services/audioCoach';
import { wakeLock } from '../services/wakeLock';
import { poolConnection } from '../services/poolConnection';
import { voiceCommands, VoiceState, VoiceCommand } from '../services/voiceCommands';

interface PoolsideHUDProps {
  workout: SwimWorkout;
  settings: AppSettings;
  onExit: () => void;
}

export const PoolsideHUD: React.FC<PoolsideHUDProps> = ({
  workout,
  settings,
  onExit
}) => {
  const [hudState, setHudState] = useState({
    segmentIndex: 0,
    segmentElapsedSec: 0,
    totalElapsedSec: 0
  });

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [paceOffset, setPaceOffset] = useState<number>(0);
  const [voiceState, setVoiceState] = useState<VoiceState>(() => voiceCommands.getState());

  const lastAnnouncedSec = useRef<number>(-1);
  const segments = workout.segments;
  const currentSegment: SwimSegment = segments[hudState.segmentIndex] || segments[0];

  const currentSegmentDuration = currentSegment?.durationSec || 60;
  const segmentRemainingSec = Math.max(0, currentSegmentDuration - hudState.segmentElapsedSec);
  const totalWorkoutDuration = workout.totalDurationSec;
  const totalRemainingSec = Math.max(0, totalWorkoutDuration - hudState.totalElapsedSec);

  const getEffectivePace = (seg: SwimSegment): number => {
    if (!seg || seg.paceSec100m === 0) return 0;
    return Math.max(EP_NOTCHES.FASTEST_PACE, Math.min(EP_NOTCHES.SLOWEST_PACE, seg.paceSec100m + paceOffset));
  };

  const effectivePaceSec = getEffectivePace(currentSegment);
  const currentNotch = effectivePaceSec > 0 ? paceToNotch(effectivePaceSec) : 0;

  useEffect(() => {
    if (settings.keepScreenOn) {
      wakeLock.requestWakeLock();
    }

    audioCoach.setSettings(
      settings.voiceCoachingEnabled,
      settings.audioChimesEnabled,
      settings.voiceVolume,
      settings.chimeVolume
    );

    if (currentSegment.type === 'warmup') {
      audioCoach.announceWarmup(`Notch ${currentNotch}`);
    } else if (currentSegment.type === 'rest') {
      audioCoach.announceBreak(currentSegment.durationSec);
    } else {
      audioCoach.announceTargetSpeed(`Notch ${currentNotch}`);
    }

    poolConnection.setDuration(totalWorkoutDuration);

    if (effectivePaceSec > 0) {
      poolConnection.setPace(effectivePaceSec);
      poolConnection.startMotor();
    } else {
      poolConnection.stopMotor();
    }

    return () => {
      wakeLock.releaseWakeLock();
      poolConnection.stopMotor();
    };
  }, []);

  useEffect(() => {
    if (isPaused || isCompleted) return;

    const timer = setInterval(() => {
      setHudState(prev => {
        const nextSegElapsed = prev.segmentElapsedSec + 1;
        const nextTotElapsed = prev.totalElapsedSec + 1;
        const segDuration = segments[prev.segmentIndex]?.durationSec || 60;
        const remaining = segDuration - nextSegElapsed;

        if (remaining <= 3 && remaining > 0 && lastAnnouncedSec.current !== remaining) {
          lastAnnouncedSec.current = remaining;
          audioCoach.playCountdownPip(false);
        } else if (remaining === 0 && lastAnnouncedSec.current !== 0) {
          lastAnnouncedSec.current = 0;
          audioCoach.playCountdownPip(true);
        }

        if (nextSegElapsed >= segDuration) {
          const nextIndex = prev.segmentIndex + 1;

          if (nextIndex >= segments.length) {
            setIsCompleted(true);
            poolConnection.stopMotor();
            audioCoach.announceComplete();
            return {
              segmentIndex: prev.segmentIndex,
              segmentElapsedSec: segDuration,
              totalElapsedSec: nextTotElapsed
            };
          }

          const nextSeg = segments[nextIndex];
          lastAnnouncedSec.current = -1;

          if (nextSeg.type === 'rest') {
            poolConnection.stopMotor();
            audioCoach.announceBreak(nextSeg.durationSec);
          } else {
            const nextPace = getEffectivePace(nextSeg);
            poolConnection.setPace(nextPace);
            poolConnection.startMotor();

            if (nextSeg.type === 'cooldown') {
              audioCoach.announceCooldown();
            } else {
              audioCoach.announceTargetSpeed(`Notch ${paceToNotch(nextPace)}`);
            }
          }

          return {
            segmentIndex: nextIndex,
            segmentElapsedSec: 0,
            totalElapsedSec: nextTotElapsed
          };
        }

        return {
          ...prev,
          segmentElapsedSec: nextSegElapsed,
          totalElapsedSec: nextTotElapsed
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused, isCompleted, segments, paceOffset]);

  const handleTogglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);

    if (nextPaused) {
      poolConnection.pauseWorkout();
      audioCoach.speak('Paused');
    } else {
      poolConnection.resumeWorkout();
      audioCoach.speak('Resuming');
    }
  };

  const handleStop = () => {
    poolConnection.stopMotor();
    audioCoach.speak('Stopped');
    onExit();
  };

  const adjustNotch = (delta: number) => {
    if (!currentSegment || currentSegment.paceSec100m === 0) return;
    const curN = paceToNotch(effectivePaceSec);
    const targetN = Math.max(1, Math.min(52, curN + delta));
    const newPace = notchToPace(targetN);
    const newOffset = newPace - currentSegment.paceSec100m;
    setPaceOffset(newOffset);
    poolConnection.setPace(newPace);
    audioCoach.speak(`Notch ${targetN}`);
  };

  useEffect(() => {
    if (settings.voiceCommandsEnabled) {
      voiceCommands.startListening();
    }

    const unsubState = voiceCommands.subscribeState(s => setVoiceState(s));

    const unsubCmd = voiceCommands.subscribe((cmd: VoiceCommand) => {
      if (cmd === 'stop') {
        handleStop();
      } else if (cmd === 'pause') {
        if (!isPaused) handleTogglePause();
      } else if (cmd === 'resume' || cmd === 'start') {
        if (isPaused) handleTogglePause();
      } else if (cmd === 'faster' || cmd === 'up5') {
        adjustNotch(cmd === 'up5' ? 5 : 1);
      } else if (cmd === 'slower' || cmd === 'down5') {
        adjustNotch(cmd === 'down5' ? -5 : -1);
      }
    });

    return () => {
      unsubState();
      unsubCmd();
    };
  }, [isPaused, currentSegment, effectivePaceSec, settings.voiceCommandsEnabled]);

  const progressPercent = Math.min(100, Math.round((hudState.totalElapsedSec / Math.max(1, totalWorkoutDuration)) * 100));

  return (
    <div 
      className="fixed inset-0 z-50 bg-[#f0f9ff] text-slate-900 flex flex-col justify-between p-3 sm:p-4 select-none overflow-hidden"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)'
      }}
    >
      {/* 1. TOP EDGE CONTROLS: Large tactile Stop and Pause buttons */}
      <div className="w-full space-y-2">
        <div className="grid grid-cols-2 gap-2 w-full">
          <button
            type="button"
            onClick={handleStop}
            className="h-14 sm:h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-black text-base sm:text-lg tracking-wider flex items-center justify-center transition-all shadow-sm"
          >
            STOP
          </button>

          <button
            type="button"
            onClick={handleTogglePause}
            className={`h-14 sm:h-16 rounded-2xl font-black text-base sm:text-lg tracking-wider transition-all flex items-center justify-center border-2 ${
              isPaused
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-900 border-water-300 hover:bg-water-50 active:bg-water-100'
            }`}
          >
            {isPaused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>

        {/* Hands-Free Voice Status Banner */}
        <div className="flex items-center justify-between px-3 py-1 rounded-xl bg-white border border-water-200 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 pr-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${voiceState.isListening ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            <span className="font-bold text-slate-700 text-xs truncate">
              {voiceState.isListening ? 'Voice Active: Say "Stop" or "Pool Stop"' : 'Voice Muted'}
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
            {voiceState.isListening ? 'MUTE' : 'ENABLE'}
          </button>
        </div>
      </div>

      {/* 2. CENTER DISPLAY: Huge legibility through goggles */}
      <div className="flex-1 flex flex-col items-center justify-center text-center my-2">
        {/* Segment Type Pill */}
        <div className="mb-2">
          {currentSegment.type === 'warmup' ? (
            <span className="px-3 py-1 rounded-full bg-water-100 text-water-800 border border-water-300 text-xs font-black uppercase tracking-wider">
              Warm Up
            </span>
          ) : currentSegment.type === 'rest' ? (
            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-black uppercase tracking-wider">
              Rest Break (Motor Off)
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-water-600 text-white text-xs font-black uppercase tracking-wider">
              Swim
            </span>
          )}
        </div>

        {/* Huge Countdown Timer */}
        <div className="font-mono font-black text-7xl sm:text-8xl md:text-9xl tracking-tight text-slate-950 leading-none">
          {formatDurationDisplay(segmentRemainingSec)}
        </div>

        {/* Speed Card with Steppers */}
        <div className="mt-4 w-full max-w-xs bg-white rounded-2xl p-3 border border-water-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">
              Speed
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-water-700">
              {currentSegment.paceSec100m === 0 ? 'OFF' : `NOTCH ${currentNotch}`}
            </span>
          </div>

          {currentSegment.paceSec100m > 0 && (
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => adjustNotch(-5)}
                className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs font-mono"
              >
                -5
              </button>
              <button
                type="button"
                onClick={() => adjustNotch(-1)}
                className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs font-mono"
              >
                -1
              </button>
              <button
                type="button"
                onClick={() => adjustNotch(1)}
                className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs font-mono"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => adjustNotch(5)}
                className="h-10 rounded-xl bg-water-50 hover:bg-water-100 active:bg-water-200 text-slate-900 border border-water-200 font-black text-xs font-mono"
              >
                +5
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. BOTTOM PROGRESS LINE */}
      <div className="w-full bg-white rounded-2xl p-3 border border-water-200 shadow-xs space-y-1.5">
        <div className="w-full bg-water-100 rounded-full h-2.5 overflow-hidden">
          <div 
            className="bg-water-600 h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-xs font-mono font-bold text-slate-600">
          <span>Elapsed {formatDurationDisplay(hudState.totalElapsedSec)}</span>
          <span>Left {formatDurationDisplay(totalRemainingSec)}</span>
        </div>
      </div>
    </div>
  );
};
