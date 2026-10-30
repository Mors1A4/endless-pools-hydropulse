import { computeCrc32, build44BytePacket, parse111BytePacket, paceToPercent, percentToPace } from '../services/protocolEngine';
import { generateSmartWorkout } from '../services/storage';
import { computeFFT, extractMFCC, computeDTWDistance, trimSilence, resampleTo16k, voiceProfileService } from '../services/voiceProfile';

console.log('=== Running HydroPulse Automated Test Suite ===\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passed++;
  } else {
    console.error(`[FAIL] ${msg}`);
    failed++;
  }
}

// 1. Test CRC-32
const testBytes = new Uint8Array([0x0A, 0xF0, 0x64, 0x1F, 0x00, 0x00]);
const crc = computeCrc32(testBytes);
assert(typeof crc === 'number' && crc > 0, `CRC-32 computed positive uint32: 0x${crc.toString(16)}`);

// 2. Test 44-byte control packet structure
const pkt = build44BytePacket(0x1F, 100);
assert(pkt.length === 44, '44-byte packet has exact length 44');
assert(pkt[0] === 0x0A && pkt[1] === 0xF0, 'Header is 0x0A 0xF0');
assert(pkt[2] >= 0x64 && pkt[2] <= 0xC6, `msgId ${pkt[2]} is in rolling range [0x64, 0xC6]`);
assert(pkt[3] === 0x1F, 'Command opcode is 0x1F (START)');
assert(pkt[4] === 100 && pkt[5] === 0, 'Param 100 encoded as uint16 LE');
assert(pkt[36] === 0x97 && pkt[37] === 0x01, 'Footer is 0x97 0x01');

// Verify CRC inside packet
const view = new DataView(pkt.buffer);
const embeddedCrc = view.getUint32(40, true);
const calculatedCrc = computeCrc32(pkt, 40);
assert(embeddedCrc === calculatedCrc, `Embedded CRC (0x${embeddedCrc.toString(16)}) matches calculated CRC (0x${calculatedCrc.toString(16)})`);

// 3. Test 111-byte status packet parsing
const statusPacket = new Uint8Array(111);
const sView = new DataView(statusPacket.buffer);
statusPacket[0] = 0x0A;
statusPacket[1] = 0xF0;
statusPacket[2] = 0x65; // msgId
statusPacket[3] = 0x4F; // Running steady
statusPacket[4] = 65;   // curSpeed 65%
statusPacket[5] = 65;   // tgtSpeed 65%
sView.setUint16(7, 105, true);  // pace 105s (1:45)
sView.setUint16(11, 450, true); // remaining 450s (7:30)
sView.setFloat32(23, 120.5, true); // runtime
sView.setFloat32(27, 450.0, true); // total runtime
sView.setUint32(71, 1730000000, true); // timestamp
const statusCrc = computeCrc32(statusPacket, 107);
sView.setUint32(107, statusCrc, true);

const telemetry = parse111BytePacket(statusPacket);
assert(telemetry !== null, '111-byte status packet parsed successfully');
if (telemetry) {
  assert(telemetry.msgId === 0x65, 'telemetry msgId echoed 0x65');
  assert(telemetry.curSpeed === 65, 'telemetry curSpeed is 65%');
  assert(telemetry.paceSec100m === 105, 'telemetry pace is 105 sec (1:45/100m)');
  assert(telemetry.remainingSec === 450, 'telemetry remaining is 450 sec');
  assert(telemetry.isMotorOn === true, 'telemetry isMotorOn is true');
  assert(telemetry.isRunning === true, 'telemetry isRunning is true');
  assert(telemetry.crcValid === true, 'telemetry crcValid is true');
}

// 4. Test Smart Workout Generator (User requirements: 20 min, 1-min warm-up slower, 1-min mid-break)
const workout = generateSmartWorkout({
  targetPaceSec100m: 100, // 1:40
  totalMinutes: 20,
  hasWarmup: true,
  warmupDurationSec: 60,
  warmupPaceSec100m: 135, // 2:15 (slower)
  hasMidBreak: true,
  midBreakDurationSec: 60
});

assert(workout.segments.length === 4, `Workout generated 4 segments (Warm-up, Main 1, Break, Main 2). Got ${workout.segments.length}`);
assert(workout.segments[0].type === 'warmup', 'First segment is Warm-up');
assert(workout.segments[0].durationSec === 60, 'Warm-up duration is 1 minute (60s)');
assert(workout.segments[0].paceSec100m === 135, 'Warm-up pace is 2:15 (slower)');

