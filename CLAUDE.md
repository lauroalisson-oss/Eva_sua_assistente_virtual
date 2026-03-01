# EVA — Executive Virtual Assistant

Assistente virtual pessoal via WhatsApp, construída com TypeScript, Fastify, Prisma e Claude AI.

## Estrutura do projeto

O código-fonte fica em `eva-assistant-projeto-completo/`. Todo comando deve ser executado dentro desse diretório.

```
eva-assistant-projeto-completo/
├── src/                     # Código TypeScript
│   ├── index.ts             # Entry point (Fastify server, porta 3000)
│   ├── config/              # env.ts (Zod), database.ts (Prisma), queue.ts (BullMQ)
│   ├── classifier/          # Classificador híbrido (regras + Claude AI)
│   │   ├── hybrid-classifier.ts   # Orquestra rule-engine → ai-classifier
│   │   ├── rule-engine.ts         # Regex patterns, custo zero, <10ms
│   │   ├── ai-classifier.ts       # Claude Haiku fallback
│   │   └── patterns/              # 4 arquivos de padrões regex por módulo
│   ├── services/            # WhatsApp client, message router, audio transcription
│   ├── modules/             # Lógica de negócio (agenda/, finance/, notes/, reports/)
│   ├── middleware/          # Rate limiter, tenant resolver, webhook security, audit
│   ├── webhooks/            # Controllers (whatsapp.controller, admin.controller)
│   └── jobs/                # Jobs agendados (daily-summary)
├── prisma/
│   ├── schema.prisma        # 7 modelos: Tenant, Event, Transaction, Budget, Note, AuditLog, MessageLog
│   └── migrations/          # SQL migrations (0001_init)
├── prompts/                 # Prompt templates para Claude AI
├── tests/                   # Vitest: classifier.test.ts, etapa3-4.test.ts (122 testes)
├── scripts/                 # Setup e teste automatizados
├── docker-compose.yml       # PostgreSQL 16, Redis 7, Evolution API v2.1.1
├── Dockerfile               # Multi-stage build para produção
└── .env.example             # Template de configuração
```

## Setup rápido (6 passos)

Para rodar a EVA do zero, execute dentro de `eva-assistant-projeto-completo/`:

```bash
cd eva-assistant-projeto-completo

# Passo 1 — Criar .env a partir do template
cp .env.example .env
# Editar .env se tiver chaves reais (ANTHROPIC_API_KEY, etc.)

# Passo 2 — Subir infraestrutura
docker compose up -d

# Passo 3 — Aguardar Postgres estar pronto (~10s)
# Verificar com: docker compose exec -T postgres pg_isready -U eva -d eva_db

# Passo 4 — Instalar dependências
npm install

# Passo 5 — Configurar banco de dados
npx prisma generate
npx prisma migrate deploy

# Passo 6 — Rodar testes
npm run test
```

Ou rode tudo de uma vez com: `bash scripts/setup.sh`

Variáveis de ambiente podem ser passadas inline:
```bash
ANTHROPIC_API_KEY=sk-ant-xxx bash scripts/setup.sh
```

## Comandos principais

Todos dentro de `eva-assistant-projeto-completo/`:

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Inicia servidor de desenvolvimento (hot reload, porta 3000) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm run start` | Roda o build compilado |
| `npm run test` | Roda todos os 122 testes com Vitest |
| `npm run test:watch` | Testes em modo watch |
| `npm run lint` | ESLint no código-fonte |
| `npm run format` | Prettier em todo o src |
| `npx prisma studio` | Interface visual do banco de dados |
| `npx prisma migrate deploy` | Aplica migrations pendentes |
| `bash scripts/setup.sh` | Setup automatizado completo (não-interativo) |
| `bash scripts/test-webhook.sh` | Simula 12 mensagens WhatsApp para teste E2E |

## Variáveis de ambiente obrigatórias

Definidas em `src/config/env.ts` com validação Zod:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | `postgresql://eva:eva_secret@localhost:5432/eva_db` |
| `ANTHROPIC_API_KEY` | Sim | Chave da API Claude (para classificador AI) |
| `EVOLUTION_API_URL` | Sim | URL da Evolution API (`http://localhost:8080`) |
| `EVOLUTION_API_KEY` | Sim | Chave da Evolution API |
| `AUTHORIZED_PHONES` | Sim | Números autorizados (DDI+DDD, separados por vírgula) |
| `GROQ_API_KEY` | Não | Para transcrição de áudio (Whisper v3) |
| `ADMIN_API_KEY` | Padrão | Chave admin (mín. 16 chars, tem default) |

## Arquitetura

### Fluxo de uma mensagem WhatsApp
```
WhatsApp → Evolution API → POST /webhook/whatsapp →
  → Tenant resolver (auto-provisioning) →
  → Rate limiter (Redis) →
  → Message Router →
    → [Audio?] Transcrição Groq Whisper →
    → Hybrid Classifier (Rules → AI fallback) →
    → Module Handler (Agenda | Finance | Notes | Reports) →
    → WhatsApp Client (resposta via Evolution API)
```

### Multi-tenancy
Cada número de WhatsApp é um tenant. RLS implementado via Prisma middleware em `src/config/database.ts`. Todos os queries filtram por `tenantId`.

### Intents do classificador
- **Agenda:** AGENDAR, LISTAR_AGENDA, CANCELAR_EVENTO, EDITAR_EVENTO
- **Financeiro:** REGISTRAR_DESPESA, REGISTRAR_RECEITA, CONSULTAR_SALDO, DEFINIR_LIMITE, CANCELAR_TRANSACAO
- **Notas:** ANOTAR, LISTAR_NOTAS
- **Sistema:** RELATORIO, AJUDA, SAUDACAO, DESCONHECIDO

## Docker

Infraestrutura (sempre necessária para dev):
```bash
docker compose up -d    # Sobe Postgres + Redis + Evolution API
docker compose down      # Para tudo
docker compose logs -f   # Ver logs
```

Para deploy completo via Docker (incluindo a EVA):
Descomentar o serviço `eva-app` no `docker-compose.yml`.

## Testes

122 testes em 2 arquivos:
- `tests/classifier.test.ts` — Classificador híbrido (71 testes)
- `tests/etapa3-4.test.ts` — Módulos agenda/financeiro (51 testes)

Os testes não precisam de banco de dados (usam mocks internos).
