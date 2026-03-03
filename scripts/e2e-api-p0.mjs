import assert from "node:assert/strict";

const API_URL = process.env.API_URL || "http://localhost:4000";

const ADMIN_IDENTIFIER = process.env.SMOKE_ADMIN_IDENTIFIER || "admin@university.edu";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "Admin123!";
const STUDENT1_IDENTIFIER = process.env.SMOKE_STUDENT_IDENTIFIER || "S1001";
const STUDENT1_PASSWORD = process.env.SMOKE_STUDENT_PASSWORD || "Student123!";
const STUDENT2_IDENTIFIER = process.env.SMOKE_STUDENT2_IDENTIFIER || "S1002";
const STUDENT2_PASSWORD = process.env.SMOKE_STUDENT2_PASSWORD || "Student123!";

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  applySetCookie(headers) {
    const fromUndici = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    const fallback = headers.get("set-cookie");
    const setCookies = fromUndici.length > 0 ? fromUndici : fallback ? [fallback] : [];

    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const eqIndex = pair.indexOf("=");
      if (eqIndex <= 0) continue;
      const name = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      if (value) this.cookies.set(name, value);
    }
  }

  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const cookie = this.cookieHeader();
    if (cookie) {
      headers.cookie = cookie;
    }

    let body;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body
    });

    this.applySetCookie(response.headers);

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    return {
      status: response.status,
      ok: response.ok,
      payload
    };
  }

  async expectSuccess(path, options = {}) {
    const res = await this.request(path, options);
    if (!res.ok || !res.payload?.success) {
      throw new Error(
        `Expected success for ${options.method || "GET"} ${path} but got ${res.status}: ${JSON.stringify(res.payload)}`
      );
    }
    return res.payload.data;
  }

  async expectError(path, expectedCode, options = {}) {
    const res = await this.request(path, options);
    if (res.ok || res.payload?.success !== false) {
      throw new Error(`Expected error for ${options.method || "GET"} ${path} but got success: ${JSON.stringify(res.payload)}`);
    }

    const code = res.payload?.error?.code;
    if (code !== expectedCode) {
      throw new Error(
        `Expected error code ${expectedCode} for ${options.method || "GET"} ${path}, got ${code}. Payload=${JSON.stringify(res.payload)}`
      );
    }

    return res.payload.error;
  }
}

async function login(client, identifier, password) {
  const data = await client.expectSuccess("/auth/login", {
    method: "POST",
    body: { identifier, password }
  });
  return data;
}

async function clearCart(client, termId) {
  const cart = await client.expectSuccess(`/registration/cart?termId=${termId}`);
  for (const item of cart) {
    await client.expectSuccess(`/registration/cart/${item.id}`, { method: "DELETE" });
  }
}

async function addAndPrecheck(client, termId, sectionId) {
  await client.expectSuccess("/registration/cart", {
    method: "POST",
    body: { termId, sectionId }
  });

  return client.expectSuccess("/registration/precheck", {
    method: "POST",
    body: { termId }
  });
}

function findIssue(precheck, reasonCode) {
  return (precheck.issues || []).find((issue) => issue.reasonCode === reasonCode);
}

