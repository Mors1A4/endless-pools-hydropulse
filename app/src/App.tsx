import React, { useState, useEffect } from 'react';
import { AppSettings, SwimWorkout } from './types/workout';
import { loadSettings, saveSettings } from './services/storage';
import { PoolConnectionStatus, poolConnection } from './services/poolConnection';
import { audioCoach } from './services/audioCoach';
import { updateService, UpdateInfo } from './services/updateService';
import { QuickWorkoutBuilder } from './components/QuickWorkoutBuilder';
import { PoolsideHUD } from './components/PoolsideHUD';
import { SettingsModal } from './components/SettingsModal';
import { ConnectionModal } from './components/ConnectionModal';
import { UpdateModal } from './components/UpdateModal';
import { VoiceEnrollmentModal } from './components/VoiceEnrollmentModal';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [activeWorkout, setActiveWorkout] = useState<SwimWorkout | null>(null);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [isVoiceEnrollmentOpen, setIsVoiceEnrollmentOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // Pool connection status
  const [connectionStatus, setConnectionStatus] = useState<PoolConnectionStatus>(poolConnection.getStatus());

  useEffect(() => {
    const unSub = poolConnection.addStatusListener((s) => setConnectionStatus(s));
    
    audioCoach.setSettings(
      settings.voiceCoachingEnabled,
      settings.audioChimesEnabled,
      settings.voiceVolume,
      settings.chimeVolume
    );

    // Silent check for new updates on launch
    if (settings.autoCheckUpdates !== false) {
      updateService.checkForUpdate()
        .then((info) => {
          if (info.available) {
            setUpdateInfo(info);
            setIsUpdateOpen(true);
          }
        })
        .catch(() => {});
    }

    return () => unSub();
  }, []);

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    audioCoach.setSettings(
      newSettings.voiceCoachingEnabled,
      newSettings.audioChimesEnabled,
      newSettings.voiceVolume,
      newSettings.chimeVolume
    );
  };

  if (activeWorkout) {
    return (
      <PoolsideHUD
        workout={activeWorkout}
        settings={settings}
        onExit={() => setActiveWorkout(null)}
      />
    );
  }

  return (
    <div 
      className="min-h-screen w-full bg-[#f0f9ff] text-slate-900 flex flex-col justify-start px-3.5 sm:px-4 select-none overflow-x-hidden"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)'
      }}
    >
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex-1 flex flex-col justify-start">
        {/* Top Navbar: Clean, minimal header with zero clutter */}
        <header className="w-full flex items-center justify-between pb-1.5 border-b border-water-200">
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-water-950 leading-none">
              HydroPulse
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsConnectionOpen(true)}
              className={`h-7 px-2.5 rounded-xl border text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1.5 ${
                connectionStatus.connected
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-water-300 text-slate-600 hover:bg-water-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${connectionStatus.connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {connectionStatus.connected ? 'Ready' : 'Searching'}
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="h-7 px-2.5 rounded-xl bg-white hover:bg-water-50 text-slate-700 border border-water-300 text-[11px] sm:text-xs font-bold transition-all"
            >
              Settings
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="w-full flex-1 flex flex-col justify-start pt-1.5">
          <QuickWorkoutBuilder
            settings={settings}
            onStartWorkout={(w) => setActiveWorkout(w)}
          />
        </main>
      </div>

      {/* Modals */}
      <SettingsModal
        settings={settings}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleUpdateSettings}
        onOpenVoiceEnrollment={() => setIsVoiceEnrollmentOpen(true)}
      />

      <VoiceEnrollmentModal
        isOpen={isVoiceEnrollmentOpen}
        onClose={() => setIsVoiceEnrollmentOpen(false)}
      />

      <ConnectionModal
        isOpen={isConnectionOpen}
        onClose={() => setIsConnectionOpen(false)}
      />

      <UpdateModal
        isOpen={isUpdateOpen}
        updateInfo={updateInfo}
        onClose={() => setIsUpdateOpen(false)}
      />
    </div>
  );
};

export default App;
