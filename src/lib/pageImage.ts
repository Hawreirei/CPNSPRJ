import { MAX_IMAGE_SIDE } from '../domain/photoImport';
import type { PageImage } from '../engine/photoImport';

/** A page ready to send, with an object URL to show it next to the questions copied from it. Revoke the URL when done. */
export type PreparedPage = PageImage & { url: string };

/** Scale a canvas down to the size sent to the model and compress it as JPEG. */
export async function fromCanvas(canvas: HTMLCanvasElement): Promise<PreparedPage> {
  let src = canvas;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(canvas.width, canvas.height));
  if (scale < 1) {
    src = document.createElement('canvas');
    src.width = Math.round(canvas.width * scale);
    src.height = Math.round(canvas.height * scale);
    const ctx = src.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, src.width, src.height);
  }
  const blob = await new Promise<Blob>((resolve, reject) => src.toBlob((b) => (b ? resolve(b) : reject(new Error('Gambar tidak bisa dikompresi.'))), 'image/jpeg', 0.85));
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return { mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), width: src.width, height: src.height, url: URL.createObjectURL(blob) };
}

/** A photo or picture file: turned upright (camera orientation), scaled, compressed. */
export async function fromImageFile(file: Blob): Promise<PreparedPage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Gambar tidak bisa dibaca browser ini. Pakai JPEG, PNG, atau WebP.');
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  // White under transparent PNGs, which JPEG would otherwise turn black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return fromCanvas(canvas);
}
