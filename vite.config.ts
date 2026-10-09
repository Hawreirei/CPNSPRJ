import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Strict CSP only for the production build (dev server needs inline scripts for HMR).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // https: is needed for user-supplied OpenAI-compatible endpoints.
  "connect-src 'self' https:",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/** Package → chunk name for libraries kept out of the startup bundle (numeric.ts, RichText.tsx, providers/index.ts). */
const LAZY_LIBS: Record<string, string> = { mathjs: 'mathjs', katex: 'katex', '@anthropic-ai/sdk': 'anthropic', 'pdfjs-dist': 'pdfjs' };

/**
 * pdf.js decodes scanned pages (JBIG2, JPEG 2000) and colour profiles with WebAssembly it fetches
 * from `wasmUrl` (src/lib/pdfPages.ts). Served at pdfjs/ in dev and copied there in the build; not
 * precached, since importing a PDF needs the network for the AI anyway.
 */
const PDFJS_WASM = ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm'];
const pdfjsWasm: Plugin = {
  name: 'pdfjs-wasm',
  configureServer(server) {
    server.middlewares.use('/pdfjs/', (req, res, next) => {
      const file = req.url?.slice(1).split('?')[0] ?? '';
      if (!PDFJS_WASM.includes(file)) return next();
      res.setHeader('content-type', 'application/wasm');
      res.end(readFileSync(`node_modules/pdfjs-dist/wasm/${file}`));
    });
  },
  generateBundle() {
    for (const f of PDFJS_WASM) this.emitFile({ type: 'asset', fileName: `pdfjs/${f}`, source: readFileSync(`node_modules/pdfjs-dist/wasm/${f}`) });
  },
};

const cspPlugin: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`),
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // Relative base so the static build works on any host or sub-path.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    cspPlugin,
    pdfjsWasm,
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/lib/pwa.ts so updates apply without a manual hard refresh.
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'CPNS SKD Set Builder',
        short_name: 'SKD Builder',
        description: 'Buat set latihan SKD CPNS (TWK, TIU, TKP) dengan AI, simulasi CAT, dan laporan skor.',
        lang: 'id',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#2259bd',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Click handling for study reminders (src/lib/reminder.ts); generateSW keeps its precache.
        importScripts: ['sw-notify.js'],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Stable names for the big on-demand libraries, so the e2e test and the bundle check can spot them.
        // They split off by themselves (dynamic imports); manualChunks would pull Vite's preload helper into one of them.
        chunkFileNames(chunk) {
          const lib = Object.keys(LAZY_LIBS).find((l) => chunk.moduleIds.some((id) => id.includes(`node_modules/${l}/`)));
          return `assets/${lib ? LAZY_LIBS[lib] : '[name]'}-[hash].js`;
        },
        // App code shared by several pages goes in a few chunks, not a dozen tiny ones: each file is a round trip.
        // What the first screen imports ($initial) is kept apart from what only other pages share, so the
        // dashboard does not download the generator, zod or the share and export code it never runs (#57).
        codeSplitting: {
          groups: [
            { name: 'shared', tags: ['$initial'] },
            { name: 'pages', test: /[\\/]src[\\/]/, minShareCount: 2 },
          ],
        },
      },
    },
  },
});
