'use strict';
// Clips de Overwatch alojados no próprio site (data/clips/).
//
// Ciclo de vida: a staff faz upload ao criar o caso → o vídeo é servido em
// /clips/<nome> → quando o caso fecha com veredicto, o ficheiro é APAGADO
// automaticamente (os clips só interessam durante a votação, e assim não
// se acumulam gigabytes no disco). Links externos (YouTube) não são tocados.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DIR = path.join(__dirname, '..', 'data', 'clips');
fs.mkdirSync(DIR, { recursive: true });

// uploads interrompidos deixam .part para trás — varrer no arranque
try {
  for (const f of fs.readdirSync(DIR)) {
    if (f.endsWith('.part')) fs.unlinkSync(path.join(DIR, f));
  }
} catch { /* pasta vazia */ }

// nomes gerados por nós — nunca aceitar nomes vindos do cliente fora deste formato
const NAME_RE = /^clip-[a-z0-9]+-[a-f0-9]{8}\.(mp4|webm)$/;
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB por clip

function newName(ext) {
  return `clip-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

function remove(name) {
  if (!NAME_RE.test(name || '')) return;
  fs.unlink(path.join(DIR, name), () => { /* já não existir não é erro */ });
}

module.exports = { DIR, NAME_RE, MAX_BYTES, newName, remove };
