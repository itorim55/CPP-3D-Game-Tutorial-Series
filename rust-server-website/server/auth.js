'use strict';
// Autenticação — login com a Steam (OpenID 2.0) e sessões em cookie assinado.
// Sem dependências: a Steam usa OpenID 2.0 puro, que é só redirects + um POST
// de verificação. O cookie de sessão é HMAC-assinado com o sessionSecret.

const crypto = require('node:crypto');
const https = require('node:https');
const { URLSearchParams } = require('node:url');

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const COOKIE_NAME = 'lr_sess';
const SESSION_DAYS = 30;

// ---------- cookie de sessão ----------

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function makeSessionCookie(steamId, secret) {
  const payload = b64url(JSON.stringify({
    sid: steamId,
    exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400,
  }));
  const value = `${payload}.${sign(payload, secret)}`;
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Lê e valida a sessão do pedido. Devolve { steamId } ou null. */
function readSession(req, secret) {
  const cookies = req.headers.cookie;
  if (!cookies || !secret) return null;
  const m = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE_NAME + '='));
  if (!m) return null;
  const value = m.slice(COOKIE_NAME.length + 1);
  const dot = value.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  try {
    const expected = sign(payload, secret);
    // Comparar em bytes: timingSafeEqual exige buffers do MESMO comprimento em
    // bytes, e uma assinatura forjada com caracteres multi-byte teria o mesmo
    // string length mas byte length diferente — sem esta guarda, lançaria.
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data.sid || !/^7656119\d{10}$/.test(data.sid)) return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { steamId: data.sid };
  } catch {
    return null;
  }
}

// ---------- Steam OpenID ----------

/** URL para onde redirecionar o utilizador quando clica "Entrar com a Steam". */
function steamLoginUrl(siteUrl) {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': `${siteUrl}/auth/steam/return`,
    'openid.realm': siteUrl,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${STEAM_OPENID}?${params}`;
}

/**
 * Verifica o regresso do login Steam. A verificação reenvia os parâmetros à
 * Steam com mode=check_authentication; a Steam responde "is_valid:true" se o
 * login for genuíno (impede alguém de forjar o redirect).
 * Devolve Promise<steamId | null>.
 */
function verifySteamReturn(url, siteUrl) {
  return new Promise((resolve) => {
    const claimed = url.searchParams.get('openid.claimed_id') || '';
    const idMatch = claimed.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/);
    const returnTo = url.searchParams.get('openid.return_to') || '';
    if (!idMatch || !returnTo.startsWith(siteUrl)) { resolve(null); return; }

    const params = new URLSearchParams();
    for (const [k, v] of url.searchParams) {
      if (k.startsWith('openid.')) params.set(k, v);
    }
    params.set('openid.mode', 'check_authentication');
    const body = params.toString();

    const req = https.request(STEAM_OPENID, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(/is_valid\s*:\s*true/.test(data) ? idMatch[1] : null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end(body);
  });
}

module.exports = { makeSessionCookie, clearSessionCookie, readSession, steamLoginUrl, verifySteamReturn };
