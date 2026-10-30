export type SegmentType = 'warmup' | 'swim' | 'rest' | 'sprint' | 'cooldown';

export interface SwimSegment {
  id: string;
  type: SegmentType;
  name: string;
  paceSec100m: number; // 0 for rest/break, > 0 for swim
  speedPercent: number; // 0-100% equivalent
  durationSec: number; // Duration in seconds
  note?: string;
}

export interface SwimWorkout {
  id: string;
  title: string;
  description?: string;
  targetPaceSec100m: number;
  totalDurationSec: number;
  activeSwimSec: number;
  restSec: number;
  hasWarmup: boolean;
  warmupDurationSec: number;
  warmupPaceSec100m: number;
  hasMidBreak: boolean;
  midBreakDurationSec: number;
  hasCooldown: boolean;
  cooldownDurationSec: number;
  cooldownPaceSec100m: number;
  segments: SwimSegment[];
  createdAt: string;
  isCustom?: boolean;
}

export type SpeedUnit = 'notches' | 'pace100m' | 'pace100yd' | 'percent' | 'mph' | 'kph';

export interface AppSettings {
  speedUnit: SpeedUnit; // default 'notches'
  voiceCoachingEnabled: boolean;
  voiceCommandsEnabled: boolean; // Continuous voice listening for "start" and "stop"
  audioChimesEnabled: boolean;
  voiceVolume: number; // 0.0 - 1.0
  chimeVolume: number; // 0.0 - 1.0
  preferredVoiceURI: string;
  defaultBreakDurationSec: number; // 30, 45, 60, 90, 120
  poolIp: string;
  autoReconnect: boolean;
  keepScreenOn: boolean;
  swimmerName?: string; // Optional display name for this phone (e.g. "Dad" or "Mum")
  gitUpdateRepo?: string; // e.g. "monty/endless-pools-hydropulse" or user's GitHub repo
  autoCheckUpdates?: boolean; // Check for updates automatically on app launch
}

export interface LastWorkoutConfig {
  targetPaceSec100m: number;
  targetNotch?: number; // 1 to 52 (Endless Pools speed notches)
  durationMinutes: number;
  hasWarmup: boolean;
  warmupPaceSec100m: number;
  warmupNotch?: number;
  hasMidBreak: boolean;
  midBreakDurationSec: number;
  hasCooldown: boolean;
  profileId?: string;
  swimmerName?: string;
}

export interface SwimmerProfile {
  id: string;
  name: string;
  config: LastWorkoutConfig;
}

export interface RunnerState {
  isActive: boolean;
  isPaused: boolean;
  currentSegmentIndex: number;
  segmentElapsedSec: number;
  segmentRemainingSec: number;
  totalElapsedSec: number;
  totalRemainingSec: number;
  currentPaceSec100m: number;
  currentSpeedPercent: number;
  motorRunning: boolean;
}
