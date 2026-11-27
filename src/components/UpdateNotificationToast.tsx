import React from 'react';
import { Rocket, RefreshCw, X, Sparkles, ArrowRight } from 'lucide-react';

interface Props {
  updateAvailable: boolean;
  newVersion: string;
  isUpdating: boolean;
  onApplyUpdate: () => void;
  onDismiss: () => void;
}

export const UpdateNotificationToast: React.FC<Props> = ({
  updateAvailable,
  newVersion,
  isUpdating,
  onApplyUpdate,
  onDismiss,
}) => {
  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/95 border-2 border-cyan-400 rounded-2xl p-4 sm:p-5 shadow-[0_20px_50px_-10px_rgba(6,182,212,0.5),0_0_30px_rgba(16,185,129,0.3)] backdrop-blur-xl text-slate-100 flex flex-col gap-3.5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 shrink-0 animate-bounce">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-black text-white tracking-tight flex items-center gap-1.5">
                  <span>Application Update Ready!</span>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-700">
                  {newVersion}
                </span>
              </div>
              <p className="text-xs text-cyan-200/90 font-medium leading-tight mt-0.5">
                A new version has been deployed to this link.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss notification"
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informative reassurance */}
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
          Click <strong className="text-cyan-300">Update Now</strong> to apply the latest optimizations and features. Your current audit data and drafted inspections will remain completely intact.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={onApplyUpdate}
            disabled={isUpdating}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 hover:from-blue-500 hover:via-cyan-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-cyan-500/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 active:scale-[0.99]"
          >
            {isUpdating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Updating Application...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Update Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};
