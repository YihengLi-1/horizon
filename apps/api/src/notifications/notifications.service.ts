import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import nodemailer, { type Transporter } from "nodemailer";
import {
  buildEnrollmentSubmissionEmail,
  buildGradePostedEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  buildWaitlistPromotionEmail
} from "../mail/templates/notification.templates";
import { StructuredLogger } from "../common/logger";
import { PrismaService } from "../common/prisma.service";

type MailEnvelope = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type MailHealthSnapshot = {
  enabled: boolean;
  configured: boolean;
  deliveryActive: boolean;
  attempts: number;
  sent: number;
  failed: number;
  skipped: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new StructuredLogger();
  private readonly from = process.env.SMTP_FROM || "noreply@horizon-sis.local";
  private readonly enabled = this.resolveEnabled();
  private readonly smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  private readonly transporter: Transporter | null = this.createTransport();
  private readonly health: MailHealthSnapshot = {
    enabled: this.enabled,
    configured: this.smtpConfigured,
    deliveryActive: false,
    attempts: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null
  };

  constructor(private readonly prisma: PrismaService) {
    this.health.deliveryActive = Boolean(this.transporter);
  }

  private resolveEnabled(): boolean {
    const raw = (process.env.MAIL_ENABLED || "").trim().toLowerCase();
    if (raw === "true") return true;
    if (raw === "false") return false;
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }

  private createTransport(): Transporter | null {
    if (!this.enabled) return null;

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      this.logger.warn("MAIL_ENABLED=true but SMTP_HOST/SMTP_USER/SMTP_PASS missing. Email delivery disabled.", NotificationsService.name);
      return null;
    }

    const port = Number(process.env.SMTP_PORT || 587);
    const secure = (process.env.SMTP_SECURE || "false").trim().toLowerCase() === "true";

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
  }

  getHealthSnapshot(): MailHealthSnapshot {
    return { ...this.health };
  }

  private async send(envelope: MailEnvelope): Promise<boolean> {
    this.health.attempts += 1;
    if (!this.transporter) {
      this.health.skipped += 1;
      this.health.lastFailureAt = new Date().toISOString();
      this.health.lastFailureReason = this.enabled
        ? "mail_enabled_but_smtp_not_configured"
        : "mail_disabled";
      this.logger.log(`Email skipped (delivery disabled): to=${envelope.to} subject=${envelope.subject}`, NotificationsService.name);
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: envelope.to,
        subject: envelope.subject,
        text: envelope.text,
        html: envelope.html
      });
      this.health.sent += 1;
      this.health.lastSuccessAt = new Date().toISOString();
      const user = await this.prisma.user.findFirst({
        where: { email: envelope.to, deletedAt: null },
        select: { id: true }
      }).catch(() => null);
      if (user?.id) {
        await this.prisma.notificationLog.create({
          data: {
            userId: user.id,
            type: "email",
            subject: envelope.subject ?? "",
            body: envelope.html || envelope.text || ""
          }
        }).catch(() => {});
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email error";
      this.health.failed += 1;
      this.health.lastFailureAt = new Date().toISOString();
      this.health.lastFailureReason = message;
      this.logger.error(`Email delivery failed: to=${envelope.to} subject=${envelope.subject} error=${message}`, undefined, NotificationsService.name);
      return false;
    }
  }

  async sendMail(envelope: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<boolean> {
    return this.send(envelope);
  }

  async sendVerificationEmail(input: {
    to: string;
    legalName?: string | null;
    activationLink: string;
  }): Promise<boolean> {
    return this.send({ to: input.to, ...buildVerificationEmail(input) });
  }

  async sendPasswordResetEmail(input: {
    to: string;
    resetLink: string;
    expiresMinutes: number;
  }): Promise<boolean> {
    return this.send({ to: input.to, ...buildPasswordResetEmail(input) });
  }

  async sendEnrollmentSubmissionEmail(input: {
    to: string;
    legalName?: string | null;
    termName: string;
    items: Array<{
      courseCode: string;
      sectionCode: string;
      status: string;
      waitlistPosition: number | null;
    }>;
  }): Promise<boolean> {
    return this.send({ to: input.to, ...buildEnrollmentSubmissionEmail(input) });
  }

  async sendWaitlistPromotionEmail(input: {
    to: string;
    legalName?: string | null;
    termName: string;
    courseCode: string;
    sectionCode: string;
  }): Promise<boolean> {
    return this.send({ to: input.to, ...buildWaitlistPromotionEmail(input) });
  }

  async sendGradePostedEmail(input: {
    to: string;
    legalName?: string | null;
    termName: string;
    courseCode: string;
    sectionCode: string;
    finalGrade: string;
  }): Promise<boolean> {
    return this.send({ to: input.to, ...buildGradePostedEmail(input) });
  }

  async getNotifications(userId: string) {
    type NotificationAuditRow = {
      id: string;
      action: string;
      metadata: Prisma.JsonValue | null;
      createdAt: Date;
    };

    const rows = await this.prisma.$queryRaw<NotificationAuditRow[]>(Prisma.sql`
      SELECT
        al.id,
        al.action,
        al.metadata,
        al."createdAt"
      FROM "AuditLog" al
      WHERE al."actorUserId" = ${userId}
         OR (
           UPPER(al.action) LIKE 'WAITLIST%'
           AND al.metadata ->> 'studentId' = ${userId}
         )
      ORDER BY al."createdAt" DESC
      LIMIT 30
    `);

    return rows.map((row) => {
      const metadata = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
      const action = row.action.toUpperCase();
      const courseCode =
        typeof metadata.course === "string"
          ? metadata.course
          : typeof metadata.courseCode === "string"
            ? metadata.courseCode
            : typeof metadata.sectionId === "string"
              ? metadata.sectionId
              : "课程";

      if (action.includes("WAITLIST")) {
        return {
          id: row.id,
          type: "warning",
          title: "候补名单更新",
          body: `${courseCode} 的候补状态有更新`,
          read: false,
          createdAt: row.createdAt
        };
      }
      if (action.includes("DROP")) {
        return {
          id: row.id,
          type: "error",
          title: "退课记录",
          body: `${courseCode} 已发生退课变更`,
          read: false,
          createdAt: row.createdAt
        };
      }
      if (action.includes("ENROLL")) {
        return {
          id: row.id,
          type: "success",
          title: "选课状态更新",
          body: `${courseCode} 的选课记录已更新`,
          read: false,
          createdAt: row.createdAt
        };
      }

      return {
        id: row.id,
        type: "info",
        title: row.action,
        body: typeof metadata.message === "string" ? metadata.message : "有一条新的系统记录",
        read: false,
        createdAt: row.createdAt
      };
    });
  }

  async markNotificationRead(_id: string) {
    return { ok: true };
  }

  async getUnreadCount(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "AuditLog" al
      WHERE al."actorUserId" = ${userId}
         OR (
           UPPER(al.action) LIKE 'WAITLIST%'
           AND al.metadata ->> 'studentId' = ${userId}
         )
    `);

    return { count: Number(rows[0]?.count ?? 0) };
  }
}
