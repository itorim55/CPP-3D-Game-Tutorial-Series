'use strict';
// Rotas da API — ingestão de eventos do plugin (protegida por chave)
// e endpoints públicos consumidos pelo frontend.

const store = require('./db');

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function clean(s, max = 200) {
  if (typeof s !== 'string') return null;
  return s.replace(/[\x00-\x1f\x7f]/g, '').slice(0, max).trim() || null;
}

// ---------- ingestão (plugin Oxide -> site) ----------

function handleIngest(body) {
  const wipe = store.currentWipe();
  let accepted = 0;
  for (const e of (Array.isArray(body.events) ? body.events : []).slice(0, 500)) {
    const ts = Number.isFinite(e.ts) ? e.ts : store.now();
    switch (e.type) {
      case 'kill': {
        if (!e.attackerId || !e.victimId) break;
        store.upsertPlayer(String(e.attackerId), clean(e.attackerName, 64), ts);
        store.upsertPlayer(String(e.victimId), clean(e.victimName, 64), ts);
        store.recordKill({
          ts, attackerId: String(e.attackerId), victimId: String(e.victimId),
          weapon: clean(e.weapon, 64), distance: Number.isFinite(e.distance) ? e.distance : null,
          headshot: !!e.headshot, bodypart: clean(e.bodypart, 32),
        }, wipe.id);
        accepted++;
        break;
      }
      case 'pve_death': {
        if (!e.victimId) break;
        store.upsertPlayer(String(e.victimId), clean(e.victimName, 64), ts);
        store.recordPveDeath({ ts, victimId: String(e.victimId), cause: clean(e.cause, 64) }, wipe.id);
        accepted++;
        break;
      }
      case 'gather': {
        if (!e.steamId || !e.resource) break;
        store.recordGather(wipe.id, String(e.steamId), clean(e.resource, 32), e.amount | 0);
        accepted++;
        break;
      }
      case 'session': {
        // enviado no disconnect: segundos jogados nesta sessão
        if (!e.steamId) break;
        store.upsertPlayer(String(e.steamId), clean(e.name, 64), ts);
        store.addPlaytime(String(e.steamId), e.seconds | 0);
        accepted++;
        break;
      }
      case 'connect': {
        if (!e.steamId) break;
        store.upsertPlayer(String(e.steamId), clean(e.name, 64), ts);
        accepted++;
        break;
      }
    }
  }
  return { ok: true, accepted };
}

function handleHeartbeat(body) {
  store.recordHeartbeat({
    players: body.players | 0, maxPlayers: body.maxPlayers | 0,
    queued: body.queued | 0, joining: body.joining | 0,
    fps: Number.isFinite(body.fps) ? body.fps : null,
    entities: Number.isFinite(body.entities) ? body.entities : null,
  });
  if (body.map) store.setInfo('map', clean(body.map, 64));
  return { ok: true };
}

// ---------- candidaturas ----------

const REQUIRED_APP_FIELDS = ['name', 'steamId', 'discord', 'motivation', 'scenario1', 'scenario2'];

function handleApplication(body, ip) {
  for (const f of REQUIRED_APP_FIELDS) {
    if (!clean(body[f], 4000)) return { error: `Campo obrigatório em falta: ${f}`, code: 400 };
  }
  if (!/^7656119\d{10}$/.test(String(body.steamId).trim())) {
    return { error: 'SteamID64 inválido (deve começar por 7656119...).', code: 400 };
  }
  if (store.recentApplicationFromIp(ip, 6 * 3600)) {
    return { error: 'Já foi enviada uma candidatura recentemente deste endereço. Tenta mais tarde.', code: 429 };
  }
  store.addApplication({
    name: clean(body.name, 64), steamId: String(body.steamId).trim(),
    discord: clean(body.discord, 64), age: body.age | 0 || null,
    hoursPlayed: body.hoursPlayed | 0 || null, timezone: clean(body.timezone, 64),
    availability: clean(body.availability, 300), experience: clean(body.experience, 4000),
    motivation: clean(body.motivation, 4000),
    scenario1: clean(body.scenario1, 4000), scenario2: clean(body.scenario2, 4000),
    scenario3: clean(body.scenario3, 4000),
  }, ip);
  return { ok: true };
}

