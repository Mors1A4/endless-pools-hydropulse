import { AppSettings, SwimSegment, SwimWorkout, SwimmerProfile, LastWorkoutConfig } from '../types/workout';
import { paceToPercent } from './protocolEngine';

const STORAGE_KEYS = {
  SETTINGS: 'hydropulse_settings_v1',
  WORKOUTS: 'hydropulse_workouts_v1',
  PROFILES: 'hydropulse_profiles_v1',
  ACTIVE_PROFILE_ID: 'hydropulse_active_profile_id_v1',
  LAST_CONFIG: 'hydropulse_last_config_v1'
};

export const DEFAULT_SETTINGS: AppSettings = {
  speedUnit: 'notches', // Default 1 to 52 speed notches (user requested)
  voiceCoachingEnabled: true,
  voiceCommandsEnabled: true, // Listen for "start" and "stop" code words
  audioChimesEnabled: true,
  voiceVolume: 1.0,
  chimeVolume: 0.9,
  preferredVoiceURI: '',
  defaultBreakDurationSec: 60, // 1 minute default
  poolIp: '255.255.255.255',
  autoReconnect: true,
  keepScreenOn: true,
  gitUpdateRepo: 'Mors1A4/endless-pools-hydropulse',
  autoCheckUpdates: true
};

export const DEFAULT_LAST_CONFIG: LastWorkoutConfig = {
  targetPaceSec100m: 135, // Notch 29 (~2:15 / 100m)
  targetNotch: 29,
  durationMinutes: 20,
  hasWarmup: true,
  warmupPaceSec100m: 175, // Notch 14 (gentle warm-up)
  warmupNotch: 14,
  hasMidBreak: true,
  midBreakDurationSec: 60,
  hasCooldown: false,
  swimmerName: ''
};

export const DEFAULT_PROFILES: SwimmerProfile[] = [
  {
    id: 'profile-default',
    name: 'Swimmer',
    config: DEFAULT_LAST_CONFIG
  }
];

/**
 * Builds a structured workout from user inputs:
 * - Target Pace (seconds per 100m)
 * - Duration (q minutes)
 * - Warmup (1 min slower, then speeds up)
 * - Mid-workout break (1 min or quick selected break at midpoint)
 * - Cooldown (1 min easy)
 */
export function generateSmartWorkout(options: {
  targetPaceSec100m: number; // e.g. 100 (1:40)
  totalMinutes: number; // e.g. 20
  hasWarmup?: boolean; // default true
  warmupDurationSec?: number; // default 60
  warmupPaceSec100m?: number; // default target + 35s (slower)
  hasMidBreak?: boolean; // default true
  midBreakDurationSec?: number; // default 60
  hasCooldown?: boolean; // default false
  cooldownDurationSec?: number; // default 60
  title?: string;
}): SwimWorkout {
  const {
    targetPaceSec100m,
    totalMinutes,
    hasWarmup = true,
    warmupDurationSec = 60,
    warmupPaceSec100m = Math.min(220, targetPaceSec100m + 35),
    hasMidBreak = true,
    midBreakDurationSec = 60,
    hasCooldown = false,
    cooldownDurationSec = 60,
    title
  } = options;

  const totalWorkoutSec = Math.max(120, totalMinutes * 60);
  const segments: SwimSegment[] = [];

  // 1. Warm-up Segment (first minute slower)
  let activeWarmupSec = 0;
  if (hasWarmup) {
    activeWarmupSec = totalWorkoutSec >= 120 ? warmupDurationSec : Math.floor(totalWorkoutSec * 0.25);
    segments.push({
      id: 'seg-warmup',
      type: 'warmup',
      name: 'Warm-up (Gentle Flow)',
      paceSec100m: warmupPaceSec100m,
      speedPercent: paceToPercent(warmupPaceSec100m),
      durationSec: activeWarmupSec,
      note: 'First minute slower to warm up muscles'
    });
  }

  // 2. Cool-down Segment (optional)
  let activeCooldownSec = 0;
  if (hasCooldown) {
    activeCooldownSec = Math.min(cooldownDurationSec, Math.floor(totalWorkoutSec * 0.2));
  }

  // 3. Break Segment
  const breakSec = hasMidBreak ? midBreakDurationSec : 0;

  // Remaining time for main workout swim intervals
  const mainSwimTime = Math.max(60, totalWorkoutSec - activeWarmupSec - activeCooldownSec - breakSec);

  if (hasMidBreak && breakSec > 0) {
    const half1 = Math.floor(mainSwimTime / 2);
    const half2 = mainSwimTime - half1;

    // First half of main swim
    segments.push({
      id: 'seg-main-1',
      type: 'swim',
      name: 'Main Set 1 (Target Pace)',
      paceSec100m: targetPaceSec100m,
      speedPercent: paceToPercent(targetPaceSec100m),
      durationSec: half1,
      note: 'Current speeds up to target workout pace'
    });

    // Mid-workout break (motor stops for 1 minute)
    segments.push({
      id: 'seg-break',
      type: 'rest',
      name: 'Mid-Workout Break',
      paceSec100m: 0,
      speedPercent: 0,
      durationSec: breakSec,
      note: 'Current pauses for break. Rest or adjust goggles.'
    });

    // Second half of main swim
    segments.push({
      id: 'seg-main-2',
      type: 'swim',
      name: 'Main Set 2 (Target Pace)',
      paceSec100m: targetPaceSec100m,
      speedPercent: paceToPercent(targetPaceSec100m),
      durationSec: half2,
      note: 'Second half push at target workout pace'
    });
  } else {
    // Single continuous main swim
    segments.push({
      id: 'seg-main',
      type: 'swim',
      name: 'Main Swim',
      paceSec100m: targetPaceSec100m,
      speedPercent: paceToPercent(targetPaceSec100m),
      durationSec: mainSwimTime,
      note: 'Current speeds up to target workout pace'
    });
  }

  // 4. Append Cool-down
  if (hasCooldown && activeCooldownSec > 0) {
    const cooldownPace = Math.min(230, targetPaceSec100m + 40);
    segments.push({
      id: 'seg-cooldown',
      type: 'cooldown',
      name: 'Cool-down',
      paceSec100m: cooldownPace,
      speedPercent: paceToPercent(cooldownPace),
      durationSec: activeCooldownSec,
      note: 'Recovery pace to conclude workout'
    });
  }

  const activeSwimSec = segments.reduce((sum, s) => s.paceSec100m > 0 ? sum + s.durationSec : sum, 0);
  const restSec = segments.reduce((sum, s) => s.paceSec100m === 0 ? sum + s.durationSec : sum, 0);

  return {
    id: `workout-${Date.now()}`,
    title: title || `${totalMinutes} Min Swim (${Math.floor(targetPaceSec100m / 60)}:${(targetPaceSec100m % 60).toString().padStart(2, '0')})`,
    targetPaceSec100m,
    totalDurationSec: activeSwimSec + restSec,
    activeSwimSec,
    restSec,
    hasWarmup,
    warmupDurationSec,
    warmupPaceSec100m,
    hasMidBreak,
    midBreakDurationSec,
    hasCooldown,
    cooldownDurationSec,
    cooldownPaceSec100m: Math.min(230, targetPaceSec100m + 40),
    segments,
    createdAt: new Date().toISOString()
  };
}

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch {
    // LocalStorage error
  }
}

