import type { Question, QuestionImage } from './types';

/*
 * A picture cut from the learner's own page and attached to a question (#49). Kept as a compressed
 * data URL on the question itself, so it travels with backups and, when chosen, shared sets, with
 * no separate store to keep in step. Size is capped so a bank of them stays within browser quota.
 */

/** Longest side of a stored picture: enough for a diagram or a chart at question width. */
export const MAX_IMAGE_SIDE = 1000;
/** Largest data URL kept per picture (about 300 KB of JPEG). */
export const MAX_IMAGE_CHARS = 400_000;

// JPEG or PNG only: what the PDF and Word exports can embed.
const SRC = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Only raster data URLs: nothing that could load from elsewhere or run as markup. */
export const isImageSrc = (src: string) => src.length <= MAX_IMAGE_CHARS && SRC.test(src);

/** Bytes the pictures take, roughly (base64 is 4 characters for 3 bytes). */
export function imageUsage(questions: readonly Pick<Question, 'image'>[]): { count: number; bytes: number } {
  const withImage = questions.filter((q) => q.image);
  return { count: withImage.length, bytes: Math.round(withImage.reduce((n, q) => n + q.image!.src.length, 0) * 0.75) };
}

export const DEFAULT_ALT = 'Gambar soal';

/** Size in an export, in points: at most `max` wide, keeping the proportions. */
export function printSize(img: Pick<QuestionImage, 'width' | 'height'>, max = 360): { width: number; height: number } {
  const width = Math.min(max, img.width * 0.6);
  return { width, height: (img.height * width) / img.width };
}
export type { QuestionImage };