assert(workout.segments[1].type === 'swim', 'Second segment is Main Set 1');
assert(workout.segments[1].paceSec100m === 100, 'Main Set 1 is target pace 1:40');

assert(workout.segments[2].type === 'rest', 'Third segment is Mid-Workout Break');
assert(workout.segments[2].durationSec === 60, 'Mid-Workout Break is 1 minute');
assert(workout.segments[2].paceSec100m === 0, 'Mid-Workout Break pace is 0 (motor off)');

assert(workout.segments[3].type === 'swim', 'Fourth segment is Main Set 2');
assert(workout.segments[3].paceSec100m === 100, 'Main Set 2 is target pace 1:40');

const totalSec = workout.segments.reduce((acc, s) => acc + s.durationSec, 0);
assert(totalSec === 20 * 60, `Total workout duration is exactly 20 minutes (1200s). Got ${totalSec}s`);

// 5. Test Per-Phone Memory Persistence
import { DEFAULT_LAST_CONFIG, loadLastWorkoutConfig, saveLastWorkoutConfig } from '../services/storage';
assert(DEFAULT_LAST_CONFIG.durationMinutes === 20, 'Default duration is 20m');
assert(DEFAULT_LAST_CONFIG.hasWarmup === true, 'Default warm-up is true');
assert(DEFAULT_LAST_CONFIG.hasMidBreak === true, 'Default mid break is true');

const loaded = loadLastWorkoutConfig();
assert(loaded !== null && typeof loaded === 'object', 'loadLastWorkoutConfig returns valid config object');

// 6. Test Free Git Hosting Auto-Updater Semver Logic
import { isNewerVersion, CURRENT_APP_VERSION } from '../services/updateService';
assert(typeof CURRENT_APP_VERSION === 'string' && CURRENT_APP_VERSION.length > 0, `Current app version is defined: ${CURRENT_APP_VERSION}`);
assert(isNewerVersion('v2.2.0', '2.1.0') === true, 'v2.2.0 is newer than 2.1.0');
assert(isNewerVersion('v2.1.0', '2.0.0') === true, 'v2.1.0 is newer than 2.0.0');
assert(isNewerVersion('2.0.0', '1.0.0') === true, 'v2.0.0 is newer than 1.0.0');
assert(isNewerVersion('2.0.0', '2.0.0') === false, '2.0.0 is not newer than 2.0.0');
assert(isNewerVersion('1.0.0', '2.0.0') === false, '1.0.0 is not newer than 2.0.0');

// 7. Test 1-to-52 Speed Notches (Endless Pools click scale)
import { paceToNotch, notchToPace, EP_NOTCHES } from '../services/protocolEngine';
assert(EP_NOTCHES.MIN === 1, 'Minimum speed notch is 1 (slowest)');
assert(EP_NOTCHES.MAX === 52, 'Maximum speed notch is 52 (fastest)');
assert(notchToPace(1) === 210, `Notch 1 maps to slowest pace 210s (3:30/100m). Got ${notchToPace(1)}s`);
assert(notchToPace(52) === 74, `Notch 52 maps to fastest pace 74s (1:14/100m). Got ${notchToPace(52)}s`);
assert(paceToNotch(210) === 1, '210s maps to Notch 1');
assert(paceToNotch(74) === 52, '74s maps to Notch 52');

// Monotonicity test: each higher notch must strictly produce equal or faster pace (lower paceSec)
let strictlyMonotonic = true;
for (let n = 1; n < 52; n++) {
  if (notchToPace(n + 1) >= notchToPace(n)) {
    strictlyMonotonic = false;
    break;
  }
}
assert(strictlyMonotonic, 'All 52 notches strictly accelerate monotonically from 1 (slowest) to 52 (fastest)');

