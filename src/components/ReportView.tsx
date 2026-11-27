import React, { useState } from 'react';
import {
  Download,
  Printer,
  Save,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Building2,
  Calendar,
  Layers,
  Award,
  Sparkles,
  ArrowLeft,
  FileCheck,
  Eye,
  Check,
  Share2,
  Images,
  Camera,
  ClipboardCheck,
  Mail,
  ShieldCheck,
  Edit3,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  AuditReportData,
  AuditorUser,
  CheckpointEvidence,
  SCORE_DEFINITIONS,
  ScoreOption,
} from '../types/audit';
import { generateAuditPdf } from '../utils/pdfGenerator';
import { getScoreBandMeta } from '../utils/scoring';
import { isAuditorAdmin } from '../services/firebase';

interface Props {
  report: AuditReportData;
  currentUser?: AuditorUser | null;
  onEditSection: (sectionId: string) => void;
  onEditPreAudit?: () => void;
  onSaveReport: (report: AuditReportData) => Promise<void>;
  onUpdateReportFields?: (updatedReport: AuditReportData) => Promise<void> | void;
  onAddFindingToReport?: (payload: {
    sectionId: string;
    title: string;
    score: Exclude<ScoreOption, null>;
    notes: string;
  }) => Promise<void> | void;
  onRemoveCheckpointFromReport?: (sectionId: string, checkpointId: string) => Promise<void> | void;
  onOpenPreviewImage: (evidence: CheckpointEvidence) => void;
  onOpenShareModal?: () => void;
  onOpenCap?: () => void;
  onEmailReport?: () => void;
}

