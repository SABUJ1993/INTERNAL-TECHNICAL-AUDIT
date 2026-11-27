import React, { useState } from 'react';
import {
  Check,
  Eye,
  ArrowRightLeft,
  Copy,
  Trash2,
} from 'lucide-react';
import { CheckpointEvidence } from '../types/audit';

interface EvidencePhotoThumbnailProps {
  photo: CheckpointEvidence;
  index: number;
  total?: number;
  onPreview: (photo: CheckpointEvidence) => void;
  onToggleConfirm?: (photoId: string) => void;
  onMove?: (photo: CheckpointEvidence) => void;
  onCopy?: (photo: CheckpointEvidence) => void;
  onDelete?: (photoId: string) => void;
  showActions?: boolean;
  className?: string;
}

export const EvidencePhotoThumbnail: React.FC<EvidencePhotoThumbnailProps> = ({
  photo,
  index,
  total,
  onPreview,
  onToggleConfirm,
  onMove,
  onCopy,
  onDelete,
  showActions = true,
  className = '',
}) => {
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(photo.aspectRatio);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      const calculated = Number((naturalWidth / naturalHeight).toFixed(4));
      if (!aspectRatio || Math.abs(calculated - aspectRatio) > 0.05) {
        setAspectRatio(calculated);
      }
    }
  };

  const isConfirmed = Boolean(photo.isConfirmed);

  // Aspect ratio formatting tag (e.g. 9:16 portrait vs 16:9 landscape)
  const isPortrait = aspectRatio ? aspectRatio < 0.85 : false;
  const isLandscape = aspectRatio ? aspectRatio > 1.25 : false;
  const ratioLabel = isPortrait ? '9:16' : isLandscape ? '16:9' : '4:3';

  // Responsive height based on orientation
  const heightClass = isPortrait
    ? 'h-48 sm:h-56'
    : isLandscape
    ? 'h-36 sm:h-44'
    : 'h-40 sm:h-48';

  return (
    <div
      className={`relative group rounded-xl overflow-hidden border border-slate-300 bg-slate-900 shadow-xs flex flex-col justify-between shrink-0 transition-all duration-200 hover:shadow-md ${heightClass} ${className}`}
      style={{
        aspectRatio: aspectRatio ? `${aspectRatio}` : undefined,
        minWidth: isPortrait ? '120px' : isLandscape ? '190px' : '150px',
        maxWidth: isPortrait ? '170px' : isLandscape ? '280px' : '220px',
      }}
    >
      {/* Background Image rendered cleanly preserving exact orientation */}
      <img
        src={photo.dataUrl}
        alt={photo.caption || `Evidence photo ${index + 1}`}
        onLoad={handleImageLoad}
        onClick={() => onPreview(photo)}
        className="w-full h-full object-cover object-center cursor-pointer transition-transform duration-200 group-hover:scale-102"
        loading="lazy"
      />

      {/* Top Left: Sequential Number & Native Orientation Badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1 z-20 pointer-events-none">
        <span className="bg-black/75 backdrop-blur-xs text-[10px] text-white px-2 py-0.5 rounded-md font-mono font-bold shadow-xs">
          #{index + 1}
        </span>
        <span className="bg-slate-900/80 backdrop-blur-xs text-[9px] text-slate-300 px-1.5 py-0.5 rounded font-mono hidden xs:inline shadow-xs">
          {ratioLabel}
        </span>
      </div>

      {/* Top Right: ONLY CLEAN GREEN CHECKMARK ICON (NO TEXT) */}
      {onToggleConfirm && (
        <div className="absolute top-2 right-2 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleConfirm(photo.id);
            }}
            title={
              isConfirmed
                ? 'Verified & Confirmed (Click to unmark)'
                : 'Click to mark as verified with green checkmark'
            }
            className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 shadow-md ${
              isConfirmed
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white ring-2 ring-white scale-105'
                : 'bg-black/60 hover:bg-emerald-600 text-white border border-white/60'
            }`}
          >
            <Check className="w-4 h-4 stroke-[3]" />
          </button>
        </div>
      )}

      {/* Caption strip if provided */}
      {photo.caption && (
        <div className="absolute inset-x-0 bottom-8 px-2 py-1 bg-black/60 text-white text-[10px] truncate pointer-events-none z-10">
          {photo.caption}
        </div>
      )}

      {/* Bottom Action Strip: View, Move, Copy, Delete - Always Accessible */}
      {showActions && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-1.5 py-1.5 flex items-center justify-between gap-1 z-20 opacity-95 sm:opacity-90 hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(photo);
            }}
            className="p-1 rounded-md bg-black/60 hover:bg-black/90 text-white text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
            title="Enlarge Photo"
          >
            <Eye className="w-3 h-3" />
            <span className="hidden xs:inline font-semibold">View</span>
          </button>

          <div className="flex items-center gap-1">
            {onMove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(photo);
                }}
                className="px-1.5 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors shadow-2xs"
                title="Move to Another Section"
              >
                <ArrowRightLeft className="w-2.5 h-2.5" />
                <span>Move</span>
              </button>
            )}

            {onCopy && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(photo);
                }}
                className="px-1.5 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors shadow-2xs"
                title="Copy / Duplicate Photo"
              >
                <Copy className="w-2.5 h-2.5" />
                <span>Copy</span>
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(photo.id);
                }}
                className="px-1.5 py-0.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold flex items-center gap-0.5 cursor-pointer transition-colors shadow-2xs"
                title="Delete Photo"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Del</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
