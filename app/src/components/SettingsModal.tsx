import React, { useState } from 'react';
import { AppSettings } from '../types/workout';

interface SettingsModalProps {
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
  onSave
}) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 text-slate-900 shadow-xl border border-water-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-water-200">
          <h3 className="text-lg font-black text-slate-900 uppercase tracking-wide">
            Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-xl bg-water-50 hover:bg-water-100 text-slate-600 font-bold text-xs"
          >
            Close
          </button>
        </div>

        {/* 1. Voice Commands Toggle */}
        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-sm font-bold text-slate-900 block">
              Voice Commands
            </span>
            <span className="text-xs text-slate-400">
              Wet hands mic control
            </span>
          </div>

          <button
            type="button"
            onClick={() => setLocalSettings({ ...localSettings, voiceCommandsEnabled: !localSettings.voiceCommandsEnabled })}
            className={`h-9 px-4 rounded-xl text-xs font-black transition-all border ${
              localSettings.voiceCommandsEnabled
                ? 'bg-water-600 text-white border-water-600'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {localSettings.voiceCommandsEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* 2. Voice Announcements Toggle */}
        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-sm font-bold text-slate-900 block">
              Voice Announcements
            </span>
            <span className="text-xs text-slate-400">
              Spoken countdowns
            </span>
          </div>

          <button
            type="button"
            onClick={() => setLocalSettings({ ...localSettings, voiceCoachingEnabled: !localSettings.voiceCoachingEnabled })}
            className={`h-9 px-4 rounded-xl text-xs font-black transition-all border ${
              localSettings.voiceCoachingEnabled
                ? 'bg-water-600 text-white border-water-600'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {localSettings.voiceCoachingEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* 3. Voice Volume Slider */}
        {localSettings.voiceCoachingEnabled && (
          <div className="space-y-1.5 py-1">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span>Volume</span>
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
        )}

        {/* 4. Keep Screen Awake */}
        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-sm font-bold text-slate-900 block">
              Keep Screen Awake
            </span>
            <span className="text-xs text-slate-400">
              Prevent phone sleep
            </span>
          </div>

          <button
            type="button"
            onClick={() => setLocalSettings({ ...localSettings, keepScreenOn: !localSettings.keepScreenOn })}
            className={`h-9 px-4 rounded-xl text-xs font-black transition-all border ${
              localSettings.keepScreenOn
                ? 'bg-water-600 text-white border-water-600'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {localSettings.keepScreenOn ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Done / Save Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="w-full h-12 rounded-2xl bg-water-600 hover:bg-water-700 active:bg-water-800 text-white font-black text-sm uppercase tracking-wider transition-all"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
