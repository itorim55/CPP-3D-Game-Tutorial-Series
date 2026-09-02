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

// node:sqlite só existe sem flags a partir do 22.13 — falhar cedo com uma mensagem clara
{
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 22 || (maj === 22 && min < 13)) {
    console.error(`\n⚠️  Node ${process.versions.node} é demasiado antigo: o site precisa de Node 22.13+ (24 LTS recomendado).\n   Descarrega em https://nodejs.org e volta a arrancar.\n`);
    process.exit(1);
  }
}

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
const steam = require('./steam');
steam.init(config.steamApiKey);
const clips = require('./clips');

// O dono do servidor tem sempre cargo de admin no site (idempotente).
// Substituível/removível via "ownerSteamId" no config.json ("" desativa).
const OWNER_STEAM_ID = String(config.ownerSteamId || '');
if (/^7656119\d{10}$/.test(OWNER_STEAM_ID)) {
  store.setRole(OWNER_STEAM_ID, 'admin');
  console.log(`[roles] ownerSteamId ${OWNER_STEAM_ID} → admin`);
} else if (OWNER_STEAM_ID) {
  console.warn('[roles] ownerSteamId inválido (tem de ser um SteamID64 de 17 dígitos) — ignorado');
}
for (const [k, v] of Object.entries({
  server_name: config.serverName, server_ip: config.serverIp,
  discord: config.discord,
  brand_accent: config.brandAccent || 'RUST', brand_rest: config.brandRest || '',
  next_map_seed: config.nextMapSeed, next_map_size: config.nextMapSize, // hype pré-wipe
  donate: config.donateUrl, // link de donations (PayPal/Ko-fi/Tebex) — vazio esconde o botão
})) if (v !== undefined && v !== null && v !== '') store.setInfo(k, v);
// next_wipe e map_image geridos no console (Map vote -> Wipe settings): o
// config.json é só o valor inicial — um boot nunca esmaga o que a UI definiu
for (const [k, v] of Object.entries({ next_wipe: config.nextWipe, map_image: config.mapImage })) {
  if (v && store.getInfo(k) === null) store.setInfo(k, v);
}
// countdown nunca fica sem data: vazio ou no passado → próximo force wipe (1ª quinta, 19:00 UTC)
{
  const nw = store.getInfo('next_wipe');
  if (!nw || new Date(nw).getTime() < Date.now() - 6 * 3600e3) store.setInfo('next_wipe', api.nextForceWipe());
}
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
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

// sitemap gerado a partir das páginas públicas (sem consola, sem TV, sem utilitários)
const SITEMAP_SKIP = new Set(['admin', 'mod', '404', 'tv', 'player']);
let _sitemap = null;
function serveSitemap(res) {
  if (!_sitemap) {
    const pages = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html'))
      .map((f) => f.slice(0, -5)).filter((p) => !SITEMAP_SKIP.has(p)).sort();
    _sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      pages.map((p) => `  <url><loc>${SITE_URL}/${p === 'index' ? '' : p}</loc></url>`).join('\n') + '\n</urlset>\n';
  }
  res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  res.end(_sitemap);
}

function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); }
  catch { res.writeHead(400); res.end('Bad Request'); return; } // %-encoding inválido
  if (p.includes('\0')) { res.writeHead(400); res.end('Bad Request'); return; } // %00 rebenta o fs
  if (p === '/') p = '/index.html';
  if (!path.extname(p)) p += '.html'; // /stats -> stats.html
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  // contenção: tem de ser o próprio dir ou um caminho por baixo dele (com separador)
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      // 404 com o estilo do site (fallback inline se o ficheiro faltar)
      fs.readFile(path.join(PUBLIC_DIR, '404.html'), (e2, page) => {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
        res.end(e2 ? '<!doctype html><meta charset="utf-8"><h1>404</h1><p>Page not found. <a href="/">Back to home</a></p>' : page);
      });
      return;
    }
    const isHtml = file.endsWith('.html');
    if (isHtml) {
      // injetar Open Graph dinâmico (perfil com stats ao vivo, resumo com
      // highlights...) para os embeds do Discord/WhatsApp ficarem bonitos
      const route = url.pathname === '/' ? '/' : url.pathname.replace(/\.html$/, '');
      const tags = og.tagsFor(route, url.searchParams, SITE_URL);
      data = data.toString('utf-8').replace('</head>', () => `${tags}\n</head>`);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      ...(isHtml ? { 'X-Frame-Options': 'DENY' } : {}),
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
      await steam.adopt(steamId); // nome + avatar prontos antes do redirect
      redirect(res, '/conta', auth.makeSessionCookie(steamId, config.sessionSecret, httpsSite()));
      return true;
    }
    case '/auth/logout':
      redirect(res, '/', auth.clearSessionCookie(httpsSite()));
      return true;
    case '/auth/dev': {
      // login falso para desenvolvimento local — desativado por omissão
      if (!config.devLogin) return false;
      const id = url.searchParams.get('id');
      if (!/^7656119\d{10}$/.test(id || '')) { res.writeHead(400); res.end('invalid id'); return true; }
      redirect(res, '/conta', auth.makeSessionCookie(id, config.sessionSecret, httpsSite()));
      return true;
    }
  }
  return false;
}

