# Guia de deployment — site no teu PC de casa

Passo a passo para pores o site ao ar no teu computador, acessível aos teus
colegas de qualquer lado, sem abrir portas no router. Escrito para Windows
(o mais provável no teu PC); a secção Linux está no fim.

## 0. O que vais precisar

- **Node.js 22 ou superior** — https://nodejs.org (instalador Windows, "LTS" serve se for 22+; confirma com `node --version`)
- **Uma conta Cloudflare gratuita** — https://dash.cloudflare.com/sign-up
- **Um domínio** (ex.: rustworthy.gg / .pt / .com — ~€10/ano na Cloudflare Registrar, Namecheap ou Porkbun). Sem domínio também dá para testar com um URL temporário (passo 4-B).

## 1. Obter o código

```powershell
# numa pasta à tua escolha (ex.: C:\rustworthy)
git clone <URL-do-teu-repositório> rustworthy
cd rustworthy\rust-server-website
```

(Sem git: descarrega o ZIP do repositório no GitHub e extrai.)

## 2. Primeiro arranque e configuração

```powershell
node server\app.js --seed     # arranca com dados de demonstração
```

Abre http://localhost:8080 — deves ver o site. Pára com Ctrl+C.

No primeiro arranque foi criado `server\config.json` com chaves novas. Edita-o:

```json
{
  "siteUrl": "https://stats.oteudominio.com",   // o URL público (passo 4)
  "serverName": "Rustworthy | Full Vanilla | EU",
  "serverIp": "connect IP-DO-SERVIDOR-DE-JOGO:28015",
  "discord": "https://discord.gg/OTEULINK",
  "nextWipe": "2026-09-03T18:00:00Z",
  "gemsPerHour": 1000,
  "anomalyKillsPerHour": 15,
  "discordWebhooks": { ... }                    // opcional, ver README
}
```

- **apiKey**: vai para a config do plugin StatsHub no servidor de jogo. Nunca a publiques.
- **adminKey**: a tua "password" da página /admin. Nunca a partilhes.
- **trustProxy**: põe `true` quando o site correr atrás do Cloudflare Tunnel
  (passo 4) — assim o rate-limit usa o IP real do jogador, não o do túnel. Em
  testes locais diretos, deixa `false`.
- **mapImage** (opcional): URL de uma imagem do mapa da wipe (ex.: exportada do
  RustMaps) para o heatmap de mortes a sobrepor. Vazio = grelha estilizada.
- Para produção real, apaga a pasta `data\` depois de testares (limpa os dados de demonstração) e arranca sem `--seed`.

## 3. Arrancar automaticamente com o Windows

Usa o script incluído:

```powershell
deploy\start.bat              # arranque manual (janela visível)
```

Para arrancar sozinho ao ligar o PC (sem janela):

1. Abre o **Agendador de Tarefas** (Task Scheduler) → "Criar Tarefa…"
2. Geral: nome `Rustworthy Site`, marca "Executar quer o utilizador tenha sessão iniciada ou não" e "Executar com privilégios máximos"
3. Acionadores: Novo → "Ao arrancar o computador"
4. Ações: Novo → Programa: `wscript.exe` · Argumentos: `"C:\rustworthy\rust-server-website\deploy\start-hidden.vbs"`
5. Definições: desmarca "Parar a tarefa se for executada mais de…"

(Alternativa mais robusta: [NSSM](https://nssm.cc) instala o Node como serviço do Windows: `nssm install Rustworthy "C:\Program Files\nodejs\node.exe" "C:\rustworthy\rust-server-website\server\app.js"`.)

## 4. Expor o site ao mundo — Cloudflare Tunnel (grátis)

O Tunnel liga o teu PC à Cloudflare por dentro para fora: **sem abrir portas no
router, sem expor o teu IP de casa, com HTTPS automático**. Funciona mesmo com
CGNAT.

Instala o cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (Windows 64-bit → `cloudflared.exe`, põe-o em `C:\cloudflared\`).

### 4-A. Com domínio (produção)

Primeiro adiciona o teu domínio à Cloudflare (dashboard → Add site → segue as
instruções para apontar os nameservers). Depois:

```powershell
cd C:\cloudflared
.\cloudflared.exe tunnel login                      # abre o browser, autoriza
.\cloudflared.exe tunnel create rustworthy
.\cloudflared.exe tunnel route dns rustworthy stats.oteudominio.com
```

Cria `C:\cloudflared\config.yml` (há um exemplo em `deploy\cloudflared-config.yml`):

```yaml
tunnel: rustworthy
credentials-file: C:\Users\<TEU-USER>\.cloudflared\<ID-DO-TUNNEL>.json
ingress:
  - hostname: stats.oteudominio.com
    service: http://localhost:8080
  - service: http_status:404
```

Testa: `.\cloudflared.exe tunnel run rustworthy` → abre https://stats.oteudominio.com 🎉

Instala como serviço (arranca sozinho para sempre):

```powershell
.\cloudflared.exe service install
```

Por fim, atualiza o `siteUrl` no `server\config.json` para o URL público e
reinicia o site — isto é essencial para o login Steam e para os embeds do
Discord funcionarem.

### 4-B. Sem domínio (teste rápido com colegas)

```powershell
.\cloudflared.exe tunnel --url http://localhost:8080
```

Dá-te um URL tipo `https://qualquer-coisa.trycloudflare.com` que podes mandar
aos teus colegas já. Atenção: o URL muda a cada execução e o login Steam só
funciona se puseres esse URL no `siteUrl` (e reiniciares o site).

