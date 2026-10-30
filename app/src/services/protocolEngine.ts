import { EP_COMMANDS, EP_PORTS, EP_STATUS_CODES, EPTelemetry } from '../types/protocol';
import { SpeedUnit } from '../types/workout';

// Pre-computed IEEE 802.3 CRC-32 lookup table (polynomial 0xEDB88320)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function computeCrc32(data: Uint8Array, length?: number): number {
  const len = length !== undefined ? Math.min(length, data.length) : data.length;
  let c = 0xFFFFFFFF;
  for (let i = 0; i < len; i++) {
    c = CRC32_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  }
  return (~c) >>> 0;
}

// Rolling sequence counter in range [0x64, 0xC6] (100 to 198 decimal)
let idx2Counter = 0xC5;

export function getNextMsgId(): number {
  idx2Counter++;
  if (idx2Counter > 0xC6 || idx2Counter < 0x64) {
    idx2Counter = 0x64;
  }
  return idx2Counter;
}

export function resetMsgIdCounter(): void {
  idx2Counter = 0xC5;
}

/**
 * Builds the exact 44-byte Endless Pools control packet
 */
export function build44BytePacket(command: number, param: number = 0, msgId?: number): Uint8Array {
  const packet = new Uint8Array(44);
  const view = new DataView(packet.buffer);

  // Bytes 0-1: Header
  packet[0] = 0x0A;
  packet[1] = 0xF0;

  // Byte 2: Msg ID (Sequence number)
  const currentMsgId = msgId ?? getNextMsgId();
  packet[2] = currentMsgId;

  // Byte 3: Command Opcode
  packet[3] = command & 0xFF;

  // Bytes 4-5: Param (little-endian uint16)
  view.setUint16(4, param, true);

  // Bytes 6-31: Reserved (zeroes)

  // Bytes 32-35: Monotonic Millisecond Timestamp (uint32 LE)
  const nowMs = Math.floor(performance.now()) & 0xFFFFFFFF;
  view.setUint32(32, nowMs, true);

  // Bytes 36-37: Footer
  packet[36] = 0x97;
  packet[37] = 0x01;

  // Bytes 38-39: Reserved (zeroes)

  // Bytes 40-43: CRC-32 over bytes 0-39 (uint32 LE)
  const crc = computeCrc32(packet, 40);
  view.setUint32(40, crc, true);

  return packet;
}

/**
 * Parses the 111-byte Endless Pools status packet
 */
export function parse111BytePacket(data: Uint8Array): EPTelemetry | null {
  if (data.length < 111) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Verify header
  if (data[0] !== 0x0A || data[1] !== 0xF0) {
    return null;
  }

  // Verify CRC32
  const receivedCrc = view.getUint32(107, true);
  const computedCrc = computeCrc32(data, 107);
  const crcValid = (receivedCrc === computedCrc);

  const msgId = data[2];
  const statusCode = data[3];
  const statusText = EP_STATUS_CODES[statusCode] || `Unknown (${statusCode.toString(16)})`;
  const curSpeed = data[4];
  const tgtSpeed = data[5];

  // Pace: 2 bytes little-endian (seconds per 100m)
  const paceSec100m = view.getUint16(7, true);
  
  // Remaining: 2 bytes little-endian (seconds remaining in current segment)
  const remainingSec = view.getUint16(11, true);

  // Runtimes: Float32 little-endian
  const runtimeSec = view.getFloat32(23, true);
  const totalRuntimeSec = view.getFloat32(27, true);

  // Timestamp at 71-74
  const timestamp = view.getUint32(71, true);

  const isMotorOn = statusCode !== 0x08 && statusCode !== 0x4E && statusCode !== 0x0E && curSpeed > 0;
  const isRunning = statusCode === 0x4F || statusCode === 0x4B || statusCode === 0x4A || statusCode === 0x49;
  const isPaused = statusCode === 0x00;

  return {
    msgId,
    statusCode,
    statusText,
    curSpeed,
    tgtSpeed,
    paceSec100m,
    paceFormatted: formatPaceDisplay(paceSec100m, 'pace100m'),
    remainingSec,
    remainingFormatted: formatDurationDisplay(remainingSec),
    runtimeSec,
    totalRuntimeSec,
    timestamp,
    isMotorOn,
    isRunning,
    isPaused,
    crcValid
  };
}