// ---------- servidor ----------

const MAX_BODY = 512 * 1024;

// Fecha uma resposta com um erro sem nunca deixar uma exceção escapar.
function fail(res, code, msg) {
  try {
    if (!res.headersSent) res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(msg);
  } catch { /* já fechada */ }
}

// ---------- clips de overwatch (upload da staff + streaming com Range) ----------

const keysMatch = auth.keysMatch;

// cookie Secure quando o site público é servido por HTTPS (Cloudflare Tunnel)
function httpsSite() { return String(config.siteUrl || '').startsWith('https://'); }

// POST /api/admin/owclip — corpo é o ficheiro em bruto (sem multipart).
// Escreve em streaming direto para o disco: nunca carrega o vídeo em memória.
function handleClipUpload(req, res) {
  if (req.method !== 'POST') { fail(res, 405, 'Method Not Allowed'); return; }
  // mesma regra dupla da API admin: adminKey OU sessão Steam com cargo admin
  const viaKey = config.adminKey && keysMatch(req.headers['x-admin-key'], config.adminKey);
  const session = viaKey ? null : auth.readSession(req, config.sessionSecret);
  if (!viaKey && !(session?.steamId && store.roleOf(String(session.steamId)) === 'admin')) {
    api.json(res, 401, { error: 'Admin access required' }); return;
  }
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = type === 'video/webm' ? '.webm' : (type === 'video/mp4' ? '.mp4' : null);
  if (!ext) { api.json(res, 400, { error: 'Only MP4 or WebM videos are accepted.' }); return; }

  const name = clips.newName(ext);
  const tmp = path.join(clips.DIR, name + '.part');
  const out = fs.createWriteStream(tmp);
  let size = 0, dead = false;
  const abort = (code, msg) => {
    if (dead) return; dead = true;
    out.destroy(); fs.unlink(tmp, () => {});
    api.json(res, code, { error: msg });
    req.destroy();
  };
  req.on('data', (c) => {
    size += c.length;
    if (size > clips.MAX_BYTES) abort(413, 'Clip too large (200 MB max). Trim or compress it first.');
  });
  req.on('error', () => { if (!dead) { dead = true; out.destroy(); fs.unlink(tmp, () => {}); } });
  out.on('error', () => abort(500, 'Could not write the clip to disk.'));
  out.on('finish', () => {
    if (dead) return;
    if (size === 0) { fs.unlink(tmp, () => {}); api.json(res, 400, { error: 'Empty upload.' }); return; }
    fs.rename(tmp, path.join(clips.DIR, name), (err) => {
      if (err) { api.json(res, 500, { error: 'Could not save the clip.' }); return; }
      api.json(res, 200, { ok: true, file: name, bytes: size });
    });
  });
  req.pipe(out);
}

