import React, { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Calendar,
  Building2,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Cloud,
} from 'lucide-react';
import { AuditReportData, AuditorUser } from '../types/audit';
import { generateAuditPdf } from '../utils/pdfGenerator';
import { getScoreBandMeta } from '../utils/scoring';
import { ADMIN_EMAIL, isAuditorAdmin } from '../services/firebase';

interface Props {
  audits: AuditReportData[];
  onLoadAudit: (audit: AuditReportData) => void;
  onDeleteAudit: (id: string) => void;
  onStartNewAudit: () => void;
  currentUser?: AuditorUser | null;
}

export const SavedAuditsView: React.FC<Props> = ({
  audits,
  onLoadAudit,
  onDeleteAudit,
  onStartNewAudit,
  currentUser,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = isAuditorAdmin(currentUser?.email);

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 animate-in fade-in duration-150">
        <div className="bg-white rounded-2xl p-8 sm:p-10 border border-slate-200 shadow-sm text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center mx-auto text-red-600">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Admin Access Only
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
              Saved audit archives are strictly restricted to the designated Admin: <strong className="font-mono text-slate-800">{ADMIN_EMAIL}</strong>. Other users cannot view, access, or modify stored assessments.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={onStartNewAudit}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
            >
              Continue to Pre-Audit Inspection
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      setIsDeleting(true);
      await onDeleteAudit(id);
      setConfirmDeleteId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto space-y-5 pb-20 animate-in fade-in duration-150">
      {/* Top Banner with Admin Verification Badge */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Saved Audit Records &amp; Archives
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Admin Verified: {ADMIN_EMAIL}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Access past factory technical assessments, export official PDF reports, or delete records from Firebase to prevent storage accumulation.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartNewAudit}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Start New Factory Audit</span>
        </button>
      </div>

      {audits.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Saved Audits Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Complete the pre-audit setup and section checkpoints, then click &quot;Submit &amp; Generate Report&quot; to archive reports here in Firebase Firestore.
          </p>
          <button
            type="button"
            onClick={onStartNewAudit}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer"
          >
            Start First Audit
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {audits.map((audit) => {
            const band = getScoreBandMeta(audit.overallPercentage, audit.totalCritical);
            const scoreColorText =
              band.band === 'deep-green'
                ? 'text-emerald-700'
                : band.band === 'amber'
                ? 'text-amber-600'
                : 'text-red-600';

            return (
              <div
                key={audit.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-blue-400 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                          {audit.id}
                        </span>
                        <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 font-semibold">
                          <Cloud className="w-3 h-3" />
                          <span>Cloud Synced</span>
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-1">
                        {audit.factoryInfo?.name || 'Factory'}
                      </h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Date: {audit.factoryInfo?.auditDate || audit.createdAt.split('T')[0]}</span>
                      </p>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Auditor: <strong className="text-slate-800">{audit.factoryInfo?.auditorName || 'Lead Auditor'}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <div className={`text-2xl font-black ${scoreColorText}`}>
                        {audit.overallPercentage}%
                      </div>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                          band.band === 'deep-green'
                            ? 'bg-emerald-100 text-emerald-800'
                            : band.band === 'amber'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {band.band === 'deep-green'
                          ? 'Deep Green'
                          : band.band === 'amber'
                          ? 'Amber Mark'
                          : 'Red Mark'}
                      </span>
                    </div>
                  </div>

                  {/* Summary counts */}
                  <div className="grid grid-cols-4 gap-1.5 py-2 px-3 bg-slate-50 rounded-xl text-center text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Critical</span>
                      <strong className="text-red-600 font-bold">{audit.totalCritical || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Major</span>
                      <strong className="text-yellow-700 font-bold">{audit.totalMajor || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Minor</span>
                      <strong className="text-amber-700 font-bold">{audit.totalMinor || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">No Issue</span>
                      <strong className="text-emerald-700 font-bold">{audit.totalNoIssue || 0}</strong>
                    </div>
                  </div>
                </div>

                {/* Card actions */}
                <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100 text-xs">
                  {confirmDeleteId === audit.id ? (
                    <div className="flex items-center gap-1.5 animate-in fade-in">
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDelete(audit.id)}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete Cloud Record?'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(audit.id)}
                      className="px-2 py-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer flex items-center gap-1 border border-transparent hover:border-red-200"
                      title="Delete saved audit from Firebase"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-semibold">Delete</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => generateAuditPdf(audit)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Download PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onLoadAudit(audit)}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>Open Report</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
