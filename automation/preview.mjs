import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', jsx: 'text/plain; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', png: 'image/png', svg: 'image/svg+xml' };
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname.replace(/^\//, '') || 'index.html';
  if (!/^(index\.html|manifest\.json|sw\.js|redfolder\.json|app\/[a-z0-9-]+\.(js|jsx|css)|icons\/[a-z0-9-]+\.(svg|png))$/.test(path)) {
    res.writeHead(404); res.end(); return;
  }
  try { const data = await readFile(resolve(root, path)); res.writeHead(200, { 'Content-Type': types[path.split('.').pop()], 'Cache-Control': 'no-cache' }); res.end(data); }
  catch { res.writeHead(404); res.end(); }
}).listen(8766, '127.0.0.1', () => console.log('Local journal preview: http://127.0.0.1:8766'));
