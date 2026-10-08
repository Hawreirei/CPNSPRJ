// Fails when the JavaScript and CSS a first visit downloads grows past the budget, or when a library
// meant to load on demand (mathjs, KaTeX, the Anthropic SDK) ends up in it. Run after `npm run build`.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

// Measured at 211 KB gzipped when the lazy loading landed (#21), plus about 10%.
const BUDGET_KB = 232;
const LAZY = /^assets\/(mathjs|katex|anthropic)-/;

const html = readFileSync('dist/index.html', 'utf8');
// Vite lists every startup file in index.html: the entry script, its modulepreloads and the stylesheet.
const files = [...new Set([...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]))];
if (!files.length) throw new Error('No startup assets found in dist/index.html. Build first.');

let total = 0;
for (const f of files) {
  const kb = gzipSync(readFileSync(`dist/${f}`)).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} KB  ${f}`);
}
console.log(`${total.toFixed(1).padStart(7)} KB  total gzipped at startup (budget ${BUDGET_KB} KB)`);

const eager = files.filter((f) => LAZY.test(f));
if (eager.length) {
  console.error(`On-demand libraries are in the startup bundle: ${eager.join(', ')}`);
  process.exit(1);
}
if (total > BUDGET_KB) {
  console.error(`Startup bundle is ${total.toFixed(1)} KB, over the ${BUDGET_KB} KB budget.`);
  process.exit(1);
}
