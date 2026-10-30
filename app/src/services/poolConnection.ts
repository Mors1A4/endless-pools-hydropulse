import { EPTelemetry } from '../types/protocol';
import { build44BytePacket, parse111BytePacket } from './protocolEngine';

export type ConnectionMode = 'native_udp' | 'ws_bridge';

export interface PoolConnectionStatus {
  mode: ConnectionMode;
  connected: boolean;
  poolIp: string;
  lastPacketTime: number;
  packetsReceived: number;
  packetsSent: number;
  unconfirmedCount: number;
}

interface QueuedCommand {
  cmd: number;
  param: number;
}

class PoolConnectionManager {
  private mode: ConnectionMode = 'native_udp';
  private ws: WebSocket | null = null;
  private telemetryListeners: Array<(t: EPTelemetry) => void> = [];
  private statusListeners: Array<(s: PoolConnectionStatus) => void> = [];
  
  private poolIp = '255.255.255.255';
  private lastPacketTime = 0;
  private packetsReceived = 0;
  private packetsSent = 0;
  private unconfirmedCount = 0;
  private lastSentMsgId = 0;
  private reconnectInterval: number | null = null;

  // Flow control queue for microcontroller pacing (200ms inter-command spacing)
  private commandQueue: QueuedCommand[] = [];
  private isProcessingQueue = false;

  constructor() {
    if (this.isCapacitorAndroid()) {
      this.mode = 'native_udp';
      this.initNativeUdp();
    } else {
      this.mode = 'ws_bridge';
      this.initWsBridge();
    }
  }

  private isCapacitorAndroid(): boolean {
    return typeof window !== 'undefined' && 
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
  }

  public getStatus(): PoolConnectionStatus {
    const isRecentlyActive = this.lastPacketTime > 0 && (Date.now() - this.lastPacketTime < 4000);
    return {
      mode: this.mode,
      connected: isRecentlyActive,
      poolIp: this.poolIp,
      lastPacketTime: this.lastPacketTime,
      packetsReceived: this.packetsReceived,
      packetsSent: this.packetsSent,
      unconfirmedCount: this.unconfirmedCount
    };
  }

  public setMode(mode: ConnectionMode, ip?: string): void {
    if (ip) this.poolIp = ip;
    if (this.mode === mode) return;

    this.cleanup();
    this.mode = mode;

    if (mode === 'ws_bridge') {
      this.initWsBridge();
    } else if (mode === 'native_udp') {
      this.initNativeUdp();
    }
    this.notifyStatus();
  }

  public setPoolIp(ip: string): void {
    this.poolIp = ip;
    this.notifyStatus();
  }

  private initWsBridge(): void {
    try {
      const host = window.location.hostname || 'localhost';
      const bridgeUrl = `ws://${host}:9751`;
      this.ws = new WebSocket(bridgeUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onmessage = (evt) => {
        if (evt.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(evt.data);
          const telemetry = parse111BytePacket(bytes);
          if (telemetry) {
            this.packetsReceived++;
            this.lastPacketTime = Date.now();
            if (telemetry.msgId === this.lastSentMsgId) {
              this.unconfirmedCount = 0;
            }
            this.notifyTelemetry(telemetry);
            this.notifyStatus();
          }
        }
      };

      this.ws.onclose = () => {
        if (!this.reconnectInterval) {
          this.reconnectInterval = window.setInterval(() => {
            if (this.mode === 'ws_bridge' && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
              this.initWsBridge();
            }
          }, 3000);
        }
      };
    } catch {
      // WS error
    }
  }

  private initNativeUdp(): void {
    const cap = (window as unknown as { Capacitor?: { Plugins?: { EndlessPoolsUdp?: { 
      addListener: (event: string, cb: (data: { packetHex: string; senderIp?: string }) => void) => void;
      startListener: (options: { multicastGroup: string; port: number }) => Promise<void>;
    } } } }).Capacitor;

    const plugin = cap?.Plugins?.EndlessPoolsUdp;
    if (plugin) {
      plugin.addListener('onUdpPacket', (data) => {
        if (data?.packetHex) {
          const bytes = this.hexToBytes(data.packetHex);
          const telemetry = parse111BytePacket(bytes);
          if (telemetry) {
            this.packetsReceived++;
            this.lastPacketTime = Date.now();
            if (data.senderIp && data.senderIp !== '0.0.0.0') {
              this.poolIp = data.senderIp;
            }
            this.notifyTelemetry(telemetry);
            this.notifyStatus();
          }
        }
      });
      plugin.startListener({ multicastGroup: '239.255.0.1', port: 45654 });
    }
  }

  /**
   * Enqueue command for transmission with microcontroller-safe flow control pacing
   */
  public sendCommand(cmd: number, param = 0): void {
    this.commandQueue.push({ cmd, param });
    this.processQueue();
  }

  private processQueue(): void {
    if (this.isProcessingQueue || this.commandQueue.length === 0) return;
    this.isProcessingQueue = true;

    const item = this.commandQueue.shift()!;
    const packet = build44BytePacket(item.cmd, item.param);
    this.lastSentMsgId = packet[2];
    this.packetsSent++;

    if (this.mode === 'ws_bridge' && this.ws?.readyState === WebSocket.OPEN) {
      // Send raw Uint8Array
      this.ws.send(packet);
    } else if (this.mode === 'native_udp') {
      const cap = (window as unknown as { Capacitor?: { Plugins?: { EndlessPoolsUdp?: {
        sendPacket: (options: { hex: string; targetIp: string; targetPort: number }) => Promise<void>;
      } } } }).Capacitor;
      const plugin = cap?.Plugins?.EndlessPoolsUdp;
      if (plugin) {
        plugin.sendPacket({
          hex: this.bytesToHex(packet),
          targetIp: this.poolIp,
          targetPort: 9750
        });
      }
    }

    this.notifyStatus();

    // 200ms spacing between distinct commands prevents UDP buffer overflows on pool hardware
    setTimeout(() => {
      this.isProcessingQueue = false;
      this.processQueue();
    }, 200);
  }

  public startMotor(): void {
    this.sendCommand(0x1F, 0);
  }

  public stopMotor(): void {
    this.sendCommand(0x21, 0);
  }

  public pauseWorkout(): void {
    this.sendCommand(0x22, 0);
  }

  public resumeWorkout(): void {
    this.sendCommand(0x23, 0);
  }

  public setPace(paceSec100m: number): void {
    this.sendCommand(0x24, paceSec100m);
  }

  public setDuration(durationSec: number): void {
    this.sendCommand(0x25, durationSec);
  }

  public addTelemetryListener(cb: (t: EPTelemetry) => void): () => void {
    this.telemetryListeners.push(cb);
    return () => {
      this.telemetryListeners = this.telemetryListeners.filter(l => l !== cb);
    };
  }

  public addStatusListener(cb: (s: PoolConnectionStatus) => void): () => void {
    this.statusListeners.push(cb);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== cb);
    };
  }

  private notifyTelemetry(t: EPTelemetry): void {
    this.telemetryListeners.forEach(l => l(t));
  }

  private notifyStatus(): void {
    const s = this.getStatus();
    this.statusListeners.forEach(l => l(s));
  }

  private cleanup(): void {
    this.commandQueue = [];
    this.isProcessingQueue = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
}

export const poolConnection = new PoolConnectionManager();
