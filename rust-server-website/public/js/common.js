'use strict';
// Utilitários partilhados por todas as páginas + navegação/rodapé injetados.

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erro ${r.status}`);
  return r.json();
}

async function apiPost(path, body, headers = {}) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function timeAgo(tsSeconds) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - tsSeconds);
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}

function hours(seconds) {
  return `${Math.round((seconds || 0) / 3600)} h`;
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function gems(n) {
  return `${(n || 0).toLocaleString('pt-PT')} 💎`;
}

function playerLink(steamId, name) {
  return `<a href="/player?id=${encodeURIComponent(steamId)}">${esc(name || steamId)}</a>`;
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
  ['/', 'Início'],
  ['/stats', 'Stats'],
  ['/loja', 'Loja'],
  ['/mapa', 'Mapa'],
  ['/overwatch', 'Overwatch'],
  ['/regras', 'Regras'],
  ['/staff', 'Staff'],
  ['/candidatura', 'Candidaturas'],
];

function renderChrome() {
  const header = document.querySelector('header');
  if (header && !header.innerHTML.trim()) {
    const path = location.pathname.replace(/\.html$/, '') || '/';
    header.innerHTML = `
      <nav class="nav">
        <a class="logo" href="/" id="nav-logo"><b></b></a>
        <div class="links">
          ${NAV_LINKS.map(([href, label]) =>
            `<a href="${href}" ${href === path || (href === '/' && path === '/index') ? 'class="active"' : ''}>${label}</a>`).join('')}
          <a href="/auth/steam" id="nav-user" class="user-chip">Entrar</a>
          <a class="cta" href="#" id="discord-link" target="_blank" rel="noopener">Discord</a>
        </div>
      </nav>`;
  }

  const footer = document.querySelector('footer');
  if (footer && !footer.innerHTML.trim()) {
    footer.innerHTML = `
      <span data-brand></span> · <a href="/regras">Regras</a> · <a href="/staff">Staff &amp; Transparência</a> ·
      <a href="/candidatura">Junta-te à equipa</a> · <a href="/novidades">Novidades</a> ·
      <a href="/apelo">Apelar um ban</a>
      <br>Este servidor não é afiliado à Facepunch Studios nem à Valve.`;
  }

  me().then((u) => {
    const chip = document.getElementById('nav-user');
    if (!chip) return;
    if (u.loggedIn) {
      chip.href = '/conta';
      chip.innerHTML = `${esc(u.name || 'A minha conta')} · ${gems(u.wallet.gems)}`;
      chip.title = 'A minha conta';
    } else {
      chip.href = '/auth/steam';
      chip.textContent = 'Entrar com Steam';
    }
  });

  siteStatus().then((s) => {
    const d = document.getElementById('discord-link');
    if (d && s?.info?.discord) d.href = s.info.discord;
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

// Countdown para a próxima wipe (elementos com [data-countdown]).
function startCountdown(el, isoDate) {
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) { el.textContent = '—'; return; }
  const tick = () => {
    let ms = target - Date.now();
    if (ms <= 0) { el.textContent = 'WIPE!'; return; }
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000);
    el.textContent = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
    setTimeout(tick, 30000);
  };
  tick();
}

// ---- gráfico de área (série única) com crosshair + tooltip ----
// data: [{hour: unixSeconds, players: n}]
function renderAreaChart(container, data, { color = '#e0552e', maxY = null } = {}) {
  container.innerHTML = '';
  if (!data || data.length < 2) {
    container.innerHTML = '<p style="color:var(--ink-muted);font-size:13px">Ainda sem histórico suficiente.</p>';
    return;
  }
  const W = 720, H = 180, PAD = { l: 34, r: 10, t: 12, b: 22 };
  const xs = data.map((d) => d.hour);
  const ys = data.map((d) => d.players);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const topY = maxY || Math.max(...ys, 10);
  const x = (v) => PAD.l + ((v - minX) / (maxX - minX)) * (W - PAD.l - PAD.r);
  const y = (v) => H - PAD.b - (v / topY) * (H - PAD.t - PAD.b);

  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.hour).toFixed(1)},${y(d.players).toFixed(1)}`).join(' ');
  const area = `${line} L${x(maxX).toFixed(1)},${H - PAD.b} L${x(minX).toFixed(1)},${H - PAD.b} Z`;

  const gridLines = [0, 0.5, 1].map((f) => {
    const v = Math.round(topY * f);
    const yy = y(v);
    return `<line x1="${PAD.l}" y1="${yy}" x2="${W - PAD.r}" y2="${yy}" stroke="#3a2f26" stroke-width="1"/>
            <text x="${PAD.l - 6}" y="${yy + 4}" text-anchor="end" font-size="10" fill="#857a6e">${v}</text>`;
  }).join('');

  const fmtHour = (ts) => {
    const d = new Date(ts * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = minX + (maxX - minX) * f;
    return `<text x="${x(v)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#857a6e">${fmtHour(v)}</text>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img"
         aria-label="Jogadores online nas últimas 48 horas">
      ${gridLines}${ticks}
      <path d="${area}" fill="${color}" opacity="0.14"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      <line class="xhair" x1="0" y1="${PAD.t}" x2="0" y2="${H - PAD.b}" stroke="#b8aca0" stroke-width="1" stroke-dasharray="3 3" style="display:none"/>
      <circle class="pt" r="4" fill="${color}" stroke="#14100d" stroke-width="2" style="display:none"/>
    </svg>
    <div class="chart-tip"></div>`;
  container.appendChild(wrap);

  const svg = wrap.querySelector('svg');
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
    const px = x(d.hour), py = y(d.players);
    xhair.setAttribute('x1', px); xhair.setAttribute('x2', px);
    xhair.style.display = ''; pt.style.display = '';
    pt.setAttribute('cx', px); pt.setAttribute('cy', py);
    const dt = new Date(d.hour * 1000);
    tip.innerHTML = `<b>${d.players}</b> jogadores · ${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')} ${fmtHour(d.hour)}`;
    tip.style.display = 'block';
    tip.style.left = `${(px / W) * rect.width}px`;
    tip.style.top = `${(py / H) * rect.height}px`;
  });
  svg.addEventListener('mouseleave', () => {
    tip.style.display = 'none'; xhair.style.display = 'none'; pt.style.display = 'none';
  });
}