export function loadLastWorkoutConfig(): LastWorkoutConfig {
  if (typeof window === 'undefined') return DEFAULT_LAST_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.LAST_CONFIG);
    if (!raw) return DEFAULT_LAST_CONFIG;
    return { ...DEFAULT_LAST_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LAST_CONFIG;
  }
}

export function saveLastWorkoutConfig(config: LastWorkoutConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_CONFIG, JSON.stringify(config));
  } catch {
    // LocalStorage error
  }
}

export function loadProfiles(): SwimmerProfile[] {
  if (typeof window === 'undefined') return DEFAULT_PROFILES;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILES);
    if (!raw) {
      saveProfiles(DEFAULT_PROFILES);
      return DEFAULT_PROFILES;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function saveProfiles(profiles: SwimmerProfile[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
  } catch {
    // LocalStorage error
  }
}

export function loadActiveProfileId(): string {
  if (typeof window === 'undefined') return 'profile-me';
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID) || 'profile-me';
}

export function saveActiveProfileId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, id);
  } catch {
    // LocalStorage error
  }
}

export function loadActiveProfile(): SwimmerProfile {
  const profiles = loadProfiles();
  const activeId = loadActiveProfileId();
  return profiles.find(p => p.id === activeId) || profiles[0] || DEFAULT_PROFILES[0];
}

export function saveActiveProfile(profile: SwimmerProfile): void {
  const profiles = loadProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = profile;
  } else {
    profiles.push(profile);
  }
  saveProfiles(profiles);
  saveActiveProfileId(profile.id);
}

export function loadWorkouts(): SwimWorkout[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WORKOUTS);
    if (!raw) {
      const defaults = [
        generateSmartWorkout({
          title: 'Daily Fit (15 Min)',
          targetPaceSec100m: 105, // 1:45
          totalMinutes: 15,
          hasWarmup: true,
          hasMidBreak: true,
          midBreakDurationSec: 60,
          hasCooldown: true
        }),
        generateSmartWorkout({
          title: 'Aerobic Base (25 Min)',
          targetPaceSec100m: 100, // 1:40
          totalMinutes: 25,
          hasWarmup: true,
          hasMidBreak: true,
          midBreakDurationSec: 60,
          hasCooldown: false
        })
      ];
      saveWorkouts(defaults);
      return defaults;
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveWorkouts(workouts: SwimWorkout[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(workouts));
  } catch {
    // LocalStorage error
  }
}

export function saveWorkout(workout: SwimWorkout): void {
  const current = loadWorkouts();
  const idx = current.findIndex(w => w.id === workout.id);
  if (idx >= 0) {
    current[idx] = workout;
  } else {
    current.unshift(workout);
  }
  saveWorkouts(current);
}

export function deleteWorkout(id: string): void {
  const current = loadWorkouts().filter(w => w.id !== id);
  saveWorkouts(current);
}
