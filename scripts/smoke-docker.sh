#!/usr/bin/env bash
set -e

docker compose up -d --wait
sleep 8
node scripts/e2e-api-p0.mjs
echo "=== Docker smoke PASSED ==="
