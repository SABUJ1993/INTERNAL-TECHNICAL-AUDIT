/**
 * High-performance browser-side image optimizer for QMS audits.
 * Compresses raw camera photos (10-30MB) down to crisp, standardized ~150KB-250KB Web JPEGs.
 * Preserves true aspect ratio without squishing or distortion.
 * Supports dynamic orientations: Portrait (9:16), Landscape (16:9), 4:3, 1:1, etc.
 */

export interface OptimizedImageResult {
  dataUrl: string;
  aspectRatio: number;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape' | 'square';
}

/**
 * Optimizes an image and returns full metadata including true aspect ratio.
 */
export async function optimizeAuditImageWithMeta(
  fileOrDataUrl: File | string,
  maxDimension = 1200,
  quality = 0.72
): Promise<OptimizedImageResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (!width || !height) {
        // Fallback to original if dimensions can't be read
        if (typeof fileOrDataUrl === 'string') {
          resolve({
            dataUrl: fileOrDataUrl,
            aspectRatio: 1.333,
            width: 1200,
            height: 900,
            orientation: 'landscape',
          });
        } else {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              dataUrl: reader.result as string,
              aspectRatio: 1.333,
              width: 1200,
              height: 900,
              orientation: 'landscape',
            });
          };
          reader.readAsDataURL(fileOrDataUrl);
        }
        return;
      }

      const rawAspectRatio = Number((width / height).toFixed(4));
      const orientation =
        rawAspectRatio < 0.95
          ? 'portrait'
          : rawAspectRatio > 1.05
          ? 'landscape'
          : 'square';

      // Constrain longer edge to maxDimension while strictly preserving exact aspect ratio
      const maxSide = Math.max(width, height);
      if (maxSide > maxDimension) {
        const scale = maxDimension / maxSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (typeof fileOrDataUrl === 'string') {
          resolve({
            dataUrl: fileOrDataUrl,
            aspectRatio: rawAspectRatio,
            width,
            height,
            orientation,
          });
        } else {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              dataUrl: reader.result as string,
              aspectRatio: rawAspectRatio,
              width,
              height,
              orientation,
            });
          reader.readAsDataURL(fileOrDataUrl);
        }
        return;
      }

      // High quality smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({
        dataUrl: optimizedDataUrl,
        aspectRatio: rawAspectRatio,
        width,
        height,
        orientation,
      });
    };

    img.onerror = () => {
      if (typeof fileOrDataUrl === 'string') {
        resolve({
          dataUrl: fileOrDataUrl,
          aspectRatio: 1.333,
          width: 800,
          height: 600,
          orientation: 'landscape',
        });
      } else {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            dataUrl: reader.result as string,
            aspectRatio: 1.333,
            width: 800,
            height: 600,
            orientation: 'landscape',
          });
        reader.readAsDataURL(fileOrDataUrl);
      }
    };

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

/**
 * Standard optimizer returning data URL string.
 */
export async function optimizeAuditImage(
  fileOrDataUrl: File | string,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.72
): Promise<string> {
  const maxDim = Math.max(maxWidth, maxHeight, 1200);
  const result = await optimizeAuditImageWithMeta(fileOrDataUrl, maxDim, quality);
  return result.dataUrl;
}
