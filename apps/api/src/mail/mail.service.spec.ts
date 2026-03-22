import { MailService } from "./mail.service";

function createMailService() {
  const mailer = { sendMail: jest.fn().mockResolvedValue(undefined) };
  const service = new MailService(mailer as never);
  return { service, mailer };
}

describe("MailService", () => {
  it("should be defined", () => {
    const { service } = createMailService();
    expect(service).toBeDefined();
  });

  describe("sendWaitlistPromoted", () => {
    it("sends email with correct subject and body", async () => {
      const { service, mailer } = createMailService();
      await service.sendWaitlistPromoted("stu@example.com", "数据库原理", "CS101-1");
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "stu@example.com",
          subject: expect.stringContaining("候补成功"),
          text: expect.stringContaining("CS101-1")
        })
      );
    });
  });

  describe("sendAppealDecision", () => {
    it("sends approval with reason", async () => {
      const { service, mailer } = createMailService();
      await service.sendAppealDecision("stu@example.com", "线性代数", true, "成绩有误");
      const call = mailer.sendMail.mock.calls[0][0];
      expect(call.subject).toContain("已批准");
      expect(call.text).toContain("成绩有误");
    });

    it("sends rejection without reason", async () => {
      const { service, mailer } = createMailService();
      await service.sendAppealDecision("stu@example.com", "线性代数", false);
      const call = mailer.sendMail.mock.calls[0][0];
      expect(call.subject).toContain("已驳回");
      expect(call.text).not.toContain("批注");
    });
  });

  describe("sendWaiverDecision", () => {
    it("sends waiver approval", async () => {
      const { service, mailer } = createMailService();
      await service.sendWaiverDecision("stu@example.com", "CS201", true);
      const call = mailer.sendMail.mock.calls[0][0];
      expect(call.subject).toContain("已批准");
    });

    it("sends waiver rejection with reason", async () => {
      const { service, mailer } = createMailService();
      await service.sendWaiverDecision("stu@example.com", "CS201", false, "未满足条件");
      const call = mailer.sendMail.mock.calls[0][0];
      expect(call.subject).toContain("已驳回");
      expect(call.text).toContain("未满足条件");
    });
  });

  describe("sendOverloadDecision", () => {
    it("sends overload approval", async () => {
      const { service, mailer } = createMailService();
      await service.sendOverloadDecision("stu@example.com", true);
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining("已批准") })
      );
    });

    it("sends overload rejection", async () => {
      const { service, mailer } = createMailService();
      await service.sendOverloadDecision("stu@example.com", false);
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining("已驳回") })
      );
    });
  });

  describe("sendPasswordReset", () => {
    it("includes token in reset URL", async () => {
      const { service, mailer } = createMailService();
      await service.sendPasswordReset("stu@example.com", "abc123token");
      const call = mailer.sendMail.mock.calls[0][0];
      expect(call.subject).toContain("密码重置");
      expect(call.text).toContain("abc123token");
    });

    it("uses WEB_URL env var when set", async () => {
      const { service, mailer } = createMailService();
      process.env.WEB_URL = "https://sis.example.edu";
      await service.sendPasswordReset("stu@example.com", "tok999");
      const call = mailer.sendMail.mock.calls[0][0];
      expect(call.text).toContain("https://sis.example.edu");
      delete process.env.WEB_URL;
    });
  });

  describe("sendTest", () => {
    it("sends test email", async () => {
      const { service, mailer } = createMailService();
      await service.sendTest("admin@example.com");
      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "admin@example.com",
          subject: expect.stringContaining("连通性测试")
        })
      );
    });
  });

  describe("error handling", () => {
    it("swallows mailer errors gracefully", async () => {
      const { service, mailer } = createMailService();
      mailer.sendMail.mockRejectedValueOnce(new Error("SMTP down"));
      // Should not throw
      await expect(service.sendTest("admin@example.com")).resolves.toBeUndefined();
    });
  });
});
