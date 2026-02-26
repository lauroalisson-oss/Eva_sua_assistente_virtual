# Configuracao da Evolution API (WhatsApp)

Guia passo a passo para conectar a EVA ao WhatsApp usando a Evolution API v2.

---

## Pre-requisitos

- Docker Desktop instalado e rodando
- Projeto EVA com `npm install` ja executado
- Arquivo `.env` configurado (copiar de `.env.example`)

---

## Passo 1 — Subir todos os servicos (incluindo Evolution API)

O `docker-compose.yml` do projeto ja inclui a Evolution API. Basta rodar:

```bash
cd eva-assistant-projeto-completo
docker compose up -d
```

Verifique se todos os containers subiram:

```bash
docker compose ps
```

Saida esperada:

```
NAME              STATUS          PORTS
eva-postgres      Up (healthy)    0.0.0.0:5432->5432/tcp
eva-redis         Up (healthy)    0.0.0.0:6379->6379/tcp
eva-evolution     Up (healthy)    0.0.0.0:8080->8080/tcp
```

> Se algum container nao subir, verifique os logs com `docker compose logs <nome-do-servico>`.

---

## Passo 2 — Verificar que a Evolution API esta rodando

Acesse no navegador ou via curl:

```bash
curl http://localhost:8080/
```

Resposta esperada (JSON com informacao da versao):

```json
{
  "status": 200,
  "message": "Welcome to the Evolution API",
  "version": "2.x.x"
}
```

---

## Passo 3 — Criar a instancia "eva-bot"

A Evolution API trabalha com "instancias" — cada instancia e uma sessao do WhatsApp.

### 3.1 — Criar instancia via API

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: sua-chave-evolution" \
  -d '{
    "instanceName": "eva-bot",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true,
    "rejectCall": true,
    "msgCall": "Nao posso atender ligacoes. Envie uma mensagem de texto ou audio!",
    "webhook": {
      "url": "http://host.docker.internal:3000/webhook/whatsapp",
      "byEvents": false,
      "base64": false,
      "events": [
        "MESSAGES_UPSERT"
      ]
    }
  }'
```

> **Importante sobre a URL do webhook:**
> - No **Windows/Mac** com Docker Desktop: use `http://host.docker.internal:3000/webhook/whatsapp`
> - No **Linux**: use `http://172.17.0.1:3000/webhook/whatsapp` (IP do host Docker)
> - Se o EVA estiver no mesmo Docker Compose: use `http://host.docker.internal:3000/webhook/whatsapp`

### 3.2 — Sobre a API Key

A API key e definida no `docker-compose.yml` pela variavel `AUTHENTICATION_API_KEY`. O valor padrao no nosso projeto e:

```
sua-chave-evolution
```

**Para producao**, troque essa chave no `docker-compose.yml` E no seu `.env`:

```env
# .env
EVOLUTION_API_KEY=minha-chave-segura-aqui
```

```yaml
# docker-compose.yml
AUTHENTICATION_API_KEY: minha-chave-segura-aqui
```

---

## Passo 4 — Conectar via QR Code

### 4.1 — Obter o QR Code

```bash
curl http://localhost:8080/instance/connect/eva-bot \
  -H "apikey: sua-chave-evolution"
```

A resposta contem o QR Code em formato base64. Para visualizar:

**Opcao A — Via navegador (mais facil):**

Acesse diretamente:

```
http://localhost:8080/instance/connect/eva-bot
```

Ou use o painel da Evolution API (se habilitado):

```
http://localhost:8080/manager
```

**Opcao B — Via terminal (gerar imagem):**

```bash
curl -s http://localhost:8080/instance/connect/eva-bot \
  -H "apikey: sua-chave-evolution" | \
  python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('qr.png','wb').write(base64.b64decode(d.get('base64','').split(',')[-1]))"
```

Depois abra o arquivo `qr.png` gerado.

### 4.2 — Escanear com WhatsApp

1. Abra o **WhatsApp** no celular
2. Va em **Configuracoes > Aparelhos conectados > Conectar um aparelho**
3. Escaneie o QR Code exibido
4. Aguarde a conexao ser estabelecida (10-30 segundos)

### 4.3 — Verificar conexao

```bash
curl http://localhost:8080/instance/connectionState/eva-bot \
  -H "apikey: sua-chave-evolution"
```

Resposta esperada:

```json
{
  "instance": {
    "instanceName": "eva-bot",
    "state": "open"
  }
}
```

> `"state": "open"` = conectado e funcionando

---

## Passo 5 — Configurar o Webhook

O webhook ja foi configurado no Passo 3 ao criar a instancia. Mas se precisar atualizar:

```bash
curl -X PUT http://localhost:8080/webhook/set/eva-bot \
  -H "Content-Type: application/json" \
  -H "apikey: sua-chave-evolution" \
  -d '{
    "url": "http://host.docker.internal:3000/webhook/whatsapp",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT"
    ]
  }'
```

