import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, ShieldAlert } from 'lucide-react';
import { CheckpointItem } from '../types/audit';

interface Props {
  isOpen: boolean;
  sectionName: string;
  sectionCode: string;
  sectionNumber?: number;
  initialCheckpoint?: CheckpointItem | null;
  existingCount: number;
  onSave: (checkpoint: CheckpointItem) => void;
  onClose: () => void;
}

export const CheckpointManagerModal: React.FC<Props> = ({
  isOpen,
  sectionName,
  sectionCode,
  sectionNumber = 1,
  initialCheckpoint,
  existingCount,
  onSave,
  onClose,
}) => {
  const isEditing = !!initialCheckpoint;

  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [guidelines, setGuidelines] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialCheckpoint) {
        setCode(initialCheckpoint.code);
        setTitle(initialCheckpoint.title);
        setDescription(initialCheckpoint.description);
        setGuidelines(initialCheckpoint.guidelines || '');
      } else {
        // Automatic serial numbering: e.g. RAW-1.6, CUT-2.6
        const autoCode = `${sectionCode}-${sectionNumber}.${existingCount + 1}`;
        setCode(autoCode);
        setTitle('');
        setDescription('');
        setGuidelines('');
      }
      setError('');
    }
  }, [isOpen, initialCheckpoint, sectionCode, sectionNumber, existingCount]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Checkpoint title is required.');
      return;
    }
    if (!description.trim()) {
      setError('Checkpoint description / standard requirement is required.');
      return;
    }

    const checkpoint: CheckpointItem = {
      id: initialCheckpoint?.id || `cp-${Date.now()}`,
      code: code.trim().toUpperCase(),
      title: title.trim(),
      description: description.trim(),
      guidelines: guidelines.trim() || undefined,
      score: initialCheckpoint?.score || null,
      notes: initialCheckpoint?.notes || '',
      images: initialCheckpoint?.images || [],
      isCustom: true,
    };

    onSave(checkpoint);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            {isEditing ? <Edit2 className="w-5 h-5 text-amber-400" /> : <Plus className="w-5 h-5 text-emerald-400" />}
            <div>
              <h3 className="font-bold text-sm text-white">
                {isEditing ? 'Edit Checkpoint & Requirement' : 'Add Checkpoint (Auto-Numbered)'}
              </h3>
              <p className="text-xs text-slate-300">
                Section {sectionNumber}: {sectionName}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Checkpoint Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono uppercase focus:ring-2 focus:ring-blue-600 focus:outline-none"
                placeholder="RAW-1.6"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Checkpoint Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError('');
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
                placeholder="e.g. Fabric 4-Point Inspection System"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Technical Requirement & Standard Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError('');
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
              placeholder="Describe the standard requirement, tolerance, or inspection criteria..."
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Auditor Verification Guidelines (Optional)
            </label>
            <textarea
              rows={2}
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:outline-none"
              placeholder="What equipment, logs, or sampling method should the auditor inspect on-site?"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              {isEditing ? 'Save Changes' : 'Add Checkpoint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
