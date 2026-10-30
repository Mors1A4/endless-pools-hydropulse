/**
 * Endless Pools Fastlane / Fit@Home Reverse-Engineered Binary Protocol
 */

export const EP_PORTS = {
  CONTROL: 9750,
  MULTICAST: 45654,
  MULTICAST_GROUP: '239.255.0.1'
} as const;

export const EP_COMMANDS = {
  START: 0x1F,
  STOP: 0x21,
  PAUSE: 0x22,
  UNPAUSE: 0x23,
  SET_PACE: 0x24,
  SET_DURATION: 0x25,
  INIT_WORKOUT_2: 0x27,
  INIT_WORKOUT: 0x33,
  ADD_SWIM: 0x34,
  START_WORKOUT: 0x35,
  CANCEL_WORKOUT: 0x36
} as const;

export const EP_STATUS_CODES: Record<number, string> = {
  0x00: 'Heartbeat (Paused)',
  0x08: 'Idle (Motor Off)',
  0x0A: 'End of Swim',
  0x0B: 'Increasing Speed (Idle)',
  0x0E: 'Turning Off (Idle)',
  0x0F: 'Idle (Motor On)',
  0x1F: 'Start Commanded',
  0x21: 'Stop Commanded',
  0x40: 'Workout Initialized',
  0x48: 'Info Off',
  0x49: 'Turning On',
  0x4A: 'Slowing Down',
  0x4B: 'Increasing Speed',
  0x4E: 'Turning Off',
  0x4F: 'Running (Steady Current)'
};

export interface EPTelemetry {
  msgId: number;
  statusCode: number;
  statusText: string;
  curSpeed: number; // 0-100 scale or raw
  tgtSpeed: number; // 0-100 scale or raw
  paceSec100m: number; // Seconds per 100m
  paceFormatted: string; // e.g. "1:45"
  remainingSec: number;
  remainingFormatted: string; // e.g. "04:32"
  runtimeSec: number;
  totalRuntimeSec: number;
  timestamp: number;
  isMotorOn: boolean;
  isRunning: boolean;
  isPaused: boolean;
  crcValid: boolean;
  rawHex?: string;
}

export interface EPControlPacket {
  msgId: number;
  command: number;
  param: number;
  timestampMs: number;
}
