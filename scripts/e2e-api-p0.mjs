import assert from 'node:assert/strict';

const BASE = process.env.API_URL ?? 'http://localhost:4000';
const ADMIN_IDENTIFIER = process.env.SMOKE_ADMIN_IDENTIFIER ?? 'admin@univ.edu';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? 'Admin1234!';
const STUDENT_PASSWORD = process.env.SMOKE_STUDENT_PASSWORD ?? 'Student1234!';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME ?? 'sis-csrf';
const CSRF_HEADER_NAME = process.env.CSRF_HEADER_NAME ?? 'x-csrf-token';

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m'
};

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  applySetCookie(headers) {
    const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    const fallback = headers.get('set-cookie');
    const setCookies = raw.length > 0 ? raw : fallback ? [fallback] : [];

    for (const item of setCookies) {
      const [pair] = item.split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.cookies.set(name, value);
    }
  }

  async request(path, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    const cookie = this.cookieHeader();
    if (cookie) {
      headers.cookie = cookie;
    }
    if (options.csrf) {
      const token = this.cookies.get(CSRF_COOKIE_NAME);
      if (token) {
        headers[CSRF_HEADER_NAME] = token;
      }
    }

    let body;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body
    });

    this.applySetCookie(response.headers);
    const text = await response.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }

    return { status: response.status, ok: response.ok, json };
  }
}

let passed = 0;
let failed = 0;
const SHOULD_BAIL = process.argv.includes('--bail');

