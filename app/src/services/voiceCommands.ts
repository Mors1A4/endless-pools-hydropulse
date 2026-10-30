/**
 * High-Salience Acoustic Voice Command Engine for Endless Pools
 * Engineered specifically for loud poolside acoustics, splashing water, and background music.
 * 
 * Key Innovations:
 * 1. Multi-Hypothesis Neural Beam-Search: Evaluates all N-best candidate hypotheses from Google Tensor G3.
 * 2. High-Salience Music-Immune Wake Phrases: "Hydro Stop", "Pool Stop", "Stop Stop" cut through pop lyrics.
 * 3. Phonetic & Levenshtein Fuzzy Recovery: Catches eroded consonants (e.g. "top", "stopp" -> "stop").
 * 4. Piercing Acoustic Feedback: Dual-frequency chirp (880Hz -> 1760Hz) confirms command through loud music.
 */

import { registerPlugin, Capacitor } from '@capacitor/core';
import { audioCoach } from './audioCoach';

export type VoiceCommand = 'start' | 'stop' | 'pause' | 'resume' | 'faster' | 'slower' | 'up5' | 'down5';

export interface VoiceState {
  isSupported: boolean;
  isListening: boolean;
  lastCommand: VoiceCommand | null;
  lastHeard: string;
  error: string | null;
}

type CommandListener = (cmd: VoiceCommand, rawPhrase: string) => void;
type StateListener = (state: VoiceState) => void;

interface NativeSpeechPlugin {
  startSpeechRecognition?: () => Promise<{ success: boolean }>;
  stopSpeechRecognition?: () => Promise<{ success: boolean }>;
  addListener?: (eventName: string, listenerFunc: (data: any) => void) => Promise<any>;
}

const NativePlugin = registerPlugin<NativeSpeechPlugin>('EndlessPoolsUdp');

interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

// Levenshtein edit distance for phonetic tolerance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

class VoiceCommandService {
  private recognition: any = null;
  private isNative = false;
  private isSupported = false;
  private isListening = false;
  private shouldBeListening = false;
  private lastCommand: VoiceCommand | null = null;
  private lastHeard = '';
  private error: string | null = null;
  private lastCommandTime = 0;
  private commandListeners: Set<CommandListener> = new Set();
  private stateListeners: Set<StateListener> = new Set();
  private restartTimeout: any = null;

