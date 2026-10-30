import React, { useState, useEffect } from 'react';
import { AppSettings, SwimWorkout } from './types/workout';
import { loadSettings, saveSettings, loadWorkouts, saveWorkout, deleteWorkout } from './services/storage';
import { PoolConnectionStatus, poolConnection } from './services/poolConnection';
import { audioCoach } from './services/audioCoach';
import { updateService, UpdateInfo } from './services/updateService';
import { QuickWorkoutBuilder } from './components/QuickWorkoutBuilder';
import { PoolsideHUD } from './components/PoolsideHUD';
import { SettingsModal } from './components/SettingsModal';
import { ConnectionModal } from './components/ConnectionModal';
import { SavedWorkoutsModal } from './components/SavedWorkoutsModal';
import { ProposalModal } from './components/ProposalModal';
import { UpdateModal } from './components/UpdateModal';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [workouts, setWorkouts] = useState<SwimWorkout[]>(loadWorkouts());
  const [activeWorkout, setActiveWorkout] = useState<SwimWorkout | null>(null);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConnectionOpen, setIsConnectionOpen] = useState(false);
  const [isSavedWorkoutsOpen, setIsSavedWorkoutsOpen] = useState(false);
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  // Real connection status
  const [connectionStatus, setConnectionStatus] = useState<PoolConnectionStatus>(poolConnection.getStatus());

  useEffect(() => {
    const unSub = poolConnection.addStatusListener((s) => setConnectionStatus(s));
    
    audioCoach.setSettings(
      settings.voiceCoachingEnabled,
      settings.audioChimesEnabled,
      settings.voiceVolume,
      settings.chimeVolume
    );
    if (settings.preferredVoiceURI) {
      audioCoach.setPreferredVoice(settings.preferredVoiceURI);
    }

    // Auto-check for updates on app launch if enabled (Free Git Hosting)
    if (settings.autoCheckUpdates !== false) {
      updateService.checkForUpdate(settings.gitUpdateRepo)
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
    if (newSettings.preferredVoiceURI) {
      audioCoach.setPreferredVoice(newSettings.preferredVoiceURI);
    }
  };

  const handleSaveWorkout = (w: SwimWorkout) => {
    saveWorkout(w);
    setWorkouts(loadWorkouts());
    audioCoach.speak('Workout saved to library.');
  };

  const handleDeleteWorkout = (id: string) => {
    deleteWorkout(id);
    setWorkouts(loadWorkouts());
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
      className="min-h-screen w-full bg-[#f0f9ff] text-slate-900 flex flex-col justify-between px-3 sm:px-4 select-none overflow-x-hidden"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 36px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)'
      }}
    >
      <div className="w-full max-w-sm sm:max-w-md mx-auto flex-1 flex flex-col justify-between">
        {/* Top Navbar: Compact, solid, fits all screens from 320px to 1024px without overflow */}
        <header className="w-full flex items-center justify-between pb-2 mb-2 border-b border-water-200">
          <div className="min-w-0 pr-2">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-water-950 font-sans leading-none truncate">
              HydroPulse
            </h1>
            <span className="text-[10px] text-slate-400 font-medium leading-none block mt-1 truncate">
              Endless Pools Companion
            </span>
          </div>

          {/* Top Actions: Compact, matching h-7.5 (30px) height, guaranteed no overflow */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsConnectionOpen(true)}
              className={`h-7 px-2 rounded-lg border text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 ${
                connectionStatus.connected
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-water-300 text-slate-600 hover:bg-water-50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus.connected ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
              {connectionStatus.connected ? 'Online' : 'Pool'}
            </button>

            <button
              type="button"
              onClick={() => setIsSavedWorkoutsOpen(true)}
              className="h-7 px-2 rounded-lg bg-white hover:bg-water-50 text-slate-700 border border-water-300 text-[10px] font-bold transition-all flex items-center justify-center"
            >
              Library
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="h-7 px-2 rounded-lg bg-white hover:bg-water-50 text-slate-700 border border-water-300 text-[10px] font-bold transition-all flex items-center justify-center"
            >
              Settings
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="w-full flex-1 flex flex-col justify-start">
          <QuickWorkoutBuilder
            settings={settings}
            onStartWorkout={(w) => setActiveWorkout(w)}
            onSaveWorkout={handleSaveWorkout}
          />
        </main>

        {/* Bottom Footer: Ultra-compact, unobtrusive */}
        <footer className="w-full pt-2 mt-2 border-t border-water-200 flex items-center justify-between text-[10px] text-slate-400">
          <span>Pixel 8 UDP Multicast</span>
          <button
            type="button"
            onClick={() => setIsProposalOpen(true)}
            className="text-[10px] text-water-700 hover:underline font-bold"
          >
            Acquisition Brief
          </button>
        </footer>
      </div>

      {/* Modals */}
      <SettingsModal
        settings={settings}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleUpdateSettings}
        onOpenUpdateModal={(info) => {
          setUpdateInfo(info);
          setIsUpdateOpen(true);
        }}
      />

      <ConnectionModal
        isOpen={isConnectionOpen}
        onClose={() => setIsConnectionOpen(false)}
      />

      <SavedWorkoutsModal
        isOpen={isSavedWorkoutsOpen}
        onClose={() => setIsSavedWorkoutsOpen(false)}
        workouts={workouts}
        onSelectWorkout={(w) => setActiveWorkout(w)}
        onDeleteWorkout={handleDeleteWorkout}
      />

      <ProposalModal
        isOpen={isProposalOpen}
        onClose={() => setIsProposalOpen(false)}
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
