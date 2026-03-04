import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.WEB_URL || "http://localhost:3000";
const OUT_DIR = process.env.E2E_OUT_DIR || "/tmp/sis-e2e-critical";

const STUDENT_IDENTIFIER = process.env.SMOKE_STUDENT_IDENTIFIER || "S1001";
const STUDENT_PASSWORD = process.env.SMOKE_STUDENT_PASSWORD || "Student123!";
const ADMIN_IDENTIFIER = process.env.SMOKE_ADMIN_IDENTIFIER || "admin@university.edu";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "Admin123!";

const RUNTIME_MARKERS = [
  "Unhandled Runtime Error",
  "Cannot find module",
  "Cannot read properties of undefined",
  "NEXT_NOT_FOUND",
  "Module not found"
];

mkdirSync(OUT_DIR, { recursive: true });

function slug(input) {
  return input.replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "").toLowerCase();
}

async function waitForStable(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

async function assertNoRuntimeOverlay(page, label) {
  const bodyText = await page.locator("body").innerText();
  for (const marker of RUNTIME_MARKERS) {
    if (bodyText.includes(marker)) {
      throw new Error(`[${label}] runtime marker detected: ${marker}`);
    }
  }
}

async function assertText(page, text, label) {
  const count = await page.getByText(text, { exact: false }).count();
  if (count === 0) {
    throw new Error(`[${label}] expected text not found: ${text}`);
  }
}

async function openChecked(page, route, label, requiredTexts = []) {
  const url = `${BASE_URL}${route}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForStable(page);
  await assertNoRuntimeOverlay(page, label);
  for (const text of requiredTexts) {
    await assertText(page, text, label);
  }
  const file = path.join(OUT_DIR, `${slug(label)}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[${label}] OK`);
}

async function fillCredentials(page, identifier, password, role) {
  const inputs = page.locator("form input");
  if ((await inputs.count()) >= 2) {
    await inputs.nth(0).fill(identifier);
    await inputs.nth(1).fill(password);
    return;
  }

  const demoButtonLabel = role === "student" ? "Fill Student" : "Fill Admin";
  const demoButton = page.getByRole("button", { name: demoButtonLabel, exact: true });
  if ((await demoButton.count()) > 0) {
    await demoButton.click();
    return;
  }

  throw new Error("Login form inputs not found.");
}

async function login(page, role) {
  const identifier = role === "student" ? STUDENT_IDENTIFIER : ADMIN_IDENTIFIER;
  const password = role === "student" ? STUDENT_PASSWORD : ADMIN_PASSWORD;

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await waitForStable(page);

  await fillCredentials(page, identifier, password, role);

  await Promise.all([
    page.waitForURL(/\/student\/|\/admin\//, { timeout: 20000 }),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);

  const finalUrl = page.url();
  if (role === "student" && !finalUrl.includes("/student/")) {
    throw new Error(`Student login did not redirect to student area. Current URL: ${finalUrl}`);
  }
  if (role === "admin" && !finalUrl.includes("/admin/")) {
    throw new Error(`Admin login did not redirect to admin area. Current URL: ${finalUrl}`);
  }
}

async function runStudentSuite(browser) {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1020 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("chrome-extension://") && !text.includes("net::ERR_FILE_NOT_FOUND")) {
        consoleErrors.push(text);
      }
    }
  });

  await login(page, "student");

  await openChecked(page, "/student/dashboard", "student-dashboard", ["Dashboard"]);
  await openChecked(page, "/student/catalog", "student-catalog", ["Course Catalog", "Catalog Summary"]);
  await openChecked(page, "/student/cart", "student-cart", ["Registration Cart", "Submit Readiness"]);
  await openChecked(page, "/student/schedule", "student-schedule", ["Class Schedule", "Week View (Mon-Fri, 08:00-18:00)"]);
  await openChecked(page, "/student/grades", "student-grades", ["Grades"]);
  await openChecked(page, "/student/profile", "student-profile", ["Student Profile", "Personal Information"]);

  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(
      `Student suite client errors detected. pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}`
    );
  }

  await context.close();
}

async function runAdminSuite(browser) {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1020 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];

  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (!text.includes("chrome-extension://") && !text.includes("net::ERR_FILE_NOT_FOUND")) {
        consoleErrors.push(text);
      }
    }
  });

  await login(page, "admin");

  await openChecked(page, "/admin/dashboard", "admin-dashboard", ["Dashboard"]);
  await openChecked(page, "/admin/sections", "admin-sections", ["Sections Management", "Promotion Control"]);
  await openChecked(page, "/admin/students", "admin-students", ["Students", "Student Records"]);
  await openChecked(page, "/admin/courses", "admin-courses", ["Courses"]);
  await openChecked(page, "/admin/terms", "admin-terms", ["Terms", "Academic Calendar Control"]);
  await openChecked(page, "/admin/enrollments", "admin-enrollments", ["Enrollments & Grades"]);
  await openChecked(page, "/admin/waitlist", "admin-waitlist", ["Waitlist"]);
  await openChecked(page, "/admin/invite-codes", "admin-invite-codes", ["Invite Codes"]);
  await openChecked(page, "/admin/audit-logs", "admin-audit-logs", ["Audit Logs"]);
  await openChecked(page, "/admin/import", "admin-import", ["CSV Import", "Import target"]);

  if (pageErrors.length > 0 || consoleErrors.length > 0) {
    throw new Error(
      `Admin suite client errors detected. pageErrors=${pageErrors.length}, consoleErrors=${consoleErrors.length}`
    );
  }

  await context.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    console.log(`Running critical E2E checks against ${BASE_URL}`);
    console.log(`Screenshots will be written to ${OUT_DIR}`);

    await runStudentSuite(browser);
    await runAdminSuite(browser);

    console.log("Critical E2E checks passed.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
