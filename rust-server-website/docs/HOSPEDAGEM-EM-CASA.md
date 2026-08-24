# Hospedar em casa? Análise honesta

> A pergunta: "é possível alocar tudo em casa, num computador extra?"
> Resposta curta: **o site sim, e é até a melhor opção. O servidor de jogo não —
> e não é por falta de capacidade técnica.**

## O que o teu PC extra consegue fazer

Um PC razoável (ex.: Ryzen 5 3600/5600, 32 GB RAM, NVMe) **aguenta tecnicamente**
um servidor de Rust de 50–100 jogadores:

| Recurso | Necessário (50–100 pop) | PC extra típico |
|---|---|---|
| CPU | 4 cores, 3.5 GHz+, single-thread forte | ✅ suficiente |
| RAM | 16–32 GB (mapa 3500–4000; cresce ao longo da wipe) | ✅ com 32 GB |
| Disco | 20–50 GB **NVMe/SSD obrigatório** (autosaves em HDD causam stutters) | ✅ |
| Upload | ~0,2–2 Mbps/jogador; fibra PT (200–400 Mbps up) chega para 100 pop | ✅ |

Rust é **single-thread heavy**: o que importa é a velocidade de um core, não o
número de cores. 200+ jogadores já exigem CPUs topo de gama atuais (7800X3D/9950X)
— isso já não é "PC extra".

## Porque é que o servidor de JOGO não deve ficar em casa

### 1. DDoS — o problema fatal
- Ataques de retaliação são **rotina** no Rust (raidaste alguém → ele compra um
  booter). 2025 bateu recordes: a Cloudflare mitigou 47 M de ataques (+121 %).
- **O IP do servidor de jogo é público por design** — o server browser do Steam
  publica o teu IP:porta a todos os clientes. Não há como esconder.
- O tráfego do jogo é **UDP** — a proteção gratuita da Cloudflare (HTTP) não
  serve; o Cloudflare Spectrum para UDP custom é plano Enterprise (~$5 000/mês).
  Túneis GRE/WireGuard por VPS protegido existem mas são frágeis (o OVH limita
  todo o UDP durante um ataque, deitando fora jogadores legítimos).
- Um ataque modesto (1–10 Gbps) satura a fibra doméstica instantaneamente:
  **a tua casa inteira fica sem internet**, e o ISP pode fazer null-route ao teu
  IP (ficas offline até o ataque parar). Reincidência pode violar os termos do
  contrato residencial.

### 2. A economia não compensa
| Opção | Custo/mês | DDoS | Notas |
|---|---|---|---|
| **PC em casa 24/7** | €13–24 só de eletricidade (80–150 W × €0,218/kWh) + IP fixo €2–5 | ❌ nenhuma | + desgaste do hardware |
| **Host de jogo gerido** (PebbleHost, GTX…) | €10–40 (50–150 slots) | ✅ incluída, game-aware | painel com wipe scheduler e updates |
| **Hetzner AX42** (Ryzen 8700GE, 64 GB) | €46 (+€39 setup) | ⚠️ básica | corre jogo + site + BD com folga |
| **OVH Game** | $179–230 | ✅✅ a melhor (scrubbing para jogos) | caro; para quando houver população |

A eletricidade do PC em casa **custa praticamente o mesmo** que um host gerido
com proteção DDoS incluída. Hospedar em casa poupa ~€0 e assume todo o risco.

### 3. Chatices operacionais em casa
- Port forwarding (28015/UDP jogo, queryport UDP, 28016/TCP RCON, 28082 Rust+),
  desativar "proteções" do router que estragam UDP.
- **CGNAT estraga tudo** — precisas de IPv4 público real (pedir/pagar ao ISP).
- IP dinâmico: o server browser e os favoritos são por IP — quando o IP roda,
  perdes toda a gente. (Mitigável com `server.favoritesEndpoint` + DDNS, mas
  uma mudança de IP a meio da sessão deita todos abaixo na mesma.)
- Updates forçados mensais (primeira quinta-feira), wipe scripts, uptime = tu.

## A arquitetura recomendada

```
┌─────────────────────┐         ┌──────────────────────────┐
│  HOST DE JOGO       │  POST   │  O TEU PC EXTRA (casa)   │
│  (PebbleHost/GTX,   │ ───────►│  site + API + SQLite     │
│   €15–35/mês)       │ eventos │  atrás de Cloudflare     │
│  Rust + Oxide +     │  HTTPS  │  Tunnel (GRÁTIS):        │
│  plugin StatsHub.cs │         │  IP escondido, TLS, WAF, │
└─────────────────────┘         │  sem port forwarding,    │
                                │  funciona mesmo c/ CGNAT │
                                └──────────────────────────┘
```

1. **Servidor de jogo** → host gerido (€15–35/mês) para começar. Quando a
   população justificar, migrar para Hetzner AX42 (€46, aceitando o risco DDoS)
   ou OVH Game (proteção máxima).
2. **Site de estatísticas** → **o teu PC extra em casa, via Cloudflare Tunnel
   (grátis)**. HTTP é exatamente o que a Cloudflare protege de graça: IP oculto,
   certificado TLS, WAF, zero port forwarding. É para isto que o PC extra é
   perfeito — e este projeto foi desenhado para isso (zero dependências, corre
   com `node server/app.js`).
3. **Nunca juntar os dois em casa**: o servidor de jogo publica o teu IP
   doméstico no server browser, o que anula a proteção do site — atacam a porta
   do jogo e cai tudo, casa incluída.

## Setup do site em casa (passo a passo)

```bash
# no PC extra (Linux ou Windows com Node 22+)
node server/app.js --seed        # arranca em http://localhost:8080

# Cloudflare Tunnel (conta gratuita + domínio ~€10/ano)
cloudflared tunnel login
cloudflared tunnel create lusorust
cloudflared tunnel route dns lusorust stats.oteudominio.pt
cloudflared tunnel run --url http://localhost:8080 lusorust
```

Depois configura o plugin StatsHub no servidor de jogo com
`"Url do site": "https://stats.oteudominio.pt"` e a chave de API.

## Wipes — o que precisas de saber

- **Force wipe**: primeira quinta-feira de cada mês (~19:00 UTC), obrigatório
  para todos os servidores (update mensal muda o protocolo).
- **Wipe de mapa** (opcional entre force wipes): as cadências mais populares são
  semanal e quinzenal. **Consistência de horário é fator nº 1 de retenção.**
- **Wipe de BPs**: convenção é no force wipe; é escolha tua.
- O plugin deteta o save novo (`OnNewSave`) e abre a wipe nova no site
  automaticamente — leaderboards fazem reset sozinhos.

## Fontes

Facepunch wiki (Creating a server, DNS records) · requisitos: HostPanel,
Supercraft, ServerMania, uMod/Overclock.net threads · DDoS: Cloudflare (Spectrum,
relatório 2025), X4B, LowEndTalk (túneis GRE), WebHostingTalk (null-routing) ·
preços: PebbleHost, GTXGaming, Hetzner AX42, OVH Game, GlobalPetrolPrices
(eletricidade PT €0,218/kWh dez 2025) · wipes: XGamingServer, GameServerKings,
MineStrator.
