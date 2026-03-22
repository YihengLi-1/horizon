import {
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildEnrollmentSubmissionEmail,
  buildWaitlistPromotionEmail,
  buildGradePostedEmail
} from "./notification.templates";

describe("buildVerificationEmail", () => {
  it("returns correct subject", () => {
    const { subject } = buildVerificationEmail({ activationLink: "https://sis.test/activate?t=abc" });
    expect(subject).toBe("Verify your SIS account");
  });

  it("includes activation link in html and text", () => {
    const { html, text } = buildVerificationEmail({ activationLink: "https://sis.test/activate?t=abc" });
    expect(html).toContain("https://sis.test/activate?t=abc");
    expect(text).toContain("https://sis.test/activate?t=abc");
  });

  it("greets by name when legalName provided", () => {
    const { html, text } = buildVerificationEmail({
      legalName: "Alice Wang",
      activationLink: "https://sis.test/activate"
    });
    expect(html).toContain("Alice Wang");
    expect(text).toContain("Alice Wang");
  });

  it("uses generic greeting when legalName is null", () => {
    const { html } = buildVerificationEmail({ legalName: null, activationLink: "https://sis.test" });
    expect(html).toContain("Hello,");
  });

  it("escapes XSS in legalName", () => {
    const { html } = buildVerificationEmail({
      legalName: "<script>alert(1)</script>",
      activationLink: "https://sis.test"
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildPasswordResetEmail", () => {
  it("includes reset link and expiry", () => {
    const { html, text, subject } = buildPasswordResetEmail({
      resetLink: "https://sis.test/reset?t=tok",
      expiresMinutes: 60
    });
    expect(subject).toBe("Reset your SIS password");
    expect(html).toContain("https://sis.test/reset?t=tok");
    expect(text).toContain("60 minute");
  });
});

describe("buildEnrollmentSubmissionEmail", () => {
  const items = [
    { courseCode: "CS101", sectionCode: "001", status: "ENROLLED", waitlistPosition: null },
    { courseCode: "MATH201", sectionCode: "002", status: "WAITLISTED", waitlistPosition: 3 }
  ];

  it("includes term name and all courses", () => {
    const { subject, html, text } = buildEnrollmentSubmissionEmail({
      legalName: "Bob Li",
      termName: "Fall 2026",
      items
    });
    expect(subject).toContain("Fall 2026");
    expect(html).toContain("CS101");
    expect(html).toContain("MATH201");
    expect(text).toContain("WAITLISTED");
  });

  it("shows waitlist position for waitlisted items", () => {
    const { html, text } = buildEnrollmentSubmissionEmail({ termName: "Fall 2026", items });
    expect(html).toContain("#3");
    expect(text).toContain("#3");
  });

  it("does not show waitlist position for non-waitlisted", () => {
    const { html } = buildEnrollmentSubmissionEmail({ termName: "Fall 2026", items });
    // CS101 item should not have a waitlist position marker; use [^<]* to stay within the <li>
    expect(html).not.toMatch(/CS101 001[^<]*#\d/);
  });
});

describe("buildWaitlistPromotionEmail", () => {
  it("contains course info", () => {
    const { subject, html, text } = buildWaitlistPromotionEmail({
      legalName: "Carol Chen",
      termName: "Spring 2027",
      courseCode: "CS201",
      sectionCode: "002"
    });
    expect(subject).toContain("waitlist");
    expect(html).toContain("CS201");
    expect(text).toContain("Spring 2027");
  });
});

describe("buildGradePostedEmail", () => {
  it("includes grade and course", () => {
    const { subject, html, text } = buildGradePostedEmail({
      legalName: "Dave Kim",
      termName: "Fall 2026",
      courseCode: "CS301",
      sectionCode: "003",
      finalGrade: "A"
    });
    expect(subject).toContain("grade");
    expect(html).toContain("A");
    expect(text).toContain("CS301");
    expect(text).toContain("A");
  });

  it("escapes XSS in finalGrade", () => {
    const { html } = buildGradePostedEmail({
      termName: "Fall 2026",
      courseCode: "CS301",
      sectionCode: "003",
      finalGrade: "<b>A+</b>"
    });
    expect(html).not.toContain("<b>");
  });
});
