import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const res = await build({ entryPoints: ['e2e/preview/entry.js'], bundle: true, format: 'iife', write: false, charset: 'utf8' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = (await readFile('index.html', 'utf8')).replace('<script type="module" src="src/app.js"></script>', () => `<script>${js}</script>`);
await mkdir('dist', { recursive: true });
await writeFile('dist/preview.html', html);
console.log('dist/preview.html');
