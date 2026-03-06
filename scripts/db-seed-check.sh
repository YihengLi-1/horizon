#!/usr/bin/env bash
set -e

COUNT=$(psql "${DATABASE_URL}" -tAc "SELECT count(*) FROM \"User\" WHERE role='ADMIN'" 2>/dev/null || echo 0)
if [ "$COUNT" -lt 1 ]; then
  echo "FAIL: No admin user found in DB"
  exit 1
fi

echo "PASS: DB has ${COUNT} admin user(s)"
