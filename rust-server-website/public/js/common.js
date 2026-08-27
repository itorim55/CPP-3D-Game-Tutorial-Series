'use strict';
// Utilitários partilhados por todas as páginas + navegação/rodapé injetados.

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t('error.generic', r.status));
  return r.json();
}

async function apiPost(path, body, headers = {}) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || t('error.generic', r.status));
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const LOCALE = { en: 'en-GB', pt: 'pt-PT' }[LANG] || 'en-GB';

function timeAgo(tsSeconds) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - tsSeconds);
  if (s < 60) return t('time.now');
  if (s < 3600) return t('time.min', Math.floor(s / 60));
  if (s < 86400) return t('time.hour', Math.floor(s / 3600));
  return t('time.day', Math.floor(s / 86400));
}

function hours(seconds) {
  return `${Math.round((seconds || 0) / 3600)} h`;
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtNum(n) {
  return (n || 0).toLocaleString(LOCALE);
}

function gems(n) {
  return `${fmtNum(n)} 💎`;
}

function playerLink(steamId, name) {
  return `<a href="/player?id=${encodeURIComponent(steamId)}">${esc(name || steamId)}</a>`;
}

// Avatar Steam com fallback para a inicial do nome (estilo stencil).
function pfp(url, name, size = 24, cls = '') {
  const s = `width:${size}px;height:${size}px`;
  if (url) {
    return `<img class="pfp ${cls}" style="${s}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  const ch = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="pfp fallback ${cls}" style="${s};font-size:${Math.round(size * 0.48)}px">${esc(ch)}</span>`;
}

// Célula "avatar + nome clicável" para tabelas e listas.
function playerCell(steamId, name, avatar, size = 24) {
  return `<span class="pcell">${pfp(avatar, name, size)}${playerLink(steamId, name)}</span>`;
}

// ---------- sessão ----------

let _mePromise = null;
function me() {
  _mePromise ??= api('/api/me').catch(() => ({ loggedIn: false }));
  return _mePromise;
}

let _statusPromise = null;
function siteStatus() {
  _statusPromise ??= api('/api/status').catch(() => null);
  return _statusPromise;
}

// ---------- navegação e rodapé injetados ----------

const NAV_LINKS = [
  ['/', 'nav.home'],
  ['/stats', 'nav.stats'],
  ['/mapa', 'nav.map'],
  ['/loja', 'nav.store'],
  ['/staff', 'nav.trust'],
];

// sub-navegação em pills nos dois hubs: STATS e TRUST
const SUBNAVS = {
  stats: {
    pages: ['/stats', '/heatmap', '/resumo', '/conquistas', '/vs'],
    items: [
      ['/stats', 'sub.leaderboards'],
      ['/stats#teams', 'sub.teams'],
      ['/heatmap', 'sub.heatmap'],
      ['/resumo', 'sub.recap'],
      ['/conquistas', 'sub.ach'],
      ['/vs', 'sub.vs'],
    ],
  },
  trust: {
    pages: ['/staff', '/regras', '/overwatch', '/apelo', '/candidatura'],
    items: [
      ['/staff', 'sub.staffBans'],
      ['/regras', 'nav.rules'],
      ['/overwatch', 'nav.overwatch'],
      ['/apelo', 'sub.appeal'],
      ['/candidatura', 'nav.apply'],
    ],
  },
};

function mountSubnav() {
  const path = location.pathname.replace(/\.html$/, '') || '/';
  const hub = Object.values(SUBNAVS).find((h) => h.pages.includes(path));
  const main = document.querySelector('main');
  if (!hub || !main || document.querySelector('.subnav')) return;
  const row = document.createElement('nav');
  row.className = 'subnav';
  row.innerHTML = hub.items.map(([href, key]) => {
    const active = href.split('#')[0] === path && (!href.includes('#') || location.hash === '#' + href.split('#')[1]);
    return `<a href="${href}" ${active ? 'class="active"' : ''}>${t(key)}</a>`;
  }).join('');
  main.prepend(row);
  // pill "My stats" para quem tem sessão iniciada — salto direto para o próprio perfil
  if (hub === SUBNAVS.stats) {
    me().then((u) => {
      if (!u.loggedIn) return;
      const a = document.createElement('a');
      a.href = `/player?id=${u.steamId}`;
      a.className = 'mine';
      a.textContent = t('sub.mine');
      row.appendChild(a);
    });
  }
}

function renderChrome() {
  const header = document.querySelector('header');
  if (header && !header.innerHTML.trim()) {
    const path = location.pathname.replace(/\.html$/, '') || '/';
    header.innerHTML = `
      <nav class="nav">
        <a class="logo" href="/" id="nav-logo"><b></b></a>
        <span class="nav-live" id="nav-live" style="display:none"><span class="pulse"></span><b></b></span>
        <div class="links">
          ${NAV_LINKS.map(([href, key]) =>
            `<a href="${href}" ${href === path || (href === '/' && path === '/index') ? 'class="active"' : ''}>${t(key)}</a>`).join('')}
          <span class="sep"></span>
          <a href="/auth/steam" id="nav-user" class="user-chip">${t('nav.login')}</a>
          <a class="cta" href="#" id="discord-link" target="_blank" rel="noopener">Discord</a>
          <span class="lang-switch">${Object.entries(LANGS).map(([code, label]) =>
            `<a href="#" data-lang="${code}" ${code === LANG ? 'class="active"' : ''}>${label}</a>`).join('')}</span>
        </div>
      </nav>`;
    header.querySelectorAll('[data-lang]').forEach((el) =>
      el.addEventListener('click', (e) => { e.preventDefault(); setLang(el.dataset.lang); }));
  }

  const footer = document.querySelector('footer');
  if (footer && !footer.innerHTML.trim()) {
    footer.innerHTML = `
      <span data-brand></span> · <a href="/regras">${t('footer.rules')}</a> · <a href="/staff">${t('footer.staff')}</a> ·
      <a href="/candidatura">${t('footer.apply')}</a> · <a href="/conquistas">${t('footer.ach')}</a> ·
      <a href="/novidades">${t('footer.news')}</a> ·
      <a href="/apelo">${t('footer.appeal')}</a> · <a href="/tv">📺 TV</a>
      <br>${t('footer.disclaimer')}`;
  }

  me().then((u) => {
    // link MOD na nav — só aparece a quem tem cargo
    if (u.loggedIn && u.isMod && header && !header.querySelector('.modlink')) {
      const sep = header.querySelector('.sep');
      if (sep) {
        const a = document.createElement('a');
        a.href = '/mod';
        a.textContent = 'MOD';
        a.className = 'modlink' + (location.pathname.replace(/\.html$/, '') === '/mod' ? ' active' : '');
        sep.parentNode.insertBefore(a, sep);
      }
    }
    const chip = document.getElementById('nav-user');
    if (!chip) return;
    if (u.loggedIn) {
      chip.href = '/conta';
      chip.classList.add('logged');
      chip.innerHTML = `${pfp(u.avatar, u.name, 26)}` +
        `<span class="cname">${esc(u.name || t('nav.account'))}</span>` +
        `<span class="cgems">${fmtNum(u.wallet.gems)} 💎</span>`;
      chip.title = t('nav.account');
    } else {
      chip.href = '/auth/steam';
      chip.textContent = t('nav.login');
    }
  });

  mountSubnav();

  siteStatus().then((s) => {
    const d = document.getElementById('discord-link');
    if (d && s?.info?.discord) d.href = s.info.discord;
    // LED ao vivo na nav: nº de jogadores online em todas as páginas
    const led = document.getElementById('nav-live');
    if (led && s?.online && s.heartbeat) {
      led.style.display = '';
      led.querySelector('b').textContent = s.heartbeat.players;
      led.title = `${s.heartbeat.players}/${s.heartbeat.max_players} online`;
    }
    applyBrand(s);
  });
}

// A marca (nome do servidor) vem da configuração do site — muda em
// server/config.json (brandAccent/brandRest) e todo o site atualiza.
function applyBrand(s) {
  const accent = s?.info?.brandAccent || 'RUST';
  const rest = s?.info?.brandRest || '';
  const full = accent + rest;

  const logo = document.getElementById('nav-logo');
  if (logo) logo.innerHTML = `<b>${esc(accent)}</b>${esc(rest)}`;

  document.querySelectorAll('[data-brand]').forEach((el) => { el.textContent = full; });
  document.querySelectorAll('[data-brand-hero]').forEach((el) => {
    el.innerHTML = `<span>${esc(accent)}</span>${esc(rest)}`;
  });

  if (!document.title.includes(full)) {
    document.title = `${document.title.split(' — ')[0]} — ${full}`;
  }
}

document.addEventListener('DOMContentLoaded', renderChrome);

// ---------- esqueletos de carregamento (substituem o "loading…" cinzento) ----------
function skelHTML(rows = 3) {
  return `<div class="skel" role="status" aria-label="${esc(t('loading'))}">${'<i></i>'.repeat(rows)}</div>`;
}
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-i18n="loading"]').forEach((el) => { el.innerHTML = skelHTML(3); });
});

