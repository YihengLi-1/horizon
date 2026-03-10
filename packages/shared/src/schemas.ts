import { z } from "zod";

export const roleSchema = z.enum(["STUDENT", "FACULTY", "ADVISOR", "ADMIN"]);
export const modalitySchema = z.enum(["ONLINE", "ON_CAMPUS", "HYBRID"]);
export const enrollmentStatusSchema = z.enum([
  "CART",
  "ENROLLED",
  "WAITLISTED",
  "PENDING_APPROVAL",
  "DROPPED",
  "COMPLETED"
]);
export const holdTypeSchema = z.enum(["REGISTRATION", "ACADEMIC", "FINANCIAL"]);
export const academicRequestTypeSchema = z.enum(["CREDIT_OVERLOAD", "PREREQ_OVERRIDE"]);
export const academicRequestStatusSchema = z.enum(["SUBMITTED", "APPROVED", "REJECTED", "WITHDRAWN"]);

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  studentId: z.string().min(3),
  inviteCode: z.string().min(3),
  legalName: z.string().min(1)
});

export const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email()
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8)
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10)
});

export const updateProfileSchema = z.object({
  legalName: z.string().min(1).optional(),
  dob: z.string().datetime().optional().nullable(),
  address: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  programMajor: z.string().optional().nullable(),
  enrollmentStatus: z.string().optional().nullable(),
  academicStatus: z.string().optional().nullable()
});

export const createStudentSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  studentId: z.string().min(3),
  legalName: z.string().min(1),
  role: z.literal("STUDENT").optional().default("STUDENT")
});

export const createFacultySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  employeeId: z.string().min(2).optional().nullable(),
  department: z.string().min(1).optional().nullable(),
  title: z.string().min(1).optional().nullable()
});

export const createAdvisorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  employeeId: z.string().min(2).optional().nullable(),
  department: z.string().min(1).optional().nullable(),
  officeLocation: z.string().min(1).optional().nullable()
});

export const assignAdvisorSchema = z.object({
  studentId: z.string().min(1),
  advisorId: z.string().min(1),
  notes: z.string().optional().nullable()
});

export const createInviteCodeSchema = z.object({
  code: z.string().min(3),
  expiresAt: z.string().datetime().optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
  active: z.boolean().default(true)
});

export const createTermSchema = z.object({
  name: z.string().min(2),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  registrationOpenAt: z.string().datetime(),
  registrationCloseAt: z.string().datetime(),
  dropDeadline: z.string().datetime(),
  maxCredits: z.number().int().positive(),
  timezone: z.string().min(2),
  registrationOpen: z.boolean().optional().default(true)
});

export const createCourseSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  credits: z.number().int().positive(),
  prerequisiteCourseIds: z.array(z.string()).optional().default([])
});

export const meetingTimeSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(1).max(1440)
}).refine((val) => val.endMinutes > val.startMinutes, {
  message: "endMinutes must be greater than startMinutes",
  path: ["endMinutes"]
});

export const createSectionSchema = z.object({
  courseId: z.string().min(1),
  termId: z.string().min(1),
  sectionCode: z.string().min(1),
  modality: modalitySchema,
  capacity: z.number().int().positive(),
  credits: z.number().int().positive(),
  instructorName: z.string().min(1),
  instructorUserId: z.string().min(1).optional().nullable(),
  location: z.string().optional().nullable(),
  requireApproval: z.boolean().default(false),
  startDate: z.string().datetime().optional().nullable(),
  meetingTimes: z.array(meetingTimeSchema).default([])
});

export const addCartItemSchema = z.object({
  termId: z.string().min(1),
  sectionId: z.string().min(1)
});

export const submitCartSchema = z.object({
  termId: z.string().min(1)
});

export const dropEnrollmentSchema = z.object({
  enrollmentId: z.string().min(1)
});

export const promoteWaitlistSchema = z.object({
  sectionId: z.string().min(1),
  count: z.number().int().positive().optional()
});

export const updateGradeSchema = z.object({
  enrollmentId: z.string().min(1),
  finalGrade: z.string().min(1)
});

export const csvImportSchema = z.object({
  csv: z.string().min(1),
  dryRun: z.boolean().optional().default(false),
  idempotencyKey: z.string().min(8).max(128).optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

export const createHoldSchema = z.object({
  studentId: z.string().min(1),
  type: holdTypeSchema,
  reason: z.string().min(3),
  note: z.string().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
});

export const resolveHoldSchema = z.object({
  resolutionNote: z.string().optional().nullable()
});

export const submitCreditOverloadRequestSchema = z.object({
  termId: z.string().min(1),
  requestedCredits: z.number().int().min(1).max(40),
  reason: z.string().min(8)
});

export const submitPrereqOverrideRequestSchema = z.object({
  sectionId: z.string().min(1),
  reason: z.string().min(8)
});

export const decideAcademicRequestSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  decisionNote: z.string().min(3)
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreateTermInput = z.infer<typeof createTermSchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type CreateFacultyInput = z.infer<typeof createFacultySchema>;
export type CreateAdvisorInput = z.infer<typeof createAdvisorSchema>;
export type AssignAdvisorInput = z.infer<typeof assignAdvisorSchema>;
export type CreateHoldInput = z.infer<typeof createHoldSchema>;
export type ResolveHoldInput = z.infer<typeof resolveHoldSchema>;
export type SubmitCreditOverloadRequestInput = z.infer<typeof submitCreditOverloadRequestSchema>;
export type SubmitPrereqOverrideRequestInput = z.infer<typeof submitPrereqOverrideRequestSchema>;
export type DecideAcademicRequestInput = z.infer<typeof decideAcademicRequestSchema>;
