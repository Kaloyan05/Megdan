// Сглобява dist/index.html: целият JavaScript вграден в една страница за публикуване.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const res = await build({
  entryPoints: ['src/app.js'], bundle: true, format: 'iife', target: 'es2020',
  minify: true, legalComments: 'none', write: false, charset: 'utf8',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = (await readFile('index.html', 'utf8'))
  .replace('<script type="module" src="src/app.js"></script>', () => `<script>${js}</script>`);
if (html.includes('src/app.js')) throw new Error('script tag not replaced');
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
console.log(`dist/index.html: ${(html.length / 1024).toFixed(1)} KB`);
