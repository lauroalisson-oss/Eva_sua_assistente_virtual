#!/usr/bin/env bash
set -euo pipefail

# ============================================
# EVA — Script de Setup Automatizado
# 100% não-interativo — pode ser executado por
# Claude Code, Claude Cowork ou CI/CD
# ============================================
# Uso:
#   bash scripts/setup.sh                    # Setup completo
#   ANTHROPIC_API_KEY=sk-ant-... bash scripts/setup.sh  # Com API key via env
#   SKIP_DOCKER=1 bash scripts/setup.sh      # Pular Docker (se já estiver rodando)
#   SKIP_TESTS=1 bash scripts/setup.sh       # Pular testes
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Flags de controle (podem ser setadas via variáveis de ambiente)
SKIP_DOCKER="${SKIP_DOCKER:-0}"
SKIP_TESTS="${SKIP_TESTS:-0}"

echo ""
echo "============================================"
echo "  EVA — Setup Automatizado"
echo "============================================"
echo ""

cd "$PROJECT_DIR"

ERRORS=0

# ============================================
# PASSO 1: Verificar pré-requisitos
# ============================================
echo "[1/6] Verificando pre-requisitos..."

# Node.js
if ! command -v node &> /dev/null; then
  echo "  ERRO: Node.js nao encontrado. Instale Node.js >= 20."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "  ERRO: Node.js $NODE_VERSION encontrado, mas >= 20 eh necessario."
  exit 1
fi
echo "  OK: Node.js $(node -v)"

# npm
if ! command -v npm &> /dev/null; then
  echo "  ERRO: npm nao encontrado."
  exit 1
fi
echo "  OK: npm $(npm -v)"

# Docker (apenas se não pular)
if [ "$SKIP_DOCKER" = "0" ]; then
  if ! command -v docker &> /dev/null; then
    echo "  ERRO: Docker nao encontrado."
    exit 1
  fi
  echo "  OK: Docker encontrado"

  if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
  else
    echo "  ERRO: Docker Compose nao encontrado."
    exit 1
  fi
  echo "  OK: Docker Compose encontrado"
else
  echo "  PULANDO: Docker (SKIP_DOCKER=1)"
fi

# ============================================
# PASSO 2: Configurar .env
# ============================================
echo ""
echo "[2/6] Configurando variaveis de ambiente..."

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "  CRIADO: .env a partir de .env.example"
else
  echo "  OK: .env ja existe"
fi

# Se ANTHROPIC_API_KEY foi passada via ambiente, injetar no .env
if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ "$ANTHROPIC_API_KEY" != "sk-ant-sua-chave-aqui" ]; then
  sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" .env
  echo "  OK: ANTHROPIC_API_KEY configurada via variavel de ambiente"
fi

# Se GROQ_API_KEY foi passada via ambiente, injetar no .env
if [ -n "${GROQ_API_KEY:-}" ] && [ "$GROQ_API_KEY" != "gsk_sua-chave-aqui" ]; then
  sed -i "s|^GROQ_API_KEY=.*|GROQ_API_KEY=$GROQ_API_KEY|" .env
  echo "  OK: GROQ_API_KEY configurada via variavel de ambiente"
fi

# Se EVOLUTION_API_KEY foi passada via ambiente, injetar no .env
if [ -n "${EVOLUTION_API_KEY:-}" ] && [ "$EVOLUTION_API_KEY" != "sua-chave-evolution" ]; then
  sed -i "s|^EVOLUTION_API_KEY=.*|EVOLUTION_API_KEY=$EVOLUTION_API_KEY|" .env
  echo "  OK: EVOLUTION_API_KEY configurada via variavel de ambiente"
fi

# Se AUTHORIZED_PHONES foi passada via ambiente, injetar no .env
if [ -n "${AUTHORIZED_PHONES:-}" ] && [ "$AUTHORIZED_PHONES" != "5575999999999" ]; then
  sed -i "s|^AUTHORIZED_PHONES=.*|AUTHORIZED_PHONES=$AUTHORIZED_PHONES|" .env
  echo "  OK: AUTHORIZED_PHONES configurado via variavel de ambiente"
