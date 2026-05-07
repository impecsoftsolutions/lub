import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDF_RENDER_SCALE = 2.5;
const JPEG_QUALITY = 0.92;

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not render PDF page.'));
          return;
        }
        resolve(new File([blob], name, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) return source;

  const target = document.createElement('canvas');
  const sideways = normalized === 90 || normalized === 270;
  target.width = sideways ? source.height : source.width;
  target.height = sideways ? source.width : source.height;

  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('Could not rotate PDF page.');

  ctx.translate(target.width / 2, target.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return target;
}

export async function renderPdfFirstPageAsImages(file: File): Promise<File[]> {
  const bytes = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not render PDF page.');

  await page.render({ canvasContext: ctx, viewport }).promise;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'aadhaar';
  const rotations = [0, 90, 270, 180];
  const rendered: File[] = [];
  for (const degrees of rotations) {
    const rotated = rotateCanvas(canvas, degrees);
    rendered.push(await canvasToFile(rotated, `${baseName}-page1-r${degrees}.jpg`));
  }
  return rendered;
}

export async function renderPdfFirstPageAsJpegBlob(
  pdfBytes: ArrayBuffer,
  opts?: { scale?: number; quality?: number },
): Promise<Blob> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: opts?.scale ?? PDF_RENDER_SCALE });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not render PDF page.');

  await page.render({ canvasContext: ctx, viewport }).promise;

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not export PDF preview image.'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      opts?.quality ?? JPEG_QUALITY,
    );
  });
}
