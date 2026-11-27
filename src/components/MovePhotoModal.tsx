import React, { useState } from 'react';
import { X, ArrowRightLeft, FolderSymlink, CheckCircle2 } from 'lucide-react';
import { AuditSection, CheckpointEvidence } from '../types/audit';

interface Props {
  isOpen: boolean;
  evidence: CheckpointEvidence | null;
  sourceCheckpointId: string;
  sourceCheckpointCode: string;
  sections: AuditSection[];
  onConfirmMove: (sourceCheckpointId: string, targetCheckpointId: string, imageId: string) => void;
  onClose: () => void;
}

export const MovePhotoModal: React.FC<Props> = ({
  isOpen,
  evidence,
  sourceCheckpointId,
  sourceCheckpointCode,
  sections,
  onConfirmMove,
  onClose,
}) => {
  if (!isOpen || !evidence) return null;

  // Find which section currently holds the source checkpoint
  const currentSection = sections.find((s) => s.checkpoints.some((c) => c.id === sourceCheckpointId));
  const [selectedSectionId, setSelectedSectionId] = useState<string>(currentSection?.id || sections[0]?.id || '');

  const targetSection = sections.find((s) => s.id === selectedSectionId) || sections[0];
  const eligibleCheckpoints = targetSection?.checkpoints.filter((c) => c.id !== sourceCheckpointId) || [];
  
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>(
    eligibleCheckpoints[0]?.id || targetSection?.checkpoints[0]?.id || ''
  );

  const handleSectionChange = (sectionId: string) => {
    setSelectedSectionId(sectionId);
    const sec = sections.find((s) => s.id === sectionId);
    if (sec && sec.checkpoints.length > 0) {
      const firstEligible = sec.checkpoints.find((c) => c.id !== sourceCheckpointId);
      setSelectedCheckpointId(firstEligible?.id || sec.checkpoints[0]?.id || '');
    }
  };

  const handleMove = () => {
    if (!selectedCheckpointId || selectedCheckpointId === sourceCheckpointId) return;
    onConfirmMove(sourceCheckpointId, selectedCheckpointId, evidence.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Move Photo Evidence</h3>
              <p className="text-xs text-slate-300">
                Transfer image from <strong className="text-blue-400 font-mono">{sourceCheckpointCode}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Photo Preview Thumbnail */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <img
              src={evidence.dataUrl}
              alt="Evidence to move"
              className="w-16 h-16 rounded-lg object-cover border border-slate-300 shadow-xs shrink-0"
            />
            <div className="text-xs min-w-0">
              <span className="font-bold text-slate-800 block truncate">
                {evidence.caption || 'Captured Photo Evidence'}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Timestamp: {evidence.timestamp ? new Date(evidence.timestamp).toLocaleTimeString() : 'N/A'}
              </span>
              <span className="inline-block mt-1 text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono font-bold">
                From: {sourceCheckpointCode}
              </span>
            </div>
          </div>

          {/* Target Section Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select Destination Section:
            </label>
            <select
              value={selectedSectionId}
              onChange={(e) => handleSectionChange(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none"
            >
              {sections.map((sec, idx) => (
                <option key={sec.id} value={sec.id}>
                  Section {idx + 1}: {sec.name} ({sec.code})
                </option>
              ))}
            </select>
          </div>

          {/* Target Checkpoint Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select Destination Checkpoint:
            </label>
            <select
              value={selectedCheckpointId}
              onChange={(e) => setSelectedCheckpointId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-medium"
            >
              {targetSection?.checkpoints.map((cp) => (
                <option key={cp.id} value={cp.id} disabled={cp.id === sourceCheckpointId}>
                  {cp.code} - {cp.title} {cp.id === sourceCheckpointId ? '(Current)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              This photo will be safely transferred to the selected checkpoint.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={!selectedCheckpointId || selectedCheckpointId === sourceCheckpointId}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <FolderSymlink className="w-3.5 h-3.5" />
            <span>Confirm Move</span>
          </button>
        </div>
      </div>
    </div>
  );
};
