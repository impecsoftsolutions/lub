import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import {
  processProfilePhoto,
  cropAndCompressImage,
  compressImageOnly,
  CroppedAreaPixels,
} from '../lib/imageProcessing';

/**
 * In-modal ratio option. `aspect: null` means "Original" — no crop, just
 * resize+compress. When passed, the modal renders a small ratio selector and
 * lets the user pick per-image. When `ratioOptions` is omitted, the modal
 * keeps its previous controlled-aspect behavior (used by the cover-image
 * path).
 */
export interface CropRatioOption {
  value: string;
  label: string;
  /** null = Original (no crop) */
  aspect: number | null;
  /** Output width when aspect is not null. Ignored for Original. */
  outputWidth?: number;
  /** Output height when aspect is not null. Ignored for Original. */
  outputHeight?: number;
}

interface ImageCropModalProps {
  imageSrc: string;
  isOpen: boolean;
  onClose: () => void;
  onCropComplete: (
    croppedImageBlob: Blob,
    meta?: {
      pixelCrop?: CroppedAreaPixels | null;
      ratioValue?: string;
      isOriginal?: boolean;
    }
  ) => void;
  onError: (error: string) => void;
  /** Crop aspect ratio. Defaults to 3/4 (portrait, profile photos). Ignored when `ratioOptions` is provided. */
  aspect?: number;
  /** Output canvas width in px. Defaults to 900 (profile). Ignored when `ratioOptions` is provided. */
  outputWidth?: number;
  /** Output canvas height in px. Defaults to 1200 (profile). Ignored when `ratioOptions` is provided. */
  outputHeight?: number;
  /** Modal heading. Defaults to "Crop Profile Photo". */
  title?: string;
  /**
   * Optional in-modal ratio chooser. When provided, the modal renders a
   * selector and ignores the `aspect` / `outputWidth` / `outputHeight` props
   * unless a static option matches them.
   */
  ratioOptions?: CropRatioOption[];
  /** Initial value to highlight in the ratio chooser. Defaults to first option. */
  initialRatioValue?: string;
  /** Pre-load a source File for blob fallback when ratio is Original (saves an extra read). */
  sourceFile?: File | Blob;
  /** Notified when the user changes ratio inside the modal — used by parents for "remember last picked" between batch items. */
  onRatioChange?: (value: string) => void;
}

