#!/bin/sh
set -e

echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "🚀 Starting EVA server..."
node dist/index.js
