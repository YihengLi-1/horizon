import { MailerService } from "@nestjs-modules/mailer";
import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailer: MailerService) {}

  private async send(to: string, subject: string, text: string) {
    try {
      await this.mailer.sendMail({ to, subject, text });
    } catch (e) {
      this.logger.error(`Failed to send mail: ${subject} → ${to}`, e instanceof Error ? e.stack : String(e));
    }
  }

  sendWaitlistPromoted(to: string, courseName: string, sectionCode: string) {
    return this.send(
      to,
      `【地平线】候补成功 — ${courseName}`,
      `您好，\n\n您已从候补名单成功录取至 ${courseName}（班级 §${sectionCode}）。\n请登录系统确认注册状态。\n\n地平线教务系统`
    );
  }

  sendAppealDecision(to: string, courseName: string, approved: boolean, reason?: string) {
    const v = approved ? "已批准" : "已驳回";
    return this.send(
      to,
      `【地平线】成绩申诉${v} — ${courseName}`,
      `您好，\n\n您对 ${courseName} 的成绩申诉${v}。${reason ? `\n批注：${reason}` : ""}\n\n地平线教务系统`
    );
  }

  sendWaiverDecision(to: string, courseCode: string, approved: boolean, reason?: string) {
    const v = approved ? "已批准" : "已驳回";
    return this.send(
      to,
      `【地平线】先修豁免${v} — ${courseCode}`,
      `您好，\n\n您对 ${courseCode} 的先修豁免申请${v}。${reason ? `\n批注：${reason}` : ""}\n\n地平线教务系统`
    );
  }

  sendOverloadDecision(to: string, approved: boolean) {
    const v = approved ? "已批准" : "已驳回";
    return this.send(
      to,
      `【地平线】超学分申请${v}`,
      `您好，\n\n您的超学分选课申请${v}。请登录系统查看详情。\n\n地平线教务系统`
    );
  }

  sendPasswordReset(to: string, token: string) {
    const resetUrl = `${process.env.WEB_URL || "http://localhost:3000"}/reset-password?token=${token}`;
    return this.send(
      to,
      "【地平线】密码重置",
      `您好，\n\n我们收到了您的密码重置请求。\n\n点击以下链接重置密码（链接1小时内有效）：\n${resetUrl}\n\n如果您没有发起此请求，请忽略此邮件，您的密码不会改变。\n\n地平线教务系统`
    );
  }

  async sendTest(to: string): Promise<void> {
    return this.send(
      to,
      "【地平线】邮件服务连通性测试",
      `这是一封测试邮件，发送时间：${new Date().toLocaleString("zh-CN")}。\n\n如果你收到这封邮件，说明 SendGrid 配置正确。\n\n地平线教务系统`
    );
  }
}