async function main() {
  const suffix = `${Date.now()}`;
  const now = new Date();

  const admin = new ApiClient(API_URL);
  const student1 = new ApiClient(API_URL);
  const student2 = new ApiClient(API_URL);

  console.log("Logging in admin and students...");
  await login(admin, ADMIN_IDENTIFIER, ADMIN_PASSWORD);
  await login(student1, STUDENT1_IDENTIFIER, STUDENT1_PASSWORD);
  await login(student2, STUDENT2_IDENTIFIER, STUDENT2_PASSWORD);

  console.log("Creating dedicated E2E term/courses/sections...");
  const term = await admin.expectSuccess("/admin/terms", {
    method: "POST",
    body: {
      name: `E2E-P0-${suffix}`,
      startDate: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000).toISOString(),
      registrationOpenAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      registrationCloseAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      dropDeadline: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
      maxCredits: 6,
      timezone: "America/Phoenix"
    }
  });

  const baseCourse = await admin.expectSuccess("/admin/courses", {
    method: "POST",
    body: { code: `E2B${suffix.slice(-4)}`, title: "E2E Base Course", credits: 3, prerequisiteCourseIds: [] }
  });

  const advancedCourse = await admin.expectSuccess("/admin/courses", {
    method: "POST",
    body: {
      code: `E2A${suffix.slice(-4)}`,
      title: "E2E Advanced Course",
      credits: 3,
      prerequisiteCourseIds: [baseCourse.id]
    }
  });

  const conflictCourse = await admin.expectSuccess("/admin/courses", {
    method: "POST",
    body: { code: `E2C${suffix.slice(-4)}`, title: "E2E Conflict Course", credits: 3, prerequisiteCourseIds: [] }
  });

  const heavyCourse = await admin.expectSuccess("/admin/courses", {
    method: "POST",
    body: { code: `E2H${suffix.slice(-4)}`, title: "E2E Heavy Course", credits: 4, prerequisiteCourseIds: [] }
  });

  const approvalCourse = await admin.expectSuccess("/admin/courses", {
    method: "POST",
    body: { code: `E2P${suffix.slice(-4)}`, title: "E2E Approval Course", credits: 3, prerequisiteCourseIds: [] }
  });

  const futureStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const pastStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const baseSection = await admin.expectSuccess("/admin/sections", {
    method: "POST",
    body: {
      termId: term.id,
      courseId: baseCourse.id,
      sectionCode: `BASE-${suffix.slice(-4)}`,
      modality: "ON_CAMPUS",
      capacity: 10,
      credits: 3,
      instructorName: "E2E Instructor",
      location: "B-101",
      requireApproval: false,
      startDate: futureStart,
      meetingTimes: [{ weekday: 1, startMinutes: 540, endMinutes: 600 }]
    }
  });

  const advancedSection = await admin.expectSuccess("/admin/sections", {
    method: "POST",
    body: {
      termId: term.id,
      courseId: advancedCourse.id,
      sectionCode: `ADV-${suffix.slice(-4)}`,
      modality: "ON_CAMPUS",
      capacity: 10,
      credits: 3,
      instructorName: "E2E Instructor",
      location: "B-102",
      requireApproval: false,
      startDate: futureStart,
      meetingTimes: [{ weekday: 2, startMinutes: 540, endMinutes: 600 }]
    }
  });

  const conflictSection = await admin.expectSuccess("/admin/sections", {
    method: "POST",
    body: {
      termId: term.id,
      courseId: conflictCourse.id,
      sectionCode: `CON-${suffix.slice(-4)}`,
      modality: "ON_CAMPUS",
      capacity: 10,
      credits: 3,
      instructorName: "E2E Instructor",
      location: "B-103",
      requireApproval: false,
      startDate: futureStart,
      meetingTimes: [{ weekday: 1, startMinutes: 555, endMinutes: 615 }]
    }
  });

  const heavySection = await admin.expectSuccess("/admin/sections", {
    method: "POST",
    body: {
      termId: term.id,
      courseId: heavyCourse.id,
      sectionCode: `HEV-${suffix.slice(-4)}`,
      modality: "ONLINE",
      capacity: 10,
      credits: 4,
      instructorName: "E2E Instructor",
      location: "Online",
      requireApproval: false,
      startDate: futureStart,
      meetingTimes: [{ weekday: 4, startMinutes: 780, endMinutes: 840 }]
    }
  });

  const approvalSection = await admin.expectSuccess("/admin/sections", {
    method: "POST",
    body: {
      termId: term.id,
      courseId: approvalCourse.id,
      sectionCode: `APP-${suffix.slice(-4)}`,
      modality: "HYBRID",
      capacity: 10,
      credits: 3,
      instructorName: "E2E Instructor",
      location: "B-104",
      requireApproval: true,
      startDate: futureStart,
      meetingTimes: [{ weekday: 3, startMinutes: 540, endMinutes: 600 }]
    }
  });

  const startedSection = await admin.expectSuccess("/admin/sections", {
    method: "POST",
    body: {
      termId: term.id,
      courseId: conflictCourse.id,
      sectionCode: `PST-${suffix.slice(-4)}`,
      modality: "ON_CAMPUS",
      capacity: 10,
      credits: 3,
      instructorName: "E2E Instructor",
      location: "B-105",
      requireApproval: false,
      startDate: pastStart,
      meetingTimes: [{ weekday: 5, startMinutes: 600, endMinutes: 660 }]
    }
  });

  const fullSection = await admin.expectSuccess("/admin/sections", {
    method: "POST",
    body: {
      termId: term.id,
      courseId: conflictCourse.id,
      sectionCode: `FUL-${suffix.slice(-4)}`,
      modality: "ON_CAMPUS",
      capacity: 1,
      credits: 3,
      instructorName: "E2E Instructor",
      location: "B-106",
      requireApproval: false,
      startDate: futureStart,
      meetingTimes: [{ weekday: 5, startMinutes: 780, endMinutes: 840 }]
    }
  });

  console.log("Validating registration rules...");

  await clearCart(student1, term.id);

  let precheck = await addAndPrecheck(student1, term.id, advancedSection.id);
  assert.equal(Boolean(findIssue(precheck, "PREREQUISITE_NOT_MET")), true, "Expected PREREQUISITE_NOT_MET");
  await clearCart(student1, term.id);

  precheck = await addAndPrecheck(student1, term.id, startedSection.id);
  assert.equal(Boolean(findIssue(precheck, "SECTION_ALREADY_STARTED")), true, "Expected SECTION_ALREADY_STARTED");
  await clearCart(student1, term.id);

  await student1.expectSuccess("/registration/cart", {
    method: "POST",
    body: { termId: term.id, sectionId: baseSection.id }
  });
  precheck = await student1.expectSuccess("/registration/precheck", {
    method: "POST",
    body: { termId: term.id }
  });
  assert.equal(precheck.ok, true, "Expected base section precheck ok");
  const baseSubmit = await student1.expectSuccess("/registration/submit", {
    method: "POST",
    body: { termId: term.id }
  });
  assert.equal(baseSubmit.some((item) => item.sectionId === baseSection.id && item.status === "ENROLLED"), true);

  precheck = await addAndPrecheck(student1, term.id, conflictSection.id);
  assert.equal(Boolean(findIssue(precheck, "TIME_CONFLICT")), true, "Expected TIME_CONFLICT");
  await clearCart(student1, term.id);

  precheck = await addAndPrecheck(student1, term.id, heavySection.id);
  assert.equal(Boolean(findIssue(precheck, "CREDIT_LIMIT_EXCEEDED")), true, "Expected CREDIT_LIMIT_EXCEEDED");
  await clearCart(student1, term.id);

  precheck = await addAndPrecheck(student1, term.id, approvalSection.id);
  assert.equal(precheck.ok, true, "Expected approval section precheck ok");
  assert.equal(
    precheck.preview.some((item) => item.sectionId === approvalSection.id && item.status === "PENDING_APPROVAL"),
    true,
    "Expected PENDING_APPROVAL preview"
  );
  const approvalSubmit = await student1.expectSuccess("/registration/submit", {
    method: "POST",
    body: { termId: term.id }
  });
  assert.equal(
    approvalSubmit.some((item) => item.sectionId === approvalSection.id && item.status === "PENDING_APPROVAL"),
    true,
    "Expected PENDING_APPROVAL result"
  );

  console.log("Validating capacity, waitlist and promote flow...");
  await clearCart(student2, term.id);
  await student2.expectSuccess("/registration/cart", {
    method: "POST",
    body: { termId: term.id, sectionId: fullSection.id }
  });
  const fullSeatSubmit = await student2.expectSuccess("/registration/submit", {
    method: "POST",
    body: { termId: term.id }
  });
  assert.equal(fullSeatSubmit.some((item) => item.sectionId === fullSection.id && item.status === "ENROLLED"), true);

  await clearCart(student1, term.id);
  await student1.expectSuccess("/registration/cart", {
    method: "POST",
    body: { termId: term.id, sectionId: fullSection.id }
  });
  const waitlistSubmit = await student1.expectSuccess("/registration/submit", {
    method: "POST",
    body: { termId: term.id }
  });
  assert.equal(waitlistSubmit.some((item) => item.sectionId === fullSection.id && item.status === "WAITLISTED"), true);

  const student2Enrollments = await student2.expectSuccess(`/registration/enrollments?termId=${term.id}`);
  const student2FullEnrollment = student2Enrollments.find(
    (item) => item.sectionId === fullSection.id && item.status === "ENROLLED"
  );
  assert.ok(student2FullEnrollment, "Expected student2 full section enrollment");

  const dropResponse = await student2.expectSuccess("/registration/drop", {
    method: "POST",
    body: { enrollmentId: student2FullEnrollment.id }
  });
  assert.equal(dropResponse.seatFreed, true, "Expected seatFreed=true after ENROLLED drop");

  const promoteResult = await admin.expectSuccess("/admin/waitlist/promote", {
    method: "POST",
    body: { sectionId: fullSection.id, count: 1 }
  });
  assert.equal(promoteResult.promotedCount, 1, "Expected one waitlist promotion");
  assert.equal(promoteResult.remainingWaitlistCount, 0, "Expected empty waitlist after promotion");

  console.log("Validating drop deadline rule...");
  await admin.expectSuccess(`/admin/terms/${term.id}`, {
    method: "PATCH",
    body: {
      dropDeadline: new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    }
  });

  const student1Enrollments = await student1.expectSuccess(`/registration/enrollments?termId=${term.id}`);
  const student1BaseEnrollment = student1Enrollments.find(
    (item) => item.sectionId === baseSection.id && item.status === "ENROLLED"
  );
  assert.ok(student1BaseEnrollment, "Expected student1 ENROLLED section for drop deadline test");

  await student1.expectError("/registration/drop", "DROP_DEADLINE_PASSED", {
    method: "POST",
    body: { enrollmentId: student1BaseEnrollment.id }
  });

  console.log("Validating CSV import fail-fast...");
  const csvError = await admin.expectError("/admin/import/students", "CSV_ROW_INVALID", {
    method: "POST",
    body: {
      csv: "email,studentId,legalName\ninvalid-email,S9X01,\n"
    }
  });
  assert.equal(Array.isArray(csvError.details), true, "Expected CSV validation details array");
  assert.equal(csvError.details.length > 0, true, "Expected non-empty CSV validation details");

  console.log("P0 API rule checks passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
