import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import argon2 from "argon2";
import { PrismaService } from "../common/prisma.service";
import { ChangePasswordInput, UpdateProfileInput } from "@sis/shared";
import { toDateOrNull } from "../common/grade.utils";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        studentId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        studentProfile: true
      }
    });

    if (!user?.studentProfile) {
      throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "Student profile not found" });
    }

    return {
      ...user.studentProfile,
      user
    };
  }

  async updateMyProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        studentProfile: true
      }
    });
    const existing = user?.studentProfile ?? null;
    if (!existing) {
      throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "Student profile not found" });
    }

    const updated = await this.prisma.studentProfile.update({
      where: { userId },
      data: {
        legalName: input.legalName ?? existing.legalName,
        dob: input.dob !== undefined ? toDateOrNull(input.dob) : existing.dob,
        address: input.address !== undefined ? input.address : existing.address,
        emergencyContact: input.emergencyContact !== undefined ? input.emergencyContact : existing.emergencyContact,
        programMajor: input.programMajor !== undefined ? input.programMajor : existing.programMajor,
        enrollmentStatus: input.enrollmentStatus !== undefined ? input.enrollmentStatus : existing.enrollmentStatus,
        academicStatus: input.academicStatus !== undefined ? input.academicStatus : existing.academicStatus
      }
    });

    return updated;
  }

  async adminListStudents() {
    return this.prisma.user.findMany({
      where: { role: "STUDENT", deletedAt: null },
      include: { studentProfile: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async adminGetStudent(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: "STUDENT", deletedAt: null },
      include: { studentProfile: true }
    });
    if (!user) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });
    }
    return user;
  }

  async adminCreateStudent(input: {
    email: string;
    password: string;
    studentId: string;
    legalName: string;
  }, actorUserId: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { studentId: input.studentId }]
      }
    });

    if (existing) {
      throw new BadRequestException({ code: "USER_EXISTS", message: "Student email or ID already exists" });
    }

    const passwordHash = await argon2.hash(input.password);
    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        studentId: input.studentId,
        passwordHash,
        role: "STUDENT",
        emailVerifiedAt: new Date(),
        studentProfile: {
          create: {
            legalName: input.legalName,
            enrollmentStatus: "New",
            academicStatus: "Active"
          }
        }
      },
      include: { studentProfile: true }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "student",
      entityId: created.id,
      metadata: { op: "create" }
    });

    return created;
  }

  async adminUpdateStudent(
    id: string,
    input: Partial<{
      email: string;
      studentId: string;
      legalName: string;
      programMajor: string;
      enrollmentStatus: string;
      academicStatus: string;
    }>,
    actorUserId: string
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: "STUDENT", deletedAt: null },
      include: { studentProfile: true }
    });
    if (!user) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: input.email ?? user.email,
        studentId: input.studentId ?? user.studentId,
        studentProfile: {
          update: {
            legalName: input.legalName ?? user.studentProfile?.legalName,
            programMajor: input.programMajor ?? user.studentProfile?.programMajor,
            enrollmentStatus: input.enrollmentStatus ?? user.studentProfile?.enrollmentStatus,
            academicStatus: input.academicStatus ?? user.studentProfile?.academicStatus
          }
        }
      },
      include: { studentProfile: true }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "student",
      entityId: id,
      metadata: { op: "update" }
    });

    return updated;
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    const valid = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new UnauthorizedException({ code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect" });
    }

    const newHash = await argon2.hash(input.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    await this.auditService.log({
      actorUserId: userId,
      action: "password_change",
      entityType: "user",
      entityId: userId,
      metadata: {}
    });

    return { success: true };
  }

  async adminDeleteStudent(id: string, actorUserId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, role: "STUDENT", deletedAt: null } });
    if (!user) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.user.update({
        where: { id },
        data: { deletedAt: now }
      });
      await tx.enrollment.updateMany({
        where: {
          studentId: id,
          deletedAt: null
        },
        data: {
          deletedAt: now
        }
      });
    });
    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "student",
      entityId: id,
      metadata: { op: "delete" }
    });

    return { id };
  }
}
