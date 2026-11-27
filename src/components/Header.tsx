import React from 'react';
import {
  LogOut,
  Building2,
  CheckSquare,
  FileText,
  History,
  Share2,
  RefreshCw,
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
}) => {
  const completionPercent = totalCheckpoints > 0 ? Math.round((evaluatedCount / totalCheckpoints) * 100) : 0;

  // Exact color coding rules:
  // < 60: Red Mark
  // 60 - 79.99: Amber Mark
  // >= 80: Deep Green Mark
  const isDeepGreen = currentPercentage >= 80 && !hasCritical;
  const isAmber = currentPercentage >= 60 && currentPercentage < 80 && !hasCritical;
  const isRed = currentPercentage < 60 || hasCritical;

  const scoreColorText = isDeepGreen
    ? 'text-emerald-700 font-extrabold'
    : isAmber
    ? 'text-amber-700 font-extrabold'
    : 'text-red-700 font-extrabold';

  const badgeBg = isDeepGreen
    ? 'bg-emerald-600 text-white'
    : isAmber
    ? 'bg-amber-600 text-white'
    : 'bg-red-600 text-white';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-800 shadow-xs pt-[max(env(safe-area-inset-top),4px)]">
      {/* Top Tier Container: Full responsive width with max-w-[1720px] on desktop */}
      <div className="max-w-[1720px] mx-auto px-3 sm:px-6 lg:px-8 xl:px-10 py-1.5 sm:py-2 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Brand: Internal Technical Audit with App Icon */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink min-w-0">
          <img
            src="/app-icon.png"
            alt="App Icon"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover shadow-xs border border-slate-200 shrink-0"
          />
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-extrabold text-xs sm:text-base tracking-tight text-slate-900 truncate">
              Internal Technical Audit
            </span>
            <span className="hidden sm:inline-block px-1.5 py-0.2 text-[10px] uppercase font-bold rounded bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
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
                isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
              title={syncMessage || 'Live Synced'}
            />
          </div>
        </div>

        {/* Live Score, Checkpoints & Cloud Sync Status - Visible on Tablet/Desktop */}
        <div className="hidden md:flex items-center gap-3 bg-slate-100/90 px-3 py-1 rounded-xl border border-slate-200 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 uppercase font-semibold">Score:</span>
            <span className={scoreColorText}>{currentPercentage}%</span>
            {isRed && (
              <span className="px-1.5 py-0.2 text-[9px] bg-red-600 text-white rounded font-bold">
                Red
              </span>
            )}
            {isAmber && (
              <span className="px-1.5 py-0.2 text-[9px] bg-amber-600 text-white rounded font-bold">
                Amber
              </span>
            )}
            {isDeepGreen && (
              <span className="px-1.5 py-0.2 text-[9px] bg-emerald-600 text-white rounded font-bold">
                Green
              </span>
            )}
          </div>

          <div className="h-4 w-[1px] bg-slate-300" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 uppercase font-semibold">Checkpoints:</span>
            <span className="font-bold text-slate-700">
              {evaluatedCount}/{totalCheckpoints} ({completionPercent}%)
            </span>
          </div>

          <div className="h-4 w-[1px] bg-slate-300" />

          {/* Real-time Multi-device Cloud Sync Status */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="font-medium text-slate-600 truncate max-w-[170px]">
              {syncMessage || (isSaved ? 'Live Synced' : 'Syncing...')}
            </span>
            {onManualSync && (
              <button
                type="button"
                onClick={onManualSync}
                title="Force Refresh Data from Cloud Server"
                className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Right Actions: Share & Logout - Perfectly inside screen bounds */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 pr-1">
          {updateAvailable && onApplyUpdate && (
            <button
              type="button"
              onClick={onApplyUpdate}
              title="New update available! Click to refresh."
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white text-[11px] font-bold shadow-xs animate-pulse cursor-pointer shrink-0"
            >
              <span>🚀</span>
              <span className="hidden sm:inline">New Update!</span>
            </button>
          )}

          {onOpenShareModal && (
            <button
              onClick={onOpenShareModal}
              title="Share Web Link"
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}

          {user && (
            <button
              type="button"
              onClick={onLogout}
              title="Log Out of Auditor Account"
              className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 hover:text-red-800 transition-all text-xs font-bold cursor-pointer shrink-0 shadow-2xs"
            >
              <LogOut className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Bar Navigation: Off-white background, spacious on desktop, scrolling on mobile */}
      <div className="bg-slate-50 border-t border-slate-200/80 px-3 sm:px-6 lg:px-8 xl:px-10">
        <div className="max-w-[1720px] mx-auto flex items-center gap-2 overflow-x-auto py-2 no-scrollbar text-xs">
          <button
            onClick={() => onTabChange('pre-audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'pre-audit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>1. Pre-Audit</span>
          </button>

          <button
            onClick={() => onTabChange('audit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'audit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>2. Checkpoints</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                currentTab === 'audit' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {evaluatedCount}/{totalCheckpoints}
            </span>
          </button>

          <button
            onClick={() => onTabChange('report')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              currentTab === 'report'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
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

          {isAuditorAdmin(user?.email) && (
            <button
              onClick={() => onTabChange('saved-audits')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                currentTab === 'saved-audits'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              <History className="w-4 h-4 text-emerald-600" />
              <span>Saved Records (Admin)</span>
            </button>
          )}
        </div>
      </div>

      {/* Merged Audit Sections Sub-strip - displayed ONLY when in Audit Checkpoints tab */}
      {currentTab === 'audit' && sections && sections.length > 0 && (
        <div className="bg-slate-100/90 border-t border-slate-200 px-3 sm:px-6 lg:px-8 xl:px-10 py-1.5">
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
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
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
                      isActive ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-600'
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
