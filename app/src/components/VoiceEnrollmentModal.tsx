import React, { useState, useEffect, useRef } from 'react';
import { registerPlugin } from '@capacitor/core';
import { voiceProfileService, VoiceTemplate, VoiceProfile, setDismissedVoiceOnboarding } from '../services/voiceProfile';
import { audioCoach } from '../services/audioCoach';
import { poolConnection } from '../services/poolConnection';
import { voiceCommands } from '../services/voiceCommands';

interface NativeAudioPlugin {
  openAppSettings?: () => Promise<void>;
  requestMicrophonePermission?: () => Promise<{ granted: boolean }>;
}
const NativeAudio = registerPlugin<NativeAudioPlugin>('EndlessPoolsUdp');

interface VoiceEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
  onCompleteWorkoutStart?: () => void;
  isOnboarding?: boolean;
}

type EnrollmentStep = 'noise' | 'start' | 'stop' | 'test';

export const VoiceEnrollmentModal: React.FC<VoiceEnrollmentModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated,
  onCompleteWorkoutStart,
  isOnboarding = false
}) => {
  const [step, setStep] = useState<EnrollmentStep>(isOnboarding ? 'start' : 'noise');
  const [isRecording, setIsRecording] = useState(false);
  const [liveRms, setLiveRms] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [isPoolConnected, setIsPoolConnected] = useState<boolean>(() => poolConnection.getStatus().connected);
  const [jetCalStatus, setJetCalStatus] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);

  // Calibration state
  const [noiseFloorDb, setNoiseFloorDb] = useState<number | null>(() => {
    const p = voiceProfileService.getProfile();
    return p ? p.noiseFloorDb : null;
  });
  const [noiseFloorRms, setNoiseFloorRms] = useState<number>(() => {
    const p = voiceProfileService.getProfile();
    return p ? p.noiseFloorRms : 0.01;
  });

  // Recorded takes
  const [startTakes, setStartTakes] = useState<VoiceTemplate[]>([]);
  const [stopTakes, setStopTakes] = useState<VoiceTemplate[]>([]);

  // Live test state
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testConfidence, setTestConfidence] = useState<number | null>(null);

  const isTestingRef = useRef(false);

  useEffect(() => {
    const unsub = poolConnection.addStatusListener(s => setIsPoolConnected(s.connected));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOpen) {
      voiceProfileService.stopLiveSpotter();
      isTestingRef.current = false;
      if (poolConnection.getStatus().connected) {
        poolConnection.stopMotor();
      }
      return;
    }

    // Free any speech recognizer holding the hardware microphone
    try {
      voiceCommands.stopListening();
    } catch {}

    // Check existing profile
    const existing = voiceProfileService.getProfile();
    if (existing) {
      setNoiseFloorDb(existing.noiseFloorDb);
      setNoiseFloorRms(existing.noiseFloorRms);
      setStartTakes(existing.templates.filter(t => t.phrase === 'start'));
      setStopTakes(existing.templates.filter(t => t.phrase === 'stop'));
    }
  }, [isOpen]);

  // Clean up live test on step change
  useEffect(() => {
    if (step === 'test' && isOpen) {
      isTestingRef.current = true;
      voiceProfileService.startLiveSpotter(
        (phrase, conf) => {
          setTestResult(phrase.toUpperCase());
          setTestConfidence(Math.round(conf * 100));
          audioCoach.playCommandChirp();
        },
        (rms) => setLiveRms(rms)
      ).catch(() => {});
    } else {
      voiceProfileService.stopLiveSpotter();
      isTestingRef.current = false;
    }

    return () => {
      voiceProfileService.stopLiveSpotter();
      isTestingRef.current = false;
    };
  }, [step, isOpen]);

  if (!isOpen) return null;

  // 1. Calibrate background noise floor with automatic pool jets spin-up and shut-off
  const handleCalibrateNoise = async () => {
    setIsRecording(true);
    setProgressPct(0);
    setJetCalStatus(null);
    const connected = poolConnection.getStatus().connected;

    try {
      if (connected) {
        setJetCalStatus('Starting pool current...');
        poolConnection.setPace(120); // 2:00/100m steady pace
        poolConnection.startMotor();

        for (let i = 1; i <= 3; i++) {
          setJetCalStatus(`Waiting for flow to steady (${4 - i}s)...`);
          await new Promise(r => setTimeout(r, 1000));
        }

        setJetCalStatus('Recording acoustic noise floor with jets on...');
      } else {
        setJetCalStatus('Measuring ambient noise floor...');
      }

      const res = await voiceProfileService.calibrateNoiseFloor(3500, (pct, rms) => {
        setProgressPct(pct);
        setLiveRms(rms);
      });
      setNoiseFloorDb(res.noiseFloorDb);
      setNoiseFloorRms(res.noiseFloorRms);

      if (connected) {
        setJetCalStatus('Shutting off pool current...');
        poolConnection.stopMotor();
      }

      audioCoach.playCommandChirp();
      setJetCalStatus(connected ? 'Jets calibrated & shut off' : 'Noise floor calibrated');
    } catch (e: any) {
      if (connected) poolConnection.stopMotor();
      const msg = String(e?.message || e || '');
      const isMicIssue = msg.toLowerCase().includes('permission') ||
                          msg.toLowerCase().includes('notallowed') ||
                          msg.toLowerCase().includes('source') ||
                          msg.toLowerCase().includes('readable') ||
                          msg.toLowerCase().includes('found');
      if (isMicIssue) {
        setPermissionError(true);
        NativeAudio.requestMicrophonePermission?.().catch(() => {});
      } else {
        alert(msg || 'Could not access microphone');
      }
    } finally {
      setIsRecording(false);
      setLiveRms(0);
    }
  };

  // 2. Record single take for phrase ('start' or 'stop')
  const handleRecordTake = async (phrase: 'start' | 'stop') => {
    setIsRecording(true);
    setLiveRms(0);
    setPermissionError(false);
    try {
      const pcm16k = await voiceProfileService.recordUtterance(1500, (rms) => {
        setLiveRms(rms);
      });
      const template = voiceProfileService.createTemplateFromPcm(phrase, pcm16k);

      if (phrase === 'start') {
        setStartTakes(prev => [...prev.slice(-2), template]); // Keep up to 3 takes
      } else {
        setStopTakes(prev => [...prev.slice(-2), template]);
      }
      audioCoach.playCommandChirp();
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      const isMicIssue = msg.toLowerCase().includes('permission') ||
                          msg.toLowerCase().includes('notallowed') ||
                          msg.toLowerCase().includes('source') ||
                          msg.toLowerCase().includes('readable') ||
                          msg.toLowerCase().includes('found');
      if (isMicIssue) {
        setPermissionError(true);
        NativeAudio.requestMicrophonePermission?.().catch(() => {});
      } else {
        alert(msg || 'Recording failed');
      }
    } finally {
      setIsRecording(false);
      setLiveRms(0);
    }
  };

  // 3. Finalize and save enrolled profile
  const handleSaveProfile = () => {
    const profile: VoiceProfile = {
      version: 1,
      createdAt: Date.now(),
      noiseFloorRms,
      noiseFloorDb: noiseFloorDb || -40,
      templates: [...startTakes, ...stopTakes]
    };

    voiceProfileService.saveProfile(profile);
    audioCoach.speak('Voice profile saved');
    if (onProfileUpdated) onProfileUpdated();
    if (isOnboarding && onCompleteWorkoutStart) {
      onCompleteWorkoutStart();
    } else {
      onClose();
    }
  };

  const handleSkipOnboarding = () => {
    setDismissedVoiceOnboarding(true);
    onClose();
    if (onCompleteWorkoutStart) {
      onCompleteWorkoutStart();
    }
  };

  const handleClearProfile = () => {
    voiceProfileService.clearProfile();
    setStartTakes([]);
    setStopTakes([]);
    setNoiseFloorDb(null);
    setTestResult(null);
    setTestConfidence(null);
    if (onProfileUpdated) onProfileUpdated();
  };

  const meterWidth = Math.min(100, Math.round(liveRms * 350));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 text-slate-900 shadow-2xl border border-water-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-water-200">
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-wide uppercase">
              {isOnboarding ? 'Voice Setup (15s)' : 'Voice Match Setup'}
            </h3>
            <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              {isOnboarding ? 'First-Time Swimmer Setup' : 'On-Device Acoustic Profile'}
            </span>
          </div>

          <button
            type="button"
            onClick={isOnboarding ? handleSkipOnboarding : onClose}
            className="px-3 py-1 rounded-xl bg-water-50 hover:bg-water-100 text-slate-600 font-bold text-xs"
          >
            {isOnboarding ? 'Skip' : 'Close'}
          </button>
        </div>

        {/* Step Indicator / Tabs */}
        {isOnboarding ? (
          <div className="flex items-center justify-between px-3 py-2 bg-water-50 rounded-2xl text-xs font-black text-water-950">
            <span>{step === 'start' ? 'Step 1 of 2: START Phrase' : 'Step 2 of 2: STOP Phrase'}</span>
            <span className="text-[11px] text-slate-400 font-bold font-mono">
              {step === 'start' ? `${startTakes.length}/3 takes` : `${stopTakes.length}/3 takes`}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1 p-1 bg-water-50 rounded-2xl text-[11px] font-black uppercase text-center">
            <button
              type="button"
              onClick={() => setStep('noise')}
              className={`py-1.5 rounded-xl transition-all ${
                step === 'noise' ? 'bg-water-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Noise
            </button>
            <button
              type="button"
              onClick={() => setStep('start')}
              className={`py-1.5 rounded-xl transition-all ${
                step === 'start' ? 'bg-water-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => setStep('stop')}
              className={`py-1.5 rounded-xl transition-all ${
                step === 'stop' ? 'bg-water-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Stop
            </button>
            <button
              type="button"
              onClick={() => setStep('test')}
              className={`py-1.5 rounded-xl transition-all ${
                step === 'test' ? 'bg-water-600 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              Test
            </button>
          </div>
        )}

        {/* Live Audio Energy Meter */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>Mic Input Level</span>
            <span>{isRecording ? 'Listening' : 'Ready'}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
            <div 
              className="h-full bg-water-500 transition-all duration-75"
              style={{ width: `${meterWidth}%` }}
            />
          </div>
        </div>

        {/* STEP 1: BACKGROUND NOISE FLOOR */}
        {step === 'noise' && (
          <div className="space-y-3 py-1">
            <div className="p-3 bg-water-50/70 border border-water-200 rounded-2xl">
              <span className="text-xs font-black text-water-950 uppercase block">
                Step 1: Pool Room Acoustics
              </span>
              <p className="text-xs text-slate-600 mt-1 leading-snug">
                {isPoolConnected
                  ? 'HydroPulse will automatically spin up your pool jets, record the water turbulence and music acoustics, and shut the current back off.'
                  : 'Turn on your pool jets and poolside music to normal swimming volume, then tap Calibrate.'}
              </p>
            </div>

            {jetCalStatus && (
              <div className="p-2.5 bg-water-100/80 border border-water-300 rounded-2xl text-center">
                <span className="text-xs font-black text-water-950 block animate-pulse">
                  {jetCalStatus}
                </span>
              </div>
            )}

            {noiseFloorDb !== null ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                <span className="text-[11px] font-bold text-emerald-800 uppercase block">
                  Noise Floor Calibrated
                </span>
                <span className="text-lg font-black text-emerald-950 font-mono">
                  {noiseFloorDb} dB
                </span>
              </div>
            ) : null}

            {permissionError && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-center space-y-2">
                <span className="text-xs font-black text-amber-900 uppercase block">
                  Microphone Access Required
                </span>
                <p className="text-[11px] text-amber-800 leading-snug">
                  Please enable Microphone permission in Android Settings so HydroPulse can listen for commands.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => NativeAudio.openAppSettings?.()}
                    className="flex-1 h-9 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-black text-[11px] uppercase tracking-wider"
                  >
                    Open Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPermissionError(false);
                      handleCalibrateNoise();
                    }}
                    className="flex-1 h-9 rounded-xl bg-white border border-amber-300 text-amber-900 font-black text-[11px] uppercase tracking-wider"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={isRecording}
              onClick={handleCalibrateNoise}
              className={`w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border ${
                isRecording
                  ? 'bg-water-100 text-water-700 border-water-300'
                  : 'bg-water-600 hover:bg-water-700 text-white border-water-600'
              }`}
            >
              {isRecording 
                ? `Calibrating (${progressPct}%)` 
                : (isPoolConnected ? 'Auto-Calibrate With Pool Jets (4s)' : 'Sample Noise Floor (4s)')}
            </button>

            <button
              type="button"
              onClick={() => setStep('start')}
              className="w-full h-10 rounded-2xl bg-white border border-water-300 text-slate-700 font-black text-xs uppercase tracking-wider hover:bg-water-50"
            >
              Next: Record Start
            </button>
          </div>
        )}

        {/* STEP 2: START PHRASE */}
        {step === 'start' && (
          <div className="space-y-3 py-1">
            <div className="p-3 bg-water-50/70 border border-water-200 rounded-2xl">
              <span className="text-xs font-black text-water-950 uppercase block">
                Step 2: Start Command
              </span>
              <p className="text-xs text-slate-600 mt-1 leading-snug">
                Say "START" loudly in your swimming voice. Capture 3 takes.
              </p>
            </div>

            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-slate-600">Takes Captured:</span>
              <span className="text-xs font-black text-water-800 font-mono">
                {startTakes.length} of 3
              </span>
            </div>

            {permissionError && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-center space-y-2">
                <span className="text-xs font-black text-amber-900 uppercase block">
                  Microphone Access Required
                </span>
                <p className="text-[11px] text-amber-800 leading-snug">
                  Please enable Microphone permission in Android Settings.
                </p>
                <button
                  type="button"
                  onClick={() => NativeAudio.openAppSettings?.()}
                  className="w-full h-8 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-[11px] uppercase"
                >
                  Open Settings
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={isRecording}
              onClick={() => handleRecordTake('start')}
              className={`w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border ${
                isRecording
                  ? 'bg-water-100 text-water-700 border-water-300 animate-pulse'
                  : 'bg-water-600 hover:bg-water-700 text-white border-water-600'
              }`}
            >
              {isRecording ? 'Listening for START...' : `Record Take ${Math.min(3, startTakes.length + 1)} of 3`}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('noise')}
                className="flex-1 h-10 rounded-2xl bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-wider"
              >
                Back
              </button>
              <button
                type="button"
                disabled={startTakes.length === 0}
                onClick={() => setStep('stop')}
                className="flex-1 h-10 rounded-2xl bg-water-600 hover:bg-water-700 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider"
              >
                Next: Stop
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: STOP PHRASE */}
        {step === 'stop' && (
          <div className="space-y-3 py-1">
            <div className="p-3 bg-water-50/70 border border-water-200 rounded-2xl">
              <span className="text-xs font-black text-water-950 uppercase block">
                Step 3: Stop Command
              </span>
              <p className="text-xs text-slate-600 mt-1 leading-snug">
                Say "STOP" clearly and firmly. Capture 3 takes.
              </p>
            </div>

            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-slate-600">Takes Captured:</span>
              <span className="text-xs font-black text-water-800 font-mono">
                {stopTakes.length} of 3
              </span>
            </div>

            {permissionError && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-center space-y-2">
                <span className="text-xs font-black text-amber-900 uppercase block">
                  Microphone Access Required
                </span>
                <p className="text-[11px] text-amber-800 leading-snug">
                  Please enable Microphone permission in Android Settings.
                </p>
                <button
                  type="button"
                  onClick={() => NativeAudio.openAppSettings?.()}
                  className="w-full h-8 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-[11px] uppercase"
                >
                  Open Settings
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={isRecording}
              onClick={() => handleRecordTake('stop')}
              className={`w-full h-12 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border ${
                isRecording
                  ? 'bg-water-100 text-water-700 border-water-300 animate-pulse'
                  : 'bg-water-600 hover:bg-water-700 text-white border-water-600'
              }`}
            >
              {isRecording ? 'Listening for STOP...' : `Record Take ${Math.min(3, stopTakes.length + 1)} of 3`}
            </button>

            {isOnboarding ? (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={startTakes.length === 0 || stopTakes.length === 0}
                  onClick={handleSaveProfile}
                  className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider shadow-md transition-all"
                >
                  SAVE & START SWIM
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep('start')}
                    className="flex-1 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs"
                  >
                    Back to Start
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipOnboarding}
                    className="flex-1 h-9 rounded-xl bg-white border border-slate-200 text-slate-500 font-bold text-xs hover:bg-slate-50"
                  >
                    Skip Setup
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('start')}
                  className="flex-1 h-10 rounded-2xl bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-wider"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={stopTakes.length === 0}
                  onClick={() => setStep('test')}
                  className="flex-1 h-10 rounded-2xl bg-water-600 hover:bg-water-700 disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider"
                >
                  Next: Test
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: LIVE TEST & ACTIVATE */}
        {step === 'test' && (
          <div className="space-y-3 py-1">
            <div className="p-3 bg-water-50/70 border border-water-200 rounded-2xl">
              <span className="text-xs font-black text-water-950 uppercase block">
                Step 4: Live Test
              </span>
              <p className="text-xs text-slate-600 mt-1 leading-snug">
                Say "START" or "STOP" right now with your music playing to test your voice match.
              </p>
            </div>

            <div className="h-16 rounded-2xl border flex flex-col items-center justify-center p-2 text-center bg-slate-50 border-slate-200">
              {testResult ? (
                <>
                  <span className="text-sm font-black text-emerald-800 tracking-wider uppercase">
                    MATCH: {testResult}
                  </span>
                  <span className="text-[11px] font-mono text-emerald-600 font-bold">
                    {testConfidence}% Acoustic Match
                  </span>
                </>
              ) : (
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider animate-pulse">
                  Listening for your voice...
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={startTakes.length === 0 || stopTakes.length === 0}
              onClick={handleSaveProfile}
              className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider shadow-md transition-all disabled:opacity-40"
            >
              SAVE VOICE PROFILE
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('stop')}
                className="flex-1 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold text-xs"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleClearProfile}
                className="flex-1 h-9 rounded-xl bg-white border border-rose-200 text-rose-600 font-bold text-xs hover:bg-rose-50"
              >
                Clear Profile
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