// ---------- "descodificação" dos títulos de secção ----------
function scramble(el) {
  if (reduceMotion) return;
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  const tgt = node || (el.children.length ? null : el);
  if (!tgt) return;
  const fin = tgt.textContent;
  const chars = 'ABCDEFGHIKLMNOPRSTUVXZ0123456789#/';
  let f = 0;
  const total = 14;
  const id = setInterval(() => {
    f++;
    tgt.textContent = fin.split('').map((c, i) =>
      c === ' ' || i < fin.length * f / total ? c : chars[Math.random() * chars.length | 0]).join('');
    if (f >= total) { tgt.textContent = fin; clearInterval(id); }
  }, 30);
}
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('h2.section').forEach(scramble);
});

// ---------- ticker: fio de atividade ao vivo por baixo da nav ----------
// Injetado em todas as páginas; dá vida ao site mesmo fora da home.
// Conteúdo do ticker; marca kills nunca vistas com .tk-new (brilham a âmbar).
const tickerSeen = new Set();
function buildTickerItems(s, kf, lb) {
  const items = [];
  const item = (tk, html, cls = '') => items.push(
    `<span class="ticker-item${cls}"><span class="tk">${tk}</span> ${html}</span>`);

  const hb = s?.heartbeat;
  if (hb && s?.online) item('◉', `<b>${hb.players}/${hb.max_players}</b> ${t('ticker.online')}`);
  if (s?.killsThisWipe) item('☠', t('ticker.killsWipe', `<b>${fmtNum(s.killsThisWipe)}</b>`));
  if (s?.nextWipe) {
    const ms = new Date(s.nextWipe).getTime() - Date.now();
    if (ms > 0) {
      const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000);
      item('⟳', t('ticker.wipeIn', `<b>${d}d ${String(h).padStart(2, '0')}h</b>`));
    }
  }
  const top = lb?.rows?.[0];
  if (top) item('★', t('ticker.topKiller', `<b>${esc(top.name)}</b>`, top.kills));
  for (const k of kf?.rows || []) {
    const key = `${k.ts}|${k.attacker_id}|${k.victim_id}`;
    const fresh = tickerSeen.size > 0 && !tickerSeen.has(key);
    tickerSeen.add(key);
    item('⚔', `<b>${esc(k.attacker_name || '?')}</b> ▸ ${esc(k.victim_name || '?')}` +
      ` · ${esc(k.weapon || '?')}${k.distance ? ` · ${Math.round(k.distance)}m` : ''}` +
      `${k.headshot ? ' · HS' : ''}`, fresh ? ' tk-new' : '');
  }
  return items;
}

