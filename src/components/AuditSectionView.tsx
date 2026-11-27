import React, { useState, useRef } from 'react';
import {
  Warehouse,
  Scissors,
  Printer,
  Sparkles,
  Shirt,
  Flame,
  PackageCheck,
  Camera,
  Trash2,
  Plus,
  Edit2,
  HelpCircle,
  FileText,
  AlertCircle,
  Info,
  RefreshCw,
  Eye,
  Check,
  ChevronRight,
  ChevronLeft,
  Image as ImageIcon,
  ArrowRightLeft,
  Copy,
} from 'lucide-react';
import {
  AuditSection,
  CheckpointItem,
  ScoreOption,
  SCORE_DEFINITIONS,
  CheckpointEvidence,
} from '../types/audit';
import { CheckpointManagerModal } from './CheckpointManagerModal';
import { MovePhotoModal } from './MovePhotoModal';
import { PhotoLocation } from './PhotoActionModal';
import { optimizeAuditImage, optimizeAuditImageWithMeta } from '../utils/imageCompressor';
import { EvidencePhotoThumbnail } from './EvidencePhotoThumbnail';
import { DEFAULT_AUDIT_SECTIONS } from '../data/defaultCheckpoints';
import { calculateSectionSummary } from '../utils/scoring';

interface Props {
  sections: AuditSection[];
  onUpdateSections: (updated: AuditSection[]) => void;
  onSubmitAndGenerateReport: () => void;
  onOpenPreviewImage: (evidence: CheckpointEvidence) => void;
  onOpenPhotoAction?: (evidence: CheckpointEvidence, sourceLocation: PhotoLocation) => void;
  onSyncCheckpoint?: (checkpointId: string, updatedSections: AuditSection[]) => Promise<void> | void;
  syncingCheckpointId?: string | null;
  activeSectionId?: string;
  onSelectSection?: (id: string) => void;
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  Warehouse,
  Scissors,
  Printer,
  Sparkles,
  Shirt,
  Flame,
  PackageCheck,
};

const COMMON_REMARKS_CHIPS: Record<string, string[]> = {
  warehouse: [
    'Fabric 4-point inspection log verified',
    'Shade segregation cards missing on rack',
    'Trims pull-test report verified',
    'Pallet clearance off floor <10cm',
    'Quarantine area open without lock',
  ],
  cutting: [
    'Fabric relaxation was <24 hours',
    'Fusing temp deviation >5°C observed',
    'Marker ratio matches approved tech pack',
    'Ply numbering tags intact and verified',
    'Cut piece template tolerance ±1.5mm',
  ],
  printing: [
    'Master strike-off signed by QA',
    'Screen mesh tension below 20 N/cm',
    'Crocking & wash fastness Grade 4 verified',
    'Tunnel dryer thermal graph calibrated',
    'Non-phthalate chemical certificate on file',
  ],
  embroidery: [
    'Broken needle log matched 100%',
    'Bobbin thread tension balanced on back',
    'Backing paper cleanly trimmed',
    'Hoop pressure marks visible on front panel',
    'Handheld metal detector tested on panels',
  ],
  sewing: [
    'Inline traffic light updated hourly',
    'Broken needle policy 100% compliant',
    'SPI measured: 11-12 SPI per specification',
    'Gold seal sample posted at line head',
    'Alteration tracking chart incomplete',
  ],
  ironing: [
    'Teflon shoe clean and free of burns',
    'Vacuum suction table fully operational',
    'Post-pressing measurements within tolerance',
    'Stain spotting exhaust hood active',
    '9-Point metal detector passed (1.0mm Fe)',
  ],
  packing: [
    'Polybag child warning & air holes compliant',
    'Barcode scans Grade A on first pass',
    'ISTA-1A carton drop test record on file',
    'Gross & Net weights accurate on scale',
    'Pre-shipment internal AQL 1.5 passed',
  ],
};

