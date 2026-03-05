function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, body: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;">
        <h2 style="margin:0 0 12px 0;color:#0f172a;">${escapeHtml(title)}</h2>
        ${body}
        <p style="margin-top:20px;font-size:12px;color:#64748b;">Horizon SIS Notifications</p>
      </div>
    </div>
  `;
}

export function buildVerificationEmail(input: {
  legalName?: string | null;
  activationLink: string;
}): { subject: string; html: string; text: string } {
  const greeting = input.legalName ? `Hello ${escapeHtml(input.legalName)},` : "Hello,";
  const subject = "Verify your SIS account";
  const html = page(
    subject,
    `<p style="color:#334155;">${greeting}</p>
     <p style="color:#334155;">Your account is ready. Please verify your email to activate login access.</p>
     <p><a href="${escapeHtml(input.activationLink)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">Verify Email</a></p>
     <p style="font-size:12px;color:#64748b;word-break:break-all;">If the button does not work, use this link: ${escapeHtml(input.activationLink)}</p>`
  );
  const text = `${input.legalName ? `Hello ${input.legalName},\n\n` : ""}Verify your SIS account using this link:\n${input.activationLink}`;
  return { subject, html, text };
}

export function buildPasswordResetEmail(input: {
  resetLink: string;
  expiresMinutes: number;
}): { subject: string; html: string; text: string } {
  const subject = "Reset your SIS password";
  const html = page(
    subject,
    `<p style="color:#334155;">A password reset was requested for your account.</p>
     <p><a href="${escapeHtml(input.resetLink)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">Reset Password</a></p>
     <p style="color:#334155;">This link expires in ${input.expiresMinutes} minute(s).</p>
     <p style="font-size:12px;color:#64748b;word-break:break-all;">If the button does not work, use this link: ${escapeHtml(input.resetLink)}</p>`
  );
  const text = `Reset your SIS password using this link (expires in ${input.expiresMinutes} minute(s)):\n${input.resetLink}`;
  return { subject, html, text };
}

export function buildEnrollmentSubmissionEmail(input: {
  legalName?: string | null;
  termName: string;
  items: Array<{
    courseCode: string;
    sectionCode: string;
    status: string;
    waitlistPosition: number | null;
  }>;
}): { subject: string; html: string; text: string } {
  const subject = `Enrollment update for ${input.termName}`;
  const rows = input.items
    .map((item) => {
      const waitlist = item.status === "WAITLISTED" && item.waitlistPosition ? ` (#${item.waitlistPosition})` : "";
      return `<li style="margin:4px 0;color:#334155;">${escapeHtml(item.courseCode)} ${escapeHtml(item.sectionCode)} — ${escapeHtml(item.status)}${escapeHtml(waitlist)}</li>`;
    })
    .join("");

  const greeting = input.legalName ? `Hello ${escapeHtml(input.legalName)},` : "Hello,";
  const html = page(
    subject,
    `<p style="color:#334155;">${greeting}</p>
     <p style="color:#334155;">Your cart submission was processed for <strong>${escapeHtml(input.termName)}</strong>.</p>
     <ul style="padding-left:18px;">${rows}</ul>`
  );

  const lines = input.items.map((item) => {
    const waitlist = item.status === "WAITLISTED" && item.waitlistPosition ? ` (#${item.waitlistPosition})` : "";
    return `- ${item.courseCode} ${item.sectionCode}: ${item.status}${waitlist}`;
  });
  const text = `${input.legalName ? `Hello ${input.legalName},\n\n` : ""}Enrollment update for ${input.termName}:\n${lines.join("\n")}`;

  return { subject, html, text };
}

export function buildWaitlistPromotionEmail(input: {
  legalName?: string | null;
  termName: string;
  courseCode: string;
  sectionCode: string;
}): { subject: string; html: string; text: string } {
  const subject = "You have been promoted from waitlist";
  const greeting = input.legalName ? `Hello ${escapeHtml(input.legalName)},` : "Hello,";
  const html = page(
    subject,
    `<p style="color:#334155;">${greeting}</p>
     <p style="color:#334155;">Good news — you are now ENROLLED in <strong>${escapeHtml(input.courseCode)} ${escapeHtml(input.sectionCode)}</strong> for ${escapeHtml(input.termName)}.</p>`
  );
  const text = `${input.legalName ? `Hello ${input.legalName},\n\n` : ""}You were promoted from waitlist to ENROLLED: ${input.courseCode} ${input.sectionCode} (${input.termName}).`;
  return { subject, html, text };
}

export function buildGradePostedEmail(input: {
  legalName?: string | null;
  termName: string;
  courseCode: string;
  sectionCode: string;
  finalGrade: string;
}): { subject: string; html: string; text: string } {
  const subject = "A final grade has been posted";
  const greeting = input.legalName ? `Hello ${escapeHtml(input.legalName)},` : "Hello,";
  const html = page(
    subject,
    `<p style="color:#334155;">${greeting}</p>
     <p style="color:#334155;">A final grade has been posted for <strong>${escapeHtml(input.courseCode)} ${escapeHtml(input.sectionCode)}</strong> (${escapeHtml(input.termName)}):</p>
     <p style="font-size:18px;font-weight:700;color:#0f172a;">${escapeHtml(input.finalGrade)}</p>`
  );
  const text = `${input.legalName ? `Hello ${input.legalName},\n\n` : ""}Final grade posted for ${input.courseCode} ${input.sectionCode} (${input.termName}): ${input.finalGrade}`;
  return { subject, html, text };
}
