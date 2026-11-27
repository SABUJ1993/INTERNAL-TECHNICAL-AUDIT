import React from 'react';
import {
  LogOut,
  Building2,
  CheckSquare,
  FileText,
  History,
  Share2,
  RefreshCw,
  ClipboardCheck,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { AppTab, AuditorUser, ViewMode, AuditSection, CheckpointItem } from '../types/audit';
import { isAuditorAdmin } from '../services/firebase';

interface Props {
  currentTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  user: AuditorUser | null;
  onLogout: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  evaluatedCount: number;
  totalCheckpoints: number;
  currentPercentage: number;
  hasCritical: boolean;
  isSaved: boolean;
  onOpenShareModal?: () => void;
  sections?: AuditSection[];
  activeSectionId?: string;
  onSelectSection?: (sectionId: string) => void;
  isLiveConnected?: boolean;
  syncMessage?: string;
  onManualSync?: () => void;
  updateAvailable?: boolean;
  onApplyUpdate?: () => void;
  openCapCount?: number;
  totalCapCount?: number;
  liveDraftCount?: number;
}

export const Header: React.FC<Props> = ({
  currentTab,
  onTabChange,
  user,
  onLogout,
  evaluatedCount,
  totalCheckpoints,
  currentPercentage,
  hasCritical,
  isSaved,
  onOpenShareModal,
  sections = [],
  activeSectionId,
  onSelectSection,
  isLiveConnected = true,
  syncMessage,
  onManualSync,
  updateAvailable = false,
  onApplyUpdate,
  openCapCount = 0,
  totalCapCount = 0,
  liveDraftCount = 0,
}) => {
  const completionPercent = totalCheckpoints > 0 ? Math.round((evaluatedCount / totalCheckpoints) * 100) : 0;

  const isDeepGreen = currentPercentage >= 80 && !hasCritical;
  const isAmber = currentPercentage >= 60 && currentPercentage < 80 && !hasCritical;
  const isRed = currentPercentage < 60 || hasCritical;

  const scoreColorText = isDeepGreen
    ? 'text-emerald-300 font-extrabold'
    : isAmber
    ? 'text-amber-300 font-extrabold'
    : 'text-rose-300 font-extrabold';

  const badgeBg = isDeepGreen
    ? 'bg-emerald-500 text-white'
    : isAmber
    ? 'bg-amber-500 text-slate-950'
    : 'bg-rose-500 text-white';

  const isAdmin = isAuditorAdmin(user?.email);

  return (
    <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-800 via-blue-700 to-indigo-800 border-b border-blue-900 text-white shadow-md pt-[max(env(safe-area-inset-top),4px)]">
      {/* Top Tier Container: Full responsive width with max-w-[1720px] on desktop */}
      <div className="max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 py-2 sm:py-2.5 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Brand: Internal Technical Audit with App Icon */}
        <div className="flex items-center gap-2 shrink min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}app-icon.png`}
            alt="App Icon"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover shadow-sm border border-blue-300/40 bg-white shrink-0"
          />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-extrabold text-xs sm:text-base tracking-tight text-white truncate drop-shadow-xs">
              Internal Technical Audit
            </span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] uppercase font-bold rounded bg-blue-950/50 text-blue-100 border border-blue-400/40 shrink-0">
              QMS
            </span>
          </div>

          {/* Compact Mobile Score & Live indicator */}
          <div className="flex md:hidden items-center gap-1 shrink-0 ml-1">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeBg}`}>
              {currentPercentage}%
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                isLiveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
              title={syncMessage || 'Live Synced'}
            />
          </div>
        </div>

        {/* Live Score, Checkpoints & Cloud Sync Status - Visible on Tablet/Desktop */}
        <div className="hidden lg:flex items-center gap-3 bg-blue-950/45 px-3 py-1.5 rounded-xl border border-blue-400/25 text-xs backdrop-blur-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-blue-200 uppercase font-semibold">Score:</span>
            <span className={scoreColorText}>{currentPercentage}%</span>
            {isRed && (
              <span className="px-1.5 py-0.2 text-[9px] bg-rose-500 text-white rounded font-bold">
                Red
              </span>
            )}
            {isAmber && (
              <span className="px-1.5 py-0.2 text-[9px] bg-amber-400 text-slate-950 rounded font-bold">
                Amber
              </span>
            )}
            {isDeepGreen && (
              <span className="px-1.5 py-0.2 text-[9px] bg-emerald-500 text-white rounded font-bold">
                Green
              </span>
            )}
          </div>

          <div className="h-4 w-[1px] bg-blue-400/30" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-blue-200 uppercase font-semibold">Checkpoints:</span>
            <span className="font-bold text-white">
              {evaluatedCount}/{totalCheckpoints} ({completionPercent}%)
            </span>
          </div>

          <div className="h-4 w-[1px] bg-blue-400/30" />

          {/* Real-time Multi-device Cloud Sync Status */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isLiveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="font-medium text-blue-100 truncate max-w-[160px]">
              {syncMessage || (isSaved ? 'Live Synced' : 'Syncing...')}
            </span>
            {onManualSync && (
              <button
                type="button"
                onClick={onManualSync}
                title="Force Refresh Data from Cloud Server"
                className="p-1 rounded hover:bg-blue-700/70 text-blue-200 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right Actions: Signed-In User Identity (Name, Email, Role) + Share + Logout */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pr-1">
          {updateAvailable && onApplyUpdate && (
            <button
              type="button"
              onClick={onApplyUpdate}
              title="New update available! Click to refresh."
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 hover:from-cyan-300 hover:to-emerald-300 text-slate-950 text-[11px] font-extrabold shadow-xs animate-pulse cursor-pointer shrink-0"
            >
              <span>Update Available</span>
            </button>
          )}

          {/* Signed-in User Profile & Role Badge (Admin vs Auditor) */}
          {user && (
            <div
              className="flex items-center gap-2 px-2 py-1 sm:px-2.5 sm:py-1 rounded-xl bg-blue-950/55 border border-blue-400/35 shadow-xs max-w-[200px] sm:max-w-[300px]"
              title={`${user.name} (${user.email}) — ${isAdmin ? 'Admin' : 'Auditor'}`}
            >
              <div className="hidden sm:flex flex-col items-end leading-tight min-w-0">
                <div className="flex items-center gap-1.5 max-w-full">
                  <span className="text-[11px] font-extrabold text-white truncate">
                    {user.name || user.email?.split('@')[0]}
                  </span>
                </div>
                <span className="text-[10px] text-blue-200 font-mono truncate max-w-[180px]">
                  {user.email}
                </span>
              </div>

              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wide shrink-0 ${
                  isAdmin
                    ? 'bg-amber-400 text-slate-950 border border-amber-200 shadow-xs'
                    : 'bg-cyan-400/95 text-slate-950 border border-cyan-200 shadow-xs'
                }`}
              >
                {isAdmin ? (
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                ) : (
                  <UserCheck className="w-3 h-3 shrink-0" />
                )}
                <span>{isAdmin ? 'Admin' : 'Auditor'}</span>
              </span>
            </div>
          )}

          {onOpenShareModal && (
            <button
              onClick={onOpenShareModal}
              title="Share Web Link"
              className="p-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-600 text-blue-100 hover:text-white border border-blue-400/30 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}

          {user && (
            <button
              type="button"
              onClick={onLogout}
              title="Log Out of Auditor Account"
              className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-rose-500/90 hover:bg-rose-600 border border-rose-300/40 text-white transition-all text-xs font-bold cursor-pointer shrink-0 shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Compact User Identity Strip */}
      {user && (
        <div className="sm:hidden bg-blue-950/60 border-t border-blue-500/25 px-3 py-1 flex items-center justify-between gap-2 text-[10px]">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-extrabold text-white truncate">{user.name || user.email?.split('@')[0]}</span>
            <span className="text-blue-300">•</span>
            <span className="font-mono text-blue-200 truncate">{user.email}</span>
          </div>
          <span
            className={`px-1.5 py-0.2 rounded font-black uppercase shrink-0 ${
              isAdmin ? 'bg-amber-400 text-slate-950' : 'bg-cyan-400 text-slate-950'
            }`}
          >
            {isAdmin ? 'Admin' : 'Auditor'}
          </span>
        </div>
      )}

      {/* Main Tab Bar Navigation: Royal Blue sub-bar with crisp active white pills */}
      <div className="bg-blue-900/90 border-t border-blue-500/30 px-3 sm:px-6 lg:px-8 xl:px-10">
        <div className="max-w-[1720px] mx-auto flex items-center gap-2 overflow-x-auto py-2 no-scrollbar text-xs">
          <button
            onClick={() => onTabChange('pre-audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'pre-audit'
                ? 'bg-white text-blue-800 shadow-sm'
                : 'text-blue-100 hover:bg-blue-800/80 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>1. Pre-Audit</span>
          </button>

          <button
            onClick={() => onTabChange('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'audit'
                ? 'bg-white text-blue-800 shadow-sm'
                : 'text-blue-100 hover:bg-blue-800/80 hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>2. Checkpoints</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                currentTab === 'audit' ? 'bg-blue-100 text-blue-800' : 'bg-blue-950/60 text-blue-100'
              }`}
            >
              {evaluatedCount}/{totalCheckpoints}
            </span>
          </button>

          <button
            onClick={() => onTabChange('report')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'report'
                ? 'bg-white text-blue-800 shadow-sm'
                : 'text-blue-100 hover:bg-blue-800/80 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>3. Report &amp; PDF</span>
            {evaluatedCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${badgeBg}`}>
                {currentPercentage}%
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('cap')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'cap'
                ? 'bg-white text-blue-800 shadow-sm'
                : 'text-blue-100 hover:bg-blue-800/80 hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>4. CAP</span>
            {totalCapCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  openCapCount > 0
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-emerald-500 text-white'
                }`}
              >
                {openCapCount > 0 ? `${openCapCount} Open` : 'Closed'}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('saved-audits')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'saved-audits'
                ? 'bg-white text-blue-800 shadow-sm'
                : 'text-blue-100 hover:bg-blue-800/80 hover:text-white'
            }`}
          >
            <History className="w-4 h-4 text-emerald-300" />
            <span>{isAdmin ? 'Saved Records (Admin)' : 'My Audits & CAP'}</span>
            {isAdmin && liveDraftCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-emerald-400 text-slate-950 animate-pulse">
                {liveDraftCount} Live
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Merged Audit Sections Sub-strip - displayed ONLY when in Audit Checkpoints tab */}
      {currentTab === 'audit' && sections && sections.length > 0 && (
        <div className="bg-blue-50 border-t border-blue-200 px-3 sm:px-6 lg:px-8 xl:px-10 py-1.5 text-slate-800">
          <div className="max-w-[1720px] mx-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {sections.map((section, idx) => {
              const isActive = section.id === activeSectionId;
              const total = section.checkpoints.length;
              const evaluated = section.checkpoints.filter((c: CheckpointItem) => c.score !== null).length;
              const isCompleted = evaluated === total && total > 0;
              const hasCrit = section.checkpoints.some((c: CheckpointItem) => c.score === 'critical');

              return (
                <button
                  key={section.id}
                  onClick={() => onSelectSection?.(section.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-blue-100 border border-blue-200'
                  }`}
                  title={`${section.name} (${evaluated}/${total})`}
                >
                  <span>
                    {idx + 1}. {section.code}
                  </span>
                  {hasCrit && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  {isCompleted && !hasCrit && <span className="text-emerald-600 text-[10px]">✓</span>}
                  <span
                    className={`px-1.5 py-0.2 text-[9px] rounded font-semibold ${
                      isActive ? 'bg-blue-800 text-blue-100' : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {evaluated}/{total}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
