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
# Usar usuário 'node' que já vem no Alpine

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

# Copiar entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Ajustar permissões
RUN chown -R node:node /app

# Mudar para usuário não-root
USER node

# Expor porta
EXPOSE 3000

# Iniciar aplicação via entrypoint (shell handles migrations + server)
CMD ["./docker-entrypoint.sh"]
