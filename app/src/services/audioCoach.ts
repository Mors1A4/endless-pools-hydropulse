/**
 * Studio-Grade Audio & Voice Coach for Endless Pools
 * Features synthesized dual-tone countdown chimes and curated high-clarity TTS
 */

class AudioCoachService {
  private audioCtx: AudioContext | null = null;
  private isVoiceEnabled = true;
  private isChimeEnabled = true;
  private voiceVolume = 1.0;
  private chimeVolume = 0.9;
  private curatedVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.initVoices();
      window.speechSynthesis.onvoiceschanged = () => this.initVoices();
    }
  }

  private initVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    // Sort voices by quality match score
    const scoredVoices = voices
      .filter(v => v.lang.startsWith('en'))
      .map(v => {
        let score = 0;
        const name = v.name.toLowerCase();
        if (name.includes('natural')) score += 10;
        if (name.includes('neural')) score += 10;
        if (name.includes('google')) score += 6;
        if (name.includes('enhanced')) score += 6;
        if (v.default) score += 2;
        if (v.lang === 'en-US' || v.lang === 'en-GB') score += 3;
        return { voice: v, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scoredVoices.length > 0) {
      this.curatedVoice = scoredVoices[0].voice;
    }
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  }

  public setPreferredVoice(voiceURI: string): void {
    const voices = this.getAvailableVoices();
    const found = voices.find(v => v.voiceURI === voiceURI);
    if (found) {
      this.curatedVoice = found;
    }
  }

  public setSettings(voiceEnabled: boolean, chimeEnabled: boolean, voiceVol: number = 1.0, chimeVol: number = 0.9): void {
    this.isVoiceEnabled = voiceEnabled;
    this.isChimeEnabled = chimeEnabled;
    this.voiceVolume = Math.max(0, Math.min(1, voiceVol));
    this.chimeVolume = Math.max(0, Math.min(1, chimeVol));
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public playCountdownPip(isFinal = false): void {
    if (!this.isChimeEnabled) return;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = isFinal ? 1200 : 750;
      const duration = isFinal ? 0.35 : 0.15;
      const now = ctx.currentTime;

      osc.type = isFinal ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (isFinal) {
        osc.frequency.exponentialRampToValueAtTime(1500, now + duration);
      }

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(this.chimeVolume * 0.7, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // AudioContext fallback
    }
  }

  public playTransitionChime(type: 'speed_up' | 'break' | 'slow_down' | 'complete'): void {
    if (!this.isChimeEnabled) return;
    const ctx = this.ensureAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(this.chimeVolume * 0.75, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

      if (type === 'speed_up') {
        osc1.frequency.setValueAtTime(440, now);
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.3);
        osc2.frequency.setValueAtTime(554.37, now);
        osc2.frequency.exponentialRampToValueAtTime(1108.73, now + 0.3);
      } else if (type === 'break') {
        osc1.frequency.setValueAtTime(659.25, now);
        osc1.frequency.exponentialRampToValueAtTime(329.63, now + 0.4);
        osc2.frequency.setValueAtTime(523.25, now);
        osc2.frequency.exponentialRampToValueAtTime(261.63, now + 0.4);
      } else if (type === 'complete') {
        osc1.frequency.setValueAtTime(523.25, now);
        osc2.frequency.setValueAtTime(659.25, now);
        setTimeout(() => this.playVictoryArpeggio(), 250);
      } else {
        osc1.frequency.setValueAtTime(587.33, now);
        osc2.frequency.setValueAtTime(440, now);
      }

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } catch {
      // AudioContext fallback
    }
  }

  /**
   * High-salience tactile acoustic chirp to confirm voice commands through loud pool music
   */
  public playCommandChirp(): void {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(Math.max(0.7, this.chimeVolume), now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Fallback
    }
  }

  private playVictoryArpeggio(): void {
    const ctx = this.ensureAudioContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const start = ctx.currentTime + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(this.chimeVolume * 0.6, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  }

  /**
   * Spoken announcement with Android Chromium hang protection
   */
  public speak(text: string, interrupt = true): void {
    if (!this.isVoiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      if (!this.curatedVoice) {
        this.initVoices();
      }

      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      if (interrupt) {
        window.speechSynthesis.cancel();
      }

      // Small 50ms delay after cancel prevents silent speech drops in Chrome/Android
      setTimeout(() => {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          if (this.curatedVoice) {
            utterance.voice = this.curatedVoice;
          }
          utterance.volume = this.voiceVolume;
          utterance.rate = 1.02;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        } catch {
          // Speak error catch
        }
      }, interrupt ? 50 : 0);
    } catch {
      // SpeechSynthesis error catch
    }
  }

  public announceWarmup(paceFormatted: string): void {
    this.playTransitionChime('speed_up');
    setTimeout(() => {
      this.speak(`Starting workout. One minute warm-up at pace ${paceFormatted}.`);
    }, 300);
  }

  public announceTargetSpeed(paceFormatted: string): void {
    this.playTransitionChime('speed_up');
    setTimeout(() => {
      this.speak(`Warm-up complete. Accelerating to target pace ${paceFormatted}.`);
    }, 300);
  }

  public announceBreak(durationSec: number): void {
    this.playTransitionChime('break');
    setTimeout(() => {
      const durText = durationSec >= 60 ? `${Math.round(durationSec / 60)} minute` : `${durationSec} seconds`;
      this.speak(`Mid-workout break. Current stopped for ${durText} rest.`);
    }, 300);
  }

  public announceCooldown(): void {
    this.playTransitionChime('slow_down');
    setTimeout(() => {
      this.speak(`Cool-down interval. Current slowing down.`);
    }, 300);
  }

  public announceComplete(): void {
    this.playTransitionChime('complete');
    setTimeout(() => {
      this.speak(`Workout complete! Outstanding swim.`);
    }, 600);
  }
}

export const audioCoach = new AudioCoachService();