fi

# Validar que chaves criticas existem (avisar mas nao bloquear)
if grep -q "sk-ant-sua-chave-aqui" .env; then
  echo "  AVISO: ANTHROPIC_API_KEY ainda eh placeholder. O classificador AI nao vai funcionar."
  echo "         O rule engine (classificador por regras) continuara funcionando."
fi

# ============================================
# PASSO 3: Subir infraestrutura Docker
# ============================================
echo ""
echo "[3/6] Subindo infraestrutura Docker..."

if [ "$SKIP_DOCKER" = "0" ]; then
  $COMPOSE_CMD up -d postgres redis evolution 2>&1

  echo "  Aguardando PostgreSQL..."
  for i in $(seq 1 30); do
    if $COMPOSE_CMD exec -T postgres pg_isready -U eva -d eva_db &> /dev/null; then
      echo "  OK: PostgreSQL pronto"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "  ERRO: PostgreSQL nao respondeu em 30 segundos"
      exit 1
    fi
    sleep 1
  done

  echo "  Aguardando Redis..."
  for i in $(seq 1 15); do
    if $COMPOSE_CMD exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
      echo "  OK: Redis pronto"
      break
    fi
    if [ "$i" -eq 15 ]; then
      echo "  ERRO: Redis nao respondeu em 15 segundos"
      exit 1
    fi
    sleep 1
  done

  echo "  OK: Evolution API iniciando em background"
else
  echo "  PULANDO: Docker (SKIP_DOCKER=1)"
  echo "  Certifique-se que Postgres e Redis estao rodando"
fi

# ============================================
# PASSO 4: Instalar dependencias
# ============================================
echo ""
echo "[4/6] Instalando dependencias Node.js..."

npm install --no-audit --no-fund 2>&1 | tail -5
echo "  OK: Dependencias instaladas"

# ============================================
# PASSO 5: Gerar Prisma Client + Migrations
# ============================================
echo ""
echo "[5/6] Configurando banco de dados (Prisma)..."

npx prisma generate 2>&1 | tail -2
echo "  OK: Prisma Client gerado"

if [ "$SKIP_DOCKER" = "0" ]; then
  # Verificar se migrations existem
  if [ -d "prisma/migrations/0001_init" ]; then
    echo "  Aplicando migrations existentes..."
    npx prisma migrate deploy 2>&1 | tail -3
    echo "  OK: Migrations aplicadas com prisma migrate deploy"
  else
    echo "  Criando migration inicial..."
    npx prisma migrate dev --name init --skip-seed 2>&1 | tail -3
    echo "  OK: Migration inicial criada e aplicada"
  fi
else
  echo "  PULANDO: migrate (SKIP_DOCKER=1, sem banco disponivel)"
fi

# ============================================
# PASSO 6: Rodar testes
# ============================================
echo ""
echo "[6/6] Rodando testes..."

if [ "$SKIP_TESTS" = "0" ]; then
  if npx vitest run 2>&1; then
    echo "  OK: Todos os testes passaram"
  else
    echo "  AVISO: Alguns testes falharam"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "  PULANDO: Testes (SKIP_TESTS=1)"
fi

# ============================================
# RESULTADO FINAL
# ============================================
echo ""
echo "============================================"
if [ "$ERRORS" -eq 0 ]; then
  echo "  SETUP CONCLUIDO COM SUCESSO"
else
  echo "  SETUP CONCLUIDO COM $ERRORS AVISO(S)"
fi
echo "============================================"
echo ""
echo "Proximos passos:"
echo "  1. Iniciar a EVA:         npm run dev"
echo "  2. Testar health check:   curl http://localhost:3000/health"
echo "  3. Simular mensagens:     bash scripts/test-webhook.sh"
echo ""
echo "Endpoints:"
echo "  Health:  http://localhost:3000/health"
echo "  Webhook: http://localhost:3000/webhook/whatsapp"
echo "  Admin:   http://localhost:3000/api/admin/tenants"
echo ""

exit $ERRORS
