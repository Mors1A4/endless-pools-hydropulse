/**
 * Screen WakeLock Service
 * Keeps phone screen awake at the pool edge during active swim workouts
 */

class WakeLockService {
  private sentinel: WakeLockSentinel | null = null;
  private isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  public async requestWakeLock(): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
      return true;
    } catch {
      return false;
    }
  }

  public releaseWakeLock(): void {
    if (this.sentinel) {
      try {
        this.sentinel.release();
      } catch {
        // Ignored
      }
      this.sentinel = null;
    }
  }

  public isActive(): boolean {
    return this.sentinel !== null;
  }
}

export const wakeLock = new WakeLockService();