const TICKER_QUIET = ['/apelo', '/candidatura', '/regras'];

async function renderTicker() {
  const header = document.querySelector('header');
  if (!header || document.querySelector('.ticker')) return;
  if (TICKER_QUIET.includes(location.pathname.replace(/\.html$/, '') || '/')) return;
  try {
    const [s, kf, lb] = await Promise.all([
      siteStatus(),
      api('/api/killfeed?limit=8').catch(() => null),
      api('/api/leaderboard?by=kills&limit=1').catch(() => null),
    ]);
    const items = buildTickerItems(s, kf, lb);
    if (!items.length) return;

    const bar = document.createElement('div');
    bar.className = 'ticker';
    bar.setAttribute('aria-hidden', 'true');
    // conteúdo duplicado = loop contínuo sem intervalo morto; com um só item
    // (BD vazia no dia do lançamento) mostrar uma cópia parada, não "x | x"
    const html = items.join('');
    bar.innerHTML = items.length > 1
      ? `<div class="ticker-track">${html}${html}</div>`
      : `<div class="ticker-track" style="animation:none">${html}</div>`;
    header.insertAdjacentElement('afterend', bar);
    const track = bar.querySelector('.ticker-track');
    track.style.animationDuration = `${Math.max(30, track.scrollWidth / 260)}s`;

    // refresh silencioso: troca o conteúdo mantendo a fase da animação
    setInterval(async () => {
      if (document.hidden) return;
      try {
        const [s2, kf2, lb2] = await Promise.all([
          api('/api/status').catch(() => null),
          api('/api/killfeed?limit=8').catch(() => null),
          api('/api/leaderboard?by=kills&limit=1').catch(() => null),
        ]);
        const fresh = buildTickerItems(s2, kf2, lb2);
        if (!fresh.length) return;
        const h = fresh.join('');
        track.innerHTML = fresh.length > 1 ? h + h : h;
        track.style.animation = fresh.length > 1 ? '' : 'none';
        track.style.animationDuration = `${Math.max(30, track.scrollWidth / 260)}s`;
      } catch {}
    }, 60000);
  } catch {}
}
document.addEventListener('DOMContentLoaded', renderTicker);

