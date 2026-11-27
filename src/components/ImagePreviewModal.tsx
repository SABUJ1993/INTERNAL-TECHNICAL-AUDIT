import React from 'react';
import { X, Calendar, Download, Trash2, ArrowRightLeft, Copy } from 'lucide-react';
import { CheckpointEvidence } from '../types/audit';

interface Props {
  image: CheckpointEvidence | null;
  onClose: () => void;
  onDelete?: (imageId: string) => void;
  onMove?: (image: CheckpointEvidence) => void;
  onCopy?: (image: CheckpointEvidence) => void;
}

export const ImagePreviewModal: React.FC<Props> = ({
  image,
  onClose,
  onDelete,
  onMove,
  onCopy,
}) => {
  if (!image) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="relative max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <div>
              <h3 className="text-sm font-bold text-white">Photo Evidence View</h3>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                <Calendar className="w-3 h-3" />
                {image.timestamp ? new Date(image.timestamp).toLocaleString() : 'Captured on site'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {onCopy && (
              <button
                type="button"
                onClick={() => {
                  onCopy(image);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 border border-indigo-500/30 transition-colors cursor-pointer"
                title="Copy / duplicate this photo to another location"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy Photo</span>
              </button>
            )}

            {onMove && (
              <button
                type="button"
                onClick={() => {
                  onMove(image);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-xs font-semibold flex items-center gap-1.5 border border-blue-500/30 transition-colors cursor-pointer"
                title="Move this photo to another checkpoint"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Move Photo</span>
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(image.id);
                  onClose();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 border border-red-500/30 transition-colors cursor-pointer shadow-xs"
                title="Delete this photo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Photo</span>
              </button>
            )}

            <a
              href={image.dataUrl}
              download={`audit_evidence_${image.id}.jpg`}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Download image"
            >
              <Download className="w-4 h-4" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-red-900/40 text-slate-300 hover:text-red-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image body */}
        <div className="flex-1 overflow-auto bg-slate-950 p-3 sm:p-4 flex items-center justify-center min-h-[280px]">
          <img
            src={image.dataUrl}
            alt="Evidence preview"
            className="max-h-[68vh] w-auto max-w-full object-contain rounded-lg shadow-lg border border-slate-800"
          />
        </div>

        {/* Caption bar */}
        {image.caption && (
          <div className="px-5 py-2.5 bg-slate-900 border-t border-slate-800 text-xs text-slate-300 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-400">Caption: </span>
              <span>{image.caption}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">ID: {image.id}</span>
          </div>
        )}
      </div>
    </div>
  );
};