// 8. Test Hands-Free Voice Commands Evaluation (Music-Immune & Multi-Hypothesis)
import { voiceCommands } from '../services/voiceCommands';
assert(voiceCommands.evaluateTranscript('start', true) === 'start', 'Spoken "start" triggers start command');
assert(voiceCommands.evaluateTranscript('stop swim', true) === 'stop', 'Spoken "stop swim" triggers stop command');
assert(voiceCommands.evaluateTranscript('please pause the pool', true) === 'pause', 'Spoken "pause" triggers pause command');
assert(voiceCommands.evaluateTranscript('resume workout', true) === 'resume', 'Spoken "resume" triggers resume command');
assert(voiceCommands.evaluateTranscript('i need to go up 5 notches', true) === 'up5', 'Spoken "up 5 notches" triggers up5 command');
assert(voiceCommands.evaluateTranscript('go down 5 notches', true) === 'down5', 'Spoken "down 5 notches" triggers down5 command');
assert(voiceCommands.evaluateTranscript('faster', true) === 'faster', 'Spoken "faster" triggers faster command');
assert(voiceCommands.evaluateTranscript('slower', true) === 'slower', 'Spoken "slower" triggers slower command');

// 9. Test Music-Immune Wake Phrases & Background Music Resilience
assert(voiceCommands.evaluateTranscript('playing loud music hydro stop', true) === 'stop', 'Wake phrase "hydro stop" cuts through music lyrics');
assert(voiceCommands.evaluateTranscript('pool stop', true) === 'stop', 'Wake phrase "pool stop" cuts through music');
assert(voiceCommands.evaluateTranscript('stop stop', true) === 'stop', 'Double vocal "stop stop" recognized');
assert(voiceCommands.evaluateTranscript('hydro start', true) === 'start', 'Wake phrase "hydro start" recognized');
assert(voiceCommands.evaluateTranscript('bump 5', true) === 'up5', '"bump 5" triggers up5');
assert(voiceCommands.evaluateTranscript('drop 5', true) === 'down5', '"drop 5" triggers down5');

// 10. Test Multi-Hypothesis Beam Search Candidates (Music masking primary candidate)
const candidateTest = voiceCommands.evaluateMultiHypothesis(
  'dancing in the rain beat', // Candidate 0 (music lyrics captured by mic)
  ['loud music', 'hydro stop', 'yeah'], // Candidate 1 has the swimmer's voice command
  true
);
assert(candidateTest === 'stop', 'Multi-hypothesis beam search extracts command from candidate list when music masks candidate 0');

// 11. Test Phonetic & Eroded Consonant Recovery (Splash Noise)
assert(voiceCommands.evaluateTranscript('stopp', true) === 'stop', 'Eroded consonant "stopp" recovered to stop');
assert(voiceCommands.evaluateTranscript('startt', true) === 'start', 'Elongated spoken "startt" recovered to start');
assert(voiceCommands.evaluateTranscript('paws', true) === 'pause', 'Phonetic "paws" recovered to pause');
assert(voiceCommands.evaluateTranscript('step', true) === null, 'Ambient word "step" rejected to prevent false beeps');
assert(voiceCommands.evaluateTranscript('shop', true) === null, 'Ambient word "shop" rejected to prevent false beeps');

// 12. Test Option B: On-Device Voice Profile & Acoustic Spotting DSP Math
// A. Test FFT on 440 Hz Sine wave
const fftN = 512;
const sineWaveR = new Float32Array(fftN);
const sineWaveI = new Float32Array(fftN);
for (let i = 0; i < fftN; i++) {
  sineWaveR[i] = Math.sin((2 * Math.PI * 440 * i) / 16000);
}
computeFFT(sineWaveR, sineWaveI);
let peakBin = 0;
let maxMag = 0;
for (let k = 0; k < fftN / 2; k++) {
  const mag = Math.sqrt(sineWaveR[k] * sineWaveR[k] + sineWaveI[k] * sineWaveI[k]);
  if (mag > maxMag) {
    maxMag = mag;
    peakBin = k;
  }
}
const peakFreq = (peakBin * 16000) / fftN;
assert(Math.abs(peakFreq - 440) < 35, `FFT correctly identified 440Hz tone at bin ${peakBin} (${Math.round(peakFreq)}Hz)`);

// B. Test Silence Trimming
const paddedPcm = new Float32Array(16000); // 1 second
for (let i = 4000; i < 8000; i++) {
  paddedPcm[i] = 0.5 * Math.sin((2 * Math.PI * 500 * i) / 16000);
}
const trimmed = trimSilence(paddedPcm, 0.05);
assert(trimmed.length < paddedPcm.length && trimmed.length >= 4000, `Silence trimming isolated active audio segment (${trimmed.length} samples)`);