// ---------- router ----------

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 * @param {object|null} body  JSON já analisado (para POST)
 * @param {object} config
 * @returns {boolean} true se a rota foi tratada
 */
function route(req, res, url, body, config) {
  const p = url.pathname;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  // --- endpoints do plugin (chave de API) ---
  if (p === '/api/ingest' || p === '/api/heartbeat' || p === '/api/wipe') {
    if (req.method !== 'POST') { json(res, 405, { error: 'Método não permitido' }); return true; }
    const key = req.headers['x-api-key'];
    if (!config.apiKey || key !== config.apiKey) { json(res, 401, { error: 'Chave de API inválida' }); return true; }
    if (!body) { json(res, 400, { error: 'JSON inválido' }); return true; }
    if (p === '/api/ingest') json(res, 200, handleIngest(body));
    else if (p === '/api/heartbeat') json(res, 200, handleHeartbeat(body));
    else json(res, 200, { ok: true, wipe: store.startWipe(body) });
    return true;
  }

  // --- endpoints públicos ---
  if (req.method === 'GET') {
    switch (p) {
      case '/api/status':
        json(res, 200, store.status()); return true;
      case '/api/leaderboard': {
        const by = url.searchParams.get('by') || 'kills';
        const period = url.searchParams.get('period') || 'wipe';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
        json(res, 200, { by, period, rows: store.leaderboard(by, period !== 'all', limit) });
        return true;
      }
      case '/api/killfeed':
        json(res, 200, { rows: store.killfeed(parseInt(url.searchParams.get('limit') || '50', 10) || 50) });
        return true;
      case '/api/player': {
        const id = url.searchParams.get('id');
        if (!id) { json(res, 400, { error: 'Falta o parâmetro id' }); return true; }
        const prof = store.playerProfile(id);
        if (!prof) { json(res, 404, { error: 'Jogador não encontrado' }); return true; }
        json(res, 200, prof); return true;
      }
      case '/api/search': {
        const q = (url.searchParams.get('q') || '').slice(0, 64);
        if (q.length < 2) { json(res, 200, { rows: [] }); return true; }
        json(res, 200, { rows: store.searchPlayers(q) }); return true;
      }
      case '/api/staff':
        json(res, 200, { staff: store.staffList(), banStats: store.banStats() }); return true;
      case '/api/bans':
        json(res, 200, { rows: store.banList() }); return true;
    }
  }

  // --- candidaturas (público, com rate-limit) ---
  if (p === '/api/applications' && req.method === 'POST') {
    if (!body) { json(res, 400, { error: 'JSON inválido' }); return true; }
    const r = handleApplication(body, ip);
    if (r.error) json(res, r.code, { error: r.error });
    else json(res, 200, r);
    return true;
  }

  // --- administração simples (listar/gerir candidaturas) ---
  if (p === '/api/admin/applications') {
    const key = req.headers['x-admin-key'] || url.searchParams.get('key');
    if (!config.adminKey || key !== config.adminKey) { json(res, 401, { error: 'Chave de administração inválida' }); return true; }
    if (req.method === 'GET') { json(res, 200, { rows: store.listApplications() }); return true; }
    if (req.method === 'POST' && body && body.id) {
      const allowed = ['pendente', 'em análise', 'entrevista', 'aprovada', 'recusada'];
      const s = allowed.includes(body.status) ? body.status : 'pendente';
      store.setApplicationStatus(body.id, s);
      json(res, 200, { ok: true }); return true;
    }
    json(res, 400, { error: 'Pedido inválido' }); return true;
  }

  return false;
}

module.exports = { route, json };
