'use strict';
// Rotas da API — ingestão de eventos do plugin (chave de API), endpoints
// públicos, endpoints autenticados por sessão Steam, e administração.

const store = require('./db');
const discord = require('./discord');
const steam = require('./steam');
const clips = require('./clips');

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
  const killLines = [];
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
          posX: Number.isFinite(e.posX) ? e.posX : null,
          posZ: Number.isFinite(e.posZ) ? e.posZ : null,
        }, wipe.id);
        killLines.push(`⚔️ **${clean(e.attackerName, 32) || '?'}** killed **${clean(e.victimName, 32) || '?'}**` +
          ` (${clean(e.weapon, 32) || '?'}${Number.isFinite(e.distance) ? `, ${Math.round(e.distance)}m` : ''}${e.headshot ? ', HS 🎯' : ''})`);
        accepted++;
        break;
      }
      case 'teams': {
        if (Array.isArray(e.teams)) { store.updateTeams(wipe.id, e.teams); accepted++; }
        break;
      }
      case 'raid': {
        if (!e.attackerId) break;
        store.upsertPlayer(String(e.attackerId), clean(e.attackerName, 64), ts);
        store.recordRaidEvent({
          ts, attackerId: String(e.attackerId),
          entity: clean(e.entity, 48), grade: clean(e.grade, 24), weapon: clean(e.weapon, 48),
          posX: Number.isFinite(e.posX) ? e.posX : null,
          posZ: Number.isFinite(e.posZ) ? e.posZ : null,
        }, wipe.id);
        accepted++;
        break;
      }
      case 'mapevent': {
        if (!e.steamId || !e.kind) break;
        store.upsertPlayer(String(e.steamId), clean(e.name, 64), ts);
        store.recordMapEvent({
          ts, kind: clean(e.kind, 12), steamId: String(e.steamId),
          posX: Number.isFinite(e.posX) ? e.posX : null,
          posZ: Number.isFinite(e.posZ) ? e.posZ : null,
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
      case 'accuracy': {
        // agregados de pontaria: tiros/acertos/headshots por arma (5 em 5 min)
        if (!e.steamId || !e.weapon) break;
        const shots = Math.min(Math.max(0, e.shots | 0), 20000);
        const hits = Math.min(Math.max(0, e.hits | 0), shots);
        const hs = Math.min(Math.max(0, e.headshots | 0), hits);
        if (!shots) break;
        store.recordAccuracy(wipe.id, String(e.steamId), clean(e.weapon, 64), shots, hits, hs);
        accepted++;
        break;
      }
      case 'report': {
        // report F7 feito dentro do jogo — vai para a fila da staff
        if (!e.reporterId || !e.targetId) break;
        store.upsertPlayer(String(e.reporterId), clean(e.reporterName, 64), ts);
        store.upsertPlayer(String(e.targetId), clean(e.targetName, 64), ts);
        store.addReport({
          ts, wipeId: wipe.id,
          reporterId: String(e.reporterId), targetId: String(e.targetId),
          subject: clean(e.subject, 120), message: clean(e.message, 1000),
          rtype: clean(e.rtype, 32),
        });
        checkReportPressure(String(e.targetId), clean(e.targetName, 64), config);
        accepted++;
        break;
      }
    }
  }
  if (killLines.length) discord.killfeed(config.discordWebhooks?.killfeed, killLines);
  if (killLines.length) checkKillAnomalies(config);
  return { ok: true, accepted };
}

// ---------- alerta de pressão de reports ----------
// Quando N jogadores DIFERENTES reportam o mesmo alvo em 24 h, a staff
// recebe prioridade máxima no Discord para ir para o spectate.

const _reportAlerted = new Map(); // targetId -> ts do último alerta

