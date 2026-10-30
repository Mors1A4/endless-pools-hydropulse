import { computeCrc32, build44BytePacket, parse111BytePacket, paceToPercent, percentToPace } from '../services/protocolEngine';
import { generateSmartWorkout } from '../services/storage';

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
assert(voiceCommands.evaluateTranscript('tart', true) === 'start', 'Eroded consonant "tart" recovered to start');
assert(voiceCommands.evaluateTranscript('paws', true) === 'pause', 'Phonetic "paws" recovered to pause');

console.log(`\n================================`);
console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
console.log(`================================`);

if (failed > 0) process.exit(1);
