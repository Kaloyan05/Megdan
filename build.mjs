// Сглобява две версии с целия JavaScript вграден в една страница:
//   dist/index.html       — за артефакта в claude.ai (вход с профил в Claude)
//   dist/site/index.html  — собственият сайт с Firebase (без вход, за GitHub Pages)
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';

async function bundle(site) {
  const res = await build({
    entryPoints: ['src/app.js'], bundle: true, format: 'iife', target: 'es2020',
    minify: true, legalComments: 'none', write: false, charset: 'utf8',
    define: { __SITE__: site ? 'true' : 'false' },
  });
  return res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

const template = await readFile('index.html', 'utf8');
const page = (js) => {
  const html = template.replace('<script type="module" src="src/app.js"></script>', () => `<script>${js}</script>`);
  if (html.includes('src/app.js')) throw new Error('script tag not replaced');
  return html;
};

await mkdir('dist/site', { recursive: true });
const claudeHtml = page(await bundle(false));
await writeFile('dist/index.html', claudeHtml);
console.log(`dist/index.html: ${(claudeHtml.length / 1024).toFixed(1)} KB`);
// Сайтът е цял документ: заглавие, иконки, преглед на линка във Viber/Messenger, инсталиране на телефона.
import { SITE_URL } from './src/site-config.js';
const head = `<!doctype html><html lang="bg"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="16 игри с приятели: стаи с код, ходове на ред и игри на живо. Без регистрация.">
<meta name="theme-color" content="#1b2333">
<meta property="og:title" content="Мегдан: ела да играем!">
<meta property="og:description" content="Натисни линка, напиши си името и влизаш в стаята. Без регистрация.">
<meta property="og:image" content="${SITE_URL}preview.png">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<style>:root{padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>`;
const siteHtml = `${head}${page(await bundle(true))}</body></html>`;
await writeFile('dist/site/index.html', siteHtml);
for (const f of ['preview.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) await copyFile(`site-assets/${f}`, `dist/site/${f}`);
await writeFile('dist/site/manifest.webmanifest', JSON.stringify({
  name: 'Мегдан', short_name: 'Мегдан', lang: 'bg', start_url: './', scope: './', display: 'standalone',
  background_color: '#f4efe0', theme_color: '#1b2333',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
}, null, 2));
await writeFile('dist/site/.nojekyll', '');
console.log(`dist/site/index.html: ${(siteHtml.length / 1024).toFixed(1)} KB`);