// ---------- chat do site (global + staff) ----------
// Widget reutilizável: initChat(container, { defaultChannel }) — sondagem de
// 5 s, tabs GLOBAL/STAFF (staff só para mods), Enter envia, mods apagam.
function initChat(container, { defaultChannel = 'global' } = {}) {
  let channel = defaultChannel;
  let lastId = 0;
  let user = { loggedIn: false, isMod: false };

  container.innerHTML = `
    <div class="chat-head">
      <span class="seg" id="ct-tabs" style="display:none">
        <button data-ch="global" class="${channel === 'global' ? 'active' : ''}">${t('chat.global')}</button>
        <button data-ch="staff" class="${channel === 'staff' ? 'active' : ''}">${t('chat.staff')}</button>
      </span>
    </div>
    <div class="chat-box" id="ct-box">${skelHTML(3)}</div>
    <div class="chat-input" id="ct-input"></div>`;

  const box = container.querySelector('#ct-box');
  const tabs = container.querySelector('#ct-tabs');

  const render = (rows, append) => {
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const html = rows.map((m) => `
      <div class="cmsg${m.role ? ' staffmsg' : ''}" data-id="${m.id}">
        ${pfp(m.avatar, m.name, 20)}
        <span class="who">${esc(m.name || '?')}</span>
        ${m.role ? `<span class="rolechip">${m.role === 'admin' ? 'ADMIN' : 'MOD'}</span>` : ''}
        <span class="txt">${esc(m.text)}</span>
        <span class="when">${timeAgo(m.ts)}</span>
        ${user.isMod ? `<a href="#" class="del" data-del="${m.id}" title="delete">×</a>` : ''}
      </div>`).join('');
    if (append) box.insertAdjacentHTML('beforeend', html);
    else box.innerHTML = html || `<p class="chat-empty">${t('chat.empty')}</p>`;
    if (rows.length) lastId = rows[rows.length - 1].id;
    if (atBottom || !append) box.scrollTop = box.scrollHeight;
  };

  const poll = async (fresh) => {
    try {
      const d = await api(`/api/chat?channel=${channel}${fresh ? '' : `&after=${lastId}`}`);
      if (fresh) { lastId = 0; render(d.rows, false); }
      else if (d.rows.length) render(d.rows, true);
    } catch { if (fresh) box.innerHTML = `<p class="chat-empty">${t('chat.empty')}</p>`; }
  };

  const renderInput = () => {
    const inp = container.querySelector('#ct-input');
    if (!user.loggedIn) {
      inp.innerHTML = `<p class="chat-empty" style="margin:0">${t('chat.login')}</p>`;
      return;
    }
    inp.innerHTML = `
      <input type="text" id="ct-text" maxlength="300" placeholder="${t('chat.ph')}" autocomplete="off">
      <button class="btn" id="ct-send">${t('chat.send')}</button>`;
    const send = async () => {
      const field = container.querySelector('#ct-text');
      const text = field.value.trim();
      if (!text) return;
      field.value = '';
      try { await apiPost('/api/chat', { channel, text }); poll(false); }
      catch (e) { field.value = text; alert('⚠️ ' + e.message); }
    };
    container.querySelector('#ct-send').addEventListener('click', send);
    container.querySelector('#ct-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
  };

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ch]');
    if (!b || b.dataset.ch === channel) return;
    channel = b.dataset.ch;
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    box.innerHTML = skelHTML(3);
    poll(true);
  });

  box.addEventListener('click', async (e) => {
    const d = e.target.closest('a[data-del]');
    if (!d) return;
    e.preventDefault();
    await apiPost('/api/chat', { channel, deleteId: parseInt(d.dataset.del, 10) }).catch(() => {});
    poll(true);
  });

  me().then((u) => {
    user = u;
    if (u.loggedIn && u.isMod) tabs.style.display = '';
    renderInput();
    poll(true);
    setInterval(() => { if (!document.hidden) poll(false); }, 5000);
  });
}

