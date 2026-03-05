import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import {
  buildEnrollmentSubmissionEmail,
  buildGradePostedEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  buildWaitlistPromotionEmail
} from "../mail/templates/notification.templates";

type MailEnvelope = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly from = process.env.SMTP_FROM || "noreply@horizon-sis.local";
  private readonly enabled = this.resolveEnabled();
  private readonly transporter: Transporter | null = this.createTransport();

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
      this.logger.warn("MAIL_ENABLED=true but SMTP_HOST/SMTP_USER/SMTP_PASS missing. Email delivery disabled.");
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

  private async send(envelope: MailEnvelope): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`Email skipped (delivery disabled): to=${envelope.to} subject=${envelope.subject}`);
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
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email error";
      this.logger.error(`Email delivery failed: to=${envelope.to} subject=${envelope.subject} error=${message}`);
      return false;
    }
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
}
