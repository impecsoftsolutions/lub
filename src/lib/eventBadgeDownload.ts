export function normalizeEventBadgeCode(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().toUpperCase();
  return /^[A-Z0-9_-]+$/.test(normalized) ? normalized : null;
}

async function convertImageBlobToJpegBlob(input: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(input);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('image_load_failed'));
      element.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas_context_missing');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const jpegBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95);
    });
    if (!jpegBlob) throw new Error('jpeg_encode_failed');
    return jpegBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function badgeResponseToJpegBlob(response: Response): Promise<Blob> {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const sourceBlob = await response.blob();
  if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
    return sourceBlob;
  }
  if (contentType.startsWith('image/')) {
    return convertImageBlobToJpegBlob(sourceBlob);
  }
  const pdfBytes = await sourceBlob.arrayBuffer();
  const { renderPdfFirstPageAsJpegBlob } = await import('./pdfImageRender');
  return renderPdfFirstPageAsJpegBlob(pdfBytes);
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
