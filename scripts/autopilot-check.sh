#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports/automation"
LOG_DIR="$REPORT_DIR/logs"
TS="$(date '+%Y%m%d-%H%M%S')"
REPORT_FILE="$REPORT_DIR/report-$TS.md"
LATEST_FILE="$REPORT_DIR/latest.md"

mkdir -p "$LOG_DIR"

FAIL_COUNT=0
STARTED_API=0
STARTED_WEB=0
API_PID=""
WEB_PID=""

is_port_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

cleanup() {
  if [[ "$STARTED_WEB" -eq 1 && -n "$WEB_PID" ]]; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
  if [[ "$STARTED_API" -eq 1 && -n "$API_PID" ]]; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

start_service_if_needed() {
  local name="$1"
  local port="$2"
  local cmd="$3"

  if is_port_listening "$port"; then
    return 0
  fi

  local log_file="$LOG_DIR/${TS}-${name}-dev.log"
  (
    cd "$ROOT_DIR" || exit 1
    bash -lc "$cmd"
  ) >"$log_file" 2>&1 &

  local pid="$!"
  if [[ "$name" == "api" ]]; then
    API_PID="$pid"
    STARTED_API=1
  else
    WEB_PID="$pid"
    STARTED_WEB=1
  fi

  for _ in $(seq 1 90); do
    if is_port_listening "$port"; then
      return 0
    fi
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "[autopilot] failed to start $name (see $log_file)"
      return 1
    fi
    sleep 1
  done

  echo "[autopilot] timeout waiting for $name on :$port (see $log_file)"
  return 1
}

run_check() {
  local name="$1"
  local cmd="$2"
  local slug
  slug="$(echo "$name" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-')"
  local log_file="$LOG_DIR/${TS}-${slug}.log"
  local start end duration status

  start="$(date +%s)"
  if (
    cd "$ROOT_DIR" || exit 1
    bash -lc "$cmd"
  ) >"$log_file" 2>&1; then
    status="PASS"
  else
    status="FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  end="$(date +%s)"
  duration=$((end - start))

  printf '| %s | %s | %ss | `%s` |\n' "$name" "$status" "$duration" "${log_file#$ROOT_DIR/}" >>"$REPORT_FILE"
}

{
  echo "# SIS Autopilot Report"
  echo
  echo "- Timestamp: $(date)"
  echo "- Root: \`$ROOT_DIR\`"
  echo "- Branch: \`$(cd "$ROOT_DIR" && git branch --show-current 2>/dev/null || echo unknown)\`"
  echo
  echo "| Check | Status | Duration | Log |"
  echo "|---|---|---:|---|"
} >"$REPORT_FILE"

if ! start_service_if_needed "api" "4000" "pnpm --filter @sis/api dev"; then
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

if ! start_service_if_needed "web" "3000" "pnpm --filter @sis/web dev"; then
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

run_check "API Build" "pnpm --filter @sis/api build"
run_check "Web Lint" "pnpm --filter @sis/web lint"
run_check "Web Build" "pnpm --filter @sis/web build"
run_check "Web Smoke" "pnpm smoke:web"
run_check "Web Critical E2E" "pnpm test:e2e:web"
run_check "API P0 E2E" "pnpm test:e2e:api"

{
  echo
  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo "## Result"
    echo "PASS"
  else
    echo "## Result"
    echo "FAIL ($FAIL_COUNT check(s) failed)"
  fi
} >>"$REPORT_FILE"

cp "$REPORT_FILE" "$LATEST_FILE"
echo "[autopilot] report generated: $REPORT_FILE"
echo "[autopilot] latest report: $LATEST_FILE"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi

