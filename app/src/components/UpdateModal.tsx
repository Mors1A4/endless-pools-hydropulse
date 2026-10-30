import React, { useState } from 'react';
import { UpdateInfo, updateService } from '../services/updateService';

interface UpdateModalProps {
  updateInfo: UpdateInfo | null;
  isOpen: boolean;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  updateInfo,
  isOpen,
  onClose
}) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  if (!isOpen || !updateInfo) return null;

  const handleInstall = async () => {
    setIsInstalling(true);
    setDownloadPercent(0);
    setStatusMessage('Downloading update...');
    try {
      const ok = await updateService.installUpdate(
        updateInfo.apkUrl,
        (pct) => {
          setDownloadPercent(pct);
          if (pct < 100) {
            setStatusMessage(`Downloading... ${pct}%`);
          } else {
            setStatusMessage('Installing...');
          }
        }
      );

      if (!ok) {
        setStatusMessage('Follow Android screen prompt');
      }
    } catch {
      setStatusMessage('Download error');
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="w-full max-w-xs bg-white rounded-3xl p-5 space-y-4 text-slate-900 shadow-xl border border-water-200 text-center">
        <h3 className="text-base font-black text-slate-900 uppercase tracking-wide">
          Update Available
        </h3>

        <div className="p-3 bg-water-50 rounded-2xl border border-water-200 flex items-center justify-around font-mono text-xs">
          <span className="text-slate-500 font-bold">v{updateInfo.currentVersion}</span>
          <span className="text-water-600 font-black">{'->'}</span>
          <span className="text-water-900 font-black">v{updateInfo.latestVersion}</span>
        </div>

        {isInstalling && (
          <div className="space-y-1.5 p-3 rounded-2xl bg-water-50 border border-water-200">
            <div className="flex justify-between text-xs font-mono font-bold text-slate-700">
              <span>{statusMessage}</span>
              <span>{downloadPercent}%</span>
            </div>
            <div className="w-full bg-water-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-water-600 h-full rounded-full transition-all duration-200"
                style={{ width: `${downloadPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleInstall}
            disabled={isInstalling}
            className={`w-full h-12 rounded-2xl text-white font-black text-xs uppercase tracking-wider transition-all ${
              isInstalling
                ? 'bg-water-400 cursor-not-allowed'
                : 'bg-water-600 hover:bg-water-700 active:bg-water-800'
            }`}
          >
            {isInstalling ? 'DOWNLOADING...' : 'UPDATE NOW'}
          </button>

          {!isInstalling && (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase"
            >
              LATER
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
