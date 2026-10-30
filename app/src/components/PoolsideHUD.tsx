import React, { useEffect, useState, useRef } from 'react';
import { AppSettings, SwimSegment, SwimWorkout } from '../types/workout';
import { formatDurationDisplay, formatPaceDisplay, paceToNotch, notchToPace, EP_NOTCHES } from '../services/protocolEngine';
import { audioCoach } from '../services/audioCoach';
import { wakeLock } from '../services/wakeLock';
import { poolConnection } from '../services/poolConnection';
import { voiceCommands, VoiceState, VoiceCommand } from '../services/voiceCommands';
import { TimelineBar } from './TimelineBar';

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
  // Unified execution state to avoid React state tearing
  const [hudState, setHudState] = useState({
    segmentIndex: 0,
    segmentElapsedSec: 0,
    totalElapsedSec: 0
  });

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [voiceMuted, setVoiceMuted] = useState<boolean>(!settings.voiceCoachingEnabled);

  // Live mid-swim pace adjustment (+/- seconds offset)
  const [paceOffset, setPaceOffset] = useState<number>(0);

  // Voice Command State
  const [voiceState, setVoiceState] = useState<VoiceState>(() => voiceCommands.getState());

  const lastAnnouncedSec = useRef<number>(-1);
  const segments = workout.segments;
  const currentSegment: SwimSegment = segments[hudState.segmentIndex] || segments[0];
  const nextSegment: SwimSegment | undefined = segments[hudState.segmentIndex + 1];

  const currentSegmentDuration = currentSegment?.durationSec || 60;
  const segmentRemainingSec = Math.max(0, currentSegmentDuration - hudState.segmentElapsedSec);
  const totalWorkoutDuration = workout.totalDurationSec;
  const totalRemainingSec = Math.max(0, totalWorkoutDuration - hudState.totalElapsedSec);

  // Compute effective pace with offset applied to active swim segments
  const getEffectivePace = (seg: SwimSegment): number => {
    if (!seg || seg.paceSec100m === 0) return 0;
    return Math.max(EP_NOTCHES.FASTEST_PACE, Math.min(EP_NOTCHES.SLOWEST_PACE, seg.paceSec100m + paceOffset));
  };

  const effectivePaceSec = getEffectivePace(currentSegment);
  const currentNotch = effectivePaceSec > 0 ? paceToNotch(effectivePaceSec) : 0;

  // Startup: WakeLock, Audio, and initial Pool commands
  useEffect(() => {
    if (settings.keepScreenOn) {
      wakeLock.requestWakeLock().then(active => setWakeLockActive(active));
    }

    audioCoach.setSettings(
      !voiceMuted,
      settings.audioChimesEnabled,
      settings.voiceVolume,
      settings.chimeVolume
    );

    // Initial announcement
    if (currentSegment.type === 'warmup') {
      audioCoach.announceWarmup(`Notch ${currentNotch}`);
    } else if (currentSegment.type === 'rest') {
      audioCoach.announceBreak(currentSegment.durationSec);
    } else {
      audioCoach.announceTargetSpeed(`Notch ${currentNotch}`);
    }

    // Set duration cap and initiate flow
    poolConnection.setDuration(totalWorkoutDuration);

    if (effectivePaceSec > 0) {
      poolConnection.setPace(effectivePaceSec);
      poolConnection.startMotor();
    } else {
      poolConnection.stopMotor();
      // Pre-set next segment pace if available
      if (nextSegment && nextSegment.paceSec100m > 0) {
        poolConnection.setPace(getEffectivePace(nextSegment));
      }
    }

    return () => {
      wakeLock.releaseWakeLock();
      poolConnection.stopMotor();
    };
  }, []);

  // Main high-precision interval runner
  useEffect(() => {
    if (isPaused || isCompleted) return;

    const timer = setInterval(() => {
      setHudState(prev => {
        const nextSegElapsed = prev.segmentElapsedSec + 1;
        const nextTotElapsed = prev.totalElapsedSec + 1;
        const segDuration = segments[prev.segmentIndex]?.durationSec || 60;
        const remaining = segDuration - nextSegElapsed;

        // Audio countdown pips
        if (remaining <= 3 && remaining > 0 && lastAnnouncedSec.current !== remaining) {
          lastAnnouncedSec.current = remaining;
          audioCoach.playCountdownPip(false);
        } else if (remaining === 0 && lastAnnouncedSec.current !== 0) {
          lastAnnouncedSec.current = 0;
          audioCoach.playCountdownPip(true);
        } else if (remaining === 10 && lastAnnouncedSec.current !== 10) {
          lastAnnouncedSec.current = 10;
          const upNext = segments[prev.segmentIndex + 1];
          if (upNext) {
            if (upNext.type === 'rest') {
              audioCoach.speak('10 seconds to rest break');
            } else if (segments[prev.segmentIndex].type === 'warmup') {
              audioCoach.speak(`10 seconds to Notch ${paceToNotch(getEffectivePace(upNext))}`);
            } else {
              audioCoach.speak('10 seconds remaining');
            }
          }
        }

        // Segment complete transition
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

          // Transition to next segment
          const nextSeg = segments[nextIndex];
          lastAnnouncedSec.current = -1;

          if (nextSeg.type === 'rest') {
            poolConnection.stopMotor();
            // Pre-set next swim pace for faster valve transition when rest ends
            const upcomingSeg = segments[nextIndex + 1];
            if (upcomingSeg && upcomingSeg.paceSec100m > 0) {
              poolConnection.setPace(getEffectivePace(upcomingSeg));
            }
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
      audioCoach.speak('Workout paused. Motor off.');
    } else {
      poolConnection.resumeWorkout();
      audioCoach.speak('Resuming workout.');
    }
  };

  const handleStop = () => {
    poolConnection.stopMotor();
    audioCoach.speak('Workout stopped.');
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

  // Voice Command Subscription in HUD (Hands-Free Wet Hands Control)
  useEffect(() => {
    if (settings.voiceCommandsEnabled) {
      voiceCommands.startListening();
    }

    const unsubState = voiceCommands.subscribeState(s => setVoiceState(s));

    const unsubCmd = voiceCommands.subscribe((cmd: VoiceCommand) => {
      if (cmd === 'stop') {
        audioCoach.speak('Voice recognized: Stopping');
        handleStop();
      } else if (cmd === 'pause') {
        if (!isPaused) handleTogglePause();
      } else if (cmd === 'resume' || cmd === 'start') {
        if (isPaused) handleTogglePause();
      } else if (cmd === 'faster' || cmd === 'up5') {
        const delta = cmd === 'up5' ? 5 : 1;
        adjustNotch(delta);
      } else if (cmd === 'slower' || cmd === 'down5') {
        const delta = cmd === 'down5' ? 5 : 1;
        adjustNotch(-delta);
      }
    });

    return () => {
      unsubState();
      unsubCmd();
    };
  }, [isPaused, currentSegment, effectivePaceSec, settings.voiceCommandsEnabled]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-[#f0f9ff] text-slate-900 flex flex-col justify-between px-3 sm:px-4 pb-3 select-none overflow-hidden"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 36px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)'
      }}
    >
      {/* 1. TOP BAR: Large Primary Start/Stop/Pause Buttons at the very top (never scroll, avoids bottom back button) */}
      <div className="space-y-1.5 z-10 border-b border-water-200 pb-2">
        <div className="grid grid-cols-2 gap-2 w-full">
          <button
            type="button"
            onClick={handleStop}
            className="h-13 sm:h-14 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-base sm:text-lg tracking-wider flex items-center justify-center transition-all shadow-sm active:scale-[0.99]"
          >
            STOP SWIM
          </button>

          <button
            type="button"
            onClick={handleTogglePause}
            className={`h-13 sm:h-14 rounded-xl font-black text-base sm:text-lg tracking-wider transition-all flex items-center justify-center border-2 active:scale-[0.99] ${
              isPaused
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-800 border-water-300 hover:bg-water-50'
            }`}
          >
            {isPaused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>

        {/* 2. Hands-Free Voice Listener Status Banner */}
        <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-white border border-water-200 text-xs">
          <div className="flex items-center gap-2 min-w-0 pr-1">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${voiceState.isListening ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
            <span className="font-bold text-slate-800 text-[11px] truncate">
              {voiceState.isListening
                ? 'Voice Active: Say "Stop", "Pause", or "Up 5"'
                : 'Voice Commands: Paused'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => voiceCommands.toggle()}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                voiceState.isListening
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              {voiceState.isListening ? '[ MIC: ON ]' : '[ MIC: OFF ]'}
            </button>

            <button
              type="button"
              onClick={() => {
                const nextMuted = !voiceMuted;
                setVoiceMuted(nextMuted);
                audioCoach.setSettings(!nextMuted, settings.audioChimesEnabled);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                !voiceMuted ? 'bg-water-100 text-water-800 border-water-300' : 'bg-white text-slate-400 border-slate-200'
              }`}
            >
              {!voiceMuted ? 'Voice: On' : 'Muted'}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main High-Contrast Swim Display (Ultra-legible through goggles poolside) */}
      <div className="flex-1 flex flex-col items-center justify-center text-center my-1">
        {/* Segment Type Pill */}
        <div className="mb-1">
          {currentSegment.type === 'warmup' ? (
            <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800 border border-sky-300 text-xs font-black uppercase tracking-wider">
              Warm-up (First Minute Slower)
            </span>
          ) : currentSegment.type === 'rest' ? (
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black uppercase tracking-wider">
              Mid-Workout Break (Motor Off)
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-water-100 text-water-800 border border-water-300 text-xs font-black uppercase tracking-wider">
              Target Pace Swim
            </span>
          )}
        </div>

        {/* Big Countdown Timer */}
        <div className="font-mono font-black text-7xl sm:text-8xl md:text-9xl tracking-tight text-slate-950 leading-none">
          {formatDurationDisplay(segmentRemainingSec)}
        </div>

        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
          Remaining in Segment
        </p>

        {/* Speed / Notch Card */}
        <div className="mt-3 w-full max-w-sm p-3 rounded-2xl bg-white border border-water-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-left">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block">
                Current Speed
              </span>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-water-700">
                {currentSegment.paceSec100m === 0 ? 'MOTOR OFF' : `NOTCH ${currentNotch}`}
              </div>
              <span className="text-[10px] font-medium text-slate-500">
                {currentSegment.paceSec100m > 0
                  ? `Level ${currentNotch} of 52 (${formatPaceDisplay(effectivePaceSec, 'pace100m')})`
                  : 'Break Interval'}
              </span>
            </div>

            {/* Quick Notch Step Buttons */}
            {currentSegment.paceSec100m > 0 && (
              <div className="grid grid-cols-2 gap-1 pl-2 border-l border-water-200">
                <button
                  type="button"
                  onClick={() => adjustNotch(-5)}
                  className="py-1 px-2 rounded-lg bg-water-100 hover:bg-water-200 text-water-900 font-bold text-xs font-mono"
                >
                  -5 Notches
                </button>
                <button
                  type="button"
                  onClick={() => adjustNotch(5)}
                  className="py-1 px-2 rounded-lg bg-water-100 hover:bg-water-200 text-water-900 font-bold text-xs font-mono"
                >
                  +5 Notches
                </button>
                <button
                  type="button"
                  onClick={() => adjustNotch(-1)}
                  className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs font-mono"
                >
                  -1 Notch
                </button>
                <button
                  type="button"
                  onClick={() => adjustNotch(1)}
                  className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs font-mono"
                >
                  +1 Notch
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Up Next Banner */}
        {nextSegment && (
          <div className="mt-2 px-3 py-1 rounded-full bg-white border border-water-200 text-xs font-semibold text-slate-600">
            <span className="text-water-700 uppercase font-bold mr-1">Next:</span>
            {nextSegment.name} ({formatDurationDisplay(nextSegment.durationSec)})
          </div>
        )}
      </div>

      {/* 4. Bottom Timeline & Progress (Non-interactive display only) */}
      <div className="space-y-1 bg-white p-2.5 rounded-xl border border-water-200">
        <TimelineBar
          segments={segments}
          currentSegmentIndex={hudState.segmentIndex}
          segmentElapsedSec={hudState.segmentElapsedSec}
        />
        <div className="flex justify-between items-center text-[11px] font-mono text-slate-600 pt-0.5">
          <span>Elapsed: {formatDurationDisplay(hudState.totalElapsedSec)}</span>
          <span>Total Left: {formatDurationDisplay(totalRemainingSec)}</span>
        </div>
      </div>
    </div>
  );
};
