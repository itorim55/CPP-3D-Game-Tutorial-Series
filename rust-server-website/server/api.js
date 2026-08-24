'use strict';
// Rotas da API — ingestão de eventos do plugin (chave de API), endpoints
// públicos, endpoints autenticados por sessão Steam, e administração.

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

function handleIngest(body, config) {
  const wipe = store.currentWipe();
  const gemsPerHour = config.gemsPerHour ?? 1000;
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
        // delta de tempo jogado (enviado periodicamente e no disconnect)
        if (!e.steamId) break;
        const seconds = Math.min(Math.max(0, e.seconds | 0), 6 * 3600); // sanidade: máx 6 h por evento
        store.upsertPlayer(String(e.steamId), clean(e.name, 64), ts);
        store.addPlaytime(String(e.steamId), seconds, wipe.id);
        store.addGems(String(e.steamId), Math.round((seconds / 3600) * gemsPerHour));
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
 * @param {object|null} body    JSON já analisado (para POST)
 * @param {object} config
 * @param {{steamId:string}|null} session  sessão Steam (cookie), se existir
 * @returns {boolean} true se a rota foi tratada
 */
function route(req, res, url, body, config, session) {
  const p = url.pathname;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  // --- endpoints do plugin (chave de API) ---
  if (p.startsWith('/api/plugin/') || p === '/api/ingest' || p === '/api/heartbeat' || p === '/api/wipe') {
    const key = req.headers['x-api-key'];
    if (!config.apiKey || key !== config.apiKey) { json(res, 401, { error: 'Chave de API inválida' }); return true; }

    if (p === '/api/plugin/redemptions' && req.method === 'GET') {
      json(res, 200, { rows: store.pendingPluginRedemptions() }); return true;
    }
    if (req.method !== 'POST') { json(res, 405, { error: 'Método não permitido' }); return true; }
    if (!body) { json(res, 400, { error: 'JSON inválido' }); return true; }

    if (p === '/api/ingest') json(res, 200, handleIngest(body, config));
    else if (p === '/api/heartbeat') json(res, 200, handleHeartbeat(body));
    else if (p === '/api/wipe') json(res, 200, { ok: true, wipe: store.startWipe(body) });
    else if (p === '/api/plugin/redemptions/complete') {
      store.completeRedemption(body.id, body.ok !== false);
      json(res, 200, { ok: true });
    } else json(res, 404, { error: 'Endpoint desconhecido' });
    return true;
  }

  // --- endpoints públicos (GET) ---
  if (req.method === 'GET') {
    switch (p) {
      case '/api/status':
        json(res, 200, store.status()); return true;
      case '/api/leaderboard': {
        const by = url.searchParams.get('by') || 'kills';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
        const period = url.searchParams.get('period');
        const wipeParam = url.searchParams.get('wipeId');
        let wipeId; // undefined = wipe atual
        if (period === 'all') wipeId = null;
        else if (wipeParam) wipeId = parseInt(wipeParam, 10) || undefined;
        json(res, 200, { by, rows: store.leaderboard(by, wipeId, limit) });
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
      case '/api/wipes':
        json(res, 200, { rows: store.listWipes(), current: store.currentWipe().id }); return true;
      case '/api/posts':
        json(res, 200, { rows: store.listPosts() }); return true;
      case '/api/store':
        json(res, 200, { items: store.listStore(), gemsPerHour: config.gemsPerHour ?? 1000 }); return true;
      case '/api/owcases':
        json(res, 200, { rows: store.listOwCases(session?.steamId) }); return true;
      case '/api/mapvote':
        json(res, 200, store.mapState(session?.steamId)); return true;
      case '/api/me': {
        if (!session) { json(res, 200, { loggedIn: false }); return true; }
        const prof = store.playerProfile(session.steamId);
        json(res, 200, {
          loggedIn: true,
          steamId: session.steamId,
          name: prof?.name || null,
          playtimeS: prof?.playtimeS || 0,
          wallet: store.getWallet(session.steamId),
          voteWeight: store.voteWeight(session.steamId),
          redemptions: store.myRedemptions(session.steamId),
          appeals: store.myAppeals(session.steamId),
        });
        return true;
      }
    }
  }

  // --- endpoints autenticados por sessão Steam (POST) ---
  if (req.method === 'POST' && ['/api/redeem', '/api/mapvote/vote', '/api/owcases/vote', '/api/appeals'].includes(p)) {
    if (!session) { json(res, 401, { error: 'Inicia sessão com a Steam primeiro.' }); return true; }
    if (!body) { json(res, 400, { error: 'JSON inválido' }); return true; }
    let r;
    if (p === '/api/redeem') r = store.redeem(session.steamId, clean(body.itemId, 64));
    else if (p === '/api/mapvote/vote') r = store.castMapVote(session.steamId, body.optionId | 0);
    else if (p === '/api/owcases/vote') r = store.voteOw(session.steamId, body.caseId | 0, clean(body.vote, 10));
    else {
      const text = clean(body.text, 4000);
      if (!text || text.length < 20) r = { error: 'Descreve o teu apelo com pelo menos 20 caracteres.' };
      else r = store.addAppeal(session.steamId, clean(body.discord, 64), text);
    }
    json(res, r.error ? 400 : 200, r);
    return true;
  }

  // --- candidaturas (público, com rate-limit) ---
  if (p === '/api/applications' && req.method === 'POST') {
    if (!body) { json(res, 400, { error: 'JSON inválido' }); return true; }
    const r = handleApplication(body, ip);
    if (r.error) json(res, r.code, { error: r.error });
    else json(res, 200, r);
    return true;
  }

  // --- administração ---
  if (p.startsWith('/api/admin/')) {
    const key = req.headers['x-admin-key'] || url.searchParams.get('key');
    if (!config.adminKey || key !== config.adminKey) { json(res, 401, { error: 'Chave de administração inválida' }); return true; }

    if (req.method === 'GET') {
      switch (p) {
        case '/api/admin/applications': json(res, 200, { rows: store.listApplications() }); return true;
        case '/api/admin/appeals': json(res, 200, { rows: store.listAppeals() }); return true;
        case '/api/admin/redemptions': json(res, 200, { rows: store.listRedemptions() }); return true;
        case '/api/admin/owcases': json(res, 200, { rows: store.listOwCasesAdmin() }); return true;
      }
    }

    if (req.method === 'POST' && body) {
      switch (p) {
        case '/api/admin/applications': {
          const allowed = ['pendente', 'em análise', 'entrevista', 'aprovada', 'recusada'];
          store.setApplicationStatus(body.id, allowed.includes(body.status) ? body.status : 'pendente');
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/appeals': {
          const allowed = ['pendente', 'em análise', 'aceite', 'recusado'];
          store.setAppealStatus(body.id, allowed.includes(body.status) ? body.status : 'pendente',
                                clean(body.response, 2000));
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/redemptions': {
          const allowed = ['pendente', 'enviado', 'entregue', 'falhou'];
          store.setRedemptionStatus(body.id, allowed.includes(body.status) ? body.status : 'pendente');
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/posts': {
          const title = clean(body.title, 120), text = clean(body.body, 8000);
          if (!title || !text) { json(res, 400, { error: 'Título e texto obrigatórios' }); return true; }
          store.addPost(title, text);
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/posts/delete':
          store.deletePost(body.id); json(res, 200, { ok: true }); return true;
        case '/api/admin/owcases': {
          const title = clean(body.title, 120), clip = clean(body.clipUrl, 300);
          if (!title || !clip) { json(res, 400, { error: 'Título e URL do clip obrigatórios' }); return true; }
          store.addOwCase(title, clip);
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/owcases/close': {
          const allowed = ['cheater', 'inocente', 'inconclusivo'];
          if (!allowed.includes(body.verdict)) { json(res, 400, { error: 'Veredicto inválido' }); return true; }
          store.closeOwCase(body.id, body.verdict);
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/mapvote':
          json(res, 200, store.mapAdmin(clean(body.action, 20), body)); return true;
      }
    }
    json(res, 400, { error: 'Pedido inválido' }); return true;
  }

  return false;
}

module.exports = { route, json };