export const ReportView: React.FC<Props> = ({
  report,
  currentUser,
  onEditSection,
  onEditPreAudit,
  onSaveReport,
  onUpdateReportFields,
  onAddFindingToReport,
  onRemoveCheckpointFromReport,
  onOpenPreviewImage,
  onOpenShareModal,
  onOpenCap,
  onEmailReport,
}) => {
  const isAdmin = isAuditorAdmin(currentUser?.email);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [includeCapForLowScores, setIncludeCapForLowScores] = useState(false);
  const [selectedCapSections, setSelectedCapSections] = useState<string[]>(() =>
    report.sectionSummaries.filter((s) => s.percentage < 70 || s.criticalCount > 0).map((s) => s.sectionId)
  );

  // Admin inline Executive Summary editor state
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(report.executiveSummary || '');

  // Admin Add Finding modal state
  const [showAddFindingModal, setShowAddFindingModal] = useState(false);
  const [findingSectionId, setFindingSectionId] = useState(report.sections[0]?.id || 'warehouse');
  const [findingTitle, setFindingTitle] = useState('');
  const [findingScore, setFindingScore] = useState<Exclude<ScoreOption, null>>('major');
  const [findingNotes, setFindingNotes] = useState('');
  const [confirmRemoveFindingId, setConfirmRemoveFindingId] = useState<string | null>(null);

  const toggleCapSection = (sectionId: string) => {
    setSelectedCapSections((prev) =>
      prev.includes(sectionId) ? prev.filter((id) => id !== sectionId) : [...prev, sectionId]
    );
  };

  const handleSaveSummary = async () => {
    if (!onUpdateReportFields) return;
    await onUpdateReportFields({
      ...report,
      executiveSummary: summaryDraft.trim(),
    });
    setIsEditingSummary(false);
  };

  const handleSubmitNewFinding = async () => {
    if (!onAddFindingToReport || !findingTitle.trim()) return;
    await onAddFindingToReport({
      sectionId: findingSectionId,
      title: findingTitle.trim(),
      score: findingScore,
      notes: findingNotes.trim(),
    });
    setFindingTitle('');
    setFindingNotes('');
    setShowAddFindingModal(false);
  };

  const scoreBand = getScoreBandMeta(report.overallPercentage, report.totalCritical);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      await generateAuditPdf(report, {
        includeCap: includeCapForLowScores,
        selectedCapSectionIds: selectedCapSections,
      });
    } catch (err) {
      console.error('PDF generation error', err);
      alert('Could not export PDF. Please verify your browser allows downloads.');
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveToDb = async () => {
    try {
      setSaving(true);
      await onSaveReport(report);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Save report error', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const nonConformances = report.sections.flatMap((sec) =>
    sec.checkpoints
      .filter((cp) => cp.score === 'critical' || cp.score === 'major' || cp.score === 'minor' || cp.images?.length > 0)
      .map((cp) => ({ ...cp, sectionName: sec.name, sectionId: sec.id }))
  );

  return (
    <div className="w-full max-w-[1720px] mx-auto space-y-6 pb-20 animate-in fade-in duration-200">
      {/* Top Banner Actions */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 text-slate-900 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                Audit Report No: {report.factoryInfo.auditReportNo || report.id}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                {report.factoryInfo.auditType || 'Annual Audit'}
              </span>
              <span className="text-xs text-slate-600 font-medium">
                Audit Date: {report.factoryInfo.auditDate || new Date().toISOString().split('T')[0]}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
              Internal Technical Audit Report
            </h1>
            <p className="text-xs text-slate-600 mt-0.5 flex flex-wrap items-center gap-2">
              <span>Factory: <strong className="text-slate-900">{report.factoryInfo.name || 'Factory'}</strong></span>
              <span>•</span>
              <span>Auditor-1: <strong className="text-blue-700">{report.factoryInfo.auditorName || 'Lead Auditor'}</strong>{report.factoryInfo.auditorTitle ? ` (${report.factoryInfo.auditorTitle.replace(/\s*\(Admin\)/gi, '').trim()})` : ''}</span>
              {report.factoryInfo.auditor2Name && (
                <>
                  <span>•</span>
                  <span>Auditor-2: <strong className="text-indigo-700">{report.factoryInfo.auditor2Name}</strong>{report.factoryInfo.auditor2Title ? ` (${report.factoryInfo.auditor2Title.replace(/\s*\(Admin\)/gi, '').trim()})` : ''}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Primary Export Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-70"
          >
            {downloading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{downloading ? 'Compiling PDF...' : 'Download PDF Report'}</span>
          </button>

          {onOpenCap && (
            <button
              type="button"
              onClick={onOpenCap}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              title="Open & Close Corrective Action Plan (CAP)"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>Open CAP</span>
            </button>
          )}

          {onEmailReport && (
            <button
              type="button"
              onClick={onEmailReport}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Send PDF Report to Contact Email(s)"
            >
              <Mail className="w-4 h-4" />
              <span>Email PDF</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Print report"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print Report</span>
          </button>

          <button
            type="button"
            onClick={handleSaveToDb}
            disabled={saving}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              saveSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            {saveSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{saveSuccess ? 'Saved to Records' : saving ? 'Saving...' : 'Save Audit'}</span>
          </button>

          {onOpenShareModal && (
            <button
              type="button"
              onClick={onOpenShareModal}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Share App or Install PWA"
            >
              <Share2 className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline">Share / Install</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin Report Control Bar (Strictly visible only to Admin quality.bd.eng@gmail.com) */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-slate-50 border border-indigo-200 rounded-2xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-4 h-4 text-indigo-700 shrink-0" />
            <div>
              <span className="font-black text-indigo-950">Admin Report Controls</span>
              <span className="text-indigo-700 ml-2">
                {report.auditorEmail ? `Auditor: ${report.auditorEmail}` : 'Full Edit, Add/Remove & CAP Access'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onEditPreAudit && (
              <button
                type="button"
                onClick={onEditPreAudit}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Factory / Pre-Audit</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onEditSection(report.sections[0]?.id || 'warehouse')}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Checkpoints &amp; Photos</span>
            </button>

            {onAddFindingToReport && (
              <button
                type="button"
                onClick={() => {
                  setFindingSectionId(report.sections[0]?.id || 'warehouse');
                  setShowAddFindingModal(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Finding / Checkpoint</span>
              </button>
            )}

            {onOpenCap && (
              <button
                type="button"
                onClick={onOpenCap}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Issue / Close CAP</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Admin Add Finding Modal */}
      {isAdmin && showAddFindingModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Add New Finding / Checkpoint to Report</h3>
              <button
                type="button"
                onClick={() => setShowAddFindingModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Audit Section</label>
                <select
                  value={findingSectionId}
                  onChange={(e) => setFindingSectionId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none font-semibold"
                >
                  {report.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Finding / Checkpoint Title *</label>
                <input
                  type="text"
                  value={findingTitle}
                  onChange={(e) => setFindingTitle(e.target.value)}
                  placeholder="e.g. Metal detector calibration log missing for Line 4"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Evaluation Score / Severity</label>
                <select
                  value={findingScore}
                  onChange={(e) => setFindingScore(e.target.value as Exclude<ScoreOption, null>)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none font-semibold"
                >
                  <option value="critical">Not Accepted (0 pts - Critical)</option>
                  <option value="major">Below Expectation (3 pts - Major)</option>
                  <option value="minor">Acceptable (7 pts - Minor)</option>
                  <option value="none">Good (10 pts - Compliant)</option>
                  <option value="na">N/A (Not Applicable)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Observation / Technical Notes</label>
                <textarea
                  rows={3}
                  value={findingNotes}
                  onChange={(e) => setFindingNotes(e.target.value)}
                  placeholder="Enter detailed technical finding..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddFindingModal(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitNewFinding}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                Add &amp; Recalculate Score
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. OVERALL AUDIT SCORECARD HERO */}
      <div
        className={`rounded-2xl p-6 border shadow-sm transition-all ${
          scoreBand.band === 'red'
            ? 'bg-gradient-to-br from-red-50 via-white to-red-50/40 border-red-300'
            : scoreBand.band === 'amber'
            ? 'bg-gradient-to-br from-amber-50 via-white to-yellow-50/40 border-amber-300'
            : 'bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 border-emerald-300'
        }`}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Big Score Visual */}
          <div className="md:col-span-4 flex flex-col items-center justify-center text-center p-5 bg-white/90 rounded-2xl border border-slate-200/90 shadow-xs">
            <div className="relative flex items-center justify-center w-36 h-36">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-slate-100"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${(report.overallPercentage / 100) * 264} 264`}
                  strokeLinecap="round"
                  className={
                    scoreBand.band === 'deep-green'
                      ? 'text-emerald-700'
                      : scoreBand.band === 'amber'
                      ? 'text-amber-600'
                      : 'text-red-600'
                  }
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-slate-900 tracking-tight">
                  {report.overallPercentage}%
                </span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Overall Score</span>
              </div>
            </div>

            <div className="mt-3">
              <span
                className={`inline-block px-3.5 py-1 rounded-full text-xs font-black tracking-wide ${
                  scoreBand.band === 'deep-green'
                    ? 'bg-emerald-700 text-white'
                    : scoreBand.band === 'amber'
                    ? 'bg-amber-600 text-white'
                    : 'bg-red-600 text-white'
                }`}
              >
                {scoreBand.label}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5 font-medium">
              Earned: {report.totalScore} / {report.maxPossibleScore} Points
            </div>
          </div>

          {/* Breakdown & Metric Cards */}
          <div className="md:col-span-8 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                {scoreBand.band === 'red' ? (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                ) : scoreBand.band === 'amber' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                )}
                <h2 className="text-lg font-black text-slate-900">
                  {scoreBand.band === 'deep-green'
                    ? 'Audit Status: Quality Compliant (Deep Green ≥80%)'
                    : scoreBand.band === 'amber'
                    ? 'Audit Status: Conditional Pass (Amber Mark 60% - 79.99%)'
                    : 'Audit Status: Non-Compliant (Red Mark <50% or Critical Issue)'}
                </h2>
              </div>
              {isAdmin && isEditingSummary ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    rows={3}
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-indigo-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveSummary}
                      className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                    >
                      Save Summary
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSummaryDraft(report.executiveSummary || '');
                        setIsEditingSummary(false);
                      }}
                      className="px-3 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-600 leading-relaxed flex-1">
                    {report.executiveSummary}
                  </p>
                  {isAdmin && onUpdateReportFields && (
                    <button
                      type="button"
                      onClick={() => {
                        setSummaryDraft(report.executiveSummary || '');
                        setIsEditingSummary(true);
                      }}
                      className="px-2 py-1 rounded-lg bg-white/80 hover:bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      title="Admin: Edit Executive Summary / Comments"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit Comment</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 4 Issue Severity Counters: Exactly aligned with Checkpoint Scoring */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
              {/* Not Accepted / Critical */}
              <div className="p-3 bg-red-100/70 border border-red-300 rounded-xl text-center">
                <div className="text-xs font-bold text-red-800 uppercase flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span> Not Accepted
                </div>
                <div className="text-2xl font-black text-red-900 mt-0.5">{report.totalCritical}</div>
                <div className="text-[10px] text-red-700 font-semibold">0 pts each</div>
              </div>

              {/* Below Expectation / Major */}
              <div className="p-3 bg-amber-100/70 border border-amber-300 rounded-xl text-center">
                <div className="text-xs font-bold text-amber-900 uppercase flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> Below Expectation
                </div>
                <div className="text-2xl font-black text-amber-950 mt-0.5">{report.totalMajor}</div>
                <div className="text-[10px] text-amber-800 font-semibold">3 pts each</div>
              </div>

              {/* Acceptable / Minor */}
              <div className="p-3 bg-blue-100/70 border border-blue-300 rounded-xl text-center">
                <div className="text-xs font-bold text-blue-900 uppercase flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span> Acceptable
                </div>
                <div className="text-2xl font-black text-blue-950 mt-0.5">{report.totalMinor}</div>
                <div className="text-[10px] text-blue-800 font-semibold">7 pts each</div>
              </div>

              {/* Good / No Issue */}
              <div className="p-3 bg-emerald-100/70 border border-emerald-300 rounded-xl text-center">
                <div className="text-xs font-bold text-emerald-900 uppercase flex items-center justify-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-700"></span> Good
                </div>
                <div className="text-2xl font-black text-emerald-950 mt-0.5">{report.totalNoIssue}</div>
                <div className="text-[10px] text-emerald-800 font-semibold">10 pts each</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. SECTION-BY-SECTION VISUAL CHART */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">SUMMARY</h2>
            <p className="text-xs text-slate-500">Benchmark performance and trend across all audited manufacturing sections</p>
          </div>
        </div>

        <div className="space-y-3.5">
          {report.sectionSummaries.map((summary) => {
            const hasCritical = summary.criticalCount > 0;
            const barColor =
              summary.percentage >= 80 && !hasCritical
                ? 'bg-emerald-700'
                : summary.percentage >= 60 && !hasCritical
                ? 'bg-amber-600'
                : 'bg-red-600';

            return (
              <div key={summary.sectionId} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEditSection(summary.sectionId)}
                      className="font-bold text-slate-900 hover:text-blue-600 transition-colors cursor-pointer text-left"
                    >
                      {summary.sectionName}
                    </button>
                    {hasCritical && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-red-100 text-red-700 uppercase">
                        Not Accepted
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[11px]">
                      {summary.earnedPoints}/{summary.maxPoints} pts
                    </span>
                    <span className="font-black text-slate-900 w-12 text-right">
                      {summary.percentage}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.max(summary.percentage, 3)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. SECTION SCORECARD TABLE */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-900">Department Score Breakdown Table</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 uppercase font-bold border-b border-slate-200">
                <th className="py-2.5 px-3">Department Section</th>
                <th className="py-2.5 px-3 text-center">Checkpoints</th>
                <th className="py-2.5 px-3 text-center">Score / Max</th>
                <th className="py-2.5 px-3 text-center">Score %</th>
                <th className="py-2.5 px-3 text-center">Not Accepted (0)</th>
                <th className="py-2.5 px-3 text-center">Below Exp (4)</th>
                <th className="py-2.5 px-3 text-center">Acceptable (7)</th>
                <th className="py-2.5 px-3 text-center">Trend</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.sectionSummaries.map((s) => (
                <tr key={s.sectionId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3 font-bold text-slate-900">{s.sectionName}</td>
                  <td className="py-2.5 px-3 text-center text-slate-600">
                    {s.evaluatedCount} of {s.totalCheckpoints}
                  </td>
                  <td className="py-2.5 px-3 text-center font-semibold text-slate-800">
                    {s.earnedPoints} / {s.maxPoints}
                  </td>
                  <td className="py-2.5 px-3 text-center font-black">
                    <span
                      className={
                        s.percentage >= 80 && s.criticalCount === 0
                          ? 'text-emerald-700'
                          : s.percentage >= 60 && s.criticalCount === 0
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }
                    >
                      {s.percentage}%
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold text-red-600">{s.criticalCount}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-amber-600">{s.majorCount}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-blue-600">{s.minorCount}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center">
                      <span
                        className={`inline-block w-8 h-2 rounded-full ${
                          s.percentage >= 80 && s.criticalCount === 0
                            ? 'bg-emerald-600'
                            : s.percentage >= 60 && s.criticalCount === 0
                            ? 'bg-amber-500'
                            : 'bg-red-600'
                        }`}
                        title={`${s.percentage}%`}
                      />
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onEditSection(s.sectionId)}
                      className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. FACTORY PROFILE & AUDITOR INFO */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <Building2 className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">Factory Profile & Auditor Verification</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Audit Report No</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {report.factoryInfo.auditReportNo || report.id || 'N/A'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Factory Name</span>
                <span className="font-bold text-slate-900 text-sm">{report.factoryInfo.name || 'N/A'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Audit Type</span>
                <span className="font-bold text-blue-700 text-sm">{report.factoryInfo.auditType || 'Annual Audit'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Audit Date</span>
                <span className="font-bold text-slate-900">
                  {report.factoryInfo.auditDate || new Date().toISOString().split('T')[0]}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Contact Person</span>
                <span className="font-bold text-slate-900">
                  {report.factoryInfo.contactPerson || 'N/A'}
                </span>
              </div>
              {report.factoryInfo.contactPhone && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Contact Phone / Mobile</span>
                  <span className="font-bold text-slate-900">
                    {report.factoryInfo.contactPhone}
                  </span>
                </div>
              )}
              {(report.factoryInfo.contactEmail || (report.factoryInfo.contactEmails && report.factoryInfo.contactEmails.length > 0)) && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 sm:col-span-2">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Contact Email(s)</span>
                  <span className="font-bold text-slate-900 break-all">
                    {report.factoryInfo.contactEmails && report.factoryInfo.contactEmails.length > 0
                      ? report.factoryInfo.contactEmails.join(', ')
                      : report.factoryInfo.contactEmail}
                  </span>
                </div>
              )}
              {report.factoryInfo.numberOfWorkers && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Number of Workers</span>
                  <span className="font-bold text-slate-900">{report.factoryInfo.numberOfWorkers}</span>
                </div>
              )}
              {report.factoryInfo.numberOfLines && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Number of Lines</span>
                  <span className="font-bold text-slate-900">{report.factoryInfo.numberOfLines}</span>
                </div>
              )}
              {report.factoryInfo.capacityPerMonth && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Capacity (Per Month)</span>
                  <span className="font-bold text-slate-900">{report.factoryInfo.capacityPerMonth}</span>
                </div>
              )}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Buyer / Brand</span>
                <span className="font-medium text-slate-800">{report.factoryInfo.buyerBrand || 'N/A'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 sm:col-span-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Location</span>
                <span className="font-medium text-slate-800">{report.factoryInfo.address || 'N/A'}</span>
              </div>
            </div>

            {/* Facilities Badges */}
            <div className="pt-2">
              <span className="text-xs font-bold text-slate-700 block mb-1.5">
                Assessed Facilities ({report.factoryInfo.facilities?.length || 0}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {report.factoryInfo.facilities?.map((f) => (
                  <span
                    key={f}
                    className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-medium"
                  >
                    ✓ {f}
                  </span>
                ))}
              </div>
            </div>

            {/* Certifications Badges */}
            {report.factoryInfo.certifications?.some((c) => c.selected) && (
              <div className="pt-2">
                <span className="text-xs font-bold text-slate-700 block mb-1.5">Verified Certifications:</span>
                <div className="flex flex-wrap gap-1.5">
                  {report.factoryInfo.certifications
                    .filter((c) => c.selected)
                    .map((c) => (
                      <span
                        key={c.id}
                        className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 text-xs font-medium flex items-center gap-1.5 shadow-xs"
                      >
                        <Award className="w-3.5 h-3.5 text-amber-600" />
                        <span>{c.name}</span>
                        {c.photo && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenPreviewImage({
                                id: `cert-${c.id}`,
                                dataUrl: c.photo!,
                                timestamp: c.photoTimestamp || '',
                                caption: `${c.name} Certificate Document`,
                              })
                            }
                            className="ml-1 px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            title="View Certificate Document"
                          >
                            <Camera className="w-3 h-3 text-emerald-700" />
                            <span>View Photo</span>
                          </button>
                        )}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Opening Meeting Photo */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700 block">Opening Meeting Photo Evidence:</span>
            {report.factoryInfo.openingMeetingPhoto ? (
              <div className="rounded-xl overflow-hidden border border-slate-300 bg-slate-950 relative group">
                <img
                  src={report.factoryInfo.openingMeetingPhoto}
                  alt="Opening Meeting"
                  className="w-full h-44 object-cover cursor-pointer"
                  onClick={() =>
                    onOpenPreviewImage({
                      id: 'opening',
                      dataUrl: report.factoryInfo.openingMeetingPhoto!,
                      timestamp: report.factoryInfo.openingMeetingPhotoTimestamp || '',
                      caption: 'Opening Meeting Photo',
                    })
                  }
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-bold flex items-center gap-1 bg-black/60 px-2 py-1 rounded-lg">
                    <Eye className="w-3.5 h-3.5" /> Enlarge Photo
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-44 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 text-xs p-4 text-center">
                <span>No opening meeting photo attached</span>
              </div>
            )}
          </div>
        </div>

        {/* Factory Outlook / Exterior Multiple Photos Gallery */}
        {report.factoryInfo.factoryOutlookPhotos && report.factoryInfo.factoryOutlookPhotos.length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Images className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Factory Exterior & Outlook Photo Records ({report.factoryInfo.factoryOutlookPhotos.length})
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {report.factoryInfo.factoryOutlookPhotos.map((photo, pIdx) => (
                <div
                  key={photo.id}
                  className="relative h-28 rounded-xl overflow-hidden border border-slate-300 group cursor-pointer bg-slate-950 shadow-xs"
                  onClick={() => onOpenPreviewImage(photo)}
                >
                  <img
                    src={photo.dataUrl}
                    alt={photo.caption || `Factory Outlook ${pIdx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-1 left-1 bg-black/60 text-[9px] text-white px-1.5 py-0.2 rounded font-mono">
                    Outlook #{pIdx + 1}
                  </div>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="w-4 h-4 text-white" />
                  </div>
                  {photo.caption && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5 text-[9px] text-white truncate">
                      {photo.caption}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Factory Certification Photos Evidence */}
        {report.factoryInfo.certifications?.some((c) => c.selected && c.photo) && (
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Factory Certification Documents & Photos ({report.factoryInfo.certifications.filter((c) => c.selected && c.photo).length})
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {report.factoryInfo.certifications
                .filter((c) => c.selected && c.photo)
                .map((cert) => (
                  <div
                    key={cert.id}
                    className="relative h-28 rounded-xl overflow-hidden border border-amber-300 group cursor-pointer bg-slate-950 shadow-xs"
                    onClick={() =>
                      onOpenPreviewImage({
                        id: `cert-${cert.id}`,
                        dataUrl: cert.photo!,
                        timestamp: cert.photoTimestamp || '',
                        caption: `${cert.name} Certificate Photo`,
                      })
                    }
                  >
                    <img
                      src={cert.photo}
                      alt={cert.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-1 left-1 bg-amber-800/85 text-[9px] text-white px-1.5 py-0.2 rounded font-medium">
                      Cert Document
                    </div>
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Eye className="w-4 h-4 text-white" />
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-black/75 px-1.5 py-0.5 text-[9px] text-white truncate font-medium">
                      {cert.name}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* 5. DETAILED NON-CONFORMANCES & ALL MULTIPLE PHOTOS VISIBLE */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Non-Conformance Findings & Multi-Photo Evidence Log ({nonConformances.length})</span>
            </h2>
            <p className="text-xs text-slate-500">
              Checkpoints flagged with issues or attached photo evidence
            </p>
          </div>
        </div>

        {nonConformances.length === 0 ? (
          <div className="p-8 text-center bg-emerald-50/50 rounded-2xl border border-emerald-200">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-base font-bold text-emerald-950">Zero Non-Conformances Flagged</h3>
            <p className="text-xs text-emerald-800 mt-1 max-w-md mx-auto">
              All inspected checkpoints conform fully to technical and quality requirements.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {nonConformances.map((nc) => {
              const meta = nc.score ? SCORE_DEFINITIONS[nc.score] : null;
              const hasImages = nc.images && nc.images.length > 0;

              return (
                <div
                  key={nc.id}
                  className={`p-4 rounded-xl border transition-all ${
                    nc.score === 'critical'
                      ? 'bg-red-50/40 border-red-300'
                      : nc.score === 'major'
                      ? 'bg-yellow-50/40 border-yellow-300'
                      : 'bg-amber-50/40 border-amber-300'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-white border border-slate-200 text-slate-800">
                            {nc.code}
                          </span>
                          <span className="text-xs font-bold text-slate-500">{nc.sectionName}</span>
                          {meta && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${meta.badgeBg}`}
                            >
                              {meta.label} ({meta.points} pts)
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{nc.title}</h3>
                        <p className="text-xs text-slate-600">{nc.description}</p>
                        {nc.notes && (
                          <div className="mt-2 p-2.5 rounded-lg bg-white/90 border border-slate-200 text-xs text-slate-800">
                            <strong className="text-slate-900">Auditor Observation: </strong>
                            <span>{nc.notes}</span>
                          </div>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onEditSection(nc.sectionId)}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            title="Edit this checkpoint"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          {onRemoveCheckpointFromReport && (
                            confirmRemoveFindingId === nc.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRemoveCheckpointFromReport(nc.sectionId, nc.id);
                                    setConfirmRemoveFindingId(null);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  Confirm Remove
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveFindingId(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveFindingId(nc.id)}
                                className="px-2.5 py-1 rounded-lg bg-white hover:bg-red-50 text-red-600 border border-red-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                title="Admin: Remove this finding from report"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Remove</span>
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* ALL MULTIPLE PHOTOS VISIBLE HERE */}
                    {hasImages && (
                      <div className="pt-2 border-t border-slate-200/80">
                        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                          <Images className="w-3.5 h-3.5 text-blue-600" />
                          <span>Attached Evidence Photos ({nc.images.length}):</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                          {nc.images.map((img, imgIdx) => (
                            <div
                              key={img.id}
                              className="relative h-24 rounded-xl overflow-hidden border border-slate-300 group cursor-pointer bg-slate-950 shadow-xs"
                              onClick={() => onOpenPreviewImage(img)}
                            >
                              <img
                                src={img.dataUrl}
                                alt={`Evidence ${imgIdx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute top-1 left-1 bg-black/60 text-[9px] text-white px-1.5 py-0.2 rounded font-mono">
                                #{imgIdx + 1}
                              </div>
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Eye className="w-4 h-4 text-white" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. CORRECTIVE ACTION PLAN (CAP) CONTROL & CONDITIONAL SECTION */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Corrective Action Plan (CAP)</h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  includeCapForLowScores
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {includeCapForLowScores
                  ? `${selectedCapSections.length} Section(s) in PDF`
                  : 'Excluded from PDF'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {includeCapForLowScores
                ? 'CAP protocol is active. You can choose any section below to include in the generated PDF.'
                : 'CAP protocol is excluded from the PDF by default. Enable it to pick any sections for corrective action planning.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIncludeCapForLowScores(!includeCapForLowScores)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-xs shrink-0 ${
              includeCapForLowScores
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20 ring-2 ring-amber-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                includeCapForLowScores ? 'bg-white animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>{includeCapForLowScores ? 'Disable CAP in PDF' : 'Enable CAP in PDF'}</span>
          </button>
        </div>

        {includeCapForLowScores && (
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
              <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                <span className="font-bold text-red-900 block mb-1">Not Accepted Issues (0 pts)</span>
                <p>Immediate containment within 24 hours. Production quarantine required until re-inspection clearance.</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <span className="font-bold text-amber-950 block mb-1">Below Expectation Issues (3 pts)</span>
                <p>Root cause analysis (RCA) and documented CAP submission required within 14 calendar days.</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                <span className="font-bold text-blue-950 block mb-1">Acceptable Issues (7 pts)</span>
                <p>Process improvement plan to be verified during next routine surveillance audit.</p>
              </div>
            </div>

            {/* Interactive Section Picker for CAP */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Select Sections for CAP Protocol:
                  </span>
                  <p className="text-[11px] text-slate-500">
                    You can include CAP on any section regardless of score. Selected sections will appear in the exported PDF.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const lowScores = report.sectionSummaries
                        .filter((s) => s.percentage < 70 || s.criticalCount > 0)
                        .map((s) => s.sectionId);
                      setSelectedCapSections(lowScores);
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer"
                  >
                    Low Scores (&lt;70%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCapSections(report.sectionSummaries.map((s) => s.sectionId));
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCapSections([])}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {report.sectionSummaries.map((sec) => {
                  const isSelected = selectedCapSections.includes(sec.sectionId);
                  const isLowScore = sec.percentage < 70 || sec.criticalCount > 0;
                  return (
                    <button
                      key={sec.sectionId}
                      type="button"
                      onClick={() => toggleCapSection(sec.sectionId)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                        isSelected
                          ? 'bg-amber-50/80 border-amber-300 ring-1 ring-amber-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // controlled by parent button click
                        className="mt-0.5 w-4 h-4 rounded text-amber-600 border-slate-300 focus:ring-amber-500 cursor-pointer pointer-events-none"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {sec.sectionName}
                          </span>
                          <span
                            className={`text-[11px] font-black shrink-0 ${
                              isLowScore ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {sec.percentage}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                          {sec.criticalCount > 0 && (
                            <span className="text-red-700 font-semibold">{sec.criticalCount} Not Accepted</span>
                          )}
                          {sec.majorCount > 0 && (
                            <span className="text-amber-800 font-semibold">{sec.majorCount} Below Exp.</span>
                          )}
                          {sec.criticalCount === 0 && sec.majorCount === 0 && (
                            <span className="text-slate-500">No major issues</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedCapSections.length === 0 && (
                <p className="text-xs text-slate-500 italic p-2 bg-slate-50 rounded-lg text-center">
                  No sections selected. Select sections above to generate CAP items in the PDF report.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Report Sign-off */}
      <div className="py-4 text-center border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>
          Internal Technical Audit Report • Confirmed by Auditor:{' '}
          <strong className="text-slate-800">{report.factoryInfo.auditorName || 'Lead Auditor'}</strong>
          {report.factoryInfo.auditor2Name && (
            <> &amp; <strong className="text-slate-800">{report.factoryInfo.auditor2Name}</strong></>
          )}
        </span>
        <span>Factory: <strong className="text-slate-800">{report.factoryInfo.name || 'Factory'}</strong></span>
      </div>
    </div>
  );
};
