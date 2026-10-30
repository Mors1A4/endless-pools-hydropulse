/**
 * Hands-Free Voice Command Listener for Endless Pools
 * Listens for voice code words ("start", "stop", "pause", "resume", "faster", "slower", "up 5", "down 5")
 * Enables wet-hand operation without touching the phone screen or triggering Android navigation buttons.
 */

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

// Web Speech API interface declarations
interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

class VoiceCommandService {
  private recognition: any = null;
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
    if (typeof window !== 'undefined') {
      const win = window as IWindowWithSpeech;
      const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechClass) {
        this.isSupported = true;
        try {
          this.recognition = new SpeechClass();
          this.recognition.continuous = true;
          this.recognition.interimResults = true;
          this.recognition.lang = 'en-US';
          this.recognition.maxAlternatives = 3;

          this.recognition.onstart = () => {
            this.isListening = true;
            this.error = null;
            this.notifyState();
          };

          this.recognition.onresult = (event: any) => {
            this.handleSpeechResult(event);
          };

          this.recognition.onerror = (event: any) => {
            // 'no-speech' is routine in background listening
            if (event.error !== 'no-speech') {
              this.error = event.error;
            }
            this.notifyState();
          };

          this.recognition.onend = () => {
            this.isListening = false;
            this.notifyState();
            // Automatically keep listening if enabled (handles WebView silence disconnects)
            if (this.shouldBeListening) {
              clearTimeout(this.restartTimeout);
              this.restartTimeout = setTimeout(() => {
                if (this.shouldBeListening) {
                  this.startInternal();
                }
              }, 400);
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
    if (!this.recognition || !this.isSupported) return;
    try {
      this.recognition.start();
    } catch (e: any) {
      // If already started or transitioning, ignore
    }
  }

  public startListening(): boolean {
    if (!this.isSupported || !this.recognition) return false;
    this.shouldBeListening = true;
    this.error = null;
    this.startInternal();
    return true;
  }

  public stopListening(): void {
    this.shouldBeListening = false;
    clearTimeout(this.restartTimeout);
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop error
      }
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
      isListening: this.isListening && this.shouldBeListening,
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

    let fullTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res && res[0]) {
        fullTranscript += ' ' + res[0].transcript;
      }
    }

    const cleaned = fullTranscript.toLowerCase().trim();
    if (!cleaned) return;

    this.lastHeard = cleaned;
    this.notifyState();

    this.evaluateTranscript(cleaned);
  }

  public evaluateTranscript(transcript: string, bypassDebounce = false): VoiceCommand | null {
    const text = transcript.toLowerCase();
    const now = Date.now();
    // Debounce: minimum 1000ms between parsed commands during live microphone stream
    if (!bypassDebounce && now - this.lastCommandTime < 1000) return null;

    let recognizedCmd: VoiceCommand | null = null;

    // Check specific multi-word / notch patterns first
    if (text.includes('up 5') || text.includes('up five') || text.includes('plus 5') || text.includes('plus five') || text.includes('five notches')) {
      recognizedCmd = 'up5';
    } else if (text.includes('down 5') || text.includes('down five') || text.includes('minus 5') || text.includes('minus five')) {
      recognizedCmd = 'down5';
    } else if (text.includes('stop') || text.includes('halt') || text.includes('cancel') || text.includes('end swim') || text.includes('shut off') || text.includes('turn off')) {
      recognizedCmd = 'stop';
    } else if (text.includes('pause') || text.includes('hold on') || text.includes('take a break')) {
      recognizedCmd = 'pause';
    } else if (text.includes('resume') || text.includes('continue') || text.includes('keep going')) {
      recognizedCmd = 'resume';
    } else if (text.includes('start') || text.includes('begin') || text.includes('let\'s swim') || text.includes('go swim') || text.endsWith(' go')) {
      recognizedCmd = 'start';
    } else if (text.includes('faster') || text.includes('speed up') || text.includes('notch up') || text.includes('more speed')) {
      recognizedCmd = 'faster';
    } else if (text.includes('slower') || text.includes('slow down') || text.includes('notch down') || text.includes('less speed')) {
      recognizedCmd = 'slower';
    }

    if (recognizedCmd) {
      this.lastCommand = recognizedCmd;
      this.lastCommandTime = now;
      this.notifyState();
      this.commandListeners.forEach(listener => listener(recognizedCmd!, transcript));
      return recognizedCmd;
    }

    return null;
  }
}

export const voiceCommands = new VoiceCommandService();
