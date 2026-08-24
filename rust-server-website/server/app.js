'use strict';
// Servidor HTTP do site — zero dependências (Node 22+).
// Arranque:  node server/app.js          (usa server/config.json)
//            node server/app.js --seed   (carrega dados de demonstração primeiro)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const api = require('./api');

// ---------- configuração ----------

const CONFIG_PATH = path.join(__dirname, 'config.json');
const EXAMPLE_PATH = path.join(__dirname, 'config.example.json');

if (!fs.existsSync(CONFIG_PATH)) {
  const example = JSON.parse(fs.readFileSync(EXAMPLE_PATH, 'utf-8'));
  example.apiKey = crypto.randomBytes(24).toString('hex');
  example.adminKey = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(example, null, 2));
  console.log('[config] Criado server/config.json com chaves novas — edita-o antes de expor o site.');
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const store = require('./db');
for (const [k, v] of Object.entries({
  server_name: config.serverName, server_ip: config.serverIp,
  discord: config.discord, next_wipe: config.nextWipe,
})) if (v) store.setInfo(k, v);

if (process.argv.includes('--seed')) {
  require('./seed').seed();
}

// ---------- ficheiros estáticos ----------

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (!path.extname(p)) p += '.html'; // /stats -> stats.html
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Proibido'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p>Página não encontrada. <a href="/">Voltar ao início</a></p>');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=300',
    });
    res.end(data);
  });
}

// ---------- servidor ----------

const MAX_BODY = 512 * 1024;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (!url.pathname.startsWith('/api/')) { serveStatic(req, res, url); return; }

  if (req.method === 'GET') {
    if (!api.route(req, res, url, null, config)) {
      api.json(res, 404, { error: 'Endpoint desconhecido' });
    }
    return;
  }

  // POST: ler corpo JSON com limite de tamanho
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    let body = null;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf-8')); } catch { /* body fica null */ }
    if (!api.route(req, res, url, body, config)) {
      api.json(res, 404, { error: 'Endpoint desconhecido' });
    }
  });
  req.on('error', () => {});
});

const PORT = config.port || 8080;
const HOST = config.host || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Site a correr em http://${HOST}:${PORT}`);
  console.log(`Chave de API do plugin (X-API-Key): ${config.apiKey}`);
});
