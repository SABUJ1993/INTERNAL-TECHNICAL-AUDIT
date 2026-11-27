import React, { useMemo, useRef, useState } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Camera,
  Plus,
  Save,
  ArrowLeft,
  Calendar,
  User,
  Images,
  Check,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  AuditReportData,
  AuditorUser,
  CapItem,
  CapStatus,
  CheckpointEvidence,
  SCORE_DEFINITIONS,
  ScoreOption,
} from '../types/audit';
import { buildCapItemsFromReport } from '../utils/capHelpers';
import { generateCapPdf } from '../utils/pdfGenerator';
import { optimizeAuditImageWithMeta } from '../utils/imageCompressor';
import { EvidencePhotoThumbnail } from './EvidencePhotoThumbnail';
import { isAuditorAdmin } from '../services/firebase';

interface Props {
  report: AuditReportData;
  currentUser?: AuditorUser | null;
  onUpdateCapItems: (capItems: CapItem[], dismissedCapIds?: string[]) => Promise<void> | void;
  onBackToReport: () => void;
  onOpenPreviewImage: (evidence: CheckpointEvidence) => void;
}

export const CapView: React.FC<Props> = ({
  report,
  currentUser,
  onUpdateCapItems,
  onBackToReport,
  onOpenPreviewImage,
}) => {
  const isAdmin = isAuditorAdmin(currentUser?.email);
  const capItems = useMemo(() => buildCapItemsFromReport(report), [report]);
  const [filterStatus, setFilterStatus] = useState<'all' | CapStatus>('all');
  const [saving, setSaving] = useState(false);
  const [saveDone, setSaveDone] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [customSection, setCustomSection] = useState('General Quality & Compliance');
  const [customSeverity, setCustomSeverity] = useState<Exclude<ScoreOption, null | 'none' | 'na'>>('major');
  const [customOwner, setCustomOwner] = useState(report.factoryInfo.contactPerson || '');
  const [customTargetDate, setCustomTargetDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const openCount = capItems.filter((c) => c.status === 'open').length;
  const inProgressCount = capItems.filter((c) => c.status === 'in-progress').length;
  const closedCount = capItems.filter((c) => c.status === 'closed').length;
  const closurePercent = capItems.length > 0 ? Math.round((closedCount / capItems.length) * 100) : 100;

  const filteredItems = capItems.filter((item) =>
    filterStatus === 'all' ? true : item.status === filterStatus
  );

  const commitCapChange = async (updatedList: CapItem[], nextDismissed?: string[]) => {
    await onUpdateCapItems(updatedList, nextDismissed ?? report.dismissedCapIds);
  };

  const handleFieldUpdate = (capId: string, field: keyof CapItem, value: any) => {
    const updated = capItems.map((item) => {
      if (item.id !== capId) return item;
      const next: CapItem = { ...item, [field]: value };
      if (field === 'status') {
        if (value === 'closed') {
          next.closedAt = new Date().toISOString();
          next.verifiedBy = currentUser?.name || report.factoryInfo.auditorName || 'Auditor';
        } else {
          next.closedAt = undefined;
        }
      }
      return next;
    });
    commitCapChange(updated);
  };

  const handleUploadClosurePhotos = async (capId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newImages: CheckpointEvidence[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const meta = await optimizeAuditImageWithMeta(files[i], 1200, 0.72);
        newImages.push({
          id: `cap-img-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          dataUrl: meta.dataUrl,
          aspectRatio: meta.aspectRatio,
          isConfirmed: true,
          timestamp: new Date().toISOString(),
          caption: `Closure Evidence #${i + 1}`,
        });
      } catch (err) {
        console.warn('Error optimizing closure photo', err);
      }
    }

    if (newImages.length > 0) {
      const updated = capItems.map((item) =>
        item.id === capId
          ? { ...item, closureImages: [...(item.closureImages || []), ...newImages] }
          : item
      );
      commitCapChange(updated);
    }
    e.target.value = '';
  };

  const handleRemoveClosurePhoto = (capId: string, photoId: string) => {
    const updated = capItems.map((item) =>
      item.id === capId
        ? {
            ...item,
            closureImages: (item.closureImages || []).filter((img) => img.id !== photoId),
          }
        : item
    );
    commitCapChange(updated);
  };

  const handleSaveCap = async () => {
    try {
      setSaving(true);
      await commitCapChange(capItems);
      setSaveDone(true);
      setTimeout(() => setSaveDone(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadCapPdf = async () => {
    try {
      setDownloadingPdf(true);
      await generateCapPdf(report, capItems);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleAddCustomCap = () => {
    if (!customTitle.trim()) return;
    const nowIso = new Date().toISOString();
    const newItem: CapItem = {
      id: `cap-custom-${Date.now()}`,
      checkpointId: `cap-custom-${Date.now()}`,
      sectionId: 'custom',
      sectionName: customSection.trim() || 'General Quality & Compliance',
      checkpointCode: `CAP-${capItems.length + 1}`,
      checkpointTitle: customTitle.trim(),
      originalScore: customSeverity,
      originalNotes: customNotes.trim() || 'CAP issued for corrective action and closure verification.',
      originalImages: [],
      rootCause: '',
      correctiveAction: '',
      responsiblePerson: customOwner.trim() || report.factoryInfo.contactPerson || '',
      targetDate: customTargetDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      status: 'open',
      closureNotes: '',
      closureImages: [],
      issuedBy: isAdmin ? `Admin (${currentUser?.name || currentUser?.email})` : currentUser?.name || undefined,
      issuedAt: nowIso,
    };
    commitCapChange([...capItems, newItem]);
    setCustomTitle('');
    setCustomNotes('');
    setShowCustomModal(false);
  };

  const handleRemoveCapItem = async (item: CapItem) => {
    if (!isAdmin) return;
    const updatedList = capItems.filter((c) => c.id !== item.id);
    const existingDismissed = new Set<string>(report.dismissedCapIds || []);
    if (!item.id.startsWith('cap-custom-')) {
      existingDismissed.add(item.checkpointId || item.id);
      existingDismissed.add(item.id);
    }
    setConfirmRemoveId(null);
    await commitCapChange(updatedList, Array.from(existingDismissed));
  };

  const handleCloseAllCapItems = async () => {
    if (!isAdmin) return;
    const nowIso = new Date().toISOString();
    const verifier = currentUser?.name || 'Admin';
    const updated = capItems.map((item) =>
      item.status === 'closed'
        ? item
        : {
            ...item,
            status: 'closed' as CapStatus,
            closedAt: nowIso,
            verifiedBy: verifier,
          }
    );
    await commitCapChange(updated);
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto space-y-5 pb-24 animate-in fade-in duration-200">
      {/* CAP Header Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 border border-blue-200">
              CAP Management &amp; Closure
            </span>
            <span className="text-xs font-mono font-bold text-slate-600">
              {report.factoryInfo.auditReportNo || report.id}
            </span>
            <span className="text-xs text-slate-500">
              • Audit Date: {report.factoryInfo.auditDate || report.createdAt.split('T')[0]}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Corrective Action Plan (CAP) — {report.factoryInfo.name || 'Factory'}
          </h1>
          <p className="text-xs text-slate-500">
            Open findings, document Root Cause &amp; Corrective Actions, upload after-fix closure evidence photos, close CAP items, and export CAP PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToReport}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Report</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCustomModal(true)}
            className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAdmin ? 'Issue New CAP' : 'Open Custom CAP'}</span>
          </button>

          {isAdmin && openCount + inProgressCount > 0 && (
            <button
              type="button"
              onClick={handleCloseAllCapItems}
              className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="Verify & close all remaining CAP items as Admin"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Close All CAPs</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveCap}
            disabled={saving}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              saveDone
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
            }`}
          >
            {saveDone ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saveDone ? 'CAP Saved' : saving ? 'Saving...' : 'Save CAP'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCapPdf}
            disabled={downloadingPdf}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-70"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloadingPdf ? 'Generating CAP PDF...' : 'Download CAP PDF'}</span>
          </button>
        </div>
      </div>

      {/* CAP Summary Metrics Strip */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Total CAP Items</span>
            <span className="text-2xl font-black text-slate-900">{capItems.length}</span>
          </div>
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-center">
            <span className="text-[10px] font-bold uppercase text-red-700 block">Open</span>
            <span className="text-2xl font-black text-red-700">{openCount}</span>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
            <span className="text-[10px] font-bold uppercase text-amber-800 block">In Progress</span>
            <span className="text-2xl font-black text-amber-700">{inProgressCount}</span>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
            <span className="text-[10px] font-bold uppercase text-emerald-800 block">Closed (Verified)</span>
            <span className="text-2xl font-black text-emerald-700">{closedCount}</span>
          </div>
        </div>

        {/* Progress Bar & Filter Pills */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">CAP Closure Progress</span>
              <span className="font-black text-emerald-700">{closurePercent}% Closed</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                style={{ width: `${closurePercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(['all', 'open', 'in-progress', 'closed'] as const).map((statusKey) => (
              <button
                key={statusKey}
                type="button"
                onClick={() => setFilterStatus(statusKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize cursor-pointer transition-all whitespace-nowrap ${
                  filterStatus === statusKey
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {statusKey === 'all'
                  ? `All (${capItems.length})`
                  : statusKey === 'open'
                  ? `Open (${openCount})`
                  : statusKey === 'in-progress'
                  ? `In Progress (${inProgressCount})`
                  : `Closed (${closedCount})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom / Admin Issue CAP Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-black text-slate-900">
              {isAdmin ? 'Issue New CAP Item (Admin)' : 'Open New Custom CAP Item'}
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Section / Department</label>
                  <input
                    type="text"
                    value={customSection}
                    onChange={(e) => setCustomSection(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Severity Level</label>
                  <select
                    value={customSeverity}
                    onChange={(e) => {
                      const val = e.target.value as Exclude<ScoreOption, null | 'none' | 'na'>;
                      setCustomSeverity(val);
                      const days = val === 'critical' ? 2 : val === 'major' ? 14 : 30;
                      setCustomTargetDate(new Date(Date.now() + days * 86400000).toISOString().split('T')[0]);
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none font-semibold"
                  >
                    <option value="critical">Not Accepted (Critical - 0 pts)</option>
                    <option value="major">Below Expectation (Major - 3 pts)</option>
                    <option value="minor">Acceptable (Minor - 7 pts)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Issue / Finding Title *</label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Broken needle log register incomplete"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Responsible Person</label>
                  <input
                    type="text"
                    value={customOwner}
                    onChange={(e) => setCustomOwner(e.target.value)}
                    placeholder="e.g. QA Manager"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Completion Date</label>
                  <input
                    type="date"
                    value={customTargetDate}
                    onChange={(e) => setCustomTargetDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Finding Description</label>
                <textarea
                  rows={2}
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Describe the non-conformance and required corrective action..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomCap}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                {isAdmin ? 'Issue CAP Item' : 'Create CAP Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CAP Items List */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-sm space-y-2">
          <ShieldCheck className="w-12 h-12 text-emerald-600 mx-auto" />
          <h3 className="text-base font-black text-slate-900">
            {capItems.length === 0 ? 'No Non-Conformances Requiring CAP' : 'No CAP Items Match Selected Filter'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {capItems.length === 0
              ? 'All evaluated checkpoints passed with Good (10/10) or N/A. You can still open a custom CAP item above if needed.'
              : 'Switch filter above to view Open, In Progress, or Closed items.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item, idx) => {
            const sevMeta = SCORE_DEFINITIONS[item.originalScore];
            const isClosed = item.status === 'closed';
            const isInProgress = item.status === 'in-progress';

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all ${
                  isClosed
                    ? 'border-emerald-300'
                    : isInProgress
                    ? 'border-amber-300'
                    : 'border-red-200'
                }`}
              >
                {/* Item Top Header */}
                <div
                  className={`px-4 sm:px-5 py-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    isClosed
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : isInProgress
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-red-50/60 border-red-200'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-white border border-slate-300 text-[10px] font-mono font-bold text-slate-800">
                        CAP #{idx + 1} • {item.checkpointCode}
                      </span>
                      <span className="text-xs font-bold text-slate-600">{item.sectionName}</span>
                      {sevMeta && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${sevMeta.badgeBg}`}>
                          {sevMeta.label} ({sevMeta.points} pts)
                        </span>
                      )}
                      {item.issuedBy && (
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-bold">
                          Issued by {item.issuedBy}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900">
                      {item.checkpointTitle}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    <span
                      className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wide ${
                        isClosed
                          ? 'bg-emerald-600 text-white'
                          : isInProgress
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {isClosed ? 'Closed (Verified)' : isInProgress ? 'In Progress' : 'Open'}
                    </span>

                    {isAdmin && (
                      confirmRemoveId === item.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRemoveCapItem(item)}
                            className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold cursor-pointer"
                          >
                            Remove?
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-100/70 transition-colors cursor-pointer"
                          title="Admin: Remove this CAP item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="p-4 sm:p-5 space-y-4">
                  {/* Original Observation & Before-Fix Photos */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="text-xs text-slate-700">
                      <strong className="text-slate-900">Original Audit Finding: </strong>
                      <span>{item.originalNotes || 'Deviation flagged during inspection.'}</span>
                    </div>
                    {item.originalImages && item.originalImages.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[10px] font-bold uppercase text-slate-500 mr-1">
                          Audit Evidence ({item.originalImages.length}):
                        </span>
                        {item.originalImages.map((img, pIdx) => (
                          <button
                            key={img.id || pIdx}
                            type="button"
                            onClick={() => onOpenPreviewImage(img)}
                            className="w-14 h-14 rounded-lg overflow-hidden border border-slate-300 hover:border-blue-500 cursor-pointer shrink-0 bg-slate-900"
                            title="Preview Original Issue Photo"
                          >
                            <img src={img.dataUrl} alt={`Issue ${pIdx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Interactive CAP Status Toggle Buttons (Auditing Style) */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      CAP Status &amp; Closure Action (Select Status like Auditing):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleFieldUpdate(item.id, 'status', 'open')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          item.status === 'open'
                            ? 'bg-red-600 text-white border-red-700 shadow-md ring-2 ring-red-300'
                            : 'bg-white hover:bg-red-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black">Open</span>
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div className={`text-[10px] mt-1 ${item.status === 'open' ? 'text-red-100' : 'text-slate-500'}`}>
                          Correction Pending
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleFieldUpdate(item.id, 'status', 'in-progress')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          item.status === 'in-progress'
                            ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-md ring-2 ring-amber-300'
                            : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black">In Progress</span>
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className={`text-[10px] mt-1 ${item.status === 'in-progress' ? 'text-slate-900' : 'text-slate-500'}`}>
                          Action Implemented / Reviewing
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleFieldUpdate(item.id, 'status', 'closed')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          item.status === 'closed'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-300'
                            : 'bg-white hover:bg-emerald-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black">Closed (Verified)</span>
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className={`text-[10px] mt-1 ${item.status === 'closed' ? 'text-emerald-100' : 'text-slate-500'}`}>
                          Resolved &amp; Verified by Auditor
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Root Cause, Corrective Action, Owner, Target Date */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Root Cause Analysis (RCA)
                      </label>
                      <textarea
                        rows={2}
                        value={item.rootCause}
                        onChange={(e) => handleFieldUpdate(item.id, 'rootCause', e.target.value)}
                        placeholder="Why did this non-compliance occur?"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Corrective &amp; Preventive Action Plan
                      </label>
                      <textarea
                        rows={2}
                        value={item.correctiveAction}
                        onChange={(e) => handleFieldUpdate(item.id, 'correctiveAction', e.target.value)}
                        placeholder="Steps taken to fix and prevent recurrence..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Responsible Person / Dept
                      </label>
                      <div className="relative">
                        <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                        <input
                          type="text"
                          value={item.responsiblePerson}
                          onChange={(e) => handleFieldUpdate(item.id, 'responsiblePerson', e.target.value)}
                          placeholder="e.g. QA Manager / Production In-Charge"
                          className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Target Completion Date
                      </label>
                      <div className="relative">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                        <input
                          type="date"
                          value={item.targetDate}
                          onChange={(e) => handleFieldUpdate(item.id, 'targetDate', e.target.value)}
                          className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Closure Verification Notes & After-Fix Photos */}
                  <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                    <div className="md:col-span-7">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Auditor Closure / Follow-Up Verification Notes
                      </label>
                      <textarea
                        rows={2}
                        value={item.closureNotes}
                        onChange={(e) => handleFieldUpdate(item.id, 'closureNotes', e.target.value)}
                        placeholder="Record follow-up inspection verification remarks before closing CAP..."
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div className="md:col-span-5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                          <Images className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Closure Evidence Photos ({item.closureImages?.length || 0})</span>
                        </label>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          capture="environment"
                          ref={(el) => {
                            fileInputRefs.current[item.id] = el;
                          }}
                          onChange={(e) => handleUploadClosurePhotos(item.id, e)}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[item.id]?.click()}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>+ Closure Photo</span>
                        </button>
                      </div>

                      {item.closureImages && item.closureImages.length > 0 ? (
                        <div className="flex flex-row flex-nowrap items-center gap-2 overflow-x-auto p-2 bg-emerald-50/50 rounded-xl border border-emerald-200 no-scrollbar">
                          {item.closureImages.map((img, imgIdx) => (
                            <EvidencePhotoThumbnail
                              key={img.id}
                              photo={img}
                              index={imgIdx}
                              total={item.closureImages.length}
                              onPreview={onOpenPreviewImage}
                              onDelete={() => handleRemoveClosurePhoto(item.id, img.id)}
                              showActions={false}
                            />
                          ))}
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRefs.current[item.id]?.click()}
                          className="border border-dashed border-slate-300 hover:border-emerald-500 rounded-xl p-2.5 text-center bg-slate-50/60 hover:bg-emerald-50/40 cursor-pointer text-slate-500 hover:text-emerald-700 transition-colors"
                        >
                          <Camera className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                          <span className="text-[10px] font-semibold block">
                            Tap to upload after-fix closure evidence photo
                          </span>
                        </div>
                      )}
                    </div>
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
