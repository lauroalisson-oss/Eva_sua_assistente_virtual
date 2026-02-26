# EVA — Executive Virtual Assistant

## Visão Geral do Projeto

EVA é um assistente virtual inteligente integrado ao WhatsApp que atua como secretária pessoal digital. Oferece gestão de agenda, controle financeiro, anotações e alertas automáticos. O sistema usa uma **arquitetura híbrida de classificação** que combina regras determinísticas (regex/patterns) com IA generativa (Claude API) como fallback.

**Modelo de Negócio:** SaaS multi-tenant com planos de R$ 19,90 a R$ 79,90/mês.

---

## Stack Tecnológica

| Componente | Tecnologia | Versão |
|---|---|---|
| Linguagem | TypeScript | 5.x |
| Runtime | Node.js | 20 LTS |
| Framework Web | Fastify | 4.x |
| ORM | Prisma | 5.x |
| Banco de Dados | PostgreSQL | 16 |
| Cache/Filas | Redis + BullMQ | 7.x / 5.x |
| IA Generativa | Claude API (Haiku) | claude-haiku-4-5-20251001 |
| Classificação Local | Regex + Levenshtein | Custom |
| Transcrição de Áudio | Groq API (Whisper v3) | - |
| WhatsApp | Evolution API (self-hosted) | 2.x |
| Testes | Vitest | 1.x |
| Linter | ESLint + Prettier | - |
| Process Manager | PM2 | - |

---

## Arquitetura Principal

```
Mensagem (texto/áudio)
       │
       ▼
[Webhook WhatsApp] → Validação → Pré-processamento
       │                              │
       │                    Se áudio: Groq/Whisper → texto
       │                              │
       ▼                              ▼
[Motor Híbrido de Classificação]
       │
       ├── Camada 1: Regex + Patterns (custo R$0, <10ms)
       │   └── Match com confidence >= 0.7? → Executa direto
       │
       └── Camada 2: Claude API Haiku (fallback)
           └── Classificação + extração de entidades → Executa
       │
       ▼
[Módulo de Negócio] → Agenda | Financeiro | Anotações | Relatórios
       │
       ▼
[Resposta formatada] → WhatsApp
```

---

## Convenções de Código

### Estrutura de Arquivos
- **Services** (`*.service.ts`): Lógica de negócio. Nunca acessam banco diretamente.
- **Repositories** (`*.repository.ts`): Queries ao banco via Prisma. Retornam tipos tipados.
- **Controllers** (`*.controller.ts`): Handlers de rotas/webhooks. Validam input, chamam services.
- **Jobs** (`*.job.ts`): Tarefas agendadas via BullMQ/cron.
- **Patterns** (`*.patterns.ts`): Regras de classificação por regex para cada módulo.

### Padrões TypeScript
```typescript
// Sempre usar interfaces para contratos
interface ClassificationResult {
  intent: IntentType;
  entities: Record<string, unknown>;
  confidence: number;
  source: 'rules' | 'ai';
}

// Enums para valores fixos
enum IntentType {
  AGENDAR = 'AGENDAR',
  LISTAR_AGENDA = 'LISTAR_AGENDA',
  CANCELAR_EVENTO = 'CANCELAR_EVENTO',
  REGISTRAR_DESPESA = 'REGISTRAR_DESPESA',
  REGISTRAR_RECEITA = 'REGISTRAR_RECEITA',
  CONSULTAR_SALDO = 'CONSULTAR_SALDO',
  DEFINIR_LIMITE = 'DEFINIR_LIMITE',
  ANOTAR = 'ANOTAR',
  LISTAR_NOTAS = 'LISTAR_NOTAS',
  RELATORIO = 'RELATORIO',
  AJUDA = 'AJUDA',
  DESCONHECIDO = 'DESCONHECIDO',
}

// Funções async sempre com try/catch tipado
async function processMessage(msg: IncomingMessage): Promise<ResponseMessage> {
  // ...
}
```

### Padrões de Nomenclatura
- Arquivos: `kebab-case.ts` (ex: `budget-alert.job.ts`)
- Classes/Interfaces: `PascalCase` (ex: `AgendaService`)
- Funções/Variáveis: `camelCase` (ex: `parseDate`)
- Constantes: `UPPER_SNAKE_CASE` (ex: `MAX_RETRIES`)
- Enums: `PascalCase` com valores `UPPER_SNAKE_CASE`

### Tratamento de Erros
```typescript
// Criar erros customizados por módulo
class AgendaError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AgendaError';
  }
}

// Sempre logar com contexto
logger.error({ err, tenantId, messageId }, 'Falha ao processar mensagem');
```

### Logging
- Usar **Pino** como logger (integrado ao Fastify)
- Níveis: `debug` para desenvolvimento, `info` para produção
- Sempre incluir `tenantId` no contexto do log
- NUNCA logar dados financeiros sensíveis ou tokens de API

---

## Banco de Dados (Prisma Schema)

O schema está em `prisma/schema.prisma`. Pontos críticos:

- **Multi-Tenancy**: Toda tabela tem `tenantId` como campo obrigatório
- **Row-Level Security**: Será implementado via Prisma middleware
- **Valores monetários**: Sempre `Decimal` (nunca Float)
- **Timestamps**: Sempre `DateTime` com timezone (UTC no banco, BRT na exibição)
- **Soft delete**: Campos `deletedAt` onde aplicável

---

## Motor Híbrido — Como Funciona

### Camada 1: Rule Engine (`src/classifier/rule-engine.ts`)
```typescript
// Cada pattern retorna: { intent, entities, confidence }
// Patterns são testados em ordem de especificidade (mais específico primeiro)
// Se confidence >= 0.7 → usa resultado das regras
// Se confidence < 0.7 → encaminha para Camada 2 (Claude API)
```

**Patterns por módulo** (em `src/classifier/patterns/`):
- `agenda.patterns.ts`: marca, agenda, reunião, compromisso, cancela, etc.
- `finance.patterns.ts`: gastei, paguei, recebi, saldo, limite, etc.
- `notes.patterns.ts`: anota, lembra, nota, anotações, etc.

### Camada 2: AI Classifier (`src/classifier/ai-classifier.ts`)
- Usa Claude API (modelo Haiku) com system prompt em `prompts/classifier.txt`
- Retorna JSON estruturado com intent + entities
- Cache de classificações similares no Redis (TTL: 1h)

---

## Variáveis de Ambiente Necessárias

```env
# Servidor
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug

# Banco de Dados
DATABASE_URL=postgresql://eva:eva_secret@localhost:5432/eva_db

# Redis
REDIS_URL=redis://localhost:6379

# Claude API (Anthropic)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Groq (Transcrição de Áudio)
GROQ_API_KEY=gsk_...

# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=eva-bot

# Configurações
AUTHORIZED_PHONES=5575999999999
DEFAULT_TIMEZONE=America/Bahia
DAILY_SUMMARY_HOUR=7
```

---

## Comandos Úteis

```bash
# Desenvolvimento
npm run dev          # Inicia com hot reload (tsx watch)
npm run build        # Compila TypeScript
npm run start        # Inicia em produção

# Banco de Dados
npx prisma migrate dev    # Cria/aplica migrações
npx prisma generate       # Gera client
npx prisma studio         # UI do banco

# Testes
npm run test              # Roda testes
npm run test:watch        # Testes em watch mode

# Docker
docker compose up -d      # Sobe PostgreSQL + Redis
docker compose down       # Para containers

# Lint
npm run lint              # ESLint
npm run format            # Prettier
```

---

## Roadmap — Fase 1 (MVP)

### Semana 1: Setup + Webhook
- [x] Estrutura de diretórios
- [x] CLAUDE.md
- [ ] package.json com dependências
- [ ] tsconfig.json
- [ ] Docker Compose (PostgreSQL + Redis)
- [ ] Prisma schema base (tenants, events, transactions, notes)
- [ ] Servidor Fastify básico
- [ ] Webhook WhatsApp (receber/enviar mensagens)
- [ ] Variáveis de ambiente validadas (env.ts)

### Semana 2: Motor Híbrido + Anotações
- [ ] Rule Engine com patterns base
- [ ] AI Classifier (Claude Haiku integration)
- [ ] Hybrid Classifier (orquestrador)
- [ ] Entity Extractor (datas, valores, etc.)
- [ ] Módulo de Anotações (CRUD completo)
- [ ] Parser de datas PT-BR

### Semana 3: Agenda
- [ ] Módulo de Agenda (criar, listar, cancelar eventos)
- [ ] Parser de datas naturais ("amanhã às 14h", "quarta que vem")
- [ ] Cron de lembretes (1h antes, 1 dia antes)
- [ ] Resumo diário automático às 7h

### Semana 4: Financeiro + Deploy
- [ ] Módulo Financeiro (registrar receita/despesa)
- [ ] Consulta de saldo e resumo mensal
- [ ] Sistema de alertas de limite (70%, 90%, 100%)
- [ ] Categorização automática (regras + IA)
- [ ] Deploy em VPS
- [ ] Testes integrados

---

## Instruções para Claude Code

Ao desenvolver neste projeto, siga estas diretrizes:

1. **Sempre tipar tudo**: Nunca usar `any`. Criar interfaces para todos os contratos.
2. **Um arquivo, uma responsabilidade**: Services não acessam banco; repositories não têm lógica de negócio.
3. **Testes junto com código**: Ao criar um service, criar o teste correspondente em `tests/`.
4. **Validação de input**: Usar Zod schemas para validar dados de entrada nos controllers.
5. **Erros informativos**: Mensagens de erro devem ajudar a debugar (incluir contexto).
6. **Português no UX**: Mensagens para o usuário final em PT-BR. Código e comentários técnicos em inglês.
7. **Commits atômicos**: Cada feature completa antes de começar a próxima.
8. **Variáveis de ambiente**: Nunca hardcode. Tudo via `src/config/env.ts`.
9. **Logs estruturados**: Usar Pino com contexto (tenantId, messageId).
10. **Respostas WhatsApp**: Formatar com emojis e bold (*texto*) para legibilidade.