export const AuditSectionView: React.FC<Props> = ({
  sections,
  onUpdateSections,
  onSubmitAndGenerateReport,
  onOpenPreviewImage,
  onOpenPhotoAction,
  onSyncCheckpoint,
  syncingCheckpointId,
  activeSectionId: externalActiveSectionId,
  onSelectSection,
}) => {
  const [internalActiveSectionId, setInternalActiveSectionId] = useState<string>(
    sections[0]?.id || 'warehouse'
  );
  const activeSectionId = externalActiveSectionId || internalActiveSectionId;
  const setActiveSectionId = onSelectSection || setInternalActiveSectionId;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCheckpoint, setEditingCheckpoint] = useState<CheckpointItem | null>(null);
  const [showGuidelines, setShowGuidelines] = useState<Record<string, boolean>>({});
  const [movePhotoState, setMovePhotoState] = useState<{
    evidence: CheckpointEvidence;
    sourceCheckpointId: string;
    sourceCheckpointCode: string;
  } | null>(null);

  const activeSectionIndex = sections.findIndex((s) => s.id === activeSectionId);
  const currentSection = sections[activeSectionIndex] || sections[0];
  const sectionSummary = currentSection ? calculateSectionSummary(currentSection) : null;

  // File upload input ref mapping
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const toggleGuidelines = (id: string) => {
    setShowGuidelines((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirmMovePhoto = (
    sourceCheckpointId: string,
    targetCheckpointId: string,
    imageId: string
  ) => {
    let movedPhoto: CheckpointEvidence | undefined;

    // 1. Remove photo from source checkpoint
    const afterRemoval = sections.map((sec) => ({
      ...sec,
      checkpoints: sec.checkpoints.map((cp) => {
        if (cp.id === sourceCheckpointId) {
          movedPhoto = cp.images.find((img) => img.id === imageId);
          return {
            ...cp,
            images: cp.images.filter((img) => img.id !== imageId),
          };
        }
        return cp;
      }),
    }));

    // 2. Add photo to target checkpoint
    if (movedPhoto) {
      const finalSections = afterRemoval.map((sec) => ({
        ...sec,
        checkpoints: sec.checkpoints.map((cp) => {
          if (cp.id === targetCheckpointId) {
            return {
              ...cp,
              images: [...cp.images, movedPhoto!],
            };
          }
          return cp;
        }),
      }));
      onUpdateSections(finalSections);
    }
  };

  const handleScoreChange = (checkpointId: string, score: ScoreOption) => {
    const updated = sections.map((sec) => {
      if (sec.id !== currentSection.id) return sec;
      return {
        ...sec,
        checkpoints: sec.checkpoints.map((cp) => {
          if (cp.id !== checkpointId) return cp;
          return {
            ...cp,
            score: cp.score === score ? null : score,
            isUpdated: false,
          };
        }),
      };
    });
    onUpdateSections(updated);
  };

  const handleNotesChange = (checkpointId: string, notes: string) => {
    const updated = sections.map((sec) => {
      if (sec.id !== currentSection.id) return sec;
      return {
        ...sec,
        checkpoints: sec.checkpoints.map((cp) =>
          cp.id === checkpointId ? { ...cp, notes, isUpdated: false } : cp
        ),
      };
    });
    onUpdateSections(updated);
  };

  const handleToggleCheckpointUpdate = (checkpointId: string) => {
    const now = new Date().toISOString();
    const updated = sections.map((sec) => {
      if (sec.id !== currentSection.id) return sec;
      return {
        ...sec,
        checkpoints: sec.checkpoints.map((cp) => {
          if (cp.id !== checkpointId) return cp;
          return {
            ...cp,
            isUpdated: !cp.isUpdated,
            lastSyncedAt: now,
          };
        }),
      };
    });
    onUpdateSections(updated);
    onSyncCheckpoint?.(checkpointId, updated);
  };

  const handleAddRemarkChip = (checkpointId: string, chipText: string) => {
    const cp = currentSection.checkpoints.find((c) => c.id === checkpointId);
    if (!cp) return;
    const currentNotes = cp.notes.trim();
    const newNotes = currentNotes ? `${currentNotes}; ${chipText}` : chipText;
    handleNotesChange(checkpointId, newNotes);
  };

  // MULTIPLE PHOTO UPLOAD HANDLER WITH HIGH-RES AUTO OPTIMIZATION
  const handleMultipleImageCapture = async (
    checkpointId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const newEvidences: CheckpointEvidence[] = [];

    for (let index = 0; index < fileList.length; index++) {
      const file = fileList[index];
      try {
        const optimized = await optimizeAuditImageWithMeta(file, 1200, 0.72);
        newEvidences.push({
          id: `img-${Date.now()}-${index}-${Math.random().toString(36).substring(5)}`,
          dataUrl: optimized.dataUrl,
          aspectRatio: optimized.aspectRatio,
          timestamp: new Date().toISOString(),
          caption: file.name || `Photo #${index + 1}`,
          isConfirmed: false,
        });
      } catch (err) {
        console.warn('Error compressing checkpoint image', err);
      }
    }

    if (newEvidences.length > 0) {
      const updated = sections.map((sec) => {
        if (sec.id !== currentSection.id) return sec;
        return {
          ...sec,
          checkpoints: sec.checkpoints.map((cp) => {
            if (cp.id !== checkpointId) return cp;
            return {
              ...cp,
              images: [...cp.images, ...newEvidences],
              isUpdated: false,
            };
          }),
        };
      });
      onUpdateSections(updated);
    }
    e.target.value = '';
  };

  const handleToggleConfirmImage = (checkpointId: string, imageId: string) => {
    const updated = sections.map((sec) => {
      if (sec.id !== currentSection.id) return sec;
      return {
        ...sec,
        checkpoints: sec.checkpoints.map((cp) => {
          if (cp.id !== checkpointId) return cp;
          return {
            ...cp,
            images: cp.images.map((img) =>
              img.id === imageId ? { ...img, isConfirmed: !img.isConfirmed } : img
            ),
          };
        }),
      };
    });
    onUpdateSections(updated);
  };

  const handleRemoveImage = (checkpointId: string, imageId: string) => {
    const updated = sections.map((sec) => {
      if (sec.id !== currentSection.id) return sec;
      return {
        ...sec,
        checkpoints: sec.checkpoints.map((cp) => {
          if (cp.id !== checkpointId) return cp;
          return {
            ...cp,
            images: cp.images.filter((img) => img.id !== imageId),
            isUpdated: false,
          };
        }),
      };
    });
    onUpdateSections(updated);
  };

  const handleSaveCheckpoint = (checkpoint: CheckpointItem) => {
    const updated = sections.map((sec) => {
      if (sec.id !== currentSection.id) return sec;
      const exists = sec.checkpoints.some((c) => c.id === checkpoint.id);
      let newCheckpoints: CheckpointItem[];
      if (exists) {
        newCheckpoints = sec.checkpoints.map((c) => (c.id === checkpoint.id ? checkpoint : c));
      } else {
        newCheckpoints = [...sec.checkpoints, checkpoint];
      }
      return {
        ...sec,
        checkpoints: newCheckpoints,
      };
    });
    onUpdateSections(updated);
  };

  const handleDeleteCheckpoint = (checkpointId: string) => {
    if (!confirm('Are you sure you want to delete this checkpoint?')) return;
    const updated = sections.map((sec) => {
      if (sec.id !== currentSection.id) return sec;
      return {
        ...sec,
        checkpoints: sec.checkpoints.filter((cp) => cp.id !== checkpointId),
      };
    });
    onUpdateSections(updated);
  };

  const handleResetSection = () => {
    const defaultSec = DEFAULT_AUDIT_SECTIONS.find((s) => s.id === currentSection.id);
    if (!defaultSec) return;
    if (!confirm(`Reset checkpoints in "${currentSection.name}" to standard industry specifications?`)) return;

    const updated = sections.map((sec) => (sec.id === currentSection.id ? { ...defaultSec } : sec));
    onUpdateSections(updated);
  };

  const navigateSection = (direction: 'next' | 'prev') => {
    if (direction === 'next' && activeSectionIndex < sections.length - 1) {
      setActiveSectionId(sections[activeSectionIndex + 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (direction === 'prev' && activeSectionIndex > 0) {
      setActiveSectionId(sections[activeSectionIndex - 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const totalCheckpointsAll = sections.reduce((acc, s) => acc + s.checkpoints.length, 0);
  const totalEvaluatedAll = sections.reduce(
    (acc, s) => acc + s.checkpoints.filter((c) => c.score !== null).length,
    0
  );

  return (
    <div className="w-full max-w-[1720px] mx-auto space-y-3 pb-16 animate-in fade-in duration-150">
      {/* Compact Active Section Header Bar (Slim so checkpoints are visible immediately on mobile) */}
      {currentSection && sectionSummary && (
        <div className="bg-white rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase bg-slate-900 text-white font-mono shrink-0">
              {currentSection.code}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-slate-900 truncate">
                  {currentSection.name}
                </h1>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    sectionSummary.percentage >= 80 && sectionSummary.criticalCount === 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : sectionSummary.percentage >= 60 && sectionSummary.criticalCount === 0
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {sectionSummary.percentage}%
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block truncate">
                {sectionSummary.evaluatedCount}/{sectionSummary.totalCheckpoints} evaluated
                {sectionSummary.criticalCount > 0 && ` • ${sectionSummary.criticalCount} Critical issue`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingCheckpoint(null);
                setModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Checkpoint</span>
            </button>

            <button
              type="button"
              onClick={handleResetSection}
              className="px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer"
              title="Reset checkpoints to standard specifications"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>
      )}



      {/* Checkpoints List */}
      <div className="space-y-4">
        {currentSection?.checkpoints.map((cp, idx) => {
          const currentMeta = cp.score ? SCORE_DEFINITIONS[cp.score] : null;
          const showHelp = showGuidelines[cp.id];
          const hasImages = cp.images && cp.images.length > 0;
          const commonChips = COMMON_REMARKS_CHIPS[currentSection.id] || [];

          return (
            <div
              key={cp.id}
              className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                cp.score === 'critical'
                  ? 'border-red-400 ring-2 ring-red-100'
                  : cp.score === 'major'
                  ? 'border-yellow-400 ring-2 ring-yellow-100'
                  : cp.score === 'minor'
                  ? 'border-amber-400 ring-2 ring-amber-100'
                  : cp.score === 'none'
                  ? 'border-emerald-400 ring-1 ring-emerald-50'
                  : 'border-slate-200'
              }`}
            >
              {/* Checkpoint Header */}
              <div className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-black font-mono bg-blue-50 text-blue-800 border border-blue-200">
                        {cp.code || `${currentSection.code}-${activeSectionIndex + 1}.${idx + 1}`}
                      </span>
                      <h2 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">{cp.title}</h2>
                      {cp.isCustom && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700 uppercase">
                          Custom
                        </span>
                      )}
                      {/* Prominent Edit Requirement Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCheckpoint(cp);
                          setModalOpen(true);
                        }}
                        className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Edit checkpoint title and standard criteria description"
                      >
                        <Edit2 className="w-3 h-3 text-blue-600" />
                        <span>Edit Requirement</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-normal">{cp.description}</p>
                  </div>

                  {/* Actions: Update & Live Sync Checkbox, Help, Edit, Delete */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                    <label
                      onClick={(e) => e.stopPropagation()}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer select-none ${
                        syncingCheckpointId === cp.id
                          ? 'bg-blue-50 text-blue-700 border-blue-300'
                          : cp.isUpdated
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs'
                          : 'bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border-slate-300 hover:border-blue-300'
                      }`}
                      title="Save draft and sync this checkpoint live to all logged-in devices"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(cp.isUpdated)}
                        onChange={() => handleToggleCheckpointUpdate(cp.id)}
                        className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
                      />
                      <span>
                        {syncingCheckpointId === cp.id
                          ? 'Syncing...'
                          : cp.isUpdated
                          ? 'Updated'
                          : 'Update'}
                      </span>
                    </label>

                    {cp.guidelines && (
                      <button
                        type="button"
                        onClick={() => toggleGuidelines(cp.id)}
                        className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          showHelp ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                        }`}
                        title="View inspection guideline"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCheckpoint(cp);
                        setModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Edit checkpoint"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCheckpoint(cp.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete checkpoint"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Guidelines Accordion */}
                {showHelp && cp.guidelines && (
                  <div className="mt-3 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2 animate-in fade-in duration-100">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-blue-950">Auditor SOP Guidelines: </span>
                      <span>{cp.guidelines}</span>
                    </div>
                  </div>
                )}

                {/* 10-POINT SCORING SELECTOR */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Scoring Selection (10-Point Scale):
                    </span>
                    {currentMeta && (
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold border ${currentMeta.badgeBg}`}
                      >
                        Selected: {currentMeta.label} ({currentMeta.points} pts)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {/* 1. Not Accepted (0 Score) */}
                    <button
                      type="button"
                      onClick={() => handleScoreChange(cp.id, 'critical')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                        cp.score === 'critical'
                          ? 'bg-red-600 text-white border-red-700 shadow-md ring-2 ring-red-400'
                          : 'bg-white hover:bg-red-50 text-slate-800 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black truncate">Not Accepted</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                            cp.score === 'critical' ? 'bg-red-800 text-white' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          0 pts
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-1 font-semibold truncate ${
                          cp.score === 'critical' ? 'text-red-100' : 'text-red-600'
                        }`}
                      >
                        Critical Issue
                      </div>
                    </button>

                    {/* 2. Below Expectation (4 Score) */}
                    <button
                      type="button"
                      onClick={() => handleScoreChange(cp.id, 'major')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                        cp.score === 'major'
                          ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-md ring-2 ring-amber-400'
                          : 'bg-white hover:bg-amber-50 text-slate-800 border-amber-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black truncate">Below Expectation</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                            cp.score === 'major' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          4 pts
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-1 font-semibold truncate ${
                          cp.score === 'major' ? 'text-amber-950' : 'text-amber-700'
                        }`}
                      >
                        Major Issue
                      </div>
                    </button>

                    {/* 3. Acceptable (7 Score) */}
                    <button
                      type="button"
                      onClick={() => handleScoreChange(cp.id, 'minor')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                        cp.score === 'minor'
                          ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-400'
                          : 'bg-white hover:bg-blue-50 text-slate-800 border-blue-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black truncate">Acceptable</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                            cp.score === 'minor' ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          7 pts
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-1 font-semibold truncate ${
                          cp.score === 'minor' ? 'text-blue-100' : 'text-blue-600'
                        }`}
                      >
                        Minor Issue
                      </div>
                    </button>

                    {/* 4. Good (10 Score) */}
                    <button
                      type="button"
                      onClick={() => handleScoreChange(cp.id, 'none')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                        cp.score === 'none'
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-500'
                          : 'bg-white hover:bg-emerald-50 text-slate-800 border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black truncate">Good</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                            cp.score === 'none' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          10 pts
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-1 font-semibold truncate ${
                          cp.score === 'none' ? 'text-emerald-100' : 'text-emerald-700'
                        }`}
                      >
                        No Issue
                      </div>
                    </button>

                    {/* 5. N/A Option (Excluded) */}
                    <button
                      type="button"
                      onClick={() => handleScoreChange(cp.id, 'na')}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer col-span-2 sm:col-span-1 relative ${
                        cp.score === 'na'
                          ? 'bg-slate-700 text-white border-slate-800 shadow-md ring-2 ring-slate-400'
                          : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black truncate">N/A</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                            cp.score === 'na' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          Excl.
                        </span>
                      </div>
                      <div
                        className={`text-[10px] mt-1 font-semibold truncate ${
                          cp.score === 'na' ? 'text-slate-200' : 'text-slate-400'
                        }`}
                      >
                        Not Applicable
                      </div>
                    </button>
                  </div>
                </div>

                {/* MULTIPLE PHOTO UPLOAD & NOTES / REMARKS */}
                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                  {/* Left: Notes Textarea & Quick Chips */}
                  <div className="md:col-span-7 space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Notes / Remarks & Observations:
                    </label>
                    <textarea
                      rows={2}
                      value={cp.notes}
                      onChange={(e) => handleNotesChange(cp.id, e.target.value)}
                      placeholder="Record specific machine ID, sample count, measured deviation, or observations..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />

                    {/* Quick suggestion chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
                      <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Quick Add:</span>
                      {commonChips.slice(0, 3).map((chip, chipIdx) => (
                        <button
                          key={chipIdx}
                          type="button"
                          onClick={() => handleAddRemarkChip(cp.id, chip)}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium shrink-0 transition-colors cursor-pointer"
                        >
                          + {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right: MULTIPLE PHOTO EVIDENCE UPLOAD */}
                  <div className="md:col-span-5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1">
                        <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span>Evidence Photos ({cp.images?.length || 0})</span>
                      </label>

                      {/* Hidden camera/file input with MULTIPLE enabled */}
                      <input
                        type="file"
                        multiple
                        ref={(el) => {
                          fileInputRefs.current[cp.id] = el;
                        }}
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleMultipleImageCapture(cp.id, e)}
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[cp.id]?.click()}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-blue-200"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>+ Add Photos</span>
                      </button>
                    </div>

                    {hasImages ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-row flex-nowrap items-center gap-2.5 overflow-x-auto p-2 bg-slate-50 rounded-xl border border-slate-200 no-scrollbar">
                          {cp.images.map((img, imgIdx) => (
                            <EvidencePhotoThumbnail
                              key={img.id}
                              photo={img}
                              index={imgIdx}
                              total={cp.images.length}
                              onPreview={onOpenPreviewImage}
                              onToggleConfirm={() => handleToggleConfirmImage(cp.id, img.id)}
                              onMove={() =>
                                onOpenPhotoAction?.(img, {
                                  type: 'checkpoint',
                                  id: cp.id,
                                  code: cp.code,
                                  title: `${cp.code} - ${cp.title}`,
                                })
                              }
                              onCopy={() =>
                                onOpenPhotoAction?.(img, {
                                  type: 'checkpoint',
                                  id: cp.id,
                                  code: cp.code,
                                  title: `${cp.code} - ${cp.title}`,
                                })
                              }
                              onDelete={() => handleRemoveImage(cp.id, img.id)}
                              showActions={true}
                            />
                          ))}

                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[cp.id]?.click()}
                            className="w-20 h-20 rounded-xl border-2 border-dashed border-blue-300 hover:border-blue-500 bg-white hover:bg-blue-50/50 flex flex-col items-center justify-center text-blue-600 transition-colors cursor-pointer shrink-0"
                            title="Add more photos"
                          >
                            <Plus className="w-4 h-4" />
                            <span className="text-[10px] font-bold">Add Photo</span>
                          </button>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {cp.images.length} photo(s) saved. Tap to preview, move to another checkpoint, or delete.
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRefs.current[cp.id]?.click()}
                        className="border border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-2.5 text-center bg-slate-50/60 hover:bg-blue-50/40 transition-colors cursor-pointer text-slate-500 hover:text-blue-600"
                      >
                        <Camera className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                        <span className="text-[10px] font-semibold block">
                          Tap to take photo or upload multiple images
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

      {/* Dynamic Checkpoint Modal */}
      <CheckpointManagerModal
        isOpen={modalOpen}
        sectionName={currentSection?.name || ''}
        sectionCode={currentSection?.code || ''}
        sectionNumber={activeSectionIndex + 1}
        initialCheckpoint={editingCheckpoint}
        existingCount={currentSection?.checkpoints.length || 0}
        onSave={handleSaveCheckpoint}
        onClose={() => {
          setModalOpen(false);
          setEditingCheckpoint(null);
        }}
      />

      {/* Move Photo Modal */}
      <MovePhotoModal
        isOpen={!!movePhotoState}
        evidence={movePhotoState?.evidence || null}
        sourceCheckpointId={movePhotoState?.sourceCheckpointId || ''}
        sourceCheckpointCode={movePhotoState?.sourceCheckpointCode || ''}
        sections={sections}
        onConfirmMove={handleConfirmMovePhoto}
        onClose={() => setMovePhotoState(null)}
      />

      {/* Ultra-Slim Bottom Navigation & Submit Bar (Mobile & Desktop Optimized) */}
      <div className="sticky bottom-0 sm:bottom-2 z-30 bg-slate-900/95 backdrop-blur-md rounded-t-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-4 sm:py-2 text-white shadow-xl border-t sm:border border-slate-800 flex items-center justify-between gap-1.5 sm:gap-2">
        {/* Navigation Arrows */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            disabled={activeSectionIndex === 0}
            onClick={() => navigateSection('prev')}
            className="px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
            title="Previous Section"
          >
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-[11px] sm:text-xs">Prev</span>
          </button>

          <span className="text-[11px] text-slate-400 font-semibold hidden md:inline">
            Sec {activeSectionIndex + 1}/{sections.length}
          </span>

          <button
            type="button"
            disabled={activeSectionIndex === sections.length - 1}
            onClick={() => navigateSection('next')}
            className="px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
            title="Next Section"
          >
            <span className="text-[11px] sm:text-xs">Next</span>
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Audit Progress Summary - Super compact inline info */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 text-[10px] sm:text-xs text-slate-300 font-mono">
          <span>
            Eval: <strong className="text-white">{totalEvaluatedAll}/{totalCheckpointsAll}</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Score: <strong className="text-blue-400">{sectionSummary?.percentage}%</strong>
          </span>
        </div>

        {/* Submit Audit & Generate Report CTA Button */}
        <button
          type="button"
          onClick={onSubmitAndGenerateReport}
          className="px-3 py-1.5 sm:px-4 sm:py-1.5 rounded-lg sm:rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer group shrink-0"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="text-[11px] sm:text-xs">Submit Audit</span>
          <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
};
