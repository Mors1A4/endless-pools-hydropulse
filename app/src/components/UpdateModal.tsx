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
  const [downloadBytesText, setDownloadBytesText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');

  if (!isOpen || !updateInfo) return null;

  const handleInstall = async () => {
    setIsInstalling(true);
    setDownloadPercent(0);
    setStatusMessage('Downloading new APK natively...');
    try {
      const ok = await updateService.installUpdate(
        updateInfo.apkUrl,
        (pct, bytesRead, totalBytes) => {
          setDownloadPercent(pct);
          if (totalBytes > 0) {
            setDownloadBytesText(
              `${(bytesRead / (1024 * 1024)).toFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
            );
          }
          if (pct < 100) {
            setStatusMessage(`Downloading update... ${pct}%`);
          } else {
            setStatusMessage('Download complete. Launching Android installer...');
          }
        }
      );

      if (ok) {
        setStatusMessage('Follow Android system prompt to complete install.');
      } else {
        setStatusMessage('Install initiated. Check notifications.');
      }
    } catch (e: any) {
      setStatusMessage(`Update error: ${e?.message || 'Check network connection'}`);
      setIsInstalling(false);
    }
  };

  const handleOpenReleaseNotes = () => {
    if (updateInfo.htmlUrl) {
      updateService.openReleasePage(updateInfo.htmlUrl);
    }
  };

  const sizeFormatted = updateInfo.apkSize 
    ? `${(updateInfo.apkSize / (1024 * 1024)).toFixed(1)} MB`
    : '4.2 MB';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md bg-white border border-water-300 rounded-2xl p-5 space-y-4 text-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-water-200">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-water-700 block">
              In-App Auto-Update System
            </span>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              New Version Available
            </h3>
          </div>
          {!isInstalling && (
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 rounded-lg bg-water-50 text-slate-600 hover:text-slate-900 font-bold text-xs"
            >
              Close
            </button>
          )}
        </div>

        {/* Version Badge Box */}
        <div className="p-3 bg-water-50/80 rounded-xl border border-water-200 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 font-medium block">Installed</span>
            <span className="text-xs font-bold font-mono text-slate-700">
              v{updateInfo.currentVersion}
            </span>
          </div>

          <span className="text-xs font-black text-water-600 px-2 py-0.5 bg-white rounded border border-water-200 font-mono">
            {'->'}
          </span>

          <div className="text-right">
            <span className="text-[10px] text-water-700 font-bold block">Available</span>
            <span className="text-xs font-black font-mono text-water-900">
              v{updateInfo.latestVersion}
            </span>
          </div>
        </div>

        {/* Release Title & Size */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-800">{updateInfo.releaseName}</span>
            <span className="font-mono text-slate-500 text-[11px]">{sizeFormatted}</span>
          </div>

          {/* Release Notes */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-36 overflow-y-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Release Notes
            </span>
            <p className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
              {updateInfo.releaseNotes}
            </p>
          </div>
        </div>

        {/* Live In-App Progress Bar (Shown while downloading) */}
        {isInstalling && (
          <div className="space-y-1.5 p-3 rounded-xl bg-water-50 border border-water-300">
            <div className="flex justify-between text-xs font-mono font-bold text-water-900">
              <span className="truncate pr-2">{statusMessage}</span>
              <span>{downloadPercent}%</span>
            </div>
            <div className="w-full bg-water-200 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-water-600 h-full rounded-full transition-all duration-200"
                style={{ width: `${downloadPercent}%` }}
              />
            </div>
            {downloadBytesText && (
              <span className="text-[10px] text-slate-500 font-mono block text-right">
                {downloadBytesText}
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleInstall}
            disabled={isInstalling}
            className={`w-full py-3.5 rounded-xl text-white font-black text-xs uppercase tracking-wider transition-all shadow-sm ${
              isInstalling
                ? 'bg-water-400 cursor-not-allowed'
                : 'bg-water-600 hover:bg-water-700 active:scale-95'
            }`}
          >
            {isInstalling ? 'DOWNLOADING & INSTALLING...' : 'INSTALL UPDATE NATIVELY NOW'}
          </button>

          {!isInstalling && (
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleOpenReleaseNotes}
                className="text-xs font-bold text-water-700 hover:text-water-900"
              >
                View on GitHub
              </button>

              <button
                type="button"
                onClick={onClose}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Remind Me Later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
