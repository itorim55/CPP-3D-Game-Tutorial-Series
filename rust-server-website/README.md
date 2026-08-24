# LusoRust — Site de estatísticas para servidor de Rust

Site completo para um servidor de Rust (o jogo da Facepunch) com estatísticas ao
vivo, killfeed, leaderboards por wipe, perfis de jogador, secção de staff com
transparência de bans, e página de candidaturas a moderador.

**Zero dependências**: só precisa de Node.js 22+ (usa o SQLite embutido do Node).
Sem `npm install`, sem build. Ideal para self-hosting num PC em casa.

## Arranque rápido

```bash
node server/app.js --seed   # com dados de demonstração
# ou
node server/app.js          # vazio, à espera de dados do plugin
```

Abre http://localhost:8080. No primeiro arranque é criado `server/config.json`
com chaves de API novas — edita o nome do servidor, IP, Discord e data da wipe.

## Estrutura

```
rust-server-website/
├── server/            backend (Node puro + node:sqlite)
│   ├── app.js         servidor HTTP + estáticos
│   ├── api.js         rotas da API
│   ├── db.js          esquema e consultas SQLite
│   ├── seed.js        dados de demonstração
│   └── config.json    criado no 1º arranque (NÃO comitar)
├── public/            frontend (HTML/CSS/JS puro)
│   ├── index.html     home: status ao vivo, countdown de wipe, população, killfeed
│   ├── stats.html     leaderboards (kills, K/D, headshots, distância, horas)
│   ├── player.html    perfil público por SteamID
│   ├── staff.html     equipa, Código do Moderador, lista pública de bans
│   ├── candidatura.html  formulário de candidatura a moderador
│   ├── regras.html    regras do servidor
│   └── admin.html     gestão de candidaturas (protegida por adminKey)
├── plugin/
│   └── StatsHub.cs    plugin Oxide/uMod que envia os dados do jogo para o site
└── docs/
    ├── ANALISE-CONCORRENCIA.md   análise dos sites das grandes redes de Rust
    ├── HOSPEDAGEM-EM-CASA.md     dá para hospedar em casa? (spoiler: o site sim)
    └── ROADMAP.md                opiniões e próximos passos por fases
```

## Como os dados chegam ao site

```
Servidor de Rust (Oxide/Carbon)
   └── plugin/StatsHub.cs
        ├── POST /api/ingest      kills, mortes PVE, sessões, farm (lotes de 30 s)
        ├── POST /api/heartbeat   população, fila, FPS, entidades (60 s)
        └── POST /api/wipe        automático quando há save novo (wipe)
              ▼
        SQLite (data/stats.db)
              ▼
        API pública → páginas do site
```

Instalação do plugin: ver `plugin/README.md`.

## API pública

| Endpoint | Descrição |
|---|---|
| `GET /api/status` | estado ao vivo + histórico de população 48 h |
| `GET /api/leaderboard?by=kills\|kd\|headshots\|distance\|playtime&period=wipe\|all` | leaderboards |
| `GET /api/killfeed?limit=50` | últimas kills |
| `GET /api/player?id=<steamid64>` | perfil completo |
| `GET /api/search?q=nome` | pesquisa de jogadores |
| `GET /api/staff` | equipa + estatísticas de bans |
| `GET /api/bans` | lista pública de bans |
| `POST /api/applications` | submeter candidatura (rate-limited por IP) |

Endpoints do plugin (`/api/ingest`, `/api/heartbeat`, `/api/wipe`) exigem o
header `X-API-Key`. Gestão de candidaturas (`/api/admin/applications`) exige
`X-Admin-Key`.

## Produção (recomendado)

- Corre atrás de **Cloudflare Tunnel** (grátis) — esconde o IP de casa, TLS e
  WAF incluídos, sem port forwarding. Ver `docs/HOSPEDAGEM-EM-CASA.md`.
- Backup: copia `data/stats.db` regularmente (é a base de dados inteira).
- systemd (Linux): `ExecStart=/usr/bin/node /caminho/server/app.js` + `Restart=always`.
