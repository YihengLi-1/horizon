#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_URL="${API_URL:-http://localhost:4000}"
WEB_URL="${WEB_URL:-http://localhost:3000}"

STUDENT_IDENTIFIER="${SMOKE_STUDENT_IDENTIFIER:-student1@univ.edu}"
STUDENT_PASSWORD="${SMOKE_STUDENT_PASSWORD:-Student1234!}"
ADMIN_IDENTIFIER="${SMOKE_ADMIN_IDENTIFIER:-admin@univ.edu}"
ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:-Admin1234!}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

student_cookies="$workdir/student.cookies"
admin_cookies="$workdir/admin.cookies"

runtime_markers=(
  "Unhandled Runtime Error"
  "Cannot find module"
  "Cannot read properties of undefined"
  "NEXT_NOT_FOUND"
  "Module not found"
)

login() {
  local identifier="$1"
  local password="$2"
  local cookie_file="$3"

  local body
  body="$(curl -s -S -c "$cookie_file" -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"identifier\":\"$identifier\",\"password\":\"$password\"}")"

  if ! echo "$body" | grep -q '"success":true'; then
    echo "Login failed for $identifier"
    echo "$body"
    return 1
  fi
}

check_route() {
  local route="$1"
  local cookie_file="$2"
  local label="$3"
  local output_file="$workdir/$(echo "$label" | tr '/ ' '__').html"

  local http_code
  http_code="$(curl -s -S -b "$cookie_file" -o "$output_file" -w "%{http_code}" "$WEB_URL$route")"

  if [[ "$http_code" != "200" ]]; then
    echo "[$label] HTTP $http_code (expected 200)"
    return 1
  fi

  for marker in "${runtime_markers[@]}"; do
    if grep -qF "$marker" "$output_file"; then
      echo "[$label] runtime marker detected: $marker"
      return 1
    fi
  done

  echo "[$label] OK"
}

echo "Logging in as student and admin..."
login "$STUDENT_IDENTIFIER" "$STUDENT_PASSWORD" "$student_cookies"
login "$ADMIN_IDENTIFIER" "$ADMIN_PASSWORD" "$admin_cookies"

echo "Checking student routes..."
check_route "/student/dashboard" "$student_cookies" "student-dashboard"
check_route "/student/catalog" "$student_cookies" "student-catalog"
check_route "/student/catalog?termId=invalid-term" "$student_cookies" "student-catalog-term-query"
check_route "/student/cart" "$student_cookies" "student-cart"
check_route "/student/schedule" "$student_cookies" "student-schedule"

echo "Checking admin routes..."
check_route "/admin/dashboard" "$admin_cookies" "admin-dashboard"
check_route "/admin/sections" "$admin_cookies" "admin-sections"
check_route "/admin/import" "$admin_cookies" "admin-import"

echo "Smoke check passed."