// ---------- dock de chat fixo, estilo Twitch ----------
// O conteúdo cede a coluna da direita ao chat (html.chatdock-open empurra o
// main); minimizar devolve o espaço. Estado lembrado em localStorage.
function mountChatDock() {
  const DOCK_MIN = 1600; // funciona na esmagadora maioria dos desktops
  const path = location.pathname.replace(/\.html$/, '') || '/';
  if (document.body.classList.contains('tv') || path === '/admin' || path === '/mod') return;

  const doc = document.documentElement;
  const aside = document.createElement('aside');
  aside.className = 'chat-dock';
  aside.id = 'chat-dock';
  aside.innerHTML = `
    <div class="cd-head">
      <b>${t('chat.title')}</b>
      <span class="live-badge" style="margin-left:auto"><span class="pulse"></span>LIVE</span>
      <button class="cd-min" id="cd-min" title="—">—</button>
    </div>
    <div class="cd-body" id="cd-body"></div>`;
  document.body.appendChild(aside);

  const tab = document.createElement('button');
  tab.className = 'chat-tab';
  tab.textContent = '💬';
  tab.title = t('chat.title');
  document.body.appendChild(tab);

  let open = true;
  try { open = localStorage.getItem('chatDock') !== '0'; } catch {}
  let started = false;

  const apply = () => {
    const wide = window.innerWidth >= DOCK_MIN;
    doc.classList.toggle('has-chatdock', wide);          // esconde o painel da home
    doc.classList.toggle('chatdock-open', wide && open); // reserva a coluna
    aside.style.display = wide && open ? '' : 'none';
    tab.style.display = wide && !open ? '' : 'none';
    if (wide && !started) { started = true; initChat(aside.querySelector('#cd-body')); }
  };

  aside.querySelector('#cd-min').addEventListener('click', () => {
    open = false;
    try { localStorage.setItem('chatDock', '0'); } catch {}
    apply();
  });
  tab.addEventListener('click', () => {
    open = true;
    try { localStorage.setItem('chatDock', '1'); } catch {}
    apply();
  });
  window.addEventListener('resize', apply);
  apply();
}
document.addEventListener('DOMContentLoaded', mountChatDock);

// ---------- delta flutuante (+2 / -1 a subir de um número que mudou) ----------
function floatDelta(anchor, diff, cls = '') {
  if (!diff || reduceMotion || !anchor) return;
  const f = document.createElement('span');
  f.className = `delta ${diff > 0 ? 'up' : 'down'}${cls ? ' ' + cls : ''}`;
  f.textContent = (diff > 0 ? '+' : '') + diff;
  if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';
  anchor.appendChild(f);
  f.addEventListener('animationend', () => f.remove());
}