const ImageCropModal: React.FC<ImageCropModalProps> = ({
  imageSrc,
  isOpen,
  onClose,
  onCropComplete,
  onError,
  aspect,
  outputWidth,
  outputHeight,
  title,
  ratioOptions,
  initialRatioValue,
  sourceFile,
  onRatioChange,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedAreaPixels | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const hasRatioChoices = Array.isArray(ratioOptions) && ratioOptions.length > 0;

  // Resolve currently-selected ratio (only meaningful when hasRatioChoices)
  const [selectedRatioValue, setSelectedRatioValue] = useState<string>(
    () => initialRatioValue ?? (hasRatioChoices ? ratioOptions![0].value : '')
  );

  // If parent re-opens the modal with a new initial value, honor it.
  useEffect(() => {
    if (!hasRatioChoices) return;
    if (initialRatioValue && initialRatioValue !== selectedRatioValue) {
      setSelectedRatioValue(initialRatioValue);
    }
    // We deliberately ignore selectedRatioValue in deps to avoid feedback loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRatioValue, hasRatioChoices]);

  // Reset crop / zoom whenever the source image changes (per-file in batch).
  useEffect(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, [imageSrc]);

  // Resolve the active option (if any)
  const activeOption: CropRatioOption | null = useMemo(() => {
    if (!hasRatioChoices) return null;
    return ratioOptions!.find((opt) => opt.value === selectedRatioValue) ?? ratioOptions![0];
  }, [hasRatioChoices, ratioOptions, selectedRatioValue]);

  // Default behavior matches previous version: profile-photo 3:4 / 900×1200
  const fallbackAspect = aspect ?? 3 / 4;
  const fallbackOutputWidth = outputWidth ?? 900;
  const fallbackOutputHeight = outputHeight ?? 1200;
  const resolvedTitle = title ?? 'Crop Profile Photo';
  const isCustom = aspect !== undefined || outputWidth !== undefined || outputHeight !== undefined;

  // Effective aspect for the Cropper component
  const effectiveAspect: number | undefined = (() => {
    if (hasRatioChoices) {
      // Original path doesn't show the cropper UI at all.
      return activeOption?.aspect ?? undefined;
    }
    return fallbackAspect;
  })();

  const isOriginalMode = hasRatioChoices && activeOption?.aspect === null;

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropAreaComplete = useCallback(
    (_croppedArea: { x: number; y: number; width: number; height: number }, croppedAreaPixels: CroppedAreaPixels) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleSelectRatio = useCallback((value: string) => {
    setSelectedRatioValue(value);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (onRatioChange) onRatioChange(value);
  }, [onRatioChange]);

  const handleSave = async () => {
    try {
      setIsProcessing(true);

      // Original mode: no crop, just resize + compress.
      if (isOriginalMode) {
        if (!sourceFile) {
          onError('Original mode requires the source file.');
          return;
        }
        const blob = await compressImageOnly(sourceFile);
        onCropComplete(blob, {
          pixelCrop: null,
          ratioValue: activeOption?.value,
          isOriginal: true,
        });
        onClose();
        return;
      }

      // Crop mode requires a crop selection.
      if (!croppedAreaPixels) {
        onError('Please adjust the crop area');
        return;
      }

      let croppedBlob: Blob;
      if (hasRatioChoices && activeOption && activeOption.aspect !== null) {
        const w = activeOption.outputWidth ?? 1200;
        const h = activeOption.outputHeight ?? Math.round(w / activeOption.aspect);
        croppedBlob = await cropAndCompressImage(imageSrc, croppedAreaPixels, w, h);
      } else if (isCustom) {
        croppedBlob = await cropAndCompressImage(imageSrc, croppedAreaPixels, fallbackOutputWidth, fallbackOutputHeight);
      } else {
        croppedBlob = await processProfilePhoto(imageSrc, croppedAreaPixels);
      }
      onCropComplete(croppedBlob, {
        pixelCrop: croppedAreaPixels,
        ratioValue: activeOption?.value,
        isOriginal: false,
      });
      onClose();
    } catch (error) {
      console.error('Error processing image:', error);
      onError('Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-section font-semibold text-foreground">{resolvedTitle}</h2>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Crop surface — hidden in Original mode (no crop step) */}
        {isOriginalMode ? (
          <div className="flex-1 bg-muted/30 flex flex-col items-center justify-center p-6 gap-4" style={{ minHeight: '300px' }}>
            <img
              src={imageSrc}
              alt="Original preview"
              className="max-h-[55vh] max-w-full rounded-md border border-border object-contain"
            />
            <p className="text-xs text-muted-foreground text-center max-w-md">
              Original ratio selected. The image will be resized and compressed but not cropped.
            </p>
          </div>
        ) : (
          <div className="relative bg-black flex-1" style={{ minHeight: '400px' }}>
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={effectiveAspect}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropAreaComplete}
              style={{
                containerStyle: {
                  width: '100%',
                  height: '100%',
                },
              }}
            />
          </div>
        )}

        <div className="px-6 py-4 border-t border-border space-y-3">
          {/* Ratio chooser (mobile-first chip row at the top of the footer) */}
          {hasRatioChoices && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Ratio</label>
              <div className="flex flex-wrap gap-2">
                {ratioOptions!.map((opt) => {
                  const active = opt.value === selectedRatioValue;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelectRatio(opt.value)}
                      disabled={isProcessing}
                      className={
                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors border ' +
                        (active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:bg-muted')
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!isOriginalMode && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Zoom</label>
              <div className="flex items-center gap-3">
                <ZoomOut className="w-4 h-4 text-muted-foreground" />
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  disabled={isProcessing}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: `linear-gradient(to right, #3B82F6 0%, #3B82F6 ${((zoom - 1) / 2) * 100}%, #E5E7EB ${((zoom - 1) / 2) * 100}%, #E5E7EB 100%)`,
                  }}
                />
                <ZoomIn className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          )}

          <div className="bg-primary/5 border border-border rounded-lg p-3">
            <p className="text-sm text-foreground">
              {isOriginalMode ? (
                <>
                  <strong>Tip:</strong> The image will be saved at its native ratio. Pick another ratio above to crop instead.
                </>
              ) : (
                <>
                  <strong>Tip:</strong> Drag to reposition. Use the zoom slider to adjust size.
                </>
              )}
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isProcessing || (!isOriginalMode && !croppedAreaPixels)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Photo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCropModal;
