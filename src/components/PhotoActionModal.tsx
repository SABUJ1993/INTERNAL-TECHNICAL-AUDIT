import React, { useState } from 'react';
import { X, ArrowRightLeft, Copy, Trash2, FolderSymlink, Check, Building2, Camera } from 'lucide-react';
import { AuditSection, CheckpointEvidence } from '../types/audit';

export type PhotoLocationType = 'checkpoint' | 'outlook' | 'opening';

export interface PhotoLocation {
  type: PhotoLocationType;
  id: string; // checkpointId, or 'outlook', or 'opening'
  title: string;
  code?: string;
}

interface Props {
  isOpen: boolean;
  evidence: CheckpointEvidence | null;
  sourceLocation: PhotoLocation | null;
  sections: AuditSection[];
  onConfirmAction: (
    action: 'move' | 'copy',
    source: PhotoLocation,
    target: PhotoLocation,
    evidence: CheckpointEvidence
  ) => void;
  onClose: () => void;
}

export const PhotoActionModal: React.FC<Props> = ({
  isOpen,
  evidence,
  sourceLocation,
  sections,
  onConfirmAction,
  onClose,
}) => {
  const [actionType, setActionType] = useState<'copy' | 'move'>('copy');
  const [targetType, setTargetType] = useState<PhotoLocationType>('checkpoint');
  const [selectedSectionId, setSelectedSectionId] = useState<string>(sections[0]?.id || '');
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string>('');

  if (!isOpen || !evidence || !sourceLocation) return null;

  const currentTargetSection = sections.find((s) => s.id === selectedSectionId) || sections[0];
  const eligibleCheckpoints = currentTargetSection?.checkpoints.filter(
    (c) => !(sourceLocation.type === 'checkpoint' && c.id === sourceLocation.id)
  ) || [];

  const effectiveCheckpointId =
    selectedCheckpointId && eligibleCheckpoints.some((c) => c.id === selectedCheckpointId)
      ? selectedCheckpointId
      : eligibleCheckpoints[0]?.id || currentTargetSection?.checkpoints[0]?.id || '';

  const handleSectionSelect = (secId: string) => {
    setSelectedSectionId(secId);
    const sec = sections.find((s) => s.id === secId);
    if (sec && sec.checkpoints.length > 0) {
      const firstEligible = sec.checkpoints.find(
        (c) => !(sourceLocation.type === 'checkpoint' && c.id === sourceLocation.id)
      );
      setSelectedCheckpointId(firstEligible?.id || sec.checkpoints[0]?.id || '');
    }
  };

  const handleExecute = () => {
    let target: PhotoLocation;

    if (targetType === 'outlook') {
      target = { type: 'outlook', id: 'outlook', title: 'Factory Outlook / Exterior Photos' };
    } else if (targetType === 'opening') {
      target = { type: 'opening', id: 'opening', title: 'Opening Meeting Photo' };
    } else {
      const cp = currentTargetSection?.checkpoints.find((c) => c.id === effectiveCheckpointId);
      if (!cp) return;
      target = {
        type: 'checkpoint',
        id: cp.id,
        code: cp.code,
        title: `${cp.code} - ${cp.title}`,
      };
    }

    onConfirmAction(actionType, sourceLocation, target, evidence);
    onClose();
  };

  const isSameAsSource =
    (targetType === 'outlook' && sourceLocation.type === 'outlook') ||
    (targetType === 'opening' && sourceLocation.type === 'opening') ||
    (targetType === 'checkpoint' &&
      sourceLocation.type === 'checkpoint' &&
      effectiveCheckpointId === sourceLocation.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30">
              {actionType === 'copy' ? <Copy className="w-4 h-4" /> : <ArrowRightLeft className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {actionType === 'copy' ? 'Copy Photo (Duplicate)' : 'Move Photo (Transfer)'}
              </h3>
              <p className="text-xs text-slate-300">
                Source: <strong className="text-blue-400 font-semibold">{sourceLocation.title}</strong>
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

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Action Mode Switcher: Copy vs Move */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Select Action:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActionType('copy')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  actionType === 'copy'
                    ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy (Keep Original)</span>
              </button>
              <button
                type="button"
                onClick={() => setActionType('move')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  actionType === 'move'
                    ? 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-300'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Move (Transfer)</span>
              </button>
            </div>
          </div>

          {/* Photo Thumbnail */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-300 flex items-center justify-center">
              <img
                src={evidence.dataUrl}
                alt="Evidence"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-xs min-w-0">
              <span className="font-bold text-slate-800 block truncate">
                {evidence.caption || 'Captured Photo Evidence'}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Timestamp: {evidence.timestamp ? new Date(evidence.timestamp).toLocaleTimeString() : 'N/A'}
              </span>
              <span className="inline-block mt-1 text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                Location: {sourceLocation.title}
              </span>
            </div>
          </div>

          {/* Destination Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Destination Category:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTargetType('checkpoint')}
                className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  targetType === 'checkpoint'
                    ? 'bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-500'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FolderSymlink className="w-4 h-4" />
                <span>Checkpoints</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('outlook')}
                className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  targetType === 'outlook'
                    ? 'bg-purple-50 border-purple-600 text-purple-700 ring-1 ring-purple-500'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Factory Outlook</span>
              </button>
              <button
                type="button"
                onClick={() => setTargetType('opening')}
                className={`p-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  targetType === 'opening'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-700 ring-1 ring-emerald-500'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Opening Meeting</span>
              </button>
            </div>
          </div>

          {/* If Checkpoint category is selected, show Section and Checkpoint pickers */}
          {targetType === 'checkpoint' && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Section:</label>
                <select
                  value={selectedSectionId}
                  onChange={(e) => handleSectionSelect(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-medium"
                >
                  {sections.map((sec, idx) => (
                    <option key={sec.id} value={sec.id}>
                      Section {idx + 1}: {sec.name} ({sec.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Checkpoint:</label>
                <select
                  value={effectiveCheckpointId}
                  onChange={(e) => setSelectedCheckpointId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-none font-medium"
                >
                  {currentTargetSection?.checkpoints.map((cp) => {
                    const isCurrent = sourceLocation.type === 'checkpoint' && cp.id === sourceLocation.id;
                    return (
                      <option key={cp.id} value={cp.id} disabled={isCurrent}>
                        {cp.code} - {cp.title} {isCurrent ? '(Current)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          {isSameAsSource && (
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-800 text-xs border border-amber-200 flex items-center gap-2">
              <span>Cannot {actionType} to the exact same location as the source. Please choose a different target.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={isSameAsSource}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {actionType === 'copy' ? <Copy className="w-3.5 h-3.5" /> : <FolderSymlink className="w-3.5 h-3.5" />}
            <span>Confirm {actionType === 'copy' ? 'Copy' : 'Move'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
