// Servidor de teste local: imita a Vercel (arquivos estaticos + rotas /api).
// Uso: npm run dev  ->  http://127.0.0.1:3100
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tipos = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const porta = Number(process.env.PORTA || 3100);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const rota = url.pathname.match(/^\/api\/([a-z]+)$/);
  try {
    if (rota) {
      const mod = await import(pathToFileURL(path.join(raiz, 'api', rota[1] + '.js')).href);
      return await mod.default(req, res);
    }
    const arq = path.join(raiz, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!arq.startsWith(raiz) || arq.includes(`${path.sep}api${path.sep}`)) throw new Error('bloqueado');
    const dados = await readFile(arq);
    res.writeHead(200, { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream' });
    res.end(dados);
  } catch {
    res.writeHead(404); res.end('não encontrado');
  }
}).listen(porta, '127.0.0.1', () => console.log(`Arise Web (teste) em http://127.0.0.1:${porta}`));
