#!/usr/bin/env bash
set -euo pipefail

# ============================================
# EVA — Script de Teste de Webhook
# Simula mensagens do WhatsApp via Evolution API
# ============================================

BASE_URL="${EVA_URL:-http://localhost:3000}"
PHONE="${TEST_PHONE:-5575999999999}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════╗"
echo "║   🧪 EVA — Teste de Webhook              ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# Função para enviar mensagem simulada
send_message() {
  local text="$1"
  local description="$2"
  local msg_id="test-$(date +%s%N | head -c 16)"

  echo -e "${YELLOW}📨 Enviando:${NC} \"$text\""
  echo -e "   ${BLUE}($description)${NC}"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/webhook/whatsapp" \
    -H "Content-Type: application/json" \
    -d "{
      \"event\": \"messages.upsert\",
      \"instance\": \"eva-bot\",
      \"data\": {
        \"key\": {
          \"remoteJid\": \"${PHONE}@s.whatsapp.net\",
          \"fromMe\": false,
          \"id\": \"${msg_id}\"
        },
        \"pushName\": \"Testador\",
        \"message\": {
          \"conversation\": \"${text}\"
        },
        \"messageTimestamp\": $(date +%s)
      }
    }" 2>/dev/null)

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "   ${GREEN}✅ HTTP $HTTP_CODE${NC} — $BODY"
  else
    echo -e "   ${RED}❌ HTTP $HTTP_CODE${NC} — $BODY"
  fi
  echo ""

  # Pausa entre mensagens para não sobrecarregar
  sleep 1
}

# ============================================
# 0. Health check
# ============================================
echo -e "${YELLOW}[0] Verificando se a EVA está rodando...${NC}"
HEALTH=$(curl -s "$BASE_URL/health" 2>/dev/null || echo "OFFLINE")

if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "   ${GREEN}✅ EVA online${NC}"
  echo -e "   $HEALTH"
else
  echo -e "   ${RED}❌ EVA não está respondendo em $BASE_URL${NC}"
  echo -e "   Inicie com: ${GREEN}npm run dev${NC}"
  exit 1
fi
echo ""

# ============================================
# 1. Testes de Saudação
# ============================================
echo -e "${BLUE}━━━ Saudação ━━━${NC}"
send_message "Olá!" "Deve responder com mensagem de boas-vindas"

# ============================================
# 2. Testes de Agenda
# ============================================
echo -e "${BLUE}━━━ Agenda ━━━${NC}"
send_message "Marca reunião amanhã às 14h" "Deve criar evento na agenda"
send_message "O que tenho pra hoje?" "Deve listar eventos do dia"
send_message "Agenda da semana" "Deve listar eventos da semana"

# ============================================
# 3. Testes Financeiros
# ============================================
echo -e "${BLUE}━━━ Financeiro ━━━${NC}"
send_message "Gastei 150 de combustível" "Deve registrar despesa"
send_message "Recebi 3500 do cliente" "Deve registrar receita"
send_message "Como tá meu financeiro?" "Deve mostrar resumo do mês"
send_message "Meu limite de gastos é 5000" "Deve definir orçamento"

# ============================================
# 4. Testes de Anotações
# ============================================
echo -e "${BLUE}━━━ Anotações ━━━${NC}"
send_message "Anota: ligar pro contador segunda" "Deve criar nota com tag follow-up"
send_message "Quais são minhas anotações?" "Deve listar notas recentes"

# ============================================
# 5. Testes de Sistema
# ============================================
echo -e "${BLUE}━━━ Sistema ━━━${NC}"
send_message "Ajuda" "Deve mostrar menu de ajuda"
send_message "Cancela o último gasto" "Deve cancelar última transação"

# ============================================
# Resumo
# ============================================
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ Testes de webhook concluídos!       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "Verifique o log da EVA para ver o processamento das mensagens."
echo -e "As respostas serão enviadas via WhatsApp (se Evolution API estiver conectada)"
echo -e "ou logadas no console se não houver conexão WhatsApp."
echo ""
echo -e "Para verificar o banco de dados:"
echo -e "  ${GREEN}npx prisma studio${NC}"
echo ""
