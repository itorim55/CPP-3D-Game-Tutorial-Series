'use strict';
// Servidor HTTP do site — zero dependências (Node 22+).
// Arranque:  node server/app.js          (usa server/config.json)
//            node server/app.js --seed   (carrega dados de demonstração primeiro)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const api = require('./api');
const auth = require('./auth');
const og = require('./og');

// ---------- configuração ----------

const CONFIG_PATH = path.join(__dirname, 'config.json');
const EXAMPLE_PATH = path.join(__dirname, 'config.example.json');

if (!fs.existsSync(CONFIG_PATH)) {
  const example = JSON.parse(fs.readFileSync(EXAMPLE_PATH, 'utf-8'));
  example.apiKey = crypto.randomBytes(24).toString('hex');
  example.adminKey = crypto.randomBytes(24).toString('hex');
  example.sessionSecret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(example, null, 2));
  console.log('[config] Criado server/config.json com chaves novas — edita-o antes de expor o site.');
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
if (!config.sessionSecret) {
  config.sessionSecret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
const SITE_URL = (config.siteUrl || `http://localhost:${config.port || 8080}`).replace(/\/$/, '');

const store = require('./db');
for (const [k, v] of Object.entries({
  server_name: config.serverName, server_ip: config.serverIp,
  discord: config.discord, next_wipe: config.nextWipe,
  brand_accent: config.brandAccent || 'RUST', brand_rest: config.brandRest || '',
})) if (v !== undefined && v !== null && v !== '') store.setInfo(k, v);
if (!config.brandRest) store.setInfo('brand_rest', '');

// sincroniza os itens da loja a partir de store-items.json (editável pelo dono)
try {
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'store-items.json'), 'utf-8'));
  store.syncStoreItems(items);
} catch (e) {
  console.warn('[loja] store-items.json inválido ou em falta:', e.message);
}

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
    const isHtml = file.endsWith('.html');
    if (isHtml) {
      // injetar Open Graph dinâmico (perfil com stats ao vivo, resumo com
      // highlights...) para os embeds do Discord/WhatsApp ficarem bonitos
      const route = url.pathname === '/' ? '/' : url.pathname.replace(/\.html$/, '');
      const tags = og.tagsFor(route, url.searchParams, SITE_URL);
      data = data.toString('utf-8').replace('</head>', `${tags}\n</head>`);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=300',
    });
    res.end(data);
  });
}

// ---------- autenticação Steam ----------

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(302, headers);
  res.end();
}

async function handleAuth(req, res, url) {
  switch (url.pathname) {
    case '/auth/steam':
      redirect(res, auth.steamLoginUrl(SITE_URL));
      return true;
    case '/auth/steam/return': {
      const steamId = await auth.verifySteamReturn(url, SITE_URL);
      if (!steamId) { redirect(res, '/conta?erro=login'); return true; }
      redirect(res, '/conta', auth.makeSessionCookie(steamId, config.sessionSecret));
      return true;
    }
    case '/auth/logout':
      redirect(res, '/', auth.clearSessionCookie());
      return true;
    case '/auth/dev': {
      // login falso para desenvolvimento local — desativado por omissão
      if (!config.devLogin) return false;
      const id = url.searchParams.get('id');
      if (!/^7656119\d{10}$/.test(id || '')) { res.writeHead(400); res.end('id inválido'); return true; }
      redirect(res, '/conta', auth.makeSessionCookie(id, config.sessionSecret));
      return true;
    }
  }
  return false;
}

// ---------- servidor ----------

const MAX_BODY = 512 * 1024;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/auth/')) {
    handleAuth(req, res, url).then((handled) => {
      if (!handled) { res.writeHead(404); res.end('Não encontrado'); }
    }).catch(() => { res.writeHead(500); res.end('Erro de autenticação'); });
    return;
  }

  if (!url.pathname.startsWith('/api/')) { serveStatic(req, res, url); return; }

  const session = auth.readSession(req, config.sessionSecret);

  if (req.method === 'GET') {
    if (!api.route(req, res, url, null, config, session)) {
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
    if (!api.route(req, res, url, body, config, session)) {
      api.json(res, 404, { error: 'Endpoint desconhecido' });
    }
  });
  req.on('error', () => {});
});

const PORT = config.port || 8080;
const HOST = config.host || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Site a correr em http://${HOST}:${PORT} (URL público: ${SITE_URL})`);
  console.log(`Chave de API do plugin (X-API-Key): ${config.apiKey}`);
});
