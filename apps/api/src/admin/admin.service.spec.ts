import { apiCache } from "../common/cache";
import { sanitizeHtml } from "../common/sanitize";
import { AdminService } from "./admin.service";

function createAdminService() {
  const prisma = {
    auditLog: {
      findMany: jest.fn()
    },
    section: {
      findMany: jest.fn()
    }
  } as any;
  const auditService = {} as any;
  const notificationsService = {} as any;
  return { prisma, service: new AdminService(prisma, auditService, notificationsService) };
}

describe("AdminService helpers", () => {
  beforeEach(() => {
    apiCache.delPrefix("admin:");
    jest.clearAllMocks();
  });

  it("computeStudentGpa returns null for empty enrollments", () => {
    const { service } = createAdminService();
    expect((service as any).computeStudentGpa([])).toBeNull();
  });

  it("computeStudentGpa returns 4.00 for a single A over 3 credits", () => {
    const { service } = createAdminService();
    expect(
      (service as any).computeStudentGpa([{ finalGrade: "A", section: { credits: 3 } }])
    ).toBe(4);
  });

  it("computeStudentGpa returns 3.00 for A and C split evenly", () => {
    const { service } = createAdminService();
    expect(
      (service as any).computeStudentGpa([
        { finalGrade: "A", section: { credits: 3 } },
        { finalGrade: "C", section: { credits: 3 } }
      ])
    ).toBe(3);
  });

  it("computeStudentGpa returns 0.00 for all failing grades", () => {
    const { service } = createAdminService();
    expect(
      (service as any).computeStudentGpa([
        { finalGrade: "F", section: { credits: 3 } },
        { finalGrade: "F", section: { credits: 4 } }
      ])
    ).toBe(0);
  });

  it("normalizePagination clamps page and pageSize", () => {
    const { service } = createAdminService();
    expect((service as any).normalizePagination({ page: -1, pageSize: 999 })).toEqual({
      page: 1,
      pageSize: 200,
      skip: 0
    });
  });

  it("sanitizeHtml strips script tags", () => {
    expect(sanitizeHtml('<p>Hello</p><script>alert(1)</script>')).toBe("<p>Hello</p>");
  });

  it("sanitizeHtml strips javascript protocols", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">bad</a>')).toBe('<a href="alert(1)">bad</a>');
  });

  it("getEnrollmentTrend returns a day bucket for each requested day", async () => {
    const { prisma, service } = createAdminService();
    prisma.auditLog.findMany.mockResolvedValue([
      { createdAt: new Date() },
      { createdAt: new Date() }
    ]);

    const result = await service.getEnrollmentTrend(7);

    expect(result).toHaveLength(7);
    expect(result[0]).toEqual(expect.objectContaining({ date: expect.any(String), count: expect.any(Number) }));
  });

  it("getTopSections returns top 10 sections sorted by enrolled count descending", async () => {
    const { prisma, service } = createAdminService();
    prisma.section.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        id: `section-${index}`,
        capacity: 30,
        courseId: `course-${index}`,
        course: { code: `CS${index}`, title: `Course ${index}` },
        enrollments: Array.from({ length: 12 - index }, () => ({ status: "ENROLLED" }))
      }))
    );

    const result = await service.getTopSections();

    expect(result).toHaveLength(10);
    expect(result[0].enrolled).toBeGreaterThanOrEqual(result[1].enrolled);
  });
});
