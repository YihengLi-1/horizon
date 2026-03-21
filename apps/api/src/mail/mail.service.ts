import { MailerService } from "@nestjs-modules/mailer";
import { Injectable } from "@nestjs/common";

@Injectable()
export class MailService {
  constructor(private readonly mailer: MailerService) {}

  private async send(to: string, subject: string, text: string) {
    try {
      await this.mailer.sendMail({ to, subject, text });
    } catch (e) {
      console.error("[MailService] failed to send:", subject, e);
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
}
