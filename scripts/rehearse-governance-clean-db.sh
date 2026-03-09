#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

require_cmd docker
require_cmd pnpm
require_cmd jq
require_cmd curl

DB_NAME="sis_rehearsal_$(date +%s)"
DB_URL="postgresql://postgres:postgres@127.0.0.1:5432/${DB_NAME}?schema=public"
API_PORT="${REHEARSAL_API_PORT:-4102}"
API_LOG="$(mktemp -t sis-governance-rehearsal-api.XXXXXX.log)"
API_PID=""
TMP_DIR="$(mktemp -d -t sis-governance-rehearsal.XXXXXX)"

drop_database() {
  docker compose exec -T postgres env PGPASSWORD=postgres \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" >/dev/null
}

cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" >/dev/null 2>&1; then
    kill "${API_PID}" >/dev/null 2>&1 || true
    wait "${API_PID}" >/dev/null 2>&1 || true
  fi
  drop_database || true
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

echo "==> Creating disposable database: ${DB_NAME}"
docker compose exec -T postgres env PGPASSWORD=postgres \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" \
  -c "CREATE DATABASE \"${DB_NAME}\" TEMPLATE template0;" >/dev/null

echo "==> Building shared package"
pnpm --filter @sis/shared build

echo "==> Applying migrations to disposable database"
DATABASE_URL="${DB_URL}" pnpm --filter @sis/api exec prisma migrate deploy

echo "==> Seeding disposable database"
DATABASE_URL="${DB_URL}" pnpm --filter @sis/api exec prisma db seed

echo "==> Building API"
pnpm --filter @sis/api build

echo "==> Starting API on port ${API_PORT}"
DATABASE_URL="${DB_URL}" PORT="${API_PORT}" node apps/api/dist/apps/api/src/main.js >"${API_LOG}" 2>&1 &
API_PID=$!

for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:${API_PORT}/api/health" | jq -e '.status == "ok"' >/dev/null

login() {
  local jar="$1"
  local identifier="$2"
  local password="$3"
  local csrf
  csrf="$(curl -fsS -c "$jar" "http://127.0.0.1:${API_PORT}/auth/csrf-token" | jq -r '.data.csrfToken // .csrfToken')"
  curl -fsS -b "$jar" -c "$jar" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: ${csrf}" \
    -d "{\"identifier\":\"${identifier}\",\"password\":\"${password}\"}" \
    "http://127.0.0.1:${API_PORT}/auth/login" >/dev/null
}

admin_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local csrf
  csrf="$(awk '$6=="sis-csrf"{print $7}' "${TMP_DIR}/admin.cookies" | tail -n 1)"
  curl -fsS -b "${TMP_DIR}/admin.cookies" -c "${TMP_DIR}/admin.cookies" \
    -X "$method" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: ${csrf}" \
    ${data:+-d "$data"} \
    "http://127.0.0.1:${API_PORT}${path}"
}

student_request() {
  local jar="$1"
  local method="$2"
  local path="$3"
  local data="${4:-}"
  local csrf
  csrf="$(awk '$6=="sis-csrf"{print $7}' "$jar" | tail -n 1)"
  curl -sS -b "$jar" -c "$jar" \
    -X "$method" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: ${csrf}" \
    ${data:+-d "$data"} \
    "http://127.0.0.1:${API_PORT}${path}"
}

echo "==> Logging in demo actors"
login "${TMP_DIR}/admin.cookies" "admin@sis.edu" "Admin@2026!"
login "${TMP_DIR}/student1.cookies" "student1@sis.edu" "Student@2026!"
login "${TMP_DIR}/student2.cookies" "student2@sis.edu" "Student@2026!"
login "${TMP_DIR}/advisor.cookies" "advisor1@sis.edu" "Advisor@2026!"

