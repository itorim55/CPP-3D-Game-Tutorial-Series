# Rustworthy — contexto do projeto para o Claude Code

Site de comunidade para um servidor de Rust (jogo da Facepunch), **full vanilla**,
do dono desta máquina. Idioma base: inglês, com seletor EN|PT (i18n em
`public/js/i18n.js`). Marca configurável: `brandAccent`/`brandRest` no
`server/config.json` (atual: RUST + WORTHY).

## Arquitetura

- **Zero dependências**: Node 22+ apenas (usa `node:sqlite`). Sem npm install, sem build.
- `server/app.js` — HTTP + estáticos + injeção de Open Graph dinâmico + rotas de login Steam (OpenID)
- `server/api.js` — todas as rotas /api/* (públicas, autenticadas por sessão, plugin via X-API-Key, admin via X-Admin-Key) + alertas de anomalia de kills e de pressão de reports F7; watchlist anti-cheat em db.js
- `server/db.js` — esquema SQLite e todas as consultas (leaderboards com janelas de tempo, Elo sazonal, equipas, raids agrupados, streaks, conquistas, heatmap, resumo de wipe)
- `server/auth.js` — Steam OpenID 2.0 + cookie de sessão HMAC
- `server/og.js` — meta tags Open Graph por rota com dados ao vivo
- `server/discord.js` — webhooks (killfeed, bans, candidaturas, resumo de wipe)
- `server/steam.js` — avatares Steam com cache na tabela players (XML público ou steamApiKey opcional)
- `server/clips.js` + rotas em app.js — clips de Overwatch alojados em `data/clips/` (upload raw da staff, streaming com Range, apagados automaticamente ao fechar o caso)
- `public/` — ~20 páginas HTML em inglês com `data-i18n`; `js/i18n.js` (dicionário PT), `js/common.js` (nav/rodapé/ticker injetados, chat reutilizável initChat(), helpers). Cargos: tabela `roles` gerida no admin (Team) dá acesso a /mod, ao chat staff e ao link MOD na nav; chat global/staff com polling de 5 s em /api/chat
- `plugin/StatsHub.cs` — plugin Oxide/uMod que corre NO SERVIDOR DE JOGO e envia eventos para o site; entrega recompensas da loja e mensagens/notices (polling); agrega analytics de pontaria (tiros/acertos/headshots)
- `deploy/` — guia DEPLOY.md + scripts de arranque (Windows/Linux) + backup + exemplo cloudflared + discord-setup.js (monta o Discord por API: canais, cargos, webhooks → config.json; guia em DISCORD.md)
- `docs/` — análise da concorrência, estudo de hospedagem, sistema de gemas, roadmap, playbook de moderação anti-cheat (em PT, para o dono)

## Comandos

```bash
node server/app.js --seed    # arrancar com dados de demonstração (porta 8080)
node server/app.js           # arrancar vazio (produção)
```

- `server/config.json` é criado no 1º arranque (gitignored — contém apiKey/adminKey/sessionSecret).
- Testar sessões localmente: `"devLogin": true` no config → `/auth/dev?id=<steamid64>`. NUNCA em produção.
- `rm -rf data/` limpa a base de dados (o ficheiro `data/stats.db` é TUDO — backups em `deploy/backup.*`).

## Convenções

- Estados na BD em inglês: pending/reviewing/interview/approved/rejected · sent/delivered/failed · open/closed · verdicts cheater/innocent/inconclusive. Traduzidos no frontend via `tStatus()`.
- Texto visível: inglês no HTML/JS (base) + chave no dicionário PT de `i18n.js`. Strings novas precisam de entrada PT (e EN_JS se usadas via `t()` em JS).
- Nomes de jogadores/armas vêm do jogo = input não confiável → SEMPRE `esc()` em templates HTML.
- Nada de dependências npm sem razão forte — a portabilidade "só Node" é uma feature.
- O dono fala português — responde-lhe em PT; código/UI em inglês.

## Deployment (plano combinado)

Site corre NESTE PC de casa atrás de **Cloudflare Tunnel** (IP escondido, HTTPS,
sem port forwarding). O servidor de JOGO ficará num host gerido (não em casa —
DDoS). Guia completo passo a passo: `deploy/DEPLOY.md`. Checklist final lá.
