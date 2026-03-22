import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AdminGradesService } from "./admin-grades.service";

function createGradesService() {
  const prisma = {
    enrollment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    section: { findUnique: jest.fn() },
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  } as any;

  const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const notificationsService = { sendGradePostedEmail: jest.fn().mockResolvedValue(undefined) } as any;
  const registrationService = { submitSectionGrades: jest.fn().mockResolvedValue({ updated: 0, succeeded: [], failed: [] }) } as any;

  return {
    prisma,
    auditService,
    notificationsService,
    registrationService,
    service: new AdminGradesService(
      prisma,
      auditService,
      notificationsService,
      registrationService
    )
  };
}

describe("AdminGradesService", () => {
  const originalSuperAdminIds = process.env.SUPERADMIN_USER_IDS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SUPERADMIN_USER_IDS;
  });

  afterAll(() => {
    process.env.SUPERADMIN_USER_IDS = originalSuperAdminIds;
  });

  describe("bulkUpdateGrades", () => {
    it("会规范化成绩并委托给 registrationService", async () => {
      const { registrationService, service } = createGradesService();
      registrationService.submitSectionGrades.mockResolvedValue({ updated: 2, succeeded: ["e1", "e2"], failed: [] });

      await expect(
        service.bulkUpdateGrades(
          "section-1",
          [
            { enrollmentId: "e1", grade: " a " },
            { enrollmentId: "e2", grade: "b+" }
          ],
          "admin-1"
        )
      ).resolves.toEqual({ updated: 2, succeeded: ["e1", "e2"], failed: [] });

      expect(registrationService.submitSectionGrades).toHaveBeenCalledWith(
        "section-1",
        [
          { enrollmentId: "e1", grade: "A" },
          { enrollmentId: "e2", grade: "B+" }
        ],
        "admin-1"
      );
    });

    it("成绩值非法时抛 BadRequestException", async () => {
      const { registrationService, service } = createGradesService();

      await expect(
        service.bulkUpdateGrades("section-1", [{ enrollmentId: "e1", grade: "INVALID" }], "admin-1")
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(registrationService.submitSectionGrades).not.toHaveBeenCalled();
    });

    it("空数组时仍安全委托，不做额外处理", async () => {
      const { registrationService, service } = createGradesService();

      await expect(service.bulkUpdateGrades("section-1", [], "admin-1")).resolves.toEqual({
        updated: 0,
        succeeded: [],
        failed: []
      });

      expect(registrationService.submitSectionGrades).toHaveBeenCalledWith("section-1", [], "admin-1");
    });

    it("下游 registrationService 的异常会向上传递", async () => {
      const { registrationService, service } = createGradesService();
      registrationService.submitSectionGrades.mockRejectedValue(new NotFoundException("教学班不存在"));

      await expect(
        service.bulkUpdateGrades("missing-section", [{ enrollmentId: "e1", grade: "A" }], "admin-1")
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("updateGrade", () => {
    it("正常更新单条成绩、记录 audit 并发送成绩通知", async () => {
      const { prisma, auditService, notificationsService, service } = createGradesService();
      prisma.enrollment.findFirst
        .mockResolvedValueOnce({ id: "enr-1", status: "ENROLLED" })
        .mockResolvedValueOnce({
          id: "enr-1",
          student: {
            email: "student@univ.edu",
            studentProfile: { legalName: "张小明" }
          },
          section: {
            course: { code: "CS101" },
            term: { name: "2025年秋季学期" },
            sectionCode: "CS101-A"
          }
        });
      prisma.enrollment.update.mockResolvedValue({ id: "enr-1", finalGrade: "A", status: "COMPLETED" });

      await expect(
        service.updateGrade({ enrollmentId: "enr-1", finalGrade: "a" } as never, "admin-1")
      ).resolves.toEqual({ id: "enr-1", finalGrade: "A", status: "COMPLETED" });

      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: "enr-1" },
        data: { finalGrade: "A", status: "COMPLETED" }
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "grade_update", entityId: "enr-1", metadata: { finalGrade: "A" } })
      );
      expect(notificationsService.sendGradePostedEmail).toHaveBeenCalledWith({
        to: "student@univ.edu",
        legalName: "张小明",
        termName: "2025年秋季学期",
        courseCode: "CS101",
        sectionCode: "CS101-A",
        finalGrade: "A"
      });
    });

    it("成绩值非法时抛 BadRequestException", async () => {
      const { prisma, service } = createGradesService();

      await expect(
        service.updateGrade({ enrollmentId: "enr-1", finalGrade: "PASS" } as never, "admin-1")
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.enrollment.findFirst).not.toHaveBeenCalled();
    });

    it("enrollment 不存在时抛 NotFoundException", async () => {
      const { prisma, service } = createGradesService();
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.updateGrade({ enrollmentId: "missing", finalGrade: "A" } as never, "admin-1")
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("非超级管理员不能修改已完成的注册记录", async () => {
      const { prisma, service } = createGradesService();
      prisma.enrollment.findFirst.mockResolvedValue({ id: "enr-1", status: "COMPLETED" });

      await expect(
        service.updateGrade({ enrollmentId: "enr-1", finalGrade: "B" } as never, "admin-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("超级管理员可以修改已完成的注册记录", async () => {
      process.env.SUPERADMIN_USER_IDS = "admin-1";
      const { prisma, service } = createGradesService();
      prisma.enrollment.findFirst
        .mockResolvedValueOnce({ id: "enr-1", status: "COMPLETED" })
        .mockResolvedValueOnce(null);
      prisma.enrollment.update.mockResolvedValue({ id: "enr-1", finalGrade: "B+", status: "COMPLETED" });

      await expect(
        service.updateGrade({ enrollmentId: "enr-1", finalGrade: "b+" } as never, "admin-1")
      ).resolves.toEqual({ id: "enr-1", finalGrade: "B+", status: "COMPLETED" });
    });
  });

  describe("updateEnrollmentGrade", () => {
    it("根据 studentId + sectionId 找到注册记录并代理到 updateGrade", async () => {
      const { prisma, service } = createGradesService();
      prisma.enrollment.findFirst.mockResolvedValue({ id: "enr-1" });
      const updateSpy = jest.spyOn(service, "updateGrade").mockResolvedValue({ id: "enr-1", finalGrade: "A" } as never);

      await expect(service.updateEnrollmentGrade("student-1", "section-1", "a", "admin-1")).resolves.toEqual({
        id: "enr-1",
        finalGrade: "A"
      });

      expect(updateSpy).toHaveBeenCalledWith({ enrollmentId: "enr-1", finalGrade: "A" }, "admin-1");
    });

    it("未找到注册记录时抛 NotFoundException", async () => {
      const { prisma, service } = createGradesService();
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(service.updateEnrollmentGrade("student-1", "section-1", "A", "admin-1")).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe("previewGradeCurve", () => {
    it("提升 1 步：B+ 变 A-", async () => {
      const { prisma, service } = createGradesService();
      prisma.enrollment.findMany.mockResolvedValue([{ id: "enr-1", finalGrade: "B+", studentId: "student-1" }]);

      const result = await service.previewGradeCurve("section-1", 1);

      expect(result.preview).toEqual([
        expect.objectContaining({ enrollmentId: "enr-1", originalGrade: "B+", curvedGrade: "A-", changed: true })
      ]);
      expect(result.changedCount).toBe(1);
    });

    it("已是 A+ 时不再提升", async () => {
      const { prisma, service } = createGradesService();
      prisma.enrollment.findMany.mockResolvedValue([{ id: "enr-1", finalGrade: "A+", studentId: "student-1" }]);

      const result = await service.previewGradeCurve("section-1", 2);

      expect(result.preview[0]).toEqual(
        expect.objectContaining({ originalGrade: "A+", curvedGrade: "A+", changed: false })
      );
    });

    it("W 不参与曲线", async () => {
      const { prisma, service } = createGradesService();
      prisma.enrollment.findMany.mockResolvedValue([{ id: "enr-1", finalGrade: "W", studentId: "student-1" }]);

      const result = await service.previewGradeCurve("section-1", 1);

      expect(result.preview[0]).toEqual(
        expect.objectContaining({ originalGrade: "W", curvedGrade: "W", changed: false })
      );
    });

    it("I 不在曲线表中，保持原值", async () => {
      const { prisma, service } = createGradesService();
      prisma.enrollment.findMany.mockResolvedValue([{ id: "enr-1", finalGrade: "I", studentId: "student-1" }]);

      const result = await service.previewGradeCurve("section-1", 3);

      expect(result.preview[0]).toEqual(
        expect.objectContaining({ originalGrade: "I", curvedGrade: "I", changed: false })
      );
    });
  });
});