echo "==> Admin creates registration hold for student2"
HOLD_RESPONSE="$(admin_request POST "/governance/admin/holds" '{"studentId":"seed-student-2","type":"REGISTRATION","reason":"Governance rehearsal hold","note":"Disposable clean-db validation"}')"
HOLD_ID="$(printf '%s' "$HOLD_RESPONSE" | jq -r '.data.id')"
printf '%s' "$HOLD_RESPONSE" | jq -e '.success == true and .data.active == true and .data.type == "REGISTRATION"' >/dev/null

echo "==> Student2 sees hold"
student_request "${TMP_DIR}/student2.cookies" GET "/governance/my-holds" \
  | jq -e '.success == true and (.data | length) >= 1 and (.data | map(select(.id == "'"${HOLD_ID}"'")) | length) == 1' >/dev/null

echo "==> Hold blocks registration mutation"
student_request "${TMP_DIR}/student2.cookies" POST "/registration/cart" '{"termId":"seed-term-fall-2026","sectionId":"section-eng101-f1"}' \
  | jq -e '.success == false and .error.code == "ACTIVE_REGISTRATION_HOLD"' >/dev/null

echo "==> Student1 builds Fall 2026 overload cart"
for section_id in \
  section-math201-f1 \
  section-eng101-f1 \
  section-bus101-f1 \
  section-cs350-f1 \
  section-eng205-f1 \
  section-eng250-f1 \
  section-bus320-f1
do
  student_request "${TMP_DIR}/student1.cookies" POST "/registration/cart" \
    "{\"termId\":\"seed-term-fall-2026\",\"sectionId\":\"${section_id}\"}" \
    | jq -e '.success == true' >/dev/null
done

echo "==> Student1 precheck fails before approval due to credit limit"
student_request "${TMP_DIR}/student1.cookies" POST "/registration/precheck" '{"termId":"seed-term-fall-2026"}' \
  | jq -e '.success == true and .data.ok == false and (.data.issues | any(.reasonCode == "CREDIT_LIMIT_EXCEEDED"))' >/dev/null

echo "==> Student1 submits credit overload request"
REQUEST_RESPONSE="$(student_request "${TMP_DIR}/student1.cookies" POST "/governance/requests/credit-overload" '{"termId":"seed-term-fall-2026","requestedCredits":19,"reason":"Need 19 credits to stay on track for this term."}')"
REQUEST_ID="$(printf '%s' "$REQUEST_RESPONSE" | jq -r '.data.id')"
printf '%s' "$REQUEST_RESPONSE" | jq -e '.success == true and .data.type == "CREDIT_OVERLOAD" and .data.status == "SUBMITTED"' >/dev/null

echo "==> Advisor sees only the owned request"
student_request "${TMP_DIR}/advisor.cookies" GET "/governance/advisor/requests" \
  | jq -e '.success == true and (.data | length) == 1 and .data[0].id == "'"${REQUEST_ID}"'" and .data[0].student.email == "student1@sis.edu"' >/dev/null

echo "==> Advisor approves request"
student_request "${TMP_DIR}/advisor.cookies" POST "/governance/advisor/requests/${REQUEST_ID}/decision" '{"decision":"APPROVED","decisionNote":"Approved during clean-db governance rehearsal."}' \
  | jq -e '.success == true and .data.status == "APPROVED"' >/dev/null

echo "==> Student1 sees approved request"
student_request "${TMP_DIR}/student1.cookies" GET "/governance/my-requests?termId=seed-term-fall-2026" \
  | jq -e '.success == true and (.data | map(select(.id == "'"${REQUEST_ID}"'" and .status == "APPROVED")) | length) == 1' >/dev/null

echo "==> Approved overload changes precheck outcome"
student_request "${TMP_DIR}/student1.cookies" POST "/registration/precheck" '{"termId":"seed-term-fall-2026"}' \
  | jq -e '.success == true and .data.ok == true and (.data.issues | length) == 0' >/dev/null

echo "==> Clean governance rehearsal passed"
