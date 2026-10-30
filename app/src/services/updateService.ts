/**
 * Free Auto-Update System for HydroPulse using Free Git Hosting (GitHub Releases & raw git manifest)
 * 
 * Works 100% free with no backend server required:
 * - Checks GitHub Releases API: https://api.github.com/repos/{owner}/{repo}/releases/latest
 * - Fallback to raw Git manifest: https://raw.githubusercontent.com/{owner}/{repo}/main/version.json
 * - Detects new version APK assets (e.g. hydropulse.apk)
 * - Invokes native Android package installer via FileProvider or browser download
 */

import { registerPlugin } from '@capacitor/core';

export const CURRENT_APP_VERSION = '2.5.3';
export const DEFAULT_GIT_REPO = 'Mors1A4/endless-pools-hydropulse';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  apkUrl: string;
  apkSize?: number;
  htmlUrl: string;
  isFallback?: boolean;
  error?: string;
}

export type ProgressCallback = (percent: number, bytesRead: number, totalBytes: number) => void;

interface NativeUdpPlugin {
  downloadAndInstallApk?: (options: { apkUrl: string }) => Promise<{ success: boolean; message?: string }>;
  openExternalUrl?: (options: { url: string }) => Promise<void>;
  addListener?: (eventName: string, listenerFunc: (data: any) => void) => Promise<any>;
}

const NativePlugin = registerPlugin<NativeUdpPlugin>('EndlessPoolsUdp');

/**
 * Compares two semantic version strings (e.g. "v1.1.0" vs "1.0.0")
 * Returns true if remote is strictly newer than current.
 */
