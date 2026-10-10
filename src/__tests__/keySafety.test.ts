import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '../providers';

describe('limiting a key (#48)', () => {
  it('every provider says how, and links to its own documentation over https', () => {
    for (const [id, p] of Object.entries(PROVIDERS)) {
      expect(p.limitHelp.text.length, id).toBeGreaterThan(10);
      expect(new URL(p.limitHelp.url).protocol, id).toBe('https:');
      expect(p.limitHelp.url, id).not.toBe(p.keyUrl);
    }
  });
});