// LED da nav atualiza-se sozinho em todas as páginas (com delta a flutuar)
setInterval(async () => {
  if (document.hidden) return;
  const led = document.getElementById('nav-live');
  if (!led) return;
  const s = await api('/api/status').catch(() => null);
  if (!s?.online || !s.heartbeat) { led.style.display = 'none'; return; }
  led.style.display = '';
  const b = led.querySelector('b');
  const prev = parseInt(b.textContent, 10);
  b.textContent = s.heartbeat.players;
  if (Number.isFinite(prev) && prev !== s.heartbeat.players) {
    bump(b);
    floatDelta(led, s.heartbeat.players - prev);
  }
}, 45000);

// ---------- brasas: partículas a subir no hero (respeita reduced-motion) ----------
function startEmbers(canvas) {
  if (!canvas || reduceMotion) return;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;
  const resize = () => { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; };
  resize();
  window.addEventListener('resize', resize);

  const spawn = (fresh) => ({
    x: Math.random() * W,
    y: fresh ? H + 4 : Math.random() * H,
    r: 1 + Math.random() * 2,
    vy: 0.2 + Math.random() * 0.55,
    sway: 0.2 + Math.random() * 0.5,
    phase: Math.random() * Math.PI * 2,
    life: 0,
    max: 260 + Math.random() * 220,
    gold: Math.random() < 0.3,
  });
  const parts = Array.from({ length: 42 }, () => spawn(false));

  const step = () => {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.life++; p.y -= p.vy; p.x += Math.sin(p.life / 46 + p.phase) * p.sway * 0.4;
      if (p.life > p.max || p.y < -6) Object.assign(p, spawn(true));
      const a = Math.max(0, 0.65 * (1 - p.life / p.max));
      ctx.fillStyle = p.gold ? `rgba(255,176,32,${a})` : `rgba(255,91,38,${a})`;
      ctx.fillRect(p.x, p.y, p.r, p.r); // quadradinhos: mais "terminal" que círculos
    }
    requestAnimationFrame(step);
  };
  step();
}

// Countdown para a próxima wipe — tique ao segundo (sensação "ao vivo").
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function startCountdown(el, isoDate) {
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) { el.textContent = '—'; return; }
  const tick = () => {
    let ms = target - Date.now();
    // o relógio muda de carácter à medida que a wipe se aproxima
    el.classList.toggle('cd-soon', ms < 86400000 && ms >= 3600000);
    el.classList.toggle('cd-crit', ms > 0 && ms < 3600000);
    if (ms <= 0) {
      // janela de graça de 6h: depois disso a data está desatualizada, não "WIPE!" eterno
      el.textContent = ms > -6 * 3600000 ? t('countdown.wipe') : '—';
      el.classList.remove('cd-soon', 'cd-crit');
      return;
    }
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const s = Math.floor(ms / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    el.textContent = d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
    setTimeout(tick, 1000);
  };
  tick();
}