export function isNewerVersion(remote: string, current: string): boolean {
  const clean = (v: string) => v.replace(/^v/i, '').trim();
  const rParts = clean(remote).split('.').map(n => parseInt(n, 10) || 0);
  const cParts = clean(current).split('.').map(n => parseInt(n, 10) || 0);

  const len = Math.max(rParts.length, cParts.length);
  for (let i = 0; i < len; i++) {
    const r = rParts[i] ?? 0;
    const c = cParts[i] ?? 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

class UpdateService {
  /**
   * Checks the configured Git repository for new releases
   */
  async checkForUpdate(repoSlug: string = DEFAULT_GIT_REPO): Promise<UpdateInfo> {
    const cleanRepo = repoSlug.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');

    // 1. First attempt: Official GitHub Releases API (Free, CDN-backed)
    try {
      const res = await fetch(`https://api.github.com/repos/${cleanRepo}/releases/latest`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (res.ok) {
        const data = await res.json();
        const latestTag = data.tag_name || data.name || '';
        const isNewer = isNewerVersion(latestTag, CURRENT_APP_VERSION);

        // Find .apk asset attached to the release
        const apkAsset = Array.isArray(data.assets) 
          ? data.assets.find((a: any) => a.name && a.name.toLowerCase().endsWith('.apk'))
          : null;

        const apkUrl = apkAsset?.browser_download_url || 
          `https://github.com/${cleanRepo}/releases/download/${latestTag}/hydropulse.apk`;

        return {
          available: isNewer,
          currentVersion: CURRENT_APP_VERSION,
          latestVersion: latestTag.replace(/^v/i, ''),
          releaseName: data.name || `Version ${latestTag}`,
          releaseNotes: data.body || 'Performance improvements and swimming engine stability updates.',
          publishedAt: data.published_at || new Date().toISOString(),
          apkUrl,
          apkSize: apkAsset?.size,
          htmlUrl: data.html_url || `https://github.com/${cleanRepo}/releases`
        };
      }
    } catch {
      // API request failed or rate-limited, fall through to raw git fallback
    }

    // 2. Fallback: Raw Git manifest version.json (Zero rate limits, completely free)
    try {
      const rawRes = await fetch(`https://raw.githubusercontent.com/${cleanRepo}/main/version.json`, {
        cache: 'no-cache'
      });

      if (rawRes.ok) {
        const rawData = await rawRes.json();
        const latestVersion = rawData.version || '';
        const isNewer = isNewerVersion(latestVersion, CURRENT_APP_VERSION);

        return {
          available: isNewer,
          currentVersion: CURRENT_APP_VERSION,
          latestVersion: latestVersion.replace(/^v/i, ''),
          releaseName: rawData.name || `Version ${latestVersion}`,
          releaseNotes: rawData.notes || 'Routine swim workout engine updates.',
          publishedAt: rawData.publishedAt || new Date().toISOString(),
          apkUrl: rawData.apkUrl || `https://github.com/${cleanRepo}/releases/download/v${latestVersion}/hydropulse.apk`,
          apkSize: rawData.apkSize,
          htmlUrl: rawData.htmlUrl || `https://github.com/${cleanRepo}`,
          isFallback: true
        };
      }
    } catch {
      // Both GitHub endpoints unreachable
    }

    // No update found or network error
    return {
      available: false,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: CURRENT_APP_VERSION,
      releaseName: `HydroPulse v${CURRENT_APP_VERSION}`,
      releaseNotes: 'GitHub repository not published online or unreachable.',
      publishedAt: new Date().toISOString(),
      apkUrl: '',
      htmlUrl: `https://github.com/${cleanRepo}`,
      error: `Repository ${cleanRepo} not found on GitHub`
    };
  }

  /**
   * Generates a sample update prompt object for immediate in-app UI testing
   */
  getDemoUpdateInfo(): UpdateInfo {
    return {
      available: true,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: '2.1.0',
      releaseName: 'HydroPulse v2.1.0 Update',
      releaseNotes: '- In-app native APK installer with real-time download progress bar\n- Top-positioned Start and Stop buttons (no scrolling, safe from back button)\n- Hands-Free Voice Commands for wet hands ("start", "stop", "pause", "up 5")\n- 1-to-52 Speed Notches calibrated for Endless Pools\n- Multi-device athletic layout verified on Google Pixel 8',
      publishedAt: new Date().toISOString(),
      apkUrl: `https://github.com/${DEFAULT_GIT_REPO}/releases/download/v2.1.0/hydropulse.apk`,
      apkSize: 4269734,
      htmlUrl: `https://github.com/${DEFAULT_GIT_REPO}/releases`
    };
  }

  /**
   * Installs the new APK natively inside the app with real-time progress callbacks
   */
  async installUpdate(apkUrl: string, onProgress?: ProgressCallback): Promise<boolean> {
    if (!apkUrl) return false;

    const isNative = typeof (window as any).Capacitor !== 'undefined' && 
                     (window as any).Capacitor.isNativePlatform();

    if (isNative && NativePlugin.downloadAndInstallApk) {
      try {
        // Register native download progress listener
        if (NativePlugin.addListener && onProgress) {
          await NativePlugin.addListener('updateProgress', (data: any) => {
            if (data && typeof data.progress === 'number') {
              onProgress(data.progress, data.bytesRead || 0, data.totalBytes || 0);
            }
          });
        }

        await NativePlugin.downloadAndInstallApk({ apkUrl });
        return true;
      } catch (err) {
        console.warn('Native APK installer error:', err);
      }
    }

    // Web preview or fallback: simulate progress step-by-step
    if (onProgress) {
      for (let p = 15; p <= 90; p += 25) {
        await new Promise(r => setTimeout(r, 200));
        onProgress(p, Math.round((p / 100) * 4167586), 4167586);
      }
      await new Promise(r => setTimeout(r, 200));
      onProgress(100, 4167586, 4167586);
    }

    // Direct browser fallback if outside native wrapper
    window.open(apkUrl, '_blank');
    return true;
  }

  /**
   * Opens the release notes or repository page in browser
   */
  async openReleasePage(url: string): Promise<void> {
    const isNative = typeof (window as any).Capacitor !== 'undefined' && 
                     (window as any).Capacitor.isNativePlatform();

    if (isNative && NativePlugin.openExternalUrl) {
      try {
        await NativePlugin.openExternalUrl({ url });
        return;
      } catch {}
    }
    window.open(url, '_blank');
  }
}

export const updateService = new UpdateService();
