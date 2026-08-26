# Discord do Rustworthy — montagem automática

O script `discord-setup.js` monta o servidor Discord inteiro em ~1 minuto:
cargos, categorias, canais com permissões, mensagens de regras/boas-vindas,
**webhooks ligados ao site** e convite permanente. É seguro correr mais de
uma vez (reaproveita o que já existir).

## Passo 1 — criar o bot (5 min, só uma vez)

1. Vai a https://discord.com/developers/applications → **New Application**
   → nome: `Rustworthy Ops` → Create
2. Menu **Bot** → **Reset Token** → copia o token (⚠️ nunca o partilhes;
   é como uma password)
3. Menu **OAuth2 → URL Generator**:
   - Scopes: ✅ `bot`
   - Bot Permissions: ✅ `Administrator`
   - Copia o URL gerado, abre-o no browser, escolhe o teu servidor → Autorizar

## Passo 2 — o ID do servidor

Discord → Definições de Utilizador → Avançado → ativa **Developer Mode**.
Depois: clique direito no nome do servidor → **Copy Server ID**.

## Passo 3 — correr o script (no PC)

```powershell
cd C:\Users\amaur\Desktop\RustWebSite
# primeiro em modo de ensaio, para veres o plano:
node rust-server-website\deploy\discord-setup.js --token O_TEU_TOKEN --guild O_ID --dry-run
# depois a sério, já a escrever os webhooks no config do site:
node rust-server-website\deploy\discord-setup.js --token O_TEU_TOKEN --guild O_ID --write-config
# reinicia o site para os webhooks ativarem:
taskkill /F /IM node.exe
node rust-server-website\server\app.js --seed
```

Com `--write-config`, os webhooks (killfeed, bans, staff-alerts,
announcements) e o convite ficam logo no `server/config.json` — o killfeed
do jogo, os bans públicos, os alertas da watchlist e o resumo de wipe passam
a cair no Discord automaticamente.

## O que fica montado

| Categoria | Canais |
|---|---|
| 📌 INFO | #welcome · #rules · #announcements 🤖 · #server-info |
| 🛰️ LIVE FROM THE SERVER | #killfeed 🤖 · #ban-log 🤖 |
| 💬 COMMUNITY | #general · #clips-and-media · #looking-for-group · #suggestions · #supporter-lounge 💎 |
| 🎫 SUPPORT | #open-a-ticket |
| 🔒 STAFF (privado) | #staff-chat · #staff-alerts 🤖 · #evidence-vault · #mod-logs |
| 🔊 VOICE | General · Squad 1/2 · Staff VC 🔒 · AFK |

Cargos: ⚖️ Admin (laranja) · 🛡️ Moderator (âmbar) · 💎 Supporter (azul) ·
✅ Survivor (verde). 🤖 = alimentado automaticamente pelo site.

## Passos manuais finais (a API não os permite)

1. **Community**: Server Settings → Enable Community (desbloqueia o canal de
   regras oficial, onboarding e relatórios)
2. **Ícone + banner**: usa `icon-rustworthy.png` e `banner-rustworthy.png`
3. **Tickets**: adiciona o bot gratuito **Ticket Tool** (https://tickettool.xyz)
   → painel no #open-a-ticket, tickets abrem privados com a staff. (Um sistema
   de tickets precisa de um bot sempre ligado — o Ticket Tool é o standard
   gratuito da comunidade Rust; podemos construir o nosso mais tarde se quiseres.)
4. Arrasta o cargo do **bot** para o topo da hierarquia de cargos
5. Dá-te a ti o cargo ⚖️ Admin, e aos futuros mods o 🛡️ Moderator

## Segurança

- O token do bot dá controlo total do teu Discord — nunca o coles em chats,
  screenshots ou no site. Se escapar: Developers → Bot → Reset Token.
- Podes remover o bot depois do setup (Server Settings → Members → Kick);
  os webhooks continuam a funcionar sem ele.
