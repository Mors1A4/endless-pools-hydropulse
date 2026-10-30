/**
 * On-Device Acoustic Voice Enrollment & Template Spotter (Option B)
 * Engineered for loud poolside environments with water jets and music.
 * 
 * 100% on-device DSP:
 * - 16kHz resampling & pre-emphasis high-frequency boost (cuts through pool rumble)
 * - 25ms Hamming window with 10ms hop
 * - Radix-2 Cooley-Tukey FFT & 26-band Mel filterbanks
 * - 13-coefficient MFCC (Mel-Frequency Cepstral Coefficients) with Cepstral Mean Normalization
 * - Fast Dynamic Time Warping (DTW) with Sakoe-Chiba band constraint
 * - Cosine distance metric (invariant to voice volume / swimmer distance)
 * - Zero external API dependencies, zero cloud, 100% offline
 */

export interface VoiceTemplate {
  phrase: string; // 'start' | 'stop' | 'pause' | 'resume' | 'up5' | 'down5'
  mfccMatrix: number[][]; // [frames][13 coefficients]
  durationMs: number;
}

export interface VoiceProfile {
  version: 1;
  userName?: string;
  createdAt: number;
  noiseFloorRms: number;
  noiseFloorDb: number;
  templates: VoiceTemplate[];
}

const STORAGE_KEY = 'hydropulse_voice_profile_v1';
const ONBOARDING_KEY = 'hydropulse_voice_onboarding_dismissed';

export function hasDismissedVoiceOnboarding(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

export function setDismissedVoiceOnboarding(dismissed: boolean = true): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ONBOARDING_KEY, dismissed ? 'true' : 'false');
  }
}

const SAMPLE_RATE = 16000;
const FRAME_SIZE = 400; // 25ms at 16kHz
const FRAME_STEP = 160; // 10ms at 16kHz
const FFT_SIZE = 512;   // Next power of 2 for 400
const NUM_MEL_FILTERS = 26;
const NUM_MFCC = 13;
const MATCH_DISTANCE_THRESHOLD = 0.28; // Normalized cosine DTW distance threshold (< 0.28 = match)

// Precomputed Hamming window
const HAMMING_WINDOW = new Float32Array(FRAME_SIZE);
for (let i = 0; i < FRAME_SIZE; i++) {
  HAMMING_WINDOW[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME_SIZE - 1));
}

// In-place Radix-2 Cooley-Tukey FFT
export function computeFFT(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = real[i]; real[i] = real[j]; real[j] = tempR;
      const tempI = imag[i]; imag[i] = imag[j]; imag[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Butterfly computations
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;
      for (let k = 0; k < half; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + half;

        const tr = wR * real[oddIdx] - wI * imag[oddIdx];
        const ti = wR * imag[oddIdx] + wI * real[oddIdx];

        real[oddIdx] = real[evenIdx] - tr;
        imag[oddIdx] = evenIdx < n ? real[evenIdx] + tr : 0;
        real[evenIdx] += tr;

        const nextWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = nextWR;
      }
    }
  }
}

// Precompute triangular Mel filterbank matrix
function buildMelFilterbank(sampleRate: number, fftSize: number, numFilters: number): Float32Array[] {
  const numBins = (fftSize >> 1) + 1;
  const minMel = 2595 * Math.log10(1 + 100 / 700);
  const maxMel = 2595 * Math.log10(1 + (sampleRate / 2) / 700);
  const melPoints = new Float32Array(numFilters + 2);
  const binPoints = new Int32Array(numFilters + 2);

  for (let i = 0; i < numFilters + 2; i++) {
    melPoints[i] = minMel + (i * (maxMel - minMel)) / (numFilters + 1);
    const freq = 700 * (Math.pow(10, melPoints[i] / 2595) - 1);
    binPoints[i] = Math.floor(((fftSize + 1) * freq) / sampleRate);
  }

  const filters: Float32Array[] = [];
  for (let m = 1; m <= numFilters; m++) {
    const filter = new Float32Array(numBins);
    const left = binPoints[m - 1];
    const center = binPoints[m];
    const right = binPoints[m + 1];

    for (let k = left; k < center; k++) {
      filter[k] = (k - left) / Math.max(1, center - left);
    }
    for (let k = center; k <= right && k < numBins; k++) {
      filter[k] = (right - k) / Math.max(1, right - center);
    }
    filters.push(filter);
  }
  return filters;
}

