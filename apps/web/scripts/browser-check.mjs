import { chromium } from 'playwright';

const BASE = process.env.WEB_URL || 'http://localhost:3000';

async function collect(url, storagePath) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storagePath, viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore known browser noise from extensions and sourcemap fetches.
      if (!txt.includes('chrome-extension://') && !txt.includes('net::ERR_FILE_NOT_FOUND')) {
        consoleErrors.push(txt);
      }
    }
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await context.close();
  await browser.close();
  return { pageErrors, consoleErrors };
}

function print(label, result) {
  console.log(`\n[${label}]`);
  console.log(`pageErrors: ${result.pageErrors.length}`);
  result.pageErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  console.log(`consoleErrors: ${result.consoleErrors.length}`);
  result.consoleErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
}

const targets = [
  { label: 'student-catalog', url: `${BASE}/student/catalog`, storage: '/tmp/student-storage.json' },
  { label: 'student-cart', url: `${BASE}/student/cart`, storage: '/tmp/student-storage.json' },
  { label: 'student-schedule', url: `${BASE}/student/schedule`, storage: '/tmp/student-storage.json' },
  { label: 'admin-sections', url: `${BASE}/admin/sections`, storage: '/tmp/admin-storage.json' }
];

let hasIssue = false;
for (const target of targets) {
  const result = await collect(target.url, target.storage);
  print(target.label, result);
  if (result.pageErrors.length > 0 || result.consoleErrors.length > 0) {
    hasIssue = true;
  }
}

if (hasIssue) process.exit(1);