// Anima um número de 0 até target (efeito de contador a subir).
function countUp(el, target, { duration = 900, suffix = '', prefix = '', from = 0 } = {}) {
  target = Number(target) || 0;
  if (reduceMotion) { el.textContent = prefix + fmtNum(target) + suffix; return; }
  const start = performance.now();
  from = Number(from) || 0;
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = prefix + fmtNum(Math.round(from + (target - from) * eased)) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Pulso visual num número que acabou de mudar.
function bump(el) {
  if (!el || reduceMotion) return;
  el.classList.remove('bump');
  void el.offsetWidth; // reiniciar a animação
  el.classList.add('bump');
}

// ---- gráfico de área (série única) com crosshair + tooltip ----
// data: [{hour: unixSeconds, players: n}]
function renderAreaChart(container, data, { color = '#ff5b26', maxY = null, xFmt = 'hour', yKey = 'players', yLabel = null } = {}) {
  container.innerHTML = '';
  if (!data || data.length < 2) {
    container.innerHTML = `<p style="color:var(--ink-muted);font-size:13px">${t('chart.empty')}</p>`;
    return;
  }
  const W = 720, H = 180, PAD = { l: 34, r: 10, t: 12, b: 22 };
  const xs = data.map((d) => d.hour);
  const ys = data.map((d) => d[yKey]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const topY = maxY || Math.max(...ys, 10);
  const x = (v) => PAD.l + ((v - minX) / (maxX - minX)) * (W - PAD.l - PAD.r);
  const y = (v) => H - PAD.b - (v / topY) * (H - PAD.t - PAD.b);

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.hour).toFixed(1)},${y(d[yKey]).toFixed(1)}`).join(' ');
  const area = `${line} L${x(maxX).toFixed(1)},${H - PAD.b} L${x(minX).toFixed(1)},${H - PAD.b} Z`;

  const gridLines = [0, 0.5, 1].map((f) => {
    const v = topY < 10 ? Math.round(topY * f * 10) / 10 : Math.round(topY * f);
    const yy = y(v);
    return `<line x1="${PAD.l}" y1="${yy}" x2="${W - PAD.r}" y2="${yy}" stroke="#252b35" stroke-width="1"/>
            <text x="${PAD.l - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#5c6675">${v}</text>`;
  }).join('');

  const fmtHour = (ts) => {
    const d = new Date(ts * 1000);
    if (xFmt === 'day') return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = minX + (maxX - minX) * f;
    return `<text x="${x(v)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#5c6675">${fmtHour(v)}</text>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img"
         aria-label="${esc(t('chart.aria'))}">
      ${gridLines}${ticks}
      <path d="${area}" fill="${color}" opacity="0.14"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      <line class="xhair" x1="0" y1="${PAD.t}" x2="0" y2="${H - PAD.b}" stroke="#9aa4b2" stroke-width="1" stroke-dasharray="3 3" style="display:none"/>
      <circle class="pt" r="4" fill="${color}" stroke="#0b0d11" stroke-width="2" style="display:none"/>
    </svg>
    <div class="chart-tip"></div>`;
  container.appendChild(wrap);

  const svg = wrap.querySelector('svg');
  if (!reduceMotion) {
    const stroke = svg.querySelector('path[fill="none"]');
    const fillArea = svg.querySelector('path[opacity]');
    const len = stroke.getTotalLength();
    stroke.style.strokeDasharray = len;
    stroke.style.strokeDashoffset = len;
    fillArea.style.opacity = 0;
    requestAnimationFrame(() => {
      stroke.style.transition = 'stroke-dashoffset 1.1s ease-out';
      fillArea.style.transition = 'opacity .8s ease .5s';
      stroke.style.strokeDashoffset = '0';
      fillArea.style.opacity = '';
    });
  }
  const tip = wrap.querySelector('.chart-tip');
  const xhair = wrap.querySelector('.xhair');
  const pt = wrap.querySelector('.pt');

  svg.addEventListener('mousemove', (ev) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((ev.clientX - rect.left) / rect.width) * W;
    let best = 0, bestDist = Infinity;
    data.forEach((d, i) => {
      const dist = Math.abs(x(d.hour) - relX);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    const d = data[best];
    const px = x(d.hour), py = y(d[yKey]);
    xhair.setAttribute('x1', px); xhair.setAttribute('x2', px);
    xhair.style.display = ''; pt.style.display = '';
    pt.setAttribute('cx', px); pt.setAttribute('cy', py);
    const dt = new Date(d.hour * 1000);
    tip.innerHTML = `<b>${d[yKey]}</b> ${yLabel || t('chart.players')} · ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}${xFmt === 'day' ? '' : ` ${fmtHour(d.hour)}`}`;
    tip.style.display = 'block';
    tip.style.left = `${(px / W) * rect.width}px`;
    tip.style.top = `${(py / H) * rect.height}px`;
  });
  svg.addEventListener('mouseleave', () => {
    tip.style.display = 'none'; xhair.style.display = 'none'; pt.style.display = 'none';
  });
}