/**
 * Speed and Pace conversions
 * Endless Pools baseline:
 * 1:40/100m = 100 sec = ~60% current speed
 * 1:15/100m = 75 sec = 100% current speed (max flow)
 * 2:45/100m = 165 sec = 25% current speed (gentle warm-up)
 */
export function paceToPercent(paceSec100m: number): number {
  if (!paceSec100m || paceSec100m <= 0) return 0;
  // Non-linear flow curve mapping ~70s -> 100%, 180s -> 20%
  const pct = Math.round(100 - ((paceSec100m - 70) / (190 - 70)) * 80);
  return Math.max(10, Math.min(100, pct));
}

export function percentToPace(pct: number): number {
  if (pct <= 0) return 0;
  const pace = Math.round(70 + ((100 - pct) / 80) * (190 - 70));
  return Math.max(65, Math.min(220, pace));
}

/**
 * Endless Pools 52-Notch Scale:
 * 1 is the slowest gentle drift (~3:30 / 100m or 210s)
 * 52 is the fastest top flow (1:14 / 100m or 74s)
 * 1 notch click = 1 step up or down
 */
export const EP_NOTCHES = {
  MIN: 1,
  MAX: 52,
  SLOWEST_PACE: 210, // 3:30 / 100m (Notch 1)
  FASTEST_PACE: 74   // 1:14 / 100m (Notch 52)
} as const;

export function paceToNotch(paceSec: number): number {
  if (!paceSec || paceSec <= 0) return 0;
  if (paceSec >= EP_NOTCHES.SLOWEST_PACE) return EP_NOTCHES.MIN;
  if (paceSec <= EP_NOTCHES.FASTEST_PACE) return EP_NOTCHES.MAX;
  
  const fraction = (EP_NOTCHES.SLOWEST_PACE - paceSec) / (EP_NOTCHES.SLOWEST_PACE - EP_NOTCHES.FASTEST_PACE);
  const notch = Math.round(1 + fraction * (EP_NOTCHES.MAX - 1));
  return Math.max(EP_NOTCHES.MIN, Math.min(EP_NOTCHES.MAX, notch));
}

export function notchToPace(notch: number): number {
  const clamped = Math.max(EP_NOTCHES.MIN, Math.min(EP_NOTCHES.MAX, Math.round(notch)));
  const fraction = (clamped - 1) / (EP_NOTCHES.MAX - 1);
  const pace = Math.round(EP_NOTCHES.SLOWEST_PACE - fraction * (EP_NOTCHES.SLOWEST_PACE - EP_NOTCHES.FASTEST_PACE));
  return pace;
}

export function formatPaceDisplay(paceSec: number, unit: SpeedUnit = 'notches'): string {
  if (!paceSec || paceSec <= 0) return 'Rest';
  
  if (unit === 'notches') {
    return `Notch ${paceToNotch(paceSec)}`;
  }

  if (unit === 'percent') {
    return `${paceToPercent(paceSec)}%`;
  }
  
  if (unit === 'pace100yd') {
    // 100yd is ~0.9144 of 100m, so pace is ~91.44% of pace per 100m
    const ydSec = Math.round(paceSec * 0.9144);
    const m = Math.floor(ydSec / 60);
    const s = ydSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}/100yd`;
  }

  if (unit === 'mph') {
    // 100m in paceSec -> m/s = 100 / paceSec -> mph = (100 / paceSec) * 2.23694
    const mph = (100 / paceSec) * 2.23694;
    return `${mph.toFixed(2)} mph`;
  }

  if (unit === 'kph') {
    const kph = (100 / paceSec) * 3.6;
    return `${kph.toFixed(2)} km/h`;
  }

  // Default / fallback: pace100m
  const m = Math.floor(paceSec / 60);
  const s = paceSec % 60;
  return `${m}:${s.toString().padStart(2, '0')} /100m`;
}

export function formatDurationDisplay(totalSec: number): string {
  if (totalSec < 0) totalSec = 0;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTimeLong(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m}m ${s}s`;
}