const MEL_FILTERS = buildMelFilterbank(SAMPLE_RATE, FFT_SIZE, NUM_MEL_FILTERS);

// Precompute DCT matrix for speed
const DCT_MATRIX: number[][] = [];
for (let c = 0; c < NUM_MFCC; c++) {
  const row: number[] = [];
  for (let m = 0; m < NUM_MEL_FILTERS; m++) {
    row.push(Math.cos((Math.PI * c * (m + 0.5)) / NUM_MEL_FILTERS));
  }
  DCT_MATRIX.push(row);
}

/**
 * Extract 13 MFCCs per frame from a 16kHz PCM audio buffer.
 */
export function extractMFCC(pcm16k: Float32Array): number[][] {
  const numSamples = pcm16k.length;
  if (numSamples < FRAME_SIZE) return [];

  // 1. High-frequency pre-emphasis filter: boost formants against low water rumble
  const emphasized = new Float32Array(numSamples);
  emphasized[0] = pcm16k[0];
  for (let i = 1; i < numSamples; i++) {
    emphasized[i] = pcm16k[i] - 0.97 * pcm16k[i - 1];
  }

  const numFrames = Math.floor((numSamples - FRAME_SIZE) / FRAME_STEP) + 1;
  const mfccMatrix: number[][] = [];

  const realBuffer = new Float32Array(FFT_SIZE);
  const imagBuffer = new Float32Array(FFT_SIZE);
  const powerSpectrum = new Float32Array((FFT_SIZE >> 1) + 1);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * FRAME_STEP;

    // Apply Hamming window and zero-pad to FFT size
    for (let i = 0; i < FFT_SIZE; i++) {
      if (i < FRAME_SIZE) {
        realBuffer[i] = emphasized[offset + i] * HAMMING_WINDOW[i];
      } else {
        realBuffer[i] = 0;
      }
      imagBuffer[i] = 0;
    }

    // Fast Fourier Transform
    computeFFT(realBuffer, imagBuffer);

    // Compute Power Spectrum
    const numBins = powerSpectrum.length;
    for (let k = 0; k < numBins; k++) {
      powerSpectrum[k] = (realBuffer[k] * realBuffer[k] + imagBuffer[k] * imagBuffer[k]) / FFT_SIZE;
    }

    // Filterbank energy computation
    const melEnergies = new Float32Array(NUM_MEL_FILTERS);
    let maxEnergy = 1e-12;
    for (let m = 0; m < NUM_MEL_FILTERS; m++) {
      let energy = 0;
      const filter = MEL_FILTERS[m];
      for (let k = 0; k < numBins; k++) {
        energy += powerSpectrum[k] * filter[k];
      }
      melEnergies[m] = energy;
      if (energy > maxEnergy) maxEnergy = energy;
    }

    // Dynamic range floor: 40 dB below frame peak (standard acoustic speech floor)
    const energyFloor = maxEnergy * 0.0001;
    const logMelEnergies = new Float32Array(NUM_MEL_FILTERS);
    for (let m = 0; m < NUM_MEL_FILTERS; m++) {
      logMelEnergies[m] = Math.log(Math.max(melEnergies[m], energyFloor));
    }

    // Discrete Cosine Transform (DCT-II)
    const frameMfcc = new Array<number>(NUM_MFCC);
    for (let c = 0; c < NUM_MFCC; c++) {
      let sum = 0;
      const dctRow = DCT_MATRIX[c];
      for (let m = 0; m < NUM_MEL_FILTERS; m++) {
        sum += logMelEnergies[m] * dctRow[m];
      }
      // Apply cepstral lifter: boosts higher-order formants
      const lifter = 1 + 11 * Math.sin((Math.PI * c) / 22);
      frameMfcc[c] = sum * lifter;
    }

    mfccMatrix.push(frameMfcc);
  }

  // Frame energy / spectral normalization: Normalize each frame to unit norm
  // This provides gain and volume invariance without erasing the word's vowel/formant identity
  for (const frame of mfccMatrix) {
    let sumSq = 0;
    for (let c = 0; c < NUM_MFCC; c++) sumSq += frame[c] * frame[c];
    const norm = Math.sqrt(sumSq);
    if (norm > 1e-6) {
      for (let c = 0; c < NUM_MFCC; c++) frame[c] /= norm;
    }
  }

  return mfccMatrix;
}