async function step(label, fn) {
  process.stdout.write(`${C.cyan}→${C.reset} ${label}\n`);
  try {
    await fn();
    passed += 1;
    process.stdout.write(`${C.green}✓${C.reset} ${label}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`${C.red}✗${C.reset} ${label}\n`);
    process.stdout.write(`${C.yellow}${String(error instanceof Error ? error.message : error)}${C.reset}\n`);
    if (SHOULD_BAIL) {
      process.exit(1);
    }
  }
}

function unwrapData(result) {
  if (!result.ok) {
    throw new Error(`HTTP ${result.status}: ${JSON.stringify(result.json)}`);
  }
  if (result.json && typeof result.json === 'object' && 'success' in result.json) {
    if (!result.json.success) {
      throw new Error(`API failure: ${JSON.stringify(result.json)}`);
    }
    return result.json.data;
  }
  return result.json;
}

async function main() {
  const student = new ApiClient(BASE);
  const admin = new ApiClient(BASE);
  const unique = Date.now().toString();
  const email = `smoke.${unique}@sis.test`;
  const studentId = `SMK${unique.slice(-8)}`;
  let activationLink = null;
  let selectedTermId = null;
  let selectedSectionId = null;
  let studentLoggedOut = false;
  let inviteCode = process.env.SMOKE_INVITE_CODE ?? '';

  async function ensureAdminSession() {
    if (admin.cookies.get('access_token')) {
      return;
    }
    const res = await admin.request('/auth/login', {
      method: 'POST',
      body: { identifier: ADMIN_IDENTIFIER, password: ADMIN_PASSWORD }
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = unwrapData(res);
    assert.equal(data?.email, ADMIN_IDENTIFIER, 'Admin login payload mismatch');
  }

  async function ensureInviteCode() {
    if (inviteCode) {
      return inviteCode;
    }
    await ensureAdminSession();
    await admin.request('/auth/csrf-token');
    const code = `SMOKE-${Date.now()}`;
    const res = await admin.request('/admin/invite-codes', {
      method: 'POST',
      csrf: true,
      body: {
        code,
        active: true
      }
    });
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    const data = unwrapData(res);
    inviteCode = data?.code ?? code;
    return inviteCode;
  }

  async function ensureStudentSession() {
    if (!studentLoggedOut && student.cookies.get('access_token')) {
      return;
    }
    const res = await student.request('/auth/login', {
      method: 'POST',
      body: { identifier: email, password: STUDENT_PASSWORD }
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = unwrapData(res);
    assert.equal(data?.email, email, 'Missing logged-in user payload');
    studentLoggedOut = false;
  }

  await step('1. POST /auth/register → 201', async () => {
    const nextInviteCode = await ensureInviteCode();
    const res = await student.request('/auth/register', {
      method: 'POST',
      body: {
        email,
        legalName: 'Smoke Student',
        studentId,
        password: STUDENT_PASSWORD,
        inviteCode: nextInviteCode
      }
    });
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    const data = unwrapData(res);
    activationLink = typeof data?.activationLink === 'string' ? data.activationLink : null;
  });

  await step('2. POST /auth/login → 200', async () => {
    if (activationLink) {
      const token = activationLink.split('token=')[1];
      assert.ok(token, 'Missing verification token in activationLink');
      const verifyRes = await fetch(`${BASE}/auth/verify-email?token=${encodeURIComponent(token)}`);
      assert.equal(verifyRes.status, 200, `Email verification failed with ${verifyRes.status}`);
    }
    const res = await student.request('/auth/login', {
      method: 'POST',
      body: { identifier: email, password: STUDENT_PASSWORD }
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = unwrapData(res);
    assert.equal(data?.email, email, 'Missing logged-in user payload');
    assert.ok(student.cookies.get('access_token'), 'Missing access_token cookie');
    studentLoggedOut = false;
  });

  await step('3. GET /academics/terms → array', async () => {
    const res = await student.request('/academics/terms');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
    const now = Date.now();
    const selectedTerm =
      data.find((term) => {
        const openAt = term?.registrationOpenAt ? Date.parse(term.registrationOpenAt) : NaN;
        const closeAt = term?.registrationCloseAt ? Date.parse(term.registrationCloseAt) : NaN;
        return Number.isFinite(openAt) && Number.isFinite(closeAt) && openAt <= now && closeAt >= now;
      }) ?? data[0];
    selectedTermId = selectedTerm?.id ?? null;
  });

  await step('4. GET /students/notifications → array', async () => {
    const res = await student.request('/students/notifications');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('5. GET /students/transcript → array', async () => {
    const res = await student.request('/students/transcript');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('6. GET /students/cart → array', async () => {
    const res = await student.request('/students/cart');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('7. GET /ops/ready → ready/ok', async () => {
    const res = await student.request('/ops/ready');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json?.status === 'ready' || res.json?.status === 'ok', `Unexpected payload: ${JSON.stringify(res.json)}`);
  });

  await step('8. POST /auth/logout → 200', async () => {
    await student.request('/auth/csrf-token');
    const res = await student.request('/auth/logout', { method: 'POST', csrf: true });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    unwrapData(res);
    studentLoggedOut = true;
  });

  await step('9. POST /auth/login admin → 200', async () => {
    const res = await admin.request('/auth/login', {
      method: 'POST',
      body: { identifier: ADMIN_IDENTIFIER, password: ADMIN_PASSWORD }
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = unwrapData(res);
    assert.equal(data?.email, ADMIN_IDENTIFIER, 'Admin login payload mismatch');
  });

  await step('10. GET /admin/students?page=1 → { data, total }', async () => {
    const res = await admin.request('/admin/students?page=1');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data?.data), 'Expected data array');
    assert.equal(typeof data?.total, 'number', 'Expected numeric total');
  });

  await step('11. GET /admin/reports → 200', async () => {
    const res = await admin.request('/admin/reports');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    unwrapData(res);
  });

  await step('12. GET /api/docs-json → has openapi', async () => {
    const res = await admin.request('/api/docs-json');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json?.openapi, 'Missing openapi key');
  });

  await step('13. GET /students/recommended → array', async () => {
    await ensureStudentSession();
    const res = await student.request('/students/recommended');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('14. GET /admin/stats/enrollment-trend?days=7 → array', async () => {
    const res = await admin.request('/admin/stats/enrollment-trend?days=7');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('15. GET /admin/stats/top-sections → array', async () => {
    const res = await admin.request('/admin/stats/top-sections');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('16. GET /ops/version → has version', async () => {
    const res = await admin.request('/ops/version');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(typeof res.json?.version, 'string', 'Missing version key');
  });

  await step('17. POST /registration/cart → 200 or 409', async () => {
    if (!selectedTermId) {
      return;
    }
    await ensureStudentSession();
    const sectionsRes = await student.request(`/academics/sections?termId=${encodeURIComponent(selectedTermId)}`);
    const sections = unwrapData(sectionsRes);
    assert.ok(Array.isArray(sections), 'Expected sections array');
    selectedSectionId = sections[0]?.id ?? null;
    if (!selectedSectionId) {
      return;
    }
    const res = await student.request('/registration/cart', {
      method: 'POST',
      csrf: true,
      body: {
        sectionId: selectedSectionId
      }
    });
    assert.ok([200, 201, 400, 409].includes(res.status), `Expected 200/201/400/409, got ${res.status}`);
  });

  await step('18. GET /registration/cart → array', async () => {
    if (!selectedTermId) {
      return;
    }
    await ensureStudentSession();
    const res = await student.request(`/registration/cart?termId=${encodeURIComponent(selectedTermId)}`);
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('19. GET /registration/schedule → array', async () => {
    if (!selectedTermId) {
      return;
    }
    await ensureStudentSession();
    const res = await student.request(`/registration/schedule?termId=${encodeURIComponent(selectedTermId)}`);
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('20. GET /admin/stats/gpa-distribution → array', async () => {
    const res = await admin.request('/admin/stats/gpa-distribution');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
    assert.ok(data.every((item) => typeof item?.tier === 'string'), 'Expected tier field');
  });

  await step('21. GET /admin/stats/dept-breakdown → array', async () => {
    const res = await admin.request('/admin/stats/dept-breakdown');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data), 'Expected array');
  });

  await step('22. GET /admin/notification-log → { data, total }', async () => {
    const res = await admin.request('/admin/notification-log');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data?.data), 'Expected data array');
    assert.equal(typeof data?.total, 'number', 'Expected numeric total');
  });

  await step('23. GET /admin/students?page=1 → { data, total }', async () => {
    const res = await admin.request('/admin/students?page=1');
    const data = unwrapData(res);
    assert.ok(Array.isArray(data?.data), 'Expected data array');
    assert.equal(typeof data?.total, 'number', 'Expected numeric total');
  });

  await step('24. GET /ops/version → has version, nodeEnv, uptime', async () => {
    const res = await admin.request('/ops/version');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(typeof res.json?.version, 'string', 'Missing version key');
    assert.equal(typeof res.json?.nodeEnv, 'string', 'Missing nodeEnv key');
    assert.equal(typeof res.json?.uptime, 'number', 'Missing uptime key');
  });

  process.stdout.write(`\nSummary: ${passed}/24 passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`${C.red}Fatal:${C.reset} ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
