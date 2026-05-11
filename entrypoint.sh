#!/bin/sh
set -e

echo "[startup] Running Prisma migrations..."
npx prisma migrate deploy

echo "[startup] Syncing match data from API..."
npx tsx scripts/seed.ts || echo "[startup] Seed skipped (API unavailable)"

echo "[startup] Starting Next.js server..."
exec node server.js