function checkReportPressure(targetId, targetName, config) {
  const threshold = config.reportAlertThreshold ?? 3;
  const url = config.discordWebhooks?.staff;
  if (!threshold || !url) return;
  const n = store.reportPressure(targetId);
  if (n < threshold) return;
  const last = _reportAlerted.get(targetId) || 0;
  if (store.now() - last < 6 * 3600) return;
  _reportAlerted.set(targetId, store.now());
  discord.send(url, {
    embeds: [{
      color: 0xff5d5d,
      title: '🚨 Report pressure — spectate priority',
      description: `**${targetName || targetId}** was reported by **${n} different players in 24h**.\n` +
        `Get someone in spectate.\nProfile: /player?id=${targetId} · Admin: /admin (Reports tab)`,
    }],
  });
}

// ---------- alerta automático de anomalias ----------
// Se alguém exceder o limite de kills na última hora, avisa a staff no Discord.
// (Não bane ninguém — é um sinal para investigar, como um F7 automático.)

const _anomalyAlerted = new Map(); // steamId -> ts do último alerta

function checkKillAnomalies(config) {
  const threshold = config.anomalyKillsPerHour ?? 15;
  const url = config.discordWebhooks?.staff;
  if (!threshold || !url) return;
  const rows = store.leaderboard('kills', { type: 'window', since: store.now() - 3600 }, 5);
  for (const r of rows) {
    if (r.kills < threshold) continue;
    const last = _anomalyAlerted.get(r.steam_id) || 0;
    if (store.now() - last < 6 * 3600) continue; // no máx. 1 alerta por jogador a cada 6 h
    _anomalyAlerted.set(r.steam_id, store.now());
    discord.send(url, {
      embeds: [{
        color: 0xd8a94e,
        title: '⚠️ Kill spike detected',
        description: `**${r.name}** has **${r.kills} kills in the last hour** ` +
          `(K/D ${r.kd}). Might just be a great night — or not. ` +
          `Worth spectating.\nProfile: /player?id=${r.steam_id}`,
      }],
    });
  }
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

function handleApplication(body, ip, config) {
  for (const f of REQUIRED_APP_FIELDS) {
    if (!clean(body[f], 4000)) return { error: `Missing required field: ${f}`, code: 400 };
  }
  if (!/^7656119\d{10}$/.test(String(body.steamId).trim())) {
    return { error: 'Invalid SteamID64 (must start with 7656119...).', code: 400 };
  }
  if (store.recentApplicationFromIp(ip, 6 * 3600)) {
    return { error: 'An application was already submitted from this address recently. Try again later.', code: 429 };
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
  discord.newApplication(config.discordWebhooks?.staff, {
    name: clean(body.name, 64), discord: clean(body.discord, 64), steamId: String(body.steamId).trim(),
  });
  return { ok: true };
}

const WINDOWS = { '1h': 3600, '24h': 86400, '7d': 7 * 86400, '30d': 30 * 86400 };

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
  // Só confiar no X-Forwarded-For quando o site está atrás de um proxy de
  // confiança (Cloudflare Tunnel, nginx…) — config.trustProxy: true. Caso
  // contrário um cliente direto podia forjar o IP e contornar o rate-limit.
  const ip = (config.trustProxy && req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress;

  // --- endpoints do plugin (chave de API) ---
  if (p.startsWith('/api/plugin/') || p === '/api/ingest' || p === '/api/heartbeat' || p === '/api/wipe') {
    const key = req.headers['x-api-key'];
    if (!config.apiKey || key !== config.apiKey) { json(res, 401, { error: 'Invalid API key' }); return true; }

    if (p === '/api/plugin/notices' && req.method === 'GET') {
      json(res, 200, { rows: store.pendingNotices(50) }); return true;
    }
    if (p === '/api/plugin/notices/ack') {
      const ids = Array.isArray(body?.ids) ? body.ids.slice(0, 100) : [];
      store.markNoticesDelivered(ids);
      json(res, 200, { ok: true }); return true;
    }
    if (p === '/api/plugin/redemptions' && req.method === 'GET') {
      json(res, 200, { rows: store.pendingPluginRedemptions() }); return true;
    }
    if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed' }); return true; }
    if (!body) { json(res, 400, { error: 'Invalid JSON' }); return true; }

    if (p === '/api/ingest') json(res, 200, handleIngest(body, config));
    else if (p === '/api/heartbeat') json(res, 200, handleHeartbeat(body));
    else if (p === '/api/wipe') {
      // antes de abrir a wipe nova: gerar o resumo da wipe que termina
      const oldWipe = store.currentWipe();
      const newWipe = store.startWipe(body);
      if (newWipe.id !== oldWipe.id) {
        const summary = store.wipeSummary(oldWipe.id);
        if (summary) summary.modStats = store.modStats(oldWipe.started_at);
        if (summary && summary.totals?.kills > 0) {
          store.addPost(
            `🏁 End of ${oldWipe.label || 'the wipe'} — the highlights`,
            [
              summary.topKiller && `⚔️ Top killer: ${summary.topKiller.name} (${summary.topKiller.n} kills)`,
              summary.topElo && `🦅 Best Elo: ${summary.topElo.name} (${summary.topElo.rating})`,
              summary.longestKill && `🎯 Longest kill: ${summary.longestKill.name} — ${Math.round(summary.longestKill.distance)} m (${summary.longestKill.weapon})`,
              summary.topHeadshots && `🎖️ Most headshots: ${summary.topHeadshots.name} (${summary.topHeadshots.n})`,
              summary.topFarmer && `🌾 Top farmer: ${summary.topFarmer.name}`,
              summary.topHours && `⏱️ Most hours: ${summary.topHours.name} (${Math.round(summary.topHours.seconds / 3600)} h)`,
              summary.topDeaths && `🧲 Punching bag: ${summary.topDeaths.name} (${summary.topDeaths.n} deaths)`,
              ``,
              `Full recap: /resumo?wipe=${oldWipe.id}`,
            ].filter((x) => x !== null && x !== undefined).join('\n'));
          discord.wipeSummaryPost(config.discordWebhooks?.announcements, summary,
            (config.siteUrl || '').replace(/\/$/, ''));
        }
      }
      json(res, 200, { ok: true, wipe: newWipe });
    }
    else if (p === '/api/plugin/redemptions/complete') {
      store.completeRedemption(body.id, body.ok !== false);
      json(res, 200, { ok: true });
    } else json(res, 404, { error: 'Unknown endpoint' });
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
        const windowParam = url.searchParams.get('window');

        if (by === 'elo') {
          // Elo é sazonal: sempre relativo a uma wipe
          const wid = wipeParam ? (parseInt(wipeParam, 10) || store.currentWipe().id) : store.currentWipe().id;
          const eloRows = store.eloLeaderboard(wid, limit);
          eloRows.slice(0, 12).forEach((r) => steam.refresh(r.steam_id));
          json(res, 200, { by, rows: eloRows });
          return true;
        }

        let scope = null; // null = wipe atual
        if (windowParam && WINDOWS[windowParam]) {
          scope = { type: 'window', since: store.now() - WINDOWS[windowParam] };
        } else if (period === 'all') {
          scope = { type: 'all' };
        } else if (wipeParam) {
          const wid = parseInt(wipeParam, 10);
          if (wid) scope = { type: 'wipe', wipeId: wid };
        }
        const rows = store.leaderboard(by, scope, limit);
        rows.slice(0, 12).forEach((r) => steam.refresh(r.steam_id));
        json(res, 200, { by, rows });
        return true;
      }
      case '/api/teams':
        json(res, 200, { rows: store.teamLeaderboard(store.currentWipe().id) }); return true;
      case '/api/raids': {
        const wid = parseInt(url.searchParams.get('wipeId') || '', 10) || store.currentWipe().id;
        json(res, 200, { rows: store.raidList(wid) }); return true;
      }
      case '/api/wrapped': {
        const id = url.searchParams.get('id');
        if (!id) { json(res, 400, { error: 'Missing id parameter' }); return true; }
        const wid = parseInt(url.searchParams.get('wipe') || '', 10) || store.currentWipe().id;
        const w = store.wrapped(id, wid);
        if (!w) { json(res, 404, { error: 'Player not found' }); return true; }
        steam.refresh(id);
        json(res, 200, w); return true;
      }
      case '/api/achievements':
        json(res, 200, { rows: store.achievementsCatalog(store.currentWipe().id) }); return true;
      case '/api/streaks':
        json(res, 200, { rows: store.currentStreaks(store.currentWipe().id) }); return true;
      case '/api/mapevents': {
        const wid = parseInt(url.searchParams.get('wipeId') || '', 10) || store.currentWipe().id;
        json(res, 200, store.mapEventLeaders(wid)); return true;
      }
      case '/api/compare': {
        const a = url.searchParams.get('a'), b = url.searchParams.get('b');
        if (!a || !b) { json(res, 400, { error: 'Missing a and b parameters' }); return true; }
        const r = store.comparePlayers(a, b);
        if (!r) { json(res, 404, { error: 'Player not found' }); return true; }
        json(res, 200, r); return true;
      }
      case '/api/heatmap': {
        const wid = parseInt(url.searchParams.get('wipeId') || '', 10) || store.currentWipe().id;
        json(res, 200, { ...store.deathHeatmap(wid), mapImage: store.getInfo('map_image') || null });
        return true;
      }
      case '/api/wipesummary': {
        const wid = parseInt(url.searchParams.get('wipe') || '', 10) || store.currentWipe().id;
        const s = store.wipeSummary(wid);
        if (!s) { json(res, 404, { error: 'Wipe not found' }); return true; }
        json(res, 200, s);
        return true;
      }
      case '/api/killfeed':
        json(res, 200, { rows: store.killfeed(parseInt(url.searchParams.get('limit') || '50', 10) || 50) });
        return true;
      case '/api/player': {
        const id = url.searchParams.get('id');
        if (!id) { json(res, 400, { error: 'Missing id parameter' }); return true; }
        const prof = store.playerProfile(id);
        if (!prof) { json(res, 404, { error: 'Player not found' }); return true; }
        steam.refresh(id);
        json(res, 200, prof); return true;
      }
      case '/api/search': {
        const q = (url.searchParams.get('q') || '').slice(0, 64);
        if (q.length < 2) { json(res, 200, { rows: [] }); return true; }
        json(res, 200, { rows: store.searchPlayers(q) }); return true;
      }
      case '/api/staff': {
        const wipe = store.currentWipe();
        json(res, 200, {
          staff: store.staffList(), banStats: store.banStats(),
          modStats: store.modStats(wipe.started_at),
        }); return true;
      }
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
        steam.refresh(session.steamId);
        json(res, 200, {
          loggedIn: true,
          steamId: session.steamId,
          name: prof?.name || null,
          avatar: prof?.avatar || null,
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
    if (!session) { json(res, 401, { error: 'Sign in with Steam first.' }); return true; }
    if (!body) { json(res, 400, { error: 'Invalid JSON' }); return true; }
    let r;
    if (p === '/api/redeem') r = store.redeem(session.steamId, clean(body.itemId, 64));
    else if (p === '/api/mapvote/vote') r = store.castMapVote(session.steamId, body.optionId | 0);
    else if (p === '/api/owcases/vote') r = store.voteOw(session.steamId, body.caseId | 0, clean(body.vote, 10));
    else {
      const text = clean(body.text, 4000);
      if (!text || text.length < 20) r = { error: 'Describe your appeal with at least 20 characters.' };
      else r = store.addAppeal(session.steamId, clean(body.discord, 64), text);
    }
    json(res, r.error ? 400 : 200, r);
    return true;
  }

  // --- candidaturas (público, com rate-limit) ---
  if (p === '/api/applications' && req.method === 'POST') {
    if (!body) { json(res, 400, { error: 'Invalid JSON' }); return true; }
    const r = handleApplication(body, ip, config);
    if (r.error) json(res, r.code, { error: r.error });
    else json(res, 200, r);
    return true;
  }

  // --- administração ---
  if (p.startsWith('/api/admin/')) {
    // só via header (nunca query string — evita vazar a chave em logs/histórico)
    const key = req.headers['x-admin-key'];
    if (!config.adminKey || key !== config.adminKey) { json(res, 401, { error: 'Invalid admin key' }); return true; }

    if (req.method === 'GET') {
      switch (p) {
        case '/api/admin/applications': json(res, 200, { rows: store.listApplications() }); return true;
        case '/api/admin/appeals': json(res, 200, { rows: store.listAppeals() }); return true;
        case '/api/admin/redemptions': json(res, 200, { rows: store.listRedemptions() }); return true;
        case '/api/admin/owcases': json(res, 200, { rows: store.listOwCasesAdmin() }); return true;
        case '/api/admin/reports': {
          const target = url.searchParams.get('target');
          json(res, 200, { rows: store.reportsAdmin(target ? clean(target, 20) : null) }); return true;
        }
        case '/api/admin/watchlist':
          json(res, 200, { rows: store.watchlist(store.currentWipe().id) }); return true;
        case '/api/admin/bans': json(res, 200, { rows: store.listBansAdmin() }); return true;
      }
    }

    if (req.method === 'POST' && body) {
      switch (p) {
        case '/api/admin/applications': {
          const allowed = ['pending', 'reviewing', 'interview', 'approved', 'rejected'];
          store.setApplicationStatus(body.id, allowed.includes(body.status) ? body.status : 'pending');
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/appeals': {
          const allowed = ['pending', 'reviewing', 'accepted', 'rejected'];
          store.setAppealStatus(body.id, allowed.includes(body.status) ? body.status : 'pending',
                                clean(body.response, 2000));
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/redemptions': {
          const allowed = ['pending', 'sent', 'delivered', 'failed'];
          store.setRedemptionStatus(body.id, allowed.includes(body.status) ? body.status : 'pending');
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/posts': {
          const title = clean(body.title, 120), text = clean(body.body, 8000);
          if (!title || !text) { json(res, 400, { error: 'Title and body are required' }); return true; }
          store.addPost(title, text);
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/posts/delete':
          store.deletePost(body.id); json(res, 200, { ok: true }); return true;
        case '/api/admin/owcases': {
          const title = clean(body.title, 120);
          const clip = clean(body.clipUrl, 300);
          const clipFile = clean(body.clipFile, 80);
          if (!title || (!clip && !clipFile)) {
            json(res, 400, { error: 'Title and a clip (URL or uploaded file) are required' }); return true;
          }
          if (clipFile && !clips.NAME_RE.test(clipFile)) {
            json(res, 400, { error: 'Invalid clip file reference' }); return true;
          }
          store.addOwCase(title, clip || null, clipFile || null);
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/owcases/close': {
          const allowed = ['cheater', 'innocent', 'inconclusive'];
          if (!allowed.includes(body.verdict)) { json(res, 400, { error: 'Invalid verdict' }); return true; }
          const gone = store.closeOwCase(body.id, body.verdict, !!body.keepClip);
          if (gone) clips.remove(gone); // sem keepClip, o clip é apagado do disco
          json(res, 200, { ok: true }); return true;
        }
        case '/api/admin/mapvote':
          json(res, 200, store.mapAdmin(clean(body.action, 20), body)); return true;
        case '/api/admin/bans': {
          if (body.action === 'delete') { store.deleteBan(body.id); json(res, 200, { ok: true }); return true; }
          const banSteamId = /^7656119\d{10}$/.test(String(body.steamId || '')) ? String(body.steamId) : null;
          const ban = {
            steamName: clean(body.steamName, 64), reason: clean(body.reason, 300),
            staffName: clean(body.staffName, 64), evidence: clean(body.evidence, 300),
            steamId: banSteamId,
          };
          if (!ban.steamName || !ban.reason || !ban.staffName) {
            json(res, 400, { error: 'Player, reason and admin are required' }); return true;
          }
          store.addBan(ban);
          discord.banAnnounce(config.discordWebhooks?.bans, ban);
          // psicologia de comunidade: quem reportou o banido recebe um obrigado in-game
          if (banSteamId) {
            for (const rid of store.reportersOf(banSteamId)) {
              store.addNotice(rid,
                '✅ The player you reported was banned. Thanks for keeping the server clean!');
            }
          }
          json(res, 200, { ok: true }); return true;
        }
      }
    }
    json(res, 400, { error: 'Invalid request' }); return true;
  }

  return false;
}

module.exports = { route, json };
