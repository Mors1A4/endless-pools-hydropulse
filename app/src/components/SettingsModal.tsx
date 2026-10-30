import React, { useState } from 'react';
import { AppSettings, SpeedUnit } from '../types/workout';
import { audioCoach } from '../services/audioCoach';
import { updateService, CURRENT_APP_VERSION, UpdateInfo } from '../services/updateService';

interface SettingsModalProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => void;
  onOpenUpdateModal?: (info: UpdateInfo) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onSave,
  onOpenUpdateModal
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [foundUpdate, setFoundUpdate] = useState<UpdateInfo | null>(null);

  const availableVoices = audioCoach.getAvailableVoices();

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const handleManualCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('Checking GitHub for new releases...');
    try {
      const info = await updateService.checkForUpdate(localSettings.gitUpdateRepo);
      if (info.available) {
        setFoundUpdate(info);
        setUpdateStatus(`Update available: v${info.latestVersion}`);
        if (onOpenUpdateModal) {
          onOpenUpdateModal(info);
        }
      } else {
        setFoundUpdate(null);
        if (info.error) {
          setUpdateStatus(`GitHub repo not found online yet. Tap [Test Prompt] to preview.`);
        } else {
          setUpdateStatus(`HydroPulse v${CURRENT_APP_VERSION} is the latest version.`);
        }
      }
    } catch (e: any) {
      setUpdateStatus(`Error checking updates: ${e?.message || 'Check connection'}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const speedUnits: { id: SpeedUnit; label: string; desc: string }[] = [
    { id: 'notches', label: 'Speed Notches (1 to 52)', desc: 'Direct click scale from slowest (1) to fastest (52) - Recommended' },
    { id: 'pace100m', label: 'Pace (min:sec / 100m)', desc: 'Standard international swim pace' },
    { id: 'pace100yd', label: 'Pace (min:sec / 100yd)', desc: 'Standard short-course yard pace' },
    { id: 'percent', label: 'Percentage (0–100%)', desc: 'Endless Pools hydraulic current percentage' },
    { id: 'mph', label: 'Speed (Miles / hr)', desc: 'Water velocity in miles per hour' },
    { id: 'kph', label: 'Speed (km / hr)', desc: 'Water velocity in kilometers per hour' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md bg-white border border-water-300 rounded-2xl p-5 space-y-4 max-h-[88vh] overflow-y-auto text-slate-900 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-water-200">
          <h3 className="text-xl font-bold text-slate-900">Settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-water-50 text-slate-600 hover:text-slate-900 font-bold text-xs"
          >
            Close
          </button>
        </div>

        {/* Optional Swimmer Name on this Phone */}
        <div className="space-y-1.5 p-3.5 rounded-xl bg-water-50 border border-water-200">
          <label className="text-xs font-bold text-slate-800 block">
            Swimmer Name (Optional)
          </label>
          <input
            type="text"
            value={localSettings.swimmerName || ''}
            onChange={(e) => setLocalSettings({ ...localSettings, swimmerName: e.target.value })}
            placeholder="e.g. Dad, Mum, or leave blank"
            className="w-full bg-white border border-water-300 rounded-lg p-2 text-xs text-slate-800"
          />
          <span className="text-[11px] text-slate-500 block">
            Identifies saved workouts on this phone.
          </span>
        </div>

        {/* Speed Unit Preference */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-900 block">
            Speed Display Unit
          </label>
          <div className="space-y-1.5">
            {speedUnits.map((u) => (
              <label
                key={u.id}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  localSettings.speedUnit === u.id
                    ? 'bg-water-50 border-water-500 text-water-900 font-bold'
                    : 'bg-white border-water-200 text-slate-700 hover:bg-water-50'
                }`}
              >
                <input
                  type="radio"
                  name="speedUnit"
                  checked={localSettings.speedUnit === u.id}
                  onChange={() => setLocalSettings({ ...localSettings, speedUnit: u.id })}
                  className="mt-1 accent-water-600"
                />
                <div>
                  <span className="font-bold text-sm block">{u.label}</span>
                  <span className="text-xs text-slate-500">{u.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Voice Coaching & Audio */}
        <div className="space-y-3 p-4 rounded-xl bg-water-50 border border-water-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-900 block">Voice Coaching</span>
              <span className="text-xs text-slate-500">Spoken interval transitions and countdowns</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.voiceCoachingEnabled}
              onChange={(e) => setLocalSettings({ ...localSettings, voiceCoachingEnabled: e.target.checked })}
              className="w-5 h-5 accent-water-600 cursor-pointer"
            />
          </div>

          {/* Hands-Free Voice Commands */}
          <div className="flex items-center justify-between pt-2 border-t border-water-200">
            <div>
              <span className="text-sm font-bold text-slate-900 block">Voice Commands (Wet Hands)</span>
              <span className="text-xs text-slate-500">Listens for code words "Start", "Stop", "Pause", "Up 5"</span>
            </div>
            <input
              type="checkbox"
              checked={localSettings.voiceCommandsEnabled}
              onChange={(e) => setLocalSettings({ ...localSettings, voiceCommandsEnabled: e.target.checked })}
              className="w-5 h-5 accent-water-600 cursor-pointer"
            />
          </div>

          {localSettings.voiceCoachingEnabled && (
            <div className="space-y-3 pt-2 border-t border-water-200">
              {availableVoices.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-600 font-bold">Select Voice</label>
                  <select
                    value={localSettings.preferredVoiceURI}
                    onChange={(e) => {
                      const uri = e.target.value;
                      setLocalSettings({ ...localSettings, preferredVoiceURI: uri });
                      audioCoach.setPreferredVoice(uri);
                      audioCoach.speak('Testing selected voice quality.');
                    }}
                    className="w-full bg-white border border-water-300 text-slate-900 rounded-lg p-2 text-xs font-mono"
                  >
                    <option value="">Default High-Quality Natural Voice</option>
                    {availableVoices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Volume Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600 font-bold">
                  <span>Voice Volume</span>
                  <span className="font-mono">{Math.round(localSettings.voiceVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={localSettings.voiceVolume}
                  onChange={(e) => setLocalSettings({ ...localSettings, voiceVolume: Number(e.target.value) })}
                  className="w-full accent-water-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Screen Keep-Awake */}
        <div className="p-4 rounded-xl bg-water-50 border border-water-200 flex items-center justify-between">
          <div>
            <span className="text-sm font-bold text-slate-900 block">Keep Screen Awake (WakeLock)</span>
            <span className="text-xs text-slate-500">Prevents Pixel 8 from sleeping during swim</span>
          </div>
          <input
            type="checkbox"
            checked={localSettings.keepScreenOn}
            onChange={(e) => setLocalSettings({ ...localSettings, keepScreenOn: e.target.checked })}
            className="w-5 h-5 accent-water-600 cursor-pointer"
          />
        </div>

        {/* Controller IP */}
        <div className="space-y-2 p-4 rounded-xl bg-water-50 border border-water-200">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-slate-900">
              Endless Pools Controller IP
            </label>
            <span className="text-xs text-slate-500">UDP Port 9750</span>
          </div>
          <input
            type="text"
            value={localSettings.poolIp}
            onChange={(e) => setLocalSettings({ ...localSettings, poolIp: e.target.value })}
            placeholder="255.255.255.255 or 192.168.1.xxx"
            className="w-full bg-white border border-water-300 rounded-lg p-2.5 text-sm font-mono text-slate-800"
          />
        </div>

        {/* Free Git Auto-Update System Card */}
        <div className="space-y-3 p-4 rounded-xl bg-water-50 border border-water-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-slate-900 block">
                Software Updates (Free Git Hosting)
              </span>
              <span className="text-xs text-slate-500">
                Installed: v{CURRENT_APP_VERSION}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (onOpenUpdateModal) {
                    onOpenUpdateModal(updateService.getDemoUpdateInfo());
                  }
                }}
                className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white border border-water-300 text-slate-700 hover:bg-water-50"
              >
                Test Prompt
              </button>

              <button
                type="button"
                onClick={handleManualCheckUpdate}
                disabled={isCheckingUpdate}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                  isCheckingUpdate
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-water-600 hover:bg-water-700 text-white'
                }`}
              >
                {isCheckingUpdate ? 'Checking...' : 'Check Now'}
              </button>
            </div>
          </div>

          {/* Git Repo Input */}
          <div className="space-y-1 pt-1">
            <label className="text-xs font-bold text-slate-700">GitHub Repository (Owner/Repo)</label>
            <input
              type="text"
              value={localSettings.gitUpdateRepo || ''}
              onChange={(e) => setLocalSettings({ ...localSettings, gitUpdateRepo: e.target.value })}
              placeholder="owner/repo (e.g. monty/endless-pools-hydropulse)"
              className="w-full bg-white border border-water-300 rounded-lg p-2 text-xs font-mono text-slate-800"
            />
          </div>

          {/* Auto-check on startup */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-600 font-medium">Auto-check on app launch</span>
            <input
              type="checkbox"
              checked={localSettings.autoCheckUpdates !== false}
              onChange={(e) => setLocalSettings({ ...localSettings, autoCheckUpdates: e.target.checked })}
              className="w-4 h-4 accent-water-600 cursor-pointer"
            />
          </div>

          {/* Status feedback */}
          {updateStatus && (
            <div className="p-2 rounded bg-white border border-water-200 text-xs font-mono text-slate-700 flex items-center justify-between">
              <span>{updateStatus}</span>
              {foundUpdate && onOpenUpdateModal && (
                <button
                  type="button"
                  onClick={() => onOpenUpdateModal(foundUpdate)}
                  className="px-2 py-0.5 rounded bg-water-600 text-white text-[11px] font-bold"
                >
                  View Update
                </button>
              )}
            </div>
          )}
        </div>

        {/* Save button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-3.5 rounded-xl bg-water-600 hover:bg-water-700 text-white font-bold text-sm uppercase tracking-wider active:scale-95 transition-all"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
