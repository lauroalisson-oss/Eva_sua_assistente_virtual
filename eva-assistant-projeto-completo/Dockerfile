# ============================================
# EVA — Executive Virtual Assistant
# Dockerfile multi-stage para produção
# ============================================

# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependência
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Instalar dependências (incluindo devDeps para build)
RUN npm ci --no-audit --no-fund

# Gerar Prisma Client
RUN npx prisma generate

# Copiar código-fonte
COPY tsconfig.json ./
COPY src ./src/
COPY prompts ./prompts/

# Build TypeScript
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine AS production

WORKDIR /app

# Metadados
LABEL maintainer="Lauro Alisson <lauro.alisson@gmail.com>"
LABEL description="EVA — Executive Virtual Assistant"

# Instalar OpenSSL (necessário para Prisma em Alpine)
RUN apk add --no-cache openssl

# Criar usuário não-root
RUN addgroup -S eva 2>/dev/null || true && adduser -S eva -G eva 2>/dev/null || true && \

# Copiar apenas o necessário
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
COPY prompts ./prompts/

# Instalar somente dependências de produção
RUN npm ci --omit=dev --no-audit --no-fund && \
    npx prisma generate && \
    npm cache clean --force

# Copiar build do stage anterior
COPY --from=builder /app/dist ./dist/

# Ajustar permissões
RUN chown -R eva:eva /app

# Mudar para usuário não-root
USER eva

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Iniciar aplicação
CMD ["node", "dist/index.js"]