### Eventos importantes

| Evento | Descricao | Usado pela EVA |
|---|---|---|
| `MESSAGES_UPSERT` | Nova mensagem recebida/enviada | Sim (principal) |
| `MESSAGES_UPDATE` | Mensagem atualizada (status) | Nao |
| `CONNECTION_UPDATE` | Status da conexao mudou | Opcional |
| `QRCODE_UPDATED` | QR Code atualizado | Opcional |

A EVA so precisa do `MESSAGES_UPSERT` — e o evento que aciona o processamento.

---

## Passo 6 — Testar o fluxo completo

### 6.1 — Iniciar o servidor EVA

Em um terminal:

```bash
cd eva-assistant-projeto-completo
npm run dev
```

Voce deve ver:

```
╔══════════════════════════════════════════╗
║   EVA — Executive Virtual Assistant      ║
║   Servidor rodando na porta 3000         ║
║   Ambiente: development                  ║
╚══════════════════════════════════════════╝
```

### 6.2 — Enviar mensagem de teste

De **outro celular** (ou do proprio, se estiver usando um numero dedicado), envie para o numero conectado:

```
Oi
```

### 6.3 — Verificar nos logs do servidor

No terminal onde o `npm run dev` esta rodando, voce deve ver:

```
📩 Mensagem recebida { phone: "55759999...", senderName: "Fulano", isAudio: false }
🧠 Classificacao: SAUDACAO (rules, 95%)
📤 Mensagem enviada para 9999
```

E no WhatsApp, a EVA responde com a saudacao:

```
Ola, Fulano!
Sou a *EVA*, sua assistente virtual. Como posso te ajudar?
...
```

### 6.4 — Testar outros comandos

Envie mensagens como:

```
Marca reuniao amanha as 14h
Gastei 150 de combustivel
O que tenho pra hoje?
Como ta meu financeiro?
Anota: ligar pro contador segunda
Ajuda
```

Cada uma deve acionar o modulo correto e retornar uma resposta formatada.

---

## Passo 7 — Enviar mensagem via API (teste sem celular)

Para testar o envio sem precisar de outro celular:

```bash
curl -X POST http://localhost:8080/message/sendText/eva-bot \
  -H "Content-Type: application/json" \
  -H "apikey: sua-chave-evolution" \
  -d '{
    "number": "5575999999999",
    "text": "Teste de envio via API"
  }'
```

> Substitua `5575999999999` pelo numero de destino (com DDI+DDD, sem + ou espacos).

---

## Troubleshooting

### A Evolution API nao sobe

```bash
docker compose logs evolution
```

Causas comuns:
- Porta 8080 ja em uso → mude no `docker-compose.yml`
- Falta de memoria → Evolution API precisa de ~512MB RAM

### QR Code expira rapido

O QR Code expira em ~60 segundos. Se expirar, faca novamente:

```bash
curl http://localhost:8080/instance/connect/eva-bot \
  -H "apikey: sua-chave-evolution"
```

### Webhook nao chega no servidor

1. Verifique se o EVA esta rodando: `curl http://localhost:3000/health`
2. Verifique a URL do webhook: `http://host.docker.internal:3000/webhook/whatsapp`
3. No Linux, troque `host.docker.internal` por `172.17.0.1`
4. Verifique se o numero esta em `AUTHORIZED_PHONES` no `.env`

### Mensagem de numero nao autorizado

No log aparece: `Mensagem de numero nao autorizado`

Adicione o numero ao `.env`:

```env
AUTHORIZED_PHONES=5575999999999,5571988887777
```

> Use DDI (55) + DDD + numero, sem espacos ou tracos.

### Sessao desconectada (WhatsApp deslogou)

```bash
# Verificar estado
curl http://localhost:8080/instance/connectionState/eva-bot \
  -H "apikey: sua-chave-evolution"

# Se state != "open", reconectar
curl http://localhost:8080/instance/connect/eva-bot \
  -H "apikey: sua-chave-evolution"
```

### Reiniciar instancia do zero

Se nada funcionar, delete e recrie:

```bash
# Deletar
curl -X DELETE http://localhost:8080/instance/delete/eva-bot \
  -H "apikey: sua-chave-evolution"

# Recriar (repetir Passo 3)
```

---

## Resumo das portas

| Servico | Porta | URL |
|---|---|---|
| EVA (Fastify) | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | postgresql://eva:eva_secret@localhost:5432/eva_db |
| Redis | 6379 | redis://localhost:6379 |
| Evolution API | 8080 | http://localhost:8080 |

---

## Variaveis do .env relacionadas

```env
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=sua-chave-evolution
EVOLUTION_INSTANCE=eva-bot
AUTHORIZED_PHONES=5575999999999
```

Certifique-se de que `EVOLUTION_API_KEY` no `.env` e a mesma que `AUTHENTICATION_API_KEY` no `docker-compose.yml`.
