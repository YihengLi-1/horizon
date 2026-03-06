"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePasswordSchema = exports.csvImportSchema = exports.updateGradeSchema = exports.promoteWaitlistSchema = exports.dropEnrollmentSchema = exports.submitCartSchema = exports.addCartItemSchema = exports.createSectionSchema = exports.meetingTimeSchema = exports.createCourseSchema = exports.createTermSchema = exports.createInviteCodeSchema = exports.createStudentSchema = exports.updateProfileSchema = exports.verifyEmailSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.registerSchema = exports.enrollmentStatusSchema = exports.modalitySchema = exports.roleSchema = void 0;
const zod_1 = require("zod");
exports.roleSchema = zod_1.z.enum(["STUDENT", "ADMIN"]);
exports.modalitySchema = zod_1.z.enum(["ONLINE", "ON_CAMPUS", "HYBRID"]);
exports.enrollmentStatusSchema = zod_1.z.enum([
    "CART",
    "ENROLLED",
    "WAITLISTED",
    "PENDING_APPROVAL",
    "DROPPED",
    "COMPLETED"
]);
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    studentId: zod_1.z.string().min(3),
    inviteCode: zod_1.z.string().min(3),
    legalName: zod_1.z.string().min(1)
});
exports.loginSchema = zod_1.z.object({
    identifier: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1)
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email()
});
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(10),
    newPassword: zod_1.z.string().min(8)
});
exports.verifyEmailSchema = zod_1.z.object({
    token: zod_1.z.string().min(10)
});
exports.updateProfileSchema = zod_1.z.object({
    legalName: zod_1.z.string().min(1).optional(),
    dob: zod_1.z.string().datetime().optional().nullable(),
    address: zod_1.z.string().optional().nullable(),
    emergencyContact: zod_1.z.string().optional().nullable(),
    programMajor: zod_1.z.string().optional().nullable(),
    enrollmentStatus: zod_1.z.string().optional().nullable(),
    academicStatus: zod_1.z.string().optional().nullable()
});
exports.createStudentSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    studentId: zod_1.z.string().min(3),
    legalName: zod_1.z.string().min(1),
    role: exports.roleSchema.default("STUDENT")
});
exports.createInviteCodeSchema = zod_1.z.object({
    code: zod_1.z.string().min(3),
    expiresAt: zod_1.z.string().datetime().optional().nullable(),
    maxUses: zod_1.z.number().int().positive().optional().nullable(),
    active: zod_1.z.boolean().default(true)
});
exports.createTermSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    startDate: zod_1.z.string().datetime(),
    endDate: zod_1.z.string().datetime(),
    registrationOpenAt: zod_1.z.string().datetime(),
    registrationCloseAt: zod_1.z.string().datetime(),
    dropDeadline: zod_1.z.string().datetime(),
    maxCredits: zod_1.z.number().int().positive(),
    timezone: zod_1.z.string().min(2),
    registrationOpen: zod_1.z.boolean().optional().default(true)
});
exports.createCourseSchema = zod_1.z.object({
    code: zod_1.z.string().min(2),
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional().nullable(),
    credits: zod_1.z.number().int().positive(),
    prerequisiteCourseIds: zod_1.z.array(zod_1.z.string()).optional().default([])
});
exports.meetingTimeSchema = zod_1.z.object({
    weekday: zod_1.z.number().int().min(0).max(6),
    startMinutes: zod_1.z.number().int().min(0).max(1439),
    endMinutes: zod_1.z.number().int().min(1).max(1440)
}).refine((val) => val.endMinutes > val.startMinutes, {
    message: "endMinutes must be greater than startMinutes",
    path: ["endMinutes"]
});
exports.createSectionSchema = zod_1.z.object({
    courseId: zod_1.z.string().min(1),
    termId: zod_1.z.string().min(1),
    sectionCode: zod_1.z.string().min(1),
    modality: exports.modalitySchema,
    capacity: zod_1.z.number().int().positive(),
    credits: zod_1.z.number().int().positive(),
    instructorName: zod_1.z.string().min(1),
    location: zod_1.z.string().optional().nullable(),
    requireApproval: zod_1.z.boolean().default(false),
    startDate: zod_1.z.string().datetime().optional().nullable(),
    meetingTimes: zod_1.z.array(exports.meetingTimeSchema).default([])
});
exports.addCartItemSchema = zod_1.z.object({
    termId: zod_1.z.string().min(1),
    sectionId: zod_1.z.string().min(1)
});
exports.submitCartSchema = zod_1.z.object({
    termId: zod_1.z.string().min(1)
});
exports.dropEnrollmentSchema = zod_1.z.object({
    enrollmentId: zod_1.z.string().min(1)
});
exports.promoteWaitlistSchema = zod_1.z.object({
    sectionId: zod_1.z.string().min(1),
    count: zod_1.z.number().int().positive().optional()
});
exports.updateGradeSchema = zod_1.z.object({
    enrollmentId: zod_1.z.string().min(1),
    finalGrade: zod_1.z.string().min(1)
});
exports.csvImportSchema = zod_1.z.object({
    csv: zod_1.z.string().min(1),
    dryRun: zod_1.z.boolean().optional().default(false),
    idempotencyKey: zod_1.z.string().min(8).max(128).optional()
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8)
});
