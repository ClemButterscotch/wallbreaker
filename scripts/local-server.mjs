import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };

const httpServer = createServer(async (req, res) => {
  const requested = decodeURIComponent((req.url || '/').split('?')[0]);
  const relative = requested === '/rules' ? '/rules.html' :
    requested === '/preview' ? '/preview.html' :
    requested === '/mathbreaker/rules' ? '/mathbreaker-rules.html' :
    requested === '/' || requested === '/host' || requested === '/tutorial/host' || requested === '/mathbreaker/host' ? '/index.html' :
    (requested === '/app.js' || requested === '/styles.css' || requested === '/brand.js' || requested === '/icons.js' || requested === '/preview.js' || requested === '/preview.css' || requested === '/game-rules.js' || requested === '/tutorial.js' || requested === '/rules.js' || requested === '/rules.css' ? `/public${requested}` : requested);
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`wallbreaker is ready at http://127.0.0.1:${port}`);
});
