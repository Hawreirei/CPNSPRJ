// Writes CHANGELOG.md from src/data/changelog.ts, the list the app shows (#71). Node 22 runs the
// TypeScript sources directly (type stripping); src/__tests__/whatsNew.test.ts fails when the file is stale.
import { writeFileSync } from 'node:fs';

const { CHANGELOG } = await import('../src/data/changelog.ts');
const { changelogMarkdown } = await import('../src/domain/whatsNew.ts');
writeFileSync('CHANGELOG.md', changelogMarkdown(CHANGELOG));
console.log(`CHANGELOG.md: ${CHANGELOG.length} versi, terbaru ${CHANGELOG[0].version}`);
