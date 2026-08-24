# LusoRust — Site de estatísticas para servidor de Rust

Site completo para um servidor de Rust (o jogo da Facepunch) com estatísticas ao
vivo, killfeed, leaderboards por wipe (com arquivo navegável), perfis de jogador,
**login Steam**, **moeda por hora jogada (gemas) com loja e entrega automática
in-game**, **votação de mapa com peso ganho por horas**, **Overwatch comunitário**
(revisão de clips de suspeitos), **apelos de ban**, novidades/changelog, secção
de staff com transparência de bans, e candidaturas a moderador.

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
│   ├── app.js         servidor HTTP + estáticos + rotas de login Steam
│   ├── api.js         rotas da API
│   ├── auth.js        login Steam (OpenID 2.0) e sessões em cookie assinado
│   ├── db.js          esquema e consultas SQLite
│   ├── seed.js        dados de demonstração
│   ├── store-items.json  itens da loja de gemas (edita e reinicia)
│   └── config.json    criado no 1º arranque (NÃO comitar)
├── public/            frontend (HTML/CSS/JS puro)
│   ├── index.html     home: status ao vivo, countdown de wipe, população, killfeed
│   ├── stats.html     leaderboards + arquivo de wipes antigas
│   ├── player.html    perfil público por SteamID
│   ├── conta.html     a minha conta: gemas, resgates, apelos (login Steam)
│   ├── loja.html      loja de gemas (moeda ganha por hora jogada)
│   ├── mapa.html      votação do próximo mapa (peso por horas jogadas)
│   ├── overwatch.html Overwatch comunitário: revisão de clips de suspeitos
│   ├── apelo.html     apelar um ban
│   ├── novidades.html changelog do servidor
│   ├── staff.html     equipa, Código do Moderador, lista pública de bans
│   ├── candidatura.html  formulário de candidatura a moderador
│   ├── regras.html    regras do servidor
│   └── admin.html     painel da staff: candidaturas, apelos, entregas,
│                      overwatch, votação de mapa, novidades (adminKey)
├── plugin/
│   └── StatsHub.cs    plugin Oxide/uMod: stats para o site + entrega de recompensas
└── docs/
    ├── ANALISE-CONCORRENCIA.md   análise dos sites das grandes redes de Rust
    ├── HOSPEDAGEM-EM-CASA.md     dá para hospedar em casa? (spoiler: o site sim)
    ├── SISTEMA-DE-GEMAS.md       como funciona a moeda + análise de performance
    └── ROADMAP.md                opiniões e próximos passos por fases
```

## Login Steam

O site usa o OpenID oficial da Steam (sem dependências, sem API key). Para
funcionar em produção define `siteUrl` no `config.json` com o URL público
(ex.: `https://stats.oteudominio.pt`). O utilizador é redirecionado para a
Steam, autentica lá, e o site só recebe o SteamID64 — nunca credenciais.
A sessão fica num cookie HMAC-assinado (30 dias). Para testar localmente sem
Steam: `"devLogin": true` e visita `/auth/dev?id=<steamid64>`.

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
| `GET /api/leaderboard?by=…&period=all` ou `&wipeId=N` | leaderboards (wipe atual, arquivo, ou sempre) |
| `GET /api/killfeed?limit=50` | últimas kills |
| `GET /api/player?id=<steamid64>` | perfil completo |
| `GET /api/search?q=nome` | pesquisa de jogadores |
| `GET /api/staff` / `GET /api/bans` | equipa + transparência de bans |
| `GET /api/wipes` | lista de wipes (para o arquivo) |
| `GET /api/store` / `GET /api/posts` / `GET /api/owcases` / `GET /api/mapvote` | loja, novidades, overwatch, votação |
| `GET /api/me` | sessão atual: gemas, resgates, apelos, peso de voto |
| `POST /api/applications` | submeter candidatura (rate-limited por IP) |
| `POST /api/redeem` · `/api/mapvote/vote` · `/api/owcases/vote` · `/api/appeals` | ações autenticadas (sessão Steam) |

Endpoints do plugin (`/api/ingest`, `/api/heartbeat`, `/api/wipe`,
`/api/plugin/redemptions[...]`) exigem o header `X-API-Key`. O painel
`/api/admin/*` (candidaturas, apelos, entregas, overwatch, mapa, novidades)
exige `X-Admin-Key`.

## Produção (recomendado)

- Corre atrás de **Cloudflare Tunnel** (grátis) — esconde o IP de casa, TLS e
  WAF incluídos, sem port forwarding. Ver `docs/HOSPEDAGEM-EM-CASA.md`.
- Backup: copia `data/stats.db` regularmente (é a base de dados inteira).
- systemd (Linux): `ExecStart=/usr/bin/node /caminho/server/app.js` + `Restart=always`.