## 5. Backups

A base de dados inteira é o ficheiro `data\stats.db`. O script incluído copia-a
com data no nome e mantém os últimos 14 dias:

```powershell
deploy\backup.bat             # corre à mão, ou agenda no Task Scheduler (diário, 06:00)
```

## 6. Ligar o servidor de jogo (quando o tiveres)

1. No host do servidor de Rust, instala o Oxide/uMod e copia `plugin\StatsHub.cs` para `oxide/plugins/`.
2. Edita `oxide/config/StatsHub.json`: `Site URL` = o teu URL público, `API key` = a `apiKey` do `server\config.json`.
3. `oxide.reload StatsHub` — em ~1 minuto o heartbeat aparece no site (bolinha verde na home).

O plugin também **aplica no jogo os bans registados no console do site** (com
SteamID): faz poll a cada minuto e corre `banid`. Desativável na config do
plugin ("Apply site bans in-game").

## 6-B. Servidor de TESTE no teu próprio PC

Para testares tudo interligado antes de alugar um host (o servidor de jogo e o
site podem correr no mesmo PC):

```powershell
# 1. SteamCMD
mkdir C:\steamcmd; cd C:\steamcmd
Invoke-WebRequest https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip -OutFile steamcmd.zip
Expand-Archive steamcmd.zip -DestinationPath .

# 2. Rust Dedicated Server (~10 GB — demora)
.\steamcmd.exe +force_install_dir C:\rustserver +login anonymous +app_update 258550 validate +quit

# 3. Oxide/uMod: descarrega https://umod.org/games/rust (Oxide.Rust.zip)
#    e extrai POR CIMA de C:\rustserver (substitui os ficheiros)

# 4. Plugin: copia plugin\StatsHub.cs para C:\rustserver\oxide\plugins\
```

Cria `C:\rustserver\start-test.bat`:

```bat
@echo off
cd /d C:\rustserver
RustDedicated.exe -batchmode -nographics ^
  +server.hostname "Rustworthy TEST" +server.port 28015 +server.maxplayers 8 ^
  +server.worldsize 2000 +server.seed 12345 +server.identity test ^
  +rcon.port 28016 +rcon.password teste123 +rcon.web 1
```

Mapa 2000 arranca em poucos minutos. Depois do 1º arranque, edita
`C:\rustserver\oxide\config\StatsHub.json`:
`"Site URL": "http://localhost:8080"` (mesmo PC = localhost chega!) e
`"API key"` = a apiKey do site. No jogo: F1 → `client.connect 127.0.0.1:28015`.

## 6-C. Teste de interligação (a prova real)

Com site + tunnel + Discord + servidor de teste a correr:

- [ ] **Heartbeat**: bolinha verde + jogadores online na home em ~1 min
- [ ] **Login Steam**: entra no site pelo URL público com a tua conta
- [ ] **Kill**: mata alguém (ou um amigo) → aparece no killfeed do site
- [ ] **Playtime/gemas**: após ~5 min in-game, o saldo 💎 sobe em /conta
- [ ] **F7 report**: reporta alguém no jogo → aparece em Reports no console
- [ ] **Loja**: resgata um item com comando → entregue no jogo em ~1 min
- [ ] **Ban bridge**: regista um ban no console COM SteamID → `banid` corre
      no servidor de jogo em ~1 min (vê a consola do jogo)
- [ ] **News → Discord**: publica uma novidade → embed no #announcements
- [ ] **Ban → Discord**: o ban de teste apareceu no #ban-log
- [ ] **Wipe settings**: muda a data no console (Map vote) → countdown da home muda

## 7. Checklist final antes de divulgar

- [ ] `data\` apagada e site arrancado SEM `--seed` (dados de demonstração fora)
- [ ] `siteUrl` = URL público real; login Steam testado (entra com a tua conta)
- [ ] `devLogin` ausente ou `false` no config.json
- [ ] /admin abre e aceita a adminKey; candidatura de teste enviada e visível
- [ ] Webhooks do Discord configurados (killfeed, bans, staff, announcements)
- [ ] Backup agendado
- [ ] Link do site no Discord e na descrição do servidor de jogo

---

## Linux (se o PC extra correr Linux)

```bash
git clone <URL-do-repo> ~/rustworthy && cd ~/rustworthy/rust-server-website
node server/app.js --seed          # teste
sudo cp deploy/rustworthy.service /etc/systemd/system/   # edita o caminho/user primeiro!
sudo systemctl daemon-reload && sudo systemctl enable --now rustworthy
# cloudflared: mesmo fluxo do Windows (pacote .deb/.rpm disponível)
# backup diário:
crontab -e   # adiciona:  0 6 * * *  ~/rustworthy/rust-server-website/deploy/backup.sh
```

## Resolução de problemas

| Sintoma | Causa provável |
|---|---|
| Site abre local mas não pelo URL público | cloudflared não está a correr / config.yml com hostname errado |
| Login Steam volta com erro | `siteUrl` no config.json não corresponde ao URL real |
| Embeds do Discord sem imagem | `siteUrl` errado, ou o Discord tem o link em cache (muda um parâmetro no URL para testar) |
| Plugin não entrega recompensas | apiKey diferente entre site e plugin; vê a consola do servidor de jogo |
| “no space left on device” | disco cheio — limpa backups antigos em `deploy\backups\` |
