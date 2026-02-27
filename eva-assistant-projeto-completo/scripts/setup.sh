#!/usr/bin/env bash
set -euo pipefail

# ============================================
# EVA — Script de Setup Automatizado
# Executa todos os passos para rodar a EVA
# ============================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║   🤖 EVA — Setup Automatizado            ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

cd "$PROJECT_DIR"

# ============================================
# 1. Verificar pré-requisitos
# ============================================
echo -e "${YELLOW}[1/7] Verificando pré-requisitos...${NC}"

# Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js não encontrado. Instale Node.js >= 20.${NC}"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}❌ Node.js $NODE_VERSION encontrado, mas >= 20 é necessário.${NC}"
  exit 1
fi
echo -e "  ✅ Node.js $(node -v)"

# npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm não encontrado.${NC}"
  exit 1
fi
echo -e "  ✅ npm $(npm -v)"

# Docker
if ! command -v docker &> /dev/null; then
  echo -e "${RED}❌ Docker não encontrado. Instale Docker Desktop ou Docker Engine.${NC}"
  exit 1
fi
echo -e "  ✅ Docker $(docker --version | grep -oP '\d+\.\d+\.\d+')"

# Docker Compose
if docker compose version &> /dev/null; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
  COMPOSE_CMD="docker-compose"
else
  echo -e "${RED}❌ Docker Compose não encontrado.${NC}"
  exit 1
fi
echo -e "  ✅ Docker Compose encontrado"

# ============================================
# 2. Configurar .env
# ============================================
echo ""
echo -e "${YELLOW}[2/7] Configurando variáveis de ambiente...${NC}"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "  📄 Arquivo .env criado a partir do .env.example"
  echo ""
  echo -e "${YELLOW}  ⚠️  IMPORTANTE: Edite o .env com suas chaves reais:${NC}"
  echo -e "     - ${RED}ANTHROPIC_API_KEY${NC} (obrigatório) → https://console.anthropic.com/"
  echo -e "     - GROQ_API_KEY (opcional, para áudio) → https://console.groq.com/"
  echo -e "     - AUTHORIZED_PHONES (seu número com DDI+DDD)"
  echo ""

  # Verificar se ANTHROPIC_API_KEY já foi preenchida
  if grep -q "sk-ant-sua-chave-aqui" .env; then
    echo -e "${RED}  ❌ ANTHROPIC_API_KEY não configurada!${NC}"
    echo -e "     Edite o arquivo .env e rode este script novamente."
    echo ""
    read -p "  Deseja continuar mesmo assim? (s/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
      echo -e "  Edite ${BLUE}.env${NC} e rode: ${GREEN}bash scripts/setup.sh${NC}"
      exit 0
    fi
  fi
else
  echo -e "  ✅ Arquivo .env já existe"
fi

# ============================================
# 3. Subir infraestrutura Docker
# ============================================
echo ""
echo -e "${YELLOW}[3/7] Subindo infraestrutura (Postgres + Redis + Evolution API)...${NC}"

$COMPOSE_CMD up -d

echo -e "  ⏳ Aguardando serviços ficarem saudáveis..."

# Aguardar Postgres
for i in {1..30}; do
  if $COMPOSE_CMD exec -T postgres pg_isready -U eva -d eva_db &> /dev/null; then
    echo -e "  ✅ PostgreSQL pronto"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo -e "${RED}  ❌ PostgreSQL não respondeu em 30s${NC}"
    exit 1
  fi
  sleep 1
done

# Aguardar Redis
for i in {1..15}; do
  if $COMPOSE_CMD exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    echo -e "  ✅ Redis pronto"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo -e "${RED}  ❌ Redis não respondeu em 15s${NC}"
    exit 1
  fi
  sleep 1
done

echo -e "  ✅ Evolution API iniciando (pode levar ~30s no primeiro boot)"

# ============================================
# 4. Instalar dependências
# ============================================
echo ""
echo -e "${YELLOW}[4/7] Instalando dependências Node.js...${NC}"

npm install --no-audit --no-fund 2>&1 | tail -3
echo -e "  ✅ Dependências instaladas"

# ============================================
# 5. Gerar Prisma Client + Migration
# ============================================
echo ""
echo -e "${YELLOW}[5/7] Configurando banco de dados...${NC}"

npx prisma generate 2>&1 | tail -1
echo -e "  ✅ Prisma Client gerado"

# Verificar se já existem migrations
if [ ! -d "prisma/migrations" ] || [ -z "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo -e "  🗃️  Criando migration inicial..."
  npx prisma migrate dev --name init --skip-seed 2>&1 | tail -3
  echo -e "  ✅ Migration inicial criada e aplicada"
else
  echo -e "  🗃️  Aplicando migrations pendentes..."
  npx prisma migrate dev --skip-seed 2>&1 | tail -3
  echo -e "  ✅ Migrations aplicadas"
fi

# ============================================
# 6. Rodar testes
# ============================================
echo ""
echo -e "${YELLOW}[6/7] Rodando testes...${NC}"

if npx vitest run 2>&1 | tail -5; then
  echo -e "  ✅ Todos os testes passaram"
else
  echo -e "${YELLOW}  ⚠️  Alguns testes falharam (verifique acima)${NC}"
fi

# ============================================
# 7. Instruções finais
# ============================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Setup concluído com sucesso!        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "Para iniciar a EVA:"
echo -e "  ${GREEN}npm run dev${NC}"
echo ""
echo -e "Para configurar o WhatsApp:"
echo -e "  1. Acesse ${BLUE}http://localhost:8080${NC} (Evolution API)"
echo -e "  2. Crie uma instância chamada ${BLUE}eva-bot${NC}"
echo -e "  3. Escaneie o QR code com seu WhatsApp"
echo -e "  4. Configure o webhook para: ${BLUE}http://host.docker.internal:3000/webhook/whatsapp${NC}"
echo ""
echo -e "Para testar sem WhatsApp (simular webhook):"
echo -e "  ${GREEN}bash scripts/test-webhook.sh${NC}"
echo ""
echo -e "Endpoints úteis:"
echo -e "  Health:  ${BLUE}http://localhost:3000/health${NC}"
echo -e "  Admin:   ${BLUE}http://localhost:3000/api/admin/tenants${NC}"
echo -e "  Webhook: ${BLUE}http://localhost:3000/webhook/whatsapp${NC}"
echo ""