// C. Test MFCC Extraction
const synthWord1 = new Float32Array(8000); // 0.5s "word 1" (formant frequencies 300Hz and 2200Hz)
const synthWord2 = new Float32Array(8000); // 0.5s "word 2" (formant frequencies 800Hz and 1200Hz)
for (let i = 0; i < 8000; i++) {
  const env = Math.sin((Math.PI * i) / 8000);
  synthWord1[i] = env * (0.6 * Math.sin((2 * Math.PI * 300 * i) / 16000) + 0.4 * Math.sin((2 * Math.PI * 2200 * i) / 16000));
  synthWord2[i] = env * (0.6 * Math.sin((2 * Math.PI * 800 * i) / 16000) + 0.4 * Math.sin((2 * Math.PI * 1200 * i) / 16000));
}
const mfcc1 = extractMFCC(synthWord1);
const mfcc2 = extractMFCC(synthWord2);
assert(mfcc1.length > 10 && mfcc1[0].length === 13, `MFCC extraction produced ${mfcc1.length} frames of 13 coefficients`);

// D. Test DTW Dynamic Time Warping Distance
// Distance to itself should be 0.0
const selfDist = computeDTWDistance(mfcc1, mfcc1);
assert(selfDist < 0.001, `DTW self-distance is near zero (${selfDist.toFixed(4)})`);

// Slightly time-stretched version of Word 1 (e.g. 15% slower pronunciation of same word)
const synthWord1Stretched = new Float32Array(9200);
for (let i = 0; i < 9200; i++) {
  const env = Math.sin((Math.PI * i) / 9200);
  synthWord1Stretched[i] = env * (0.6 * Math.sin((2 * Math.PI * 300 * i) / 16000) + 0.4 * Math.sin((2 * Math.PI * 2200 * i) / 16000));
}
const mfcc1Stretched = extractMFCC(synthWord1Stretched);
const stretchDist = computeDTWDistance(mfcc1, mfcc1Stretched);
assert(stretchDist < 0.20, `DTW matched time-stretched pronunciation with low distance (${stretchDist.toFixed(3)} < 0.20)`);

// Distance between two completely different words (Word 1 vs Word 2)
const diffDist = computeDTWDistance(mfcc1, mfcc2);
assert(diffDist > stretchDist && diffDist > 0.25, `DTW clearly separated different words (diff distance ${diffDist.toFixed(3)} > 0.25)`);

// E. Test Audio Resampling
const audio48k = new Float32Array(48000); // 1 sec at 48kHz
const resampled16k = resampleTo16k(audio48k, 48000);
assert(resampled16k.length === 16000, `Resampled 48kHz (48,000 samples) to exactly 16kHz (${resampled16k.length} samples)`);

// F. Test End-to-End Voice Profile Enrollment & Spotting
const tStart = voiceProfileService.createTemplateFromPcm('start', synthWord1);
const tStop = voiceProfileService.createTemplateFromPcm('stop', synthWord2);
voiceProfileService.saveProfile({
  version: 1,
  createdAt: Date.now(),
  noiseFloorRms: 0.01,
  noiseFloorDb: -40,
  templates: [tStart, tStop]
});

// Test matching "start" variant
const matchStart = voiceProfileService.matchAudio(synthWord1Stretched);
assert(matchStart !== null && matchStart.phrase === 'start', `Voice Match correctly spotted 'start' (confidence: ${Math.round((matchStart?.confidence || 0) * 100)}%)`);

// Test matching "stop"
const matchStop = voiceProfileService.matchAudio(synthWord2);
assert(matchStop !== null && matchStop.phrase === 'stop', `Voice Match correctly spotted 'stop' (confidence: ${Math.round((matchStop?.confidence || 0) * 100)}%)`);

// Test rejecting random noise / music beats (white noise + 60Hz hum)
const noiseAudio = new Float32Array(8000);
for (let i = 0; i < 8000; i++) {
  noiseAudio[i] = (Math.random() - 0.5) * 0.2 + 0.3 * Math.sin((2 * Math.PI * 60 * i) / 16000);
}
const matchNoise = voiceProfileService.matchAudio(noiseAudio);
assert(matchNoise === null, 'Voice Match correctly rejected random noise / music rumble');

console.log(`\n================================`);
console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
console.log(`================================`);

if (failed > 0) process.exit(1);
