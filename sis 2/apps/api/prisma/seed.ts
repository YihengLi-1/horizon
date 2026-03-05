import argon2 from "argon2";
import { PrismaClient, EnrollmentStatus, Modality, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.meetingTime.deleteMany();
  await prisma.section.deleteMany();
  await prisma.coursePrerequisite.deleteMany();
  await prisma.course.deleteMany();
  await prisma.term.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.inviteCode.deleteMany();
  await prisma.studentProfile.deleteMany();
  await prisma.user.deleteMany();

  const adminPassword = await argon2.hash("Admin123!");
  const studentPassword = await argon2.hash("Student123!");

  const admin = await prisma.user.create({
    data: {
      email: "admin@university.edu",
      passwordHash: adminPassword,
      role: Role.ADMIN,
      emailVerifiedAt: new Date(),
      studentId: null
    }
  });

  const student1 = await prisma.user.create({
    data: {
      email: "alice@student.edu",
      studentId: "S1001",
      passwordHash: studentPassword,
      role: Role.STUDENT,
      emailVerifiedAt: new Date(),
      studentProfile: {
        create: {
          legalName: "Alice Chen",
          dob: new Date("2004-04-12T00:00:00.000Z"),
          address: "123 Main St, Phoenix, AZ",
          emergencyContact: "Bob Chen (555-1001)",
          programMajor: "Computer Science",
          enrollmentStatus: "Full-time",
          academicStatus: "Good Standing"
        }
      }
    }
  });

  const student2 = await prisma.user.create({
    data: {
      email: "brian@student.edu",
      studentId: "S1002",
      passwordHash: studentPassword,
      role: Role.STUDENT,
      emailVerifiedAt: new Date(),
      studentProfile: {
        create: {
          legalName: "Brian Patel",
          dob: new Date("2003-09-08T00:00:00.000Z"),
          address: "55 Oak Ave, Tempe, AZ",
          emergencyContact: "Maya Patel (555-1002)",
          programMajor: "Software Engineering",
          enrollmentStatus: "Part-time",
          academicStatus: "Good Standing"
        }
      }
    }
  });

  await prisma.inviteCode.create({
    data: {
      code: "INVITE-2026",
      issuedByUserId: admin.id,
      maxUses: 200,
      usedCount: 0,
      active: true,
      expiresAt: new Date("2026-12-31T23:59:59.000Z")
    }
  });

  const term = await prisma.term.create({
    data: {
      name: "Spring 2026",
      startDate: new Date("2026-01-12T00:00:00.000Z"),
      endDate: new Date("2026-05-10T00:00:00.000Z"),
      registrationOpenAt: new Date("2025-11-01T15:00:00.000Z"),
      registrationCloseAt: new Date("2026-01-20T06:59:59.000Z"),
      dropDeadline: new Date("2026-02-15T06:59:59.000Z"),
      maxCredits: 9,
      timezone: "America/Phoenix"
    }
  });

  const cs101 = await prisma.course.create({
    data: {
      code: "CS101",
      title: "Intro to Programming",
      description: "Core programming foundations",
      credits: 3
    }
  });

  const cs201 = await prisma.course.create({
    data: {
      code: "CS201",
      title: "Data Structures",
      description: "Data structures and algorithm analysis",
      credits: 3
    }
  });

  const math101 = await prisma.course.create({
    data: {
      code: "MATH101",
      title: "Calculus I",
      description: "Differential calculus",
      credits: 4
    }
  });

  const hist100 = await prisma.course.create({
    data: {
      code: "HIST100",
      title: "World History",
      description: "Survey of world history",
      credits: 3
    }
  });

  await prisma.coursePrerequisite.create({
    data: {
      courseId: cs201.id,
      prerequisiteCourseId: cs101.id
    }
  });

  const cs101_001 = await prisma.section.create({
    data: {
      termId: term.id,
      courseId: cs101.id,
      sectionCode: "CS101-001",
      modality: Modality.ON_CAMPUS,
      capacity: 1,
      credits: 3,
      instructorName: "Dr. Nguyen",
      location: "ENGR-105",
      requireApproval: false,
      startDate: term.startDate,
      meetingTimes: {
        create: [
          { weekday: 1, startMinutes: 540, endMinutes: 615 },
          { weekday: 3, startMinutes: 540, endMinutes: 615 }
        ]
      }
    }
  });

  const cs101_002 = await prisma.section.create({
    data: {
      termId: term.id,
      courseId: cs101.id,
      sectionCode: "CS101-002",
      modality: Modality.ONLINE,
      capacity: 30,
      credits: 3,
      instructorName: "Prof. Lopez",
      location: "Online",
      requireApproval: false,
      startDate: term.startDate,
      meetingTimes: {
        create: [{ weekday: 2, startMinutes: 660, endMinutes: 735 }]
      }
    }
  });

  const cs201_001 = await prisma.section.create({
    data: {
      termId: term.id,
      courseId: cs201.id,
      sectionCode: "CS201-001",
      modality: Modality.HYBRID,
      capacity: 2,
      credits: 3,
      instructorName: "Dr. Shah",
      location: "SCI-210",
      requireApproval: true,
      startDate: term.startDate,
      meetingTimes: {
        create: [
          { weekday: 1, startMinutes: 630, endMinutes: 705 },
          { weekday: 3, startMinutes: 630, endMinutes: 705 }
        ]
      }
    }
  });

  const math101_001 = await prisma.section.create({
    data: {
      termId: term.id,
      courseId: math101.id,
      sectionCode: "MATH101-001",
      modality: Modality.ON_CAMPUS,
      capacity: 25,
      credits: 4,
      instructorName: "Dr. Ortiz",
      location: "MATH-120",
      requireApproval: false,
      startDate: term.startDate,
      meetingTimes: {
        create: [
          { weekday: 2, startMinutes: 540, endMinutes: 615 },
          { weekday: 4, startMinutes: 540, endMinutes: 615 }
        ]
      }
    }
  });

  const hist100_001 = await prisma.section.create({
    data: {
      termId: term.id,
      courseId: hist100.id,
      sectionCode: "HIST100-001",
      modality: Modality.ONLINE,
      capacity: 40,
      credits: 3,
      instructorName: "Prof. Adams",
      location: "Online",
      requireApproval: false,
      startDate: term.startDate,
      meetingTimes: {
        create: [{ weekday: 5, startMinutes: 480, endMinutes: 600 }]
      }
    }
  });

  const cs201_002 = await prisma.section.create({
    data: {
      termId: term.id,
      courseId: cs201.id,
      sectionCode: "CS201-002",
      modality: Modality.ON_CAMPUS,
      capacity: 1,
      credits: 3,
      instructorName: "Dr. Shah",
      location: "SCI-220",
      requireApproval: false,
      startDate: term.startDate,
      meetingTimes: {
        create: [
          { weekday: 2, startMinutes: 780, endMinutes: 855 },
          { weekday: 4, startMinutes: 780, endMinutes: 855 }
        ]
      }
    }
  });

  await prisma.enrollment.createMany({
    data: [
      {
        studentId: student1.id,
        termId: term.id,
        sectionId: cs101_001.id,
        status: EnrollmentStatus.ENROLLED
      },
      {
        studentId: student2.id,
        termId: term.id,
        sectionId: cs101_001.id,
        status: EnrollmentStatus.WAITLISTED,
        waitlistPosition: 1
      },
      {
        studentId: student2.id,
        termId: term.id,
        sectionId: cs101_002.id,
        status: EnrollmentStatus.COMPLETED,
        finalGrade: "B"
      },
      {
        studentId: student1.id,
        termId: term.id,
        sectionId: math101_001.id,
        status: EnrollmentStatus.ENROLLED
      },
      {
        studentId: student1.id,
        termId: term.id,
        sectionId: hist100_001.id,
        status: EnrollmentStatus.COMPLETED,
        finalGrade: "A-"
      },
      {
        studentId: student2.id,
        termId: term.id,
        sectionId: cs201_001.id,
        status: EnrollmentStatus.PENDING_APPROVAL
      },
      {
        studentId: student2.id,
        termId: term.id,
        sectionId: cs201_002.id,
        status: EnrollmentStatus.ENROLLED
      }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorUserId: admin.id,
        action: "seed",
        entityType: "system",
        entityId: "initial",
        metadata: { note: "Initial seed completed" }
      },
      {
        actorUserId: student1.id,
        action: "login",
        entityType: "auth",
        entityId: student1.id,
        metadata: { seeded: true }
      }
    ]
  });

  console.log("Seeded users:", {
    admin: "admin@university.edu / Admin123!",
    student1: "alice@student.edu or S1001 / Student123!",
    student2: "brian@student.edu or S1002 / Student123!"
  });
  console.log("Invite code:", "INVITE-2026");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
