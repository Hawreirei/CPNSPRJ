/** Hand the learner a file to save: a backup, an export, a shared set. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** File names browsers accept everywhere: letters, digits, spaces, dashes, dots, parentheses. */
export const safeFileName = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\-. ()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'soal';
