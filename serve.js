// Локален сървър за разработка: обвива index.html в същия скелет, който добавя публикуването.
// node serve.js [порт]  →  http://localhost:8080/?store=local&as=p1
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const port = Number(process.argv[2] ?? 8080);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };
const skeleton = (body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path === '/' ? 'index.html' : normalize(path).replace(/^\/+/, '');
  if (file.startsWith('..')) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(join(root, file));
    if (file === 'index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(skeleton(data.toString()));
    } else {
      res.writeHead(200, { 'content-type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` }).end(data);
    }
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Мегдан: http://localhost:${port}/?store=local&as=p1`));