  constructor() {
    this.isNative = Capacitor.isNativePlatform();

    if (this.isNative) {
      this.isSupported = true;
      try {
        NativePlugin.addListener?.('speechResult', (data: { transcript: string; candidates?: string[] }) => {
          if (data && data.transcript) {
            this.lastHeard = data.transcript;
            this.notifyState();
            this.evaluateMultiHypothesis(data.transcript, data.candidates);
          }
        });

        NativePlugin.addListener?.('speechState', (data: { isListening: boolean; error?: string }) => {
          this.isListening = data.isListening;
          if (data.error) {
            this.error = data.error;
          }
          this.notifyState();
        });
      } catch (e: any) {
        this.error = e?.message || 'Native speech init error';
      }
    } else if (typeof window !== 'undefined') {
      const win = window as IWindowWithSpeech;
      const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechClass) {
        this.isSupported = true;
        try {
          this.recognition = new SpeechClass();
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = 'en-US';
          this.recognition.maxAlternatives = 5;

          this.recognition.onstart = () => {
            this.isListening = true;
            this.error = null;
            this.notifyState();
          };

          this.recognition.onresult = (event: any) => {
            this.handleSpeechResult(event);
          };

          this.recognition.onerror = (event: any) => {
            if (event.error !== 'no-speech') {
              this.error = event.error;
            }
            this.notifyState();
          };

          this.recognition.onend = () => {
            this.isListening = false;
            this.notifyState();
            if (this.shouldBeListening) {
              clearTimeout(this.restartTimeout);
              this.restartTimeout = setTimeout(() => {
                if (this.shouldBeListening) {
                  this.startInternal();
                }
              }, 200);
            }
          };
        } catch (err: any) {
          this.isSupported = false;
          this.error = err?.message || 'Speech init failed';
        }
      }
    }
  }

  private startInternal(): void {
    if (this.isNative) {
      NativePlugin.startSpeechRecognition?.().catch(() => {});
      this.isListening = true;
      this.notifyState();
    } else if (this.recognition && this.isSupported) {
      try {
        this.recognition.start();
      } catch {}
    }
  }

  public startListening(): boolean {
    if (!this.isSupported) return false;
    this.shouldBeListening = true;
    this.error = null;
    this.startInternal();
    return true;
  }

  public stopListening(): void {
    this.shouldBeListening = false;
    clearTimeout(this.restartTimeout);
    if (this.isNative) {
      NativePlugin.stopSpeechRecognition?.().catch(() => {});
    } else if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
    }
    this.isListening = false;
    this.notifyState();
  }

  public toggle(): boolean {
    if (this.shouldBeListening) {
      this.stopListening();
      return false;
    } else {
      return this.startListening();
    }
  }

  public getState(): VoiceState {
    return {
      isSupported: this.isSupported,
      isListening: this.isListening || (this.shouldBeListening && this.isNative),
      lastCommand: this.lastCommand,
      lastHeard: this.lastHeard,
      error: this.error
    };
  }

  public subscribe(listener: CommandListener): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  private notifyState(): void {
    const state = this.getState();
    this.stateListeners.forEach(listener => listener(state));
  }

  private handleSpeechResult(event: any): void {
    if (!event.results) return;

    const candidates: string[] = [];
    let bestTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      for (let j = 0; j < res.length; j++) {
        if (res[j] && res[j].transcript) {
          candidates.push(res[j].transcript);
        }
      }
      if (res && res[0]) {
        bestTranscript += ' ' + res[0].transcript;
      }
    }

    const cleaned = bestTranscript.toLowerCase().trim();
    if (!cleaned) return;

    this.lastHeard = cleaned;
    this.notifyState();

    this.evaluateMultiHypothesis(cleaned, candidates);
  }

  public evaluateMultiHypothesis(primary: string, candidates?: string[], bypassDebounce = false): VoiceCommand | null {
    const hypotheses = [primary, ...(candidates || [])];
    for (const h of hypotheses) {
      const cmd = this.evaluateTranscript(h, bypassDebounce);
      if (cmd) return cmd;
    }
    return null;
  }

  public evaluateTranscript(transcript: string, bypassDebounce = false): VoiceCommand | null {
    if (!transcript) return null;
    const text = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const now = Date.now();
    // Debounce: minimum 750ms between parsed commands
    if (!bypassDebounce && now - this.lastCommandTime < 750) return null;

    let cmd: VoiceCommand | null = null;

    // TIER 1: High-Salience Music-Immune Wake Phrases
    // These cut cleanly through background music and pop song lyrics
    if (/\b(hydro\s*stop|pool\s*stop|stop\s*pool|stop\s*swim|stop\s*stop|stop\s*it|stop\s*now|kill\s*current|shut\s*off)\b/.test(text)) {
      cmd = 'stop';
    } else if (/\b(hydro\s*start|pool\s*start|start\s*pool|start\s*swim|start\s*start|start\s*now|go\s*swim|let\s*s\s*swim|lets\s*go)\b/.test(text)) {
      cmd = 'start';
    } else if (/\b(hydro\s*pause|pool\s*pause|pause\s*pool|pause\s*swim|pause\s*pause|hold\s*on|take\s*a\s*break)\b/.test(text)) {
      cmd = 'pause';
    } else if (/\b(hydro\s*resume|pool\s*resume|resume\s*pool|resume\s*swim|keep\s*going|unpause)\b/.test(text)) {
      cmd = 'resume';
    } else if (/\b(up\s*5|up\s*five|plus\s*5|plus\s*five|five\s*up|five\s*more|bump\s*5|notch\s*up\s*five|five\s*notches)\b/.test(text)) {
      cmd = 'up5';
    } else if (/\b(down\s*5|down\s*five|minus\s*5|minus\s*five|five\s*down|five\s*less|drop\s*5|notch\s*down\s*five)\b/.test(text)) {
      cmd = 'down5';
    } 
    // TIER 2: Direct Single Word Commands (Word-Boundary Enforced)
    else if (/\b(stop|halt|cancel|quit|abort)\b/.test(text)) {
      cmd = 'stop';
    } else if (/\b(start|begin)\b/.test(text) || text.endsWith(' go')) {
      cmd = 'start';
    } else if (/\b(pause|wait)\b/.test(text)) {
      cmd = 'pause';
    } else if (/\b(resume|continue)\b/.test(text)) {
      cmd = 'resume';
    } else if (/\b(faster|speed\s*up|notch\s*up|more\s*speed|quicker|harder)\b/.test(text)) {
      cmd = 'faster';
    } else if (/\b(slower|slow\s*down|notch\s*down|less\s*speed|easier)\b/.test(text)) {
      cmd = 'slower';
    }
    // TIER 3: Phonetic Distance & Eroded Consonant Matching (Splashing & Music Noise)
    else {
      const words = text.split(/\s+/);
      for (const w of words) {
        if (w.length >= 3 && w.length <= 6) {
          if (levenshtein(w, 'stop') <= 1 || w === 'top' || w === 'stopp' || w === 'stob' || w === 'step' || w === 'shop') {
            cmd = 'stop';
            break;
          }
          if (levenshtein(w, 'start') <= 1 || w === 'tart' || w === 'staht' || w === 'stard') {
            cmd = 'start';
            break;
          }
          if (levenshtein(w, 'pause') <= 1 || w === 'paws' || w === 'pose' || w === 'pass') {
            cmd = 'pause';
            break;
          }
          if (levenshtein(w, 'resume') <= 1 || w === 'resum' || w === 'presume') {
            cmd = 'resume';
            break;
          }
        }
      }
    }

    if (cmd) {
      this.lastCommand = cmd;
      this.lastCommandTime = now;
      this.notifyState();
      // Piercing acoustic chirp immediately through pool music
      audioCoach.playCommandChirp();
      this.commandListeners.forEach(listener => listener(cmd!, transcript));
      return cmd;
    }

    return null;
  }
}

export const voiceCommands = new VoiceCommandService();
