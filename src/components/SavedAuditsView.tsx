import React, { useState } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Calendar,
  Plus,
  ArrowRight,
  ShieldCheck,
  Cloud,
  ClipboardCheck,
  UserCheck,
} from 'lucide-react';
import { AuditReportData, AuditorUser } from '../types/audit';
import { generateAuditPdf, generateCapPdf } from '../utils/pdfGenerator';
import { getScoreBandMeta } from '../utils/scoring';
import { ADMIN_EMAIL, isAuditorAdmin } from '../services/firebase';
import { buildCapItemsFromReport } from '../utils/capHelpers';

interface Props {
  audits: AuditReportData[];
  onLoadAudit: (audit: AuditReportData) => void;
  onOpenCap: (audit: AuditReportData) => void;
  onDeleteAudit: (id: string) => void;
  onStartNewAudit: () => void;
  currentUser?: AuditorUser | null;
}

export const SavedAuditsView: React.FC<Props> = ({
  audits,
  onLoadAudit,
  onOpenCap,
  onDeleteAudit,
  onStartNewAudit,
  currentUser,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = isAuditorAdmin(currentUser?.email);

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
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
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {isAdmin ? 'Saved Audit Records & CAP Archives' : 'My Submitted Factory Audits & CAP'}
            </h1>
            {isAdmin ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Admin: {ADMIN_EMAIL}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Private Auditor View ({currentUser?.email})</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            {isAdmin
              ? 'Access all factory technical assessments, open/close CAP items, export Audit or CAP PDF reports, or manage cloud records.'
              : 'Reopen factories you audited to open CAP items, upload closure evidence, close CAPs, and download Audit or CAP PDF reports. Other auditors’ reports remain strictly private.'}
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
          <h3 className="text-base font-bold text-slate-800">No Submitted Audits Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Complete the Pre-Audit setup and Checkpoints, then click &quot;Submit Audit&quot; to archive your factory report and manage its CAP here.
          </p>
          <button
            type="button"
            onClick={onStartNewAudit}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer"
          >
            Start Factory Audit
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

            const capList = buildCapItemsFromReport(audit);
            const capClosedCount = capList.filter((c) => c.status === 'closed').length;
            const capOpenCount = capList.length - capClosedCount;

            return (
              <div
                key={audit.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-blue-400 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                          {audit.factoryInfo?.auditReportNo || audit.id}
                        </span>
                        <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 font-semibold">
                          <Cloud className="w-3 h-3" />
                          <span>Synced</span>
                        </span>
                        {capList.length > 0 && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              capOpenCount > 0
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            CAP: {capClosedCount}/{capList.length} Closed
                          </span>
                        )}
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
                      <span className="text-[10px] text-slate-400 block font-semibold">Not Acc.</span>
                      <strong className="text-red-600 font-bold">{audit.totalCritical || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Below Exp.</span>
                      <strong className="text-amber-700 font-bold">{audit.totalMajor || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Acceptable</span>
                      <strong className="text-blue-700 font-bold">{audit.totalMinor || 0}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Good</span>
                      <strong className="text-emerald-700 font-bold">{audit.totalNoIssue || 0}</strong>
                    </div>
                  </div>
                </div>

                {/* Card actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100 text-xs">
                  {isAdmin ? (
                    confirmDeleteId === audit.id ? (
                      <div className="flex items-center gap-1.5 animate-in fade-in">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDelete(audit.id)}
                          className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isDeleting ? 'Deleting...' : 'Confirm Delete?'}
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
                    )
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium">
                      Submitted Audit
                    </span>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => generateAuditPdf(audit)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Download Audit PDF"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>

                    {capList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => generateCapPdf(audit, capList)}
                        className="px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Download CAP PDF Report"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CAP PDF</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenCap(audit)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Open & Close Corrective Action Plan (CAP)"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span>Open CAP</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onLoadAudit(audit)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <span>Report</span>
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
