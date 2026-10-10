// The legacy build carries polyfills for what pdf.js uses from the newest JavaScript (Map.getOrInsertComputed),
// which the browsers of many phones do not have yet.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PreparedPage } from './pageImage';

/*
 * PDF pages are drawn in the browser and sent as images, one page per request (#38). Sending the PDF
 * itself would work only with Gemini and Claude (not every OpenAI-compatible model), would bill every
 * page of the file per request unless it were split first, which takes this same library, and would
 * leave nothing to show next to the copied questions. A drawn page costs a fixed, known number of
 * image tokens at every provider. This module, pdf.js and its worker load only when a PDF is picked;
 * the caller hands in how a drawn page becomes an image, so nothing else of the app lands in this chunk.
 */

GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfPages {
  count: number;
  render: (n: number) => Promise<PreparedPage>;
  close: () => Promise<void>;
}

export async function openPdf(file: Blob, maxSide: number, toPage: (canvas: HTMLCanvasElement) => Promise<PreparedPage>): Promise<PdfPages> {
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // Decoders for scanned pages (JBIG2, JPEG 2000) and colour profiles, served next to the app by vite.config.ts.
    wasmUrl: new URL('pdfjs/', document.baseURI).href,
    enableXfa: false,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    throw new Error((e as Error).name === 'PasswordException' ? 'PDF ini dilindungi kata sandi.' : 'Berkas PDF tidak bisa dibuka.');
  }
  return {
    count: doc.numPages,
    async render(n) {
      const canvas = document.createElement('canvas');
      try {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: maxSide / Math.max(base.width, base.height) });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, viewport, background: '#ffffff' }).promise;
        page.cleanup();
      } catch {
        throw new Error(`Halaman ${n} PDF ini tidak bisa digambar. Coba potret halamannya.`);
      }
      return toPage(canvas);
    },
    close: () => task.destroy(),
  };
}
