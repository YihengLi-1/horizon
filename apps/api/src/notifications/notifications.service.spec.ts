import { NotificationsService } from "./notifications.service";

const createTransportMock = jest.fn();

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: {
    createTransport: (...args: unknown[]) => createTransportMock(...args)
  }
}));

const ORIGINAL_ENV = { ...process.env };

function createNotificationsService() {
  const prisma = {
    user: {
      findFirst: jest.fn()
    },
    notificationLog: {
      create: jest.fn()
    },
    $queryRaw: jest.fn()
  } as any;

  return { service: new NotificationsService(prisma), prisma };
}

describe("NotificationsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MAIL_ENABLED;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("未配置邮件时 health snapshot 显示禁用", () => {
    const { service } = createNotificationsService();

    expect(service.getHealthSnapshot()).toMatchObject({
      enabled: false,
      configured: false,
      deliveryActive: false,
      attempts: 0,
      sent: 0,
      failed: 0,
      skipped: 0
    });
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("邮件禁用时 sendMail 返回 false 并计入 skipped", async () => {
    const { service, prisma } = createNotificationsService();

    await expect(
      service.sendMail({
        to: "student@univ.edu",
        subject: "测试",
        html: "<p>hello</p>",
        text: "hello"
      })
    ).resolves.toBe(false);

    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    expect(service.getHealthSnapshot()).toMatchObject({
      attempts: 1,
      skipped: 1,
      sent: 0,
      failed: 0,
      lastFailureReason: "mail_disabled"
    });
  });

  it("SMTP 配置完整时会创建 transporter", () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";
    createTransportMock.mockReturnValue({ sendMail: jest.fn() });

    const { service } = createNotificationsService();

    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "mailer", pass: "secret" }
    });
    expect(service.getHealthSnapshot()).toMatchObject({
      enabled: true,
      configured: true,
      deliveryActive: true
    });
  });

  it("sendMail 成功时写 notificationLog", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "noreply@test.edu";

    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({ sendMail });

    const { service, prisma } = createNotificationsService();
    prisma.user.findFirst.mockResolvedValue({ id: "u1" });
    prisma.notificationLog.create.mockResolvedValue({ id: "n1" });

    await expect(
      service.sendMail({
        to: "student@univ.edu",
        subject: "选课确认",
        html: "<p>ok</p>",
        text: "ok"
      })
    ).resolves.toBe(true);

    expect(sendMail).toHaveBeenCalledWith({
      from: "noreply@test.edu",
      to: "student@univ.edu",
      subject: "选课确认",
      text: "ok",
      html: "<p>ok</p>"
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: "student@univ.edu", deletedAt: null },
      select: { id: true }
    });
    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        type: "email",
        subject: "选课确认",
        body: "<p>ok</p>"
      }
    });
    expect(service.getHealthSnapshot()).toMatchObject({ sent: 1, failed: 0, skipped: 0, attempts: 1 });
  });

  it("找不到匹配用户时不写 notificationLog 但仍返回成功", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";

    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({ sendMail });

    const { service, prisma } = createNotificationsService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.sendMail({
        to: "unknown@univ.edu",
        subject: "测试",
        html: "<p>x</p>",
        text: "x"
      })
    ).resolves.toBe(true);

    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it("sendMail 失败时返回 false 并记录 failure 信息", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";

    createTransportMock.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(new Error("boom"))
    });

    const { service } = createNotificationsService();

    await expect(
      service.sendMail({
        to: "student@univ.edu",
        subject: "测试",
        html: "<p>x</p>",
        text: "x"
      })
    ).resolves.toBe(false);

    expect(service.getHealthSnapshot()).toMatchObject({
      attempts: 1,
      sent: 0,
      failed: 1,
      lastFailureReason: "boom"
    });
  });

  it("sendVerificationEmail 委托发送模板邮件", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({ sendMail });

    const { service, prisma } = createNotificationsService();
    prisma.user.findFirst.mockResolvedValue(null);

    await service.sendVerificationEmail({
      to: "student@univ.edu",
      legalName: "张小明",
      activationLink: "https://example.com/verify"
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("student@univ.edu");
    expect(sendMail.mock.calls[0][0].subject).toContain("Verify");
  });

  it("getNotifications 会把审计记录映射成通知类型", async () => {
    const now = new Date("2026-03-21T10:00:00Z");
    const { service, prisma } = createNotificationsService();
    prisma.$queryRaw.mockResolvedValue([
      { id: "1", action: "WAITLIST_PROMOTED", metadata: { courseCode: "CS101" }, createdAt: now },
      { id: "2", action: "DROP_ENROLLMENT", metadata: { course: "MATH101" }, createdAt: now },
      { id: "3", action: "ENROLL_SUCCESS", metadata: { sectionId: "SEC-1" }, createdAt: now },
      { id: "4", action: "CUSTOM_EVENT", metadata: { message: "系统维护提醒" }, createdAt: now }
    ]);

    await expect(service.getNotifications("u1")).resolves.toEqual([
      expect.objectContaining({ id: "1", type: "warning", title: "候补名单更新", body: "CS101 的候补状态有更新" }),
      expect.objectContaining({ id: "2", type: "error", title: "退课记录", body: "MATH101 已发生退课变更" }),
      expect.objectContaining({ id: "3", type: "success", title: "选课状态更新", body: "SEC-1 的选课记录已更新" }),
      expect.objectContaining({ id: "4", type: "info", title: "CUSTOM_EVENT", body: "系统维护提醒" })
    ]);
  });

  it("markNotificationRead 恒定返回 ok", async () => {
    const { service } = createNotificationsService();
    await expect(service.markNotificationRead("n1")).resolves.toEqual({ ok: true });
  });

  it("getUnreadCount 返回数字计数", async () => {
    const { service, prisma } = createNotificationsService();
    prisma.$queryRaw.mockResolvedValue([{ count: 7 }]);

    await expect(service.getUnreadCount("u1")).resolves.toEqual({ count: 7 });
  });

  it("sendPasswordResetEmail 委托发送密码重置邮件", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({ sendMail });

    const { service, prisma } = createNotificationsService();
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.sendPasswordResetEmail({
      to: "student@univ.edu",
      resetLink: "https://sis.test/reset?t=tok",
      expiresMinutes: 60
    });

    expect(result).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].subject).toContain("Reset");
  });

  it("sendEnrollmentSubmissionEmail 委托发送注册确认邮件", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({ sendMail });

    const { service, prisma } = createNotificationsService();
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.sendEnrollmentSubmissionEmail({
      to: "stu@univ.edu",
      legalName: "Alice",
      termName: "Fall 2026",
      items: [
        { courseCode: "CS101", sectionCode: "001", status: "ENROLLED", waitlistPosition: null }
      ]
    });

    expect(result).toBe(true);
    expect(sendMail.mock.calls[0][0].subject).toContain("Fall 2026");
  });

  it("sendWaitlistPromotionEmail 委托发送候补升级邮件", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({ sendMail });

    const { service, prisma } = createNotificationsService();
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.sendWaitlistPromotionEmail({
      to: "stu@univ.edu",
      legalName: "Bob",
      termName: "Spring 2027",
      courseCode: "CS201",
      sectionCode: "002"
    });

    expect(result).toBe(true);
    expect(sendMail.mock.calls[0][0].subject).toContain("waitlist");
  });

  it("sendGradePostedEmail 委托发送成绩通知邮件", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASS = "secret";
    const sendMail = jest.fn().mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({ sendMail });

    const { service, prisma } = createNotificationsService();
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.sendGradePostedEmail({
      to: "stu@univ.edu",
      legalName: "Carol",
      termName: "Fall 2026",
      courseCode: "CS301",
      sectionCode: "003",
      finalGrade: "A"
    });

    expect(result).toBe(true);
    expect(sendMail.mock.calls[0][0].subject).toContain("grade");
  });

  it("recordNotification 持久化通知日志", async () => {
    const { service, prisma } = createNotificationsService();
    prisma.notificationLog.create.mockResolvedValue({ id: "nl-1" });

    const result = await service.recordNotification("u1", "系统通知", "维护提醒", "system");
    expect(result).toEqual({ ok: true });
    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: { userId: "u1", type: "system", subject: "系统通知", body: "维护提醒" }
    });
  });
});
