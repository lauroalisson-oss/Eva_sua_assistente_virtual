# 🤖 EVA — Executive Virtual Assistant

Assistente virtual inteligente via WhatsApp com gestão de agenda, controle financeiro, anotações e alertas automáticos.

## 🚀 Quickstart

### Pré-requisitos
- Node.js 20+
- Docker e Docker Compose
- Conta na [Anthropic](https://console.anthropic.com/) (Claude API)
- (Opcional) Conta na [Groq](https://console.groq.com/) (transcrição de áudio)

### 1. Clonar e instalar

```bash
git clone <seu-repo>
cd eva-assistant
npm install
```

### 2. Configurar ambiente

```bash
cp .env.example .env
# Edite o .env com suas chaves de API
```

### 3. Subir banco de dados

```bash
docker compose up -d
```

### 4. Rodar migrações

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Iniciar em desenvolvimento

```bash
npm run dev
```

O servidor estará rodando em `http://localhost:3000`.

### 6. Testar health check

```bash
curl http://localhost:3000/health
```

## 📁 Estrutura do Projeto

Veja o arquivo `CLAUDE.md` para documentação completa da arquitetura e convenções.

## 🛠️ Desenvolvimento com Claude Code

```bash
# Abra o projeto no Claude Code
claude

# O Claude Code lerá automaticamente o CLAUDE.md
# Peça para implementar features específicas:
# "Implemente o cron de lembretes no reminder.job.ts"
# "Adicione testes para o hybrid-classifier"
```

## 📄 Licença

Proprietário — Lauro Alisson © 2026