// GET /clips/<nome> — com suporte a Range para o browser poder saltar no vídeo.
function serveClip(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { fail(res, 405, 'Method Not Allowed'); return; }
  const name = url.pathname.slice('/clips/'.length);
  if (!clips.NAME_RE.test(name)) { fail(res, 404, 'Not Found'); return; }
  const file = path.join(clips.DIR, name);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { fail(res, 404, 'Not Found'); return; }
    const type = name.endsWith('.webm') ? 'video/webm' : 'video/mp4';
    const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    // o caso pode fechar (clip auto-apagado) entre o stat e o open — nunca deixar o pedido pendurado
    const send = (stream, head, headers) => {
      res.writeHead(head, headers);
      if (req.method === 'HEAD') { res.end(); return; }
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? parseInt(m[1], 10) : Math.max(0, st.size - parseInt(m[2], 10));
      const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1;
      if (Number.isFinite(start) && start >= 0 && start <= end && start < st.size) {
        send(fs.createReadStream(file, { start, end }), 206,
          { ...base, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
        return;
      }
      // Range sintaticamente inválido (ex.: bytes=500-100) ignora-se — RFC 9110
    }
    send(fs.createReadStream(file), 200, { ...base, 'Content-Length': st.size });
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { fail(res, 400, 'Bad Request'); return; } // URL malformado

  try {
    if (url.pathname.startsWith('/auth/')) {
      handleAuth(req, res, url).then((handled) => {
        if (!handled) fail(res, 404, 'Not Found');
      }).catch(() => fail(res, 500, 'Auth error'));
      return;
    }

    if (url.pathname.startsWith('/clips/')) { serveClip(req, res, url); return; }
    if (url.pathname === '/api/admin/owclip') { handleClipUpload(req, res); return; }

    if (!url.pathname.startsWith('/api/')) { if (url.pathname === '/sitemap.xml') { serveSitemap(res); return; }
  serveStatic(req, res, url); return; }

    // ler a sessão nunca pode derrubar o pedido (cookie forjado/inválido)
    let session = null;
    try { session = auth.readSession(req, config.sessionSecret); } catch { session = null; }

    if (req.method === 'GET') {
      if (!api.route(req, res, url, null, config, session)) {
        api.json(res, 404, { error: 'Unknown endpoint' });
      }
      return;
    }

    // POST: ler corpo JSON com limite de tamanho
    let size = 0, tooBig = false;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        if (!tooBig) { tooBig = true; fail(res, 413, 'Payload Too Large'); req.destroy(); }
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return;
      let body = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf-8')); } catch { /* body fica null */ }
      // defesa CSRF em profundidade: um POST cross-site do browser (Sec-Fetch-Site é
      // definido pelo próprio browser, não pela página) nunca usa a sessão Steam.
      // O plugin e os scripts não enviam este header, por isso não são afetados.
      if (req.method === 'POST' && req.headers['sec-fetch-site'] === 'cross-site') {
        api.json(res, 403, { error: 'Cross-site request blocked' }); return;
      }
      try {
        if (!api.route(req, res, url, body, config, session)) {
          api.json(res, 404, { error: 'Unknown endpoint' });
        }
      } catch (e) {
        console.error('[route error]', e);
        if (!res.headersSent) api.json(res, 500, { error: 'Internal error' });
      }
    });
    req.on('error', () => {});
  } catch (e) {
    console.error('[handler error]', e);
    fail(res, 500, 'Internal error');
  }
});

// Rede de segurança final: um bug num callback assíncrono não deve derrubar
// o processo inteiro (mantém o site vivo em produção). Regista e continua.
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

const PORT = config.port || 8080;
const HOST = config.host || '0.0.0.0';
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${PORT} is already in use — the site is probably already running in another window.`);
    console.error(`   Close it there (Ctrl+C) — or kill just that process:`);
    console.error(`   Windows:  netstat -ano | findstr :${PORT}   then   taskkill /F /PID <pid>`);
    console.error(`   Linux:    fuser -k ${PORT}/tcp\n`);
    process.exit(1);
  }
  console.error('[server error]', e);
});
// clips órfãos: upload feito mas caso nunca criado (falha/aba fechada) —
// ficheiros com 24h+ sem nenhuma ow_case a apontar para eles são lixo
try {
  const referenced = new Set(
    store.db.prepare('SELECT clip_file FROM ow_cases WHERE clip_file IS NOT NULL').all().map((r) => r.clip_file));
  const cut = Date.now() - 24 * 3600e3;
  for (const f of fs.readdirSync(clips.DIR)) {
    if (!clips.NAME_RE.test(f) || referenced.has(f)) continue;
    if (fs.statSync(path.join(clips.DIR, f)).mtimeMs < cut) fs.unlinkSync(path.join(clips.DIR, f));
  }
} catch { /* pasta vazia */ }

// hype de wipe: verifica a cada 30 min se estamos a <24h do wipe (1 post único)
setTimeout(() => api.checkWipeHype(config), 10e3).unref();
setInterval(() => api.checkWipeHype(config), 30 * 60e3).unref();

server.listen(PORT, HOST, () => {
  console.log(`Site running at http://${HOST}:${PORT} (public URL: ${SITE_URL})`);
  console.log(`Plugin API key (X-API-Key): …${String(config.apiKey).slice(-4)}  (completa em server/config.json)`);
  if (httpsSite() && !config.trustProxy) {
    // atrás do Cloudflare Tunnel todos os visitantes chegam com o IP do cloudflared:
    // sem trustProxy o rate-limit das candidaturas bloqueia toda a gente após a 1ª
    console.warn('[config] siteUrl é https mas "trustProxy" está false — atrás do Cloudflare Tunnel põe "trustProxy": true');
  }
});
