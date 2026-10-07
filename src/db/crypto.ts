import { db } from './index';

/**
 * API keys are encrypted with AES-GCM using a non-extractable key that lives
 * only in this browser's IndexedDB. This stops casual reading of stored data
 * and keeps keys out of backups, but cannot protect against code running in
 * the page itself (XSS, malicious extensions).
 */
async function deviceKey(): Promise<CryptoKey> {
  const row = await db.meta.get('deviceKey');
  if (row?.value instanceof CryptoKey) return row.value;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await db.meta.put({ key: 'deviceKey', value: key });
  return key;
}

export async function encryptSecret(plain: string): Promise<{ cipher: ArrayBuffer; iv: Uint8Array<ArrayBuffer> }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), new TextEncoder().encode(plain));
  return { cipher, iv };
}

export async function decryptSecret(cipher: ArrayBuffer, iv: Uint8Array<ArrayBuffer>): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await deviceKey(), cipher);
  return new TextDecoder().decode(plain);
}