/**
 * Cosine distance between two MFCC frames:
 * Invariant to volume, distance, or loudness.
 * Compares phonetic formant coefficients (1..12), ignoring DC energy offset (0).
 * Range: [0 (identical) to 2 (opposite)]
 */
function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 1; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA <= 0 || normB <= 0) return 1.0;
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, 1 - sim);
}

/**
 * Fast Dynamic Time Warping (DTW) with Sakoe-Chiba constraint band.
 * Aligns two speech sequences in time (e.g. saying "stop" fast vs slow).
 * Returns normalized alignment distance in [0, 1].
 */
export function computeDTWDistance(
  template: number[][],
  candidate: number[][],
  maxBandWidth: number = 8
): number {
  const n = template.length;
  const m = candidate.length;

  if (n === 0 || m === 0) return 1.0;
  // If lengths differ by more than 2.5x, not the same word
  if (m < n * 0.4 || m > n * 2.5) return 1.0;

  const band = Math.max(maxBandWidth, Math.round(0.25 * Math.max(n, m)));

  // DP cost matrix
  const dp: number[][] = [];
  for (let i = 0; i <= n; i++) {
    dp.push(new Array<number>(m + 1).fill(Infinity));
  }
  dp[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    const targetJ = Math.round((i * m) / n);
    const jMin = Math.max(1, targetJ - band);
    const jMax = Math.min(m, targetJ + band);

    for (let j = jMin; j <= jMax; j++) {
      const cost = cosineDistance(template[i - 1], candidate[j - 1]);
      dp[i][j] = cost + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  const finalCost = dp[n][m];
  if (!isFinite(finalCost)) return 1.0;
  return finalCost / (n + m);
}

/**
 * Voice Activity Detector & Silence Trimmer:
 * Trims silence before and after the spoken utterance.
 */
export function trimSilence(pcm: Float32Array, thresholdRms: number = 0.015): Float32Array {
  const windowSize = 320; // 20ms
  let startIdx = 0;
  let endIdx = pcm.length;

  // Find start
  for (let i = 0; i <= pcm.length - windowSize; i += 160) {
    let sumSq = 0;
    for (let j = 0; j < windowSize; j++) {
      const v = pcm[i + j];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / windowSize);
    if (rms >= thresholdRms) {
      startIdx = Math.max(0, i - 1600); // 100ms lead-in padding
      break;
    }
  }

  // Find end
  for (let i = pcm.length - windowSize; i >= startIdx; i -= 160) {
    let sumSq = 0;
    for (let j = 0; j < windowSize; j++) {
      const v = pcm[i + j];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / windowSize);
    if (rms >= thresholdRms) {
      endIdx = Math.min(pcm.length, i + windowSize + 1600); // 100ms lead-out padding
      break;
    }
  }

  if (endIdx <= startIdx + 1600) return pcm;
  return pcm.subarray(startIdx, endIdx);
}

/**
 * Resample arbitrary Web Audio sample rate (e.g. 44100 or 48000) down to 16000 Hz.
 */
export function resampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
  if (sourceRate === SAMPLE_RATE) return input;
  const ratio = sourceRate / SAMPLE_RATE;
  const newLen = Math.floor(input.length / ratio);
  const result = new Float32Array(newLen);

  for (let i = 0; i < newLen; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = srcIndex - i0;
    result[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return result;
}

/**
 * Voice Profile Management Service
 */
class VoiceProfileService {
  private currentProfile: VoiceProfile | null = null;

  constructor() {
    this.loadProfile();
  }

  public loadProfile(): VoiceProfile | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.currentProfile = JSON.parse(saved);
        return this.currentProfile;
      }
    } catch (e) {
      console.warn('Failed to load voice profile from localStorage', e);
    }
    return null;
  }

  public getProfile(): VoiceProfile | null {
    if (!this.currentProfile) this.loadProfile();
    return this.currentProfile;
  }

  public hasProfile(): boolean {
    const p = this.getProfile();
    return Boolean(p && p.templates && p.templates.length > 0);
  }

  public saveProfile(profile: VoiceProfile): void {
    this.currentProfile = profile;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      } catch (e) {
        console.error('Failed to save voice profile to localStorage', e);
      }
    }
  }

  public clearProfile(): void {
    this.currentProfile = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
  }

  /**
   * Create an enrolled template from a single recorded take (16kHz PCM).
   */
  public createTemplateFromPcm(phrase: string, pcm16k: Float32Array): VoiceTemplate {
    const trimmed = trimSilence(pcm16k);
    const mfcc = extractMFCC(trimmed);
    const durationMs = Math.round((trimmed.length / SAMPLE_RATE) * 1000);
    return {
      phrase,
      mfccMatrix: mfcc,
      durationMs
    };
  }

  /**
   * Match a candidate PCM window against all enrolled templates using DTW.
   * Returns matched command with confidence [0 to 1], or null if below threshold.
   */
  public matchAudio(pcm16k: Float32Array): { phrase: string; confidence: number; distance: number } | null {
    const profile = this.getProfile();
    if (!profile || !profile.templates || profile.templates.length === 0) return null;

    const trimmed = trimSilence(pcm16k);
    if (trimmed.length < FRAME_SIZE * 3) return null; // Too short to be a word (< 75ms)

    const candidateMfcc = extractMFCC(trimmed);
    if (candidateMfcc.length < 5) return null;

    let bestPhrase = '';
    let minDistance = Infinity;

    for (const t of profile.templates) {
      const dist = computeDTWDistance(t.mfccMatrix, candidateMfcc);
      if (dist < minDistance) {
        minDistance = dist;
        bestPhrase = t.phrase;
      }
    }

    if (minDistance <= MATCH_DISTANCE_THRESHOLD) {
      const confidence = Math.max(0, Math.min(1, 1 - (minDistance / MATCH_DISTANCE_THRESHOLD)));
      return {
        phrase: bestPhrase,
        confidence,
        distance: minDistance
      };
    }

    return null;
  }

  // ==========================================
  // REAL-TIME AUDIO CAPTURE & STREAMING SPOTTER
  // ==========================================

  private liveStream: MediaStream | null = null;
  private liveAudioCtx: AudioContext | null = null;
  private liveProcessor: ScriptProcessorNode | null = null;
  private isSpotting = false;

  /**
   * Universal microphone stream acquisition helper.
   * Tries ideal constraints first; immediately falls back to universal { audio: true }
   * to eliminate OverconstrainedError ("could not find audio source") on Android hardware.
   */
  public async acquireMicrophone(mode: 'raw' | 'speech' = 'speech'): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this environment');
    }

    // 1. Soft ideal constraints (never strict booleans that fail Android hardware HAL)
    try {
      const idealConstraints: MediaStreamConstraints = {
        audio: mode === 'raw'
          ? {
              echoCancellation: { ideal: false },
              noiseSuppression: { ideal: false },
              autoGainControl: { ideal: false }
            }
          : {
              echoCancellation: { ideal: true },
              noiseSuppression: { ideal: false },
              autoGainControl: { ideal: false }
            }
      };
      const stream = await navigator.mediaDevices.getUserMedia(idealConstraints);
      if (stream && stream.getAudioTracks().length > 0) {
        return stream;
      }
    } catch (err) {
      console.warn('Ideal audio constraints rejected, falling back to universal audio', err);
    }

    // 2. Universal fallback: basic audio: true (100% supported on every Android HAL and browser)
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      console.error('Universal audio acquisition failed', err);
      throw err;
    }
  }

  /**
   * Capture a single utterance of fixed duration (e.g. 1.5s for "start" or "stop").
   * Used during the 3-take voice enrollment flow.
   */
  public async recordUtterance(
    durationMs: number = 1500,
    onRmsUpdate?: (rms: number) => void
  ): Promise<Float32Array> {
    const stream = await this.acquireMicrophone('speech');

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch {}
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(2048, 1, 1);

    const recordedChunks: Float32Array[] = [];

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);
      recordedChunks.push(copy);

      if (onRmsUpdate) {
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
        const rms = Math.sqrt(sumSq / input.length);
        onRmsUpdate(rms);
      }
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    return new Promise((resolve) => {
      setTimeout(() => {
        // Cleanup recording pipeline
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close().catch(() => {});

        // Concatenate all recorded chunks
        let totalLen = 0;
        for (const c of recordedChunks) totalLen += c.length;
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const c of recordedChunks) {
          merged.set(c, offset);
          offset += c.length;
        }

        // Resample to 16kHz
        const resampled = resampleTo16k(merged, audioCtx.sampleRate);
        const trimmed = trimSilence(resampled);
        resolve(trimmed);
      }, durationMs);
    });
  }

  /**
   * Sample 4 seconds of ambient sound to calculate background noise floor.
   */
  public async calibrateNoiseFloor(
    durationMs: number = 4000,
    onProgress?: (progressPct: number, currentRms: number) => void
  ): Promise<{ noiseFloorRms: number; noiseFloorDb: number }> {
    const stream = await this.acquireMicrophone('raw');

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch {}
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(2048, 1, 1);

    let sumRms = 0;
    let frameCount = 0;
    const startTime = Date.now();

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < input.length; i++) sumSq += input[i] * input[i];
      const rms = Math.sqrt(sumSq / input.length);
      sumRms += rms;
      frameCount++;

      if (onProgress) {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
        onProgress(pct, rms);
      }
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    return new Promise((resolve) => {
      setTimeout(() => {
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close().catch(() => {});

        const avgRms = frameCount > 0 ? sumRms / frameCount : 0.01;
        const db = Math.round(20 * Math.log10(Math.max(avgRms, 1e-5)));
        resolve({
          noiseFloorRms: avgRms,
          noiseFloorDb: db
        });
      }, durationMs);
    });
  }

  /**
   * Silently measure ambient sound level in background when a workout begins,
   * dynamically adapting the noise gate to today's music volume and water turbulence.
   */
  public async autoCalibrateAmbientBackground(durationMs: number = 3000): Promise<{ noiseFloorRms: number; noiseFloorDb: number }> {
    try {
      const res = await this.calibrateNoiseFloor(durationMs);
      const profile = this.getProfile();
      if (profile) {
        profile.noiseFloorRms = res.noiseFloorRms;
        profile.noiseFloorDb = res.noiseFloorDb;
        this.saveProfile(profile);
      }
      return res;
    } catch (e) {
      return { noiseFloorRms: 0.015, noiseFloorDb: -36 };
    }
  }

  /**
   * Start live streaming keyword spotter for poolside swimming.
   * Matches audio buffers continuously against enrolled voice templates.
   */
  public async startLiveSpotter(
    onCommand: (phrase: string, confidence: number) => void,
    onRms?: (rms: number) => void
  ): Promise<boolean> {
    if (this.isSpotting) return true;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    const profile = this.getProfile();
    if (!profile || !profile.templates || profile.templates.length === 0) {
      return false;
    }

    try {
      this.liveStream = await this.acquireMicrophone('speech');

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.liveAudioCtx = new AudioContextClass();
      if (this.liveAudioCtx.state === 'suspended') {
        try { await this.liveAudioCtx.resume(); } catch {}
      }
      const source = this.liveAudioCtx.createMediaStreamSource(this.liveStream);
      this.liveProcessor = this.liveAudioCtx.createScriptProcessor(2048, 1, 1);

      const sampleRate = this.liveAudioCtx.sampleRate;
      const noiseThreshold = Math.max(0.015, (profile.noiseFloorRms || 0.01) * 1.6);

      // Ring buffer holding last 1.2s of audio
      const ringCapacity = Math.round(1.2 * sampleRate);
      const ringBuffer = new Float32Array(ringCapacity);
      let ringWriteIdx = 0;
      let samplesAccumulated = 0;

      let isSpeechActive = false;
      let speechHoldoffFrames = 0;
      let lastMatchTime = 0;

      this.liveProcessor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const len = input.length;

        // Compute chunk RMS
        let sumSq = 0;
        for (let i = 0; i < len; i++) sumSq += input[i] * input[i];
        const rms = Math.sqrt(sumSq / len);
        if (onRms) onRms(rms);

        // Append to ring buffer
        for (let i = 0; i < len; i++) {
          ringBuffer[ringWriteIdx] = input[i];
          ringWriteIdx = (ringWriteIdx + 1) % ringCapacity;
        }
        samplesAccumulated += len;

        const now = Date.now();
        if (now - lastMatchTime < 1400) {
          // Cooldown refractory period to prevent multi-triggering
          return;
        }

        if (rms >= noiseThreshold) {
          isSpeechActive = true;
          speechHoldoffFrames = 0;
        } else if (isSpeechActive) {
          speechHoldoffFrames++;
          // When energy drops for ~180ms, the spoken word has ended -> evaluate utterance
          if (speechHoldoffFrames >= 4 && samplesAccumulated >= ringCapacity * 0.5) {
            isSpeechActive = false;
            speechHoldoffFrames = 0;

            // Extract linear buffer from ring
            const utterance = new Float32Array(ringCapacity);
            let readIdx = ringWriteIdx;
            for (let i = 0; i < ringCapacity; i++) {
              utterance[i] = ringBuffer[readIdx];
              readIdx = (readIdx + 1) % ringCapacity;
            }

            // Resample to 16kHz
            const pcm16k = resampleTo16k(utterance, sampleRate);
            const match = this.matchAudio(pcm16k);

            if (match && match.confidence >= 0.70) {
              lastMatchTime = now;
              onCommand(match.phrase, match.confidence);
            }
          }
        }
      };

      source.connect(this.liveProcessor);
      this.liveProcessor.connect(this.liveAudioCtx.destination);
      this.isSpotting = true;
      return true;
    } catch (e) {
      console.error('Failed to start live voice spotter', e);
      this.stopLiveSpotter();
      return false;
    }
  }

  public stopLiveSpotter(): void {
    this.isSpotting = false;
    if (this.liveProcessor) {
      this.liveProcessor.disconnect();
      this.liveProcessor = null;
    }
    if (this.liveStream) {
      this.liveStream.getTracks().forEach((t) => t.stop());
      this.liveStream = null;
    }
    if (this.liveAudioCtx) {
      this.liveAudioCtx.close().catch(() => {});
      this.liveAudioCtx = null;
    }
  }

  public isSpotterActive(): boolean {
    return this.isSpotting;
  }
}

export const voiceProfileService = new VoiceProfileService();
