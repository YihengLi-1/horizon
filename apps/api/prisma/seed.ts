import bcrypt from "bcryptjs";
import { EnrollmentStatus, Modality, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const IDS = {
  admin: "seed-user-admin",
  faculty: "seed-user-faculty-1",
  advisor: "seed-user-advisor-1",
  spring2026: "seed-term-spring-2026",
  fall2026: "seed-term-fall-2026"
} as const;

type StudentSeed = {
  id: string;
  email: string;
  studentId: string;
  legalName: string;
  major: string;
  enrollmentStatus: string;
  academicStatus: string;
};

type CourseSeed = {
  id: string;
  code: string;
  title: string;
  description: string;
  credits: number;
};

type SectionSeed = {
  id: string;
  termId: string;
  courseId: string;
  sectionCode: string;
  modality: Modality;
  capacity: number;
  credits: number;
  instructorName: string;
  instructorUserId?: string;
  location: string;
  requireApproval: boolean;
  startDate: string;
  meetingTimes: Array<{
    id: string;
    weekday: number;
    startMinutes: number;
    endMinutes: number;
  }>;
};

const namedStudents: StudentSeed[] = [
  {
    id: "seed-student-1",
    email: "student1@sis.edu",
    studentId: "S2601",
    legalName: "李明",
    major: "Computer Science",
    enrollmentStatus: "Continuing",
    academicStatus: "Active"
  },
  {
    id: "seed-student-2",
    email: "student2@sis.edu",
    studentId: "S2602",
    legalName: "王芳",
    major: "Business Analytics",
    enrollmentStatus: "Continuing",
    academicStatus: "Active"
  },
  {
    id: "seed-student-3",
    email: "student3@sis.edu",
    studentId: "S2603",
    legalName: "张伟",
    major: "Mathematics",
    enrollmentStatus: "New",
    academicStatus: "Active"
  },
  {
    id: "seed-student-4",
    email: "student4@sis.edu",
    studentId: "S2604",
    legalName: "刘洋",
    major: "English",
    enrollmentStatus: "Returning",
    academicStatus: "Active"
  },
  {
    id: "seed-student-5",
    email: "student5@sis.edu",
    studentId: "S2605",
    legalName: "陈静",
    major: "Business Administration",
    enrollmentStatus: "Continuing",
    academicStatus: "Probation"
  }
];

const fillerStudents: StudentSeed[] = Array.from({ length: 20 }, (_, index) => ({
  id: `seed-student-filler-${String(index + 1).padStart(2, "0")}`,
  email: `demo${String(index + 1).padStart(2, "0")}@sis.edu`,
  studentId: `D26${String(index + 1).padStart(2, "0")}`,
  legalName: `演示学生${String(index + 1).padStart(2, "0")}`,
  major: index % 2 === 0 ? "Computer Science" : "Business",
  enrollmentStatus: "Continuing",
  academicStatus: "Active"
}));

const courses: CourseSeed[] = [
  { id: "course-cs101", code: "CS101", title: "Introduction to Programming", description: "Programming fundamentals using TypeScript.", credits: 3 },
  { id: "course-cs102", code: "CS102", title: "Web Foundations", description: "HTML, CSS, and web application basics.", credits: 3 },
  { id: "course-cs201", code: "CS201", title: "Data Structures", description: "Arrays, trees, graphs, and performance analysis.", credits: 4 },
  { id: "course-cs220", code: "CS220", title: "Database Systems", description: "Relational modeling, SQL, and transaction design.", credits: 3 },
  { id: "course-cs310", code: "CS310", title: "Operating Systems", description: "Processes, scheduling, and memory management.", credits: 4 },
  { id: "course-math101", code: "MATH101", title: "College Algebra", description: "Functions, equations, and modeling.", credits: 3 },
  { id: "course-math201", code: "MATH201", title: "Calculus I", description: "Limits, derivatives, and applications.", credits: 4 },
  { id: "course-math220", code: "MATH220", title: "Discrete Mathematics", description: "Logic, sets, proofs, and combinatorics.", credits: 3 },
  { id: "course-eng101", code: "ENG101", title: "Academic Writing", description: "College-level writing and research skills.", credits: 3 },
  { id: "course-eng205", code: "ENG205", title: "Public Speaking", description: "Speech organization and presentation delivery.", credits: 2 },
  { id: "course-eng250", code: "ENG250", title: "Technical Communication", description: "Documentation for technical teams.", credits: 2 },
  { id: "course-bus101", code: "BUS101", title: "Principles of Management", description: "Leadership, planning, and operations basics.", credits: 3 },
  { id: "course-bus210", code: "BUS210", title: "Business Analytics", description: "Data analysis for business decisions.", credits: 3 },
  { id: "course-bus320", code: "BUS320", title: "Entrepreneurship Lab", description: "Startup experimentation and pitching.", credits: 2 },
  { id: "course-cs350", code: "CS350", title: "Computer Networks", description: "Network protocols and distributed systems basics.", credits: 3 }
];

const sections: SectionSeed[] = [
  {
    id: "section-cs101-a",
    termId: IDS.spring2026,
    courseId: "course-cs101",
    sectionCode: "CS101-A",
    modality: Modality.ON_CAMPUS,
    capacity: 24,
    credits: 3,
    instructorName: "Dr. Zhao",
    location: "ENG-105",
    requireApproval: false,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-cs101-a-1", weekday: 1, startMinutes: 540, endMinutes: 615 },
      { id: "mt-cs101-a-2", weekday: 3, startMinutes: 540, endMinutes: 615 }
    ]
  },
  {
    id: "section-cs102-a",
    termId: IDS.spring2026,
    courseId: "course-cs102",
    sectionCode: "CS102-A",
    modality: Modality.ONLINE,
    capacity: 22,
    credits: 3,
    instructorName: "Prof. Lin",
    location: "Online",
    requireApproval: false,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-cs102-a-1", weekday: 2, startMinutes: 660, endMinutes: 735 }
    ]
  },
  {
    id: "section-cs201-a",
    termId: IDS.spring2026,
    courseId: "course-cs201",
    sectionCode: "CS201-A",
    modality: Modality.HYBRID,
    capacity: 20,
    credits: 4,
    instructorName: "Prof. Ada Stone",
    instructorUserId: IDS.faculty,
    location: "SCI-210",
    requireApproval: true,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-cs201-a-1", weekday: 1, startMinutes: 630, endMinutes: 705 },
      { id: "mt-cs201-a-2", weekday: 3, startMinutes: 630, endMinutes: 705 }
    ]
  },
  {
    id: "section-cs220-a",
    termId: IDS.spring2026,
    courseId: "course-cs220",
    sectionCode: "CS220-A",
    modality: Modality.ON_CAMPUS,
    capacity: 26,
    credits: 3,
    instructorName: "Prof. Gomez",
    location: "SCI-115",
    requireApproval: false,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-cs220-a-1", weekday: 2, startMinutes: 780, endMinutes: 855 },
      { id: "mt-cs220-a-2", weekday: 4, startMinutes: 780, endMinutes: 855 }
    ]
  },
  {
    id: "section-math101-a",
    termId: IDS.spring2026,
    courseId: "course-math101",
    sectionCode: "MATH101-A",
    modality: Modality.ON_CAMPUS,
    capacity: 20,
    credits: 3,
    instructorName: "Dr. Ortiz",
    location: "MATH-120",
    requireApproval: false,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-math101-a-1", weekday: 2, startMinutes: 540, endMinutes: 615 },
      { id: "mt-math101-a-2", weekday: 4, startMinutes: 540, endMinutes: 615 }
    ]
  },
  {
    id: "section-math201-a",
    termId: IDS.spring2026,
    courseId: "course-math201",
    sectionCode: "MATH201-A",
    modality: Modality.HYBRID,
    capacity: 28,
    credits: 4,
    instructorName: "Prof. Sullivan",
    location: "MATH-220",
    requireApproval: false,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-math201-a-1", weekday: 1, startMinutes: 840, endMinutes: 915 },
      { id: "mt-math201-a-2", weekday: 3, startMinutes: 840, endMinutes: 915 }
    ]
  },
  {
    id: "section-math220-a",
    termId: IDS.spring2026,
    courseId: "course-math220",
    sectionCode: "MATH220-A",
    modality: Modality.ONLINE,
    capacity: 24,
    credits: 3,
    instructorName: "Dr. Rao",
    location: "Online",
    requireApproval: false,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-math220-a-1", weekday: 5, startMinutes: 600, endMinutes: 690 }
    ]
  },
  {
    id: "section-eng101-a",
    termId: IDS.spring2026,
    courseId: "course-eng101",
    sectionCode: "ENG101-A",
    modality: Modality.ON_CAMPUS,
    capacity: 30,
    credits: 3,
    instructorName: "Prof. Ada Stone",
    instructorUserId: IDS.faculty,
    location: "HUM-110",
    requireApproval: false,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-eng101-a-1", weekday: 1, startMinutes: 720, endMinutes: 795 },
      { id: "mt-eng101-a-2", weekday: 3, startMinutes: 720, endMinutes: 795 }
    ]
  },
  {
    id: "section-bus101-a",
    termId: IDS.spring2026,
    courseId: "course-bus101",
    sectionCode: "BUS101-A",
    modality: Modality.ON_CAMPUS,
    capacity: 26,
    credits: 3,
    instructorName: "Dr. Kim",
    location: "BUS-201",
    requireApproval: false,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-bus101-a-1", weekday: 2, startMinutes: 900, endMinutes: 975 },
      { id: "mt-bus101-a-2", weekday: 4, startMinutes: 900, endMinutes: 975 }
    ]
  },
  {
    id: "section-bus210-a",
    termId: IDS.spring2026,
    courseId: "course-bus210",
    sectionCode: "BUS210-A",
    modality: Modality.HYBRID,
    capacity: 20,
    credits: 3,
    instructorName: "Prof. Chen",
    location: "BUS-310",
    requireApproval: true,
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-bus210-a-1", weekday: 1, startMinutes: 1020, endMinutes: 1095 },
      { id: "mt-bus210-a-2", weekday: 3, startMinutes: 1020, endMinutes: 1095 }
    ]
  },
  {
    id: "section-cs201-f1",
    termId: IDS.fall2026,
    courseId: "course-cs201",
    sectionCode: "CS201-F1",
    modality: Modality.HYBRID,
    capacity: 24,
    credits: 4,
    instructorName: "Prof. Ada Stone",
    instructorUserId: IDS.faculty,
    location: "SCI-210",
    requireApproval: true,
    startDate: "2026-08-24T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-cs201-f1-1", weekday: 1, startMinutes: 540, endMinutes: 615 },
      { id: "mt-cs201-f1-2", weekday: 3, startMinutes: 540, endMinutes: 615 }
    ]
  },
  {
    id: "section-cs220-f1",
    termId: IDS.fall2026,
    courseId: "course-cs220",
    sectionCode: "CS220-F1",
    modality: Modality.ON_CAMPUS,
    capacity: 26,
    credits: 3,
    instructorName: "Prof. Gomez",
    location: "SCI-115",
    requireApproval: false,
    startDate: "2026-08-24T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-cs220-f1-1", weekday: 2, startMinutes: 630, endMinutes: 705 },
      { id: "mt-cs220-f1-2", weekday: 4, startMinutes: 630, endMinutes: 705 }
    ]
  },
  {
    id: "section-math201-f1",
    termId: IDS.fall2026,
    courseId: "course-math201",
    sectionCode: "MATH201-F1",
    modality: Modality.ON_CAMPUS,
    capacity: 28,
    credits: 4,
    instructorName: "Prof. Sullivan",
    location: "MATH-220",
    requireApproval: false,
    startDate: "2026-08-24T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-math201-f1-1", weekday: 1, startMinutes: 720, endMinutes: 795 },
      { id: "mt-math201-f1-2", weekday: 3, startMinutes: 720, endMinutes: 795 }
    ]
  },
  {
    id: "section-eng101-f1",
    termId: IDS.fall2026,
    courseId: "course-eng101",
    sectionCode: "ENG101-F1",
    modality: Modality.ON_CAMPUS,
    capacity: 30,
    credits: 3,
    instructorName: "Prof. Ada Stone",
    instructorUserId: IDS.faculty,
    location: "HUM-110",
    requireApproval: false,
    startDate: "2026-08-24T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-eng101-f1-1", weekday: 2, startMinutes: 780, endMinutes: 855 },
      { id: "mt-eng101-f1-2", weekday: 4, startMinutes: 780, endMinutes: 855 }
    ]
  },
  {
    id: "section-bus101-f1",
    termId: IDS.fall2026,
    courseId: "course-bus101",
    sectionCode: "BUS101-F1",
    modality: Modality.ON_CAMPUS,
    capacity: 26,
    credits: 3,
    instructorName: "Dr. Kim",
    location: "BUS-201",
    requireApproval: false,
    startDate: "2026-08-24T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-bus101-f1-1", weekday: 5, startMinutes: 540, endMinutes: 660 }
    ]
  },
  {
    id: "section-cs350-f1",
    termId: IDS.fall2026,
    courseId: "course-cs350",
    sectionCode: "CS350-F1",
    modality: Modality.ONLINE,
    capacity: 24,
    credits: 3,
    instructorName: "Prof. Rivera",
    location: "Online",
    requireApproval: false,
    startDate: "2026-08-24T00:00:00.000Z",
    meetingTimes: [
      { id: "mt-cs350-f1-1", weekday: 5, startMinutes: 810, endMinutes: 885 }
    ]
  }
];

async function upsertUser(student: StudentSeed, passwordHash: string) {
  return prisma.user.upsert({
    where: { email: student.email },
    update: {
      studentId: student.studentId,
      passwordHash,
      role: Role.STUDENT,
      emailVerifiedAt: new Date("2026-01-10T12:00:00.000Z"),
      deletedAt: null,
      studentProfile: {
        upsert: {
          create: {
            legalName: student.legalName,
            programMajor: student.major,
            enrollmentStatus: student.enrollmentStatus,
            academicStatus: student.academicStatus,
            address: "Phoenix, AZ",
            emergencyContact: "Campus Hotline"
          },
          update: {
            legalName: student.legalName,
            programMajor: student.major,
            enrollmentStatus: student.enrollmentStatus,
            academicStatus: student.academicStatus,
            address: "Phoenix, AZ",
            emergencyContact: "Campus Hotline"
          }
        }
      }
    },
    create: {
      id: student.id,
      email: student.email,
      studentId: student.studentId,
      passwordHash,
      role: Role.STUDENT,
      emailVerifiedAt: new Date("2026-01-10T12:00:00.000Z"),
      studentProfile: {
        create: {
          legalName: student.legalName,
          programMajor: student.major,
          enrollmentStatus: student.enrollmentStatus,
          academicStatus: student.academicStatus,
          address: "Phoenix, AZ",
          emergencyContact: "Campus Hotline"
        }
      }
    },
    include: {
      studentProfile: true
    }
  });
}

async function upsertFaculty(passwordHash: string) {
  return prisma.user.upsert({
    where: { email: "faculty1@sis.edu" },
    update: {
      studentId: null,
      passwordHash,
      role: Role.FACULTY,
      emailVerifiedAt: new Date("2026-01-10T12:00:00.000Z"),
      deletedAt: null,
      facultyProfile: {
        upsert: {
          create: {
            displayName: "Prof. Ada Stone",
            employeeId: "F2601",
            department: "Computer Science",
            title: "Associate Professor"
          },
          update: {
            displayName: "Prof. Ada Stone",
            employeeId: "F2601",
            department: "Computer Science",
            title: "Associate Professor"
          }
        }
      }
    },
    create: {
      id: IDS.faculty,
      email: "faculty1@sis.edu",
      studentId: null,
      passwordHash,
      role: Role.FACULTY,
      emailVerifiedAt: new Date("2026-01-10T12:00:00.000Z"),
      facultyProfile: {
        create: {
          displayName: "Prof. Ada Stone",
          employeeId: "F2601",
          department: "Computer Science",
          title: "Associate Professor"
        }
      }
    },
    include: {
      facultyProfile: true
    }
  });
}

async function upsertAdvisor(passwordHash: string) {
  return prisma.user.upsert({
    where: { email: "advisor1@sis.edu" },
    update: {
      studentId: null,
      passwordHash,
      role: Role.ADVISOR,
      emailVerifiedAt: new Date("2026-01-10T12:00:00.000Z"),
      deletedAt: null,
      advisorProfile: {
        upsert: {
          create: {
            displayName: "Jordan Reyes",
            employeeId: "A2601",
            department: "Academic Advising",
            officeLocation: "Student Success Center 210"
          },
          update: {
            displayName: "Jordan Reyes",
            employeeId: "A2601",
            department: "Academic Advising",
            officeLocation: "Student Success Center 210"
          }
        }
      }
    },
    create: {
      id: IDS.advisor,
      email: "advisor1@sis.edu",
      studentId: null,
      passwordHash,
      role: Role.ADVISOR,
      emailVerifiedAt: new Date("2026-01-10T12:00:00.000Z"),
      advisorProfile: {
        create: {
          displayName: "Jordan Reyes",
          employeeId: "A2601",
          department: "Academic Advising",
          officeLocation: "Student Success Center 210"
        }
      }
    },
    include: {
      advisorProfile: true
    }
  });
}

async function main() {
  const adminPasswordHash = await bcrypt.hash("Admin@2026!", 12);
  const studentPasswordHash = await bcrypt.hash("Student@2026!", 12);
  const facultyPasswordHash = await bcrypt.hash("Faculty@2026!", 12);
  const advisorPasswordHash = await bcrypt.hash("Advisor@2026!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@sis.edu" },
    update: {
      studentId: null,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      emailVerifiedAt: new Date("2026-01-10T12:00:00.000Z"),
      deletedAt: null
    },
    create: {
      id: IDS.admin,
      email: "admin@sis.edu",
      studentId: null,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      emailVerifiedAt: new Date("2026-01-10T12:00:00.000Z")
    }
  });

  const studentUsers = [] as Awaited<ReturnType<typeof upsertUser>>[];
  for (const student of [...namedStudents, ...fillerStudents]) {
    studentUsers.push(await upsertUser(student, studentPasswordHash));
  }
  const faculty = await upsertFaculty(facultyPasswordHash);
  const advisor = await upsertAdvisor(advisorPasswordHash);

  await prisma.term.upsert({
    where: { id: IDS.spring2026 },
    update: {
      name: "Spring 2026",
      startDate: new Date("2026-01-12T00:00:00.000Z"),
      endDate: new Date("2026-05-15T23:59:59.000Z"),
      registrationOpenAt: new Date("2025-11-15T15:00:00.000Z"),
      registrationCloseAt: new Date("2026-03-20T23:59:59.000Z"),
      dropDeadline: new Date("2026-03-25T23:59:59.000Z"),
      maxCredits: 18,
      timezone: "America/Phoenix"
    },
    create: {
      id: IDS.spring2026,
      name: "Spring 2026",
      startDate: new Date("2026-01-12T00:00:00.000Z"),
      endDate: new Date("2026-05-15T23:59:59.000Z"),
      registrationOpenAt: new Date("2025-11-15T15:00:00.000Z"),
      registrationCloseAt: new Date("2026-03-20T23:59:59.000Z"),
      dropDeadline: new Date("2026-03-25T23:59:59.000Z"),
      maxCredits: 18,
      timezone: "America/Phoenix"
    }
  });

  await prisma.term.upsert({
    where: { id: IDS.fall2026 },
    update: {
      name: "Fall 2026",
      startDate: new Date("2026-08-24T00:00:00.000Z"),
      endDate: new Date("2026-12-18T23:59:59.000Z"),
      registrationOpenAt: new Date("2026-02-15T15:00:00.000Z"),
      registrationCloseAt: new Date("2026-09-10T23:59:59.000Z"),
      dropDeadline: new Date("2026-09-10T23:59:59.000Z"),
      maxCredits: 18,
      timezone: "America/Phoenix"
    },
    create: {
      id: IDS.fall2026,
      name: "Fall 2026",
      startDate: new Date("2026-08-24T00:00:00.000Z"),
      endDate: new Date("2026-12-18T23:59:59.000Z"),
      registrationOpenAt: new Date("2026-02-15T15:00:00.000Z"),
      registrationCloseAt: new Date("2026-09-10T23:59:59.000Z"),
      dropDeadline: new Date("2026-09-10T23:59:59.000Z"),
      maxCredits: 18,
      timezone: "America/Phoenix"
    }
  });

  const courseIdBySeedId = new Map<string, string>();
  for (const course of courses) {
    const storedCourse = await prisma.course.upsert({
      where: { code: course.code },
      update: {
        title: course.title,
        description: course.description,
        credits: course.credits
      },
      create: course
    });
    courseIdBySeedId.set(course.id, storedCourse.id);
  }

  const prerequisitePairs = [
    ["course-cs201", "course-cs101"],
    ["course-cs220", "course-cs201"],
    ["course-bus210", "course-math101"]
  ] as const;

  for (const [courseId, prerequisiteCourseId] of prerequisitePairs) {
    const resolvedCourseId = courseIdBySeedId.get(courseId);
    const resolvedPrerequisiteId = courseIdBySeedId.get(prerequisiteCourseId);
    if (!resolvedCourseId || !resolvedPrerequisiteId) {
      throw new Error(`Failed to resolve prerequisite pair ${courseId} -> ${prerequisiteCourseId}`);
    }
    await prisma.coursePrerequisite.upsert({
      where: {
        courseId_prerequisiteCourseId: {
          courseId: resolvedCourseId,
          prerequisiteCourseId: resolvedPrerequisiteId
        }
      },
      update: {},
      create: {
        courseId: resolvedCourseId,
        prerequisiteCourseId: resolvedPrerequisiteId
      }
    });
  }

  const sectionIdByCode = new Map<string, string>();
  for (const section of sections) {
    const resolvedCourseId = courseIdBySeedId.get(section.courseId);
    if (!resolvedCourseId) {
      throw new Error(`Failed to resolve course ID for section ${section.sectionCode}`);
    }

    const storedSection = await prisma.section.upsert({
      where: {
        termId_sectionCode: {
          termId: section.termId,
          sectionCode: section.sectionCode
        }
      },
      update: {
        termId: section.termId,
        courseId: resolvedCourseId,
        sectionCode: section.sectionCode,
        modality: section.modality,
        capacity: section.capacity,
        credits: section.credits,
        instructorName: section.instructorName,
        instructorUserId: section.instructorUserId ?? null,
        location: section.location,
        requireApproval: section.requireApproval,
        startDate: new Date(section.startDate)
      },
      create: {
        id: section.id,
        termId: section.termId,
        courseId: resolvedCourseId,
        sectionCode: section.sectionCode,
        modality: section.modality,
        capacity: section.capacity,
        credits: section.credits,
        instructorName: section.instructorName,
        instructorUserId: section.instructorUserId ?? null,
        location: section.location,
        requireApproval: section.requireApproval,
        startDate: new Date(section.startDate)
      }
    });
    sectionIdByCode.set(section.sectionCode, storedSection.id);

    for (const meetingTime of section.meetingTimes) {
      await prisma.meetingTime.upsert({
        where: { id: meetingTime.id },
        update: {
          sectionId: storedSection.id,
          weekday: meetingTime.weekday,
          startMinutes: meetingTime.startMinutes,
          endMinutes: meetingTime.endMinutes
        },
        create: {
          id: meetingTime.id,
          sectionId: storedSection.id,
          weekday: meetingTime.weekday,
          startMinutes: meetingTime.startMinutes,
          endMinutes: meetingTime.endMinutes
        }
      });
    }
  }

  await prisma.inviteCode.upsert({
    where: { code: "OPEN-2026" },
    update: {
      issuedByUserId: admin.id,
      maxUses: null,
      usedCount: 0,
      active: true,
      expiresAt: new Date("2026-12-31T23:59:59.000Z")
    },
    create: {
      id: "invite-open-2026",
      code: "OPEN-2026",
      issuedByUserId: admin.id,
      maxUses: null,
      usedCount: 0,
      active: true,
      expiresAt: new Date("2026-12-31T23:59:59.000Z")
    }
  });

  await prisma.inviteCode.upsert({
    where: { code: "LIMIT10-2026" },
    update: {
      issuedByUserId: admin.id,
      maxUses: 10,
      usedCount: 0,
      active: true,
      expiresAt: new Date("2026-12-31T23:59:59.000Z")
    },
    create: {
      id: "invite-limit10-2026",
      code: "LIMIT10-2026",
      issuedByUserId: admin.id,
      maxUses: 10,
      usedCount: 0,
      active: true,
      expiresAt: new Date("2026-12-31T23:59:59.000Z")
    }
  });

  const student1 = studentUsers.find((user) => user.email === "student1@sis.edu");
  const student2 = studentUsers.find((user) => user.email === "student2@sis.edu");
  if (!student1 || !student2) {
    throw new Error("Named demo students were not created correctly");
  }
  const sectionCs102 = sectionIdByCode.get("CS102-A");
  const sectionEng101 = sectionIdByCode.get("ENG101-A");
  const sectionBus101 = sectionIdByCode.get("BUS101-A");
  const sectionCs201 = sectionIdByCode.get("CS201-A");
  const sectionMath101 = sectionIdByCode.get("MATH101-A");
  if (!sectionCs102 || !sectionEng101 || !sectionBus101 || !sectionCs201 || !sectionMath101) {
    throw new Error("Named demo sections were not created correctly");
  }

  await prisma.advisorAssignment.upsert({
    where: { id: "advisor-assignment-student1" },
    update: {
      studentId: student1.id,
      advisorId: advisor.id,
      assignedByUserId: admin.id,
      notes: "Primary academic advisor for demo student 1",
      active: true,
      endedAt: null
    },
    create: {
      id: "advisor-assignment-student1",
      studentId: student1.id,
      advisorId: advisor.id,
      assignedByUserId: admin.id,
      notes: "Primary academic advisor for demo student 1",
      active: true
    }
  });

  await prisma.advisorAssignment.upsert({
    where: { id: "advisor-assignment-student2" },
    update: {
      studentId: student2.id,
      advisorId: advisor.id,
      assignedByUserId: admin.id,
      notes: "Primary academic advisor for demo student 2",
      active: true,
      endedAt: null
    },
    create: {
      id: "advisor-assignment-student2",
      studentId: student2.id,
      advisorId: advisor.id,
      assignedByUserId: admin.id,
      notes: "Primary academic advisor for demo student 2",
      active: true
    }
  });

  const fullSectionStudentIds = fillerStudents.map((student) => {
    const user = studentUsers.find((item) => item.email === student.email);
    if (!user) {
      throw new Error(`Missing filler student ${student.email}`);
    }
    return user.id;
  });

  await prisma.enrollment.upsert({
    where: { id: "enrollment-student1-cs102" },
    update: {
      studentId: student1.id,
      termId: IDS.spring2026,
      sectionId: sectionCs102,
      status: EnrollmentStatus.ENROLLED,
      waitlistPosition: null,
      finalGrade: null,
      deletedAt: null,
      droppedAt: null
    },
    create: {
      id: "enrollment-student1-cs102",
      studentId: student1.id,
      termId: IDS.spring2026,
      sectionId: sectionCs102,
      status: EnrollmentStatus.ENROLLED
    }
  });

  await prisma.enrollment.upsert({
    where: { id: "enrollment-student1-eng101" },
    update: {
      studentId: student1.id,
      termId: IDS.spring2026,
      sectionId: sectionEng101,
      status: EnrollmentStatus.ENROLLED,
      waitlistPosition: null,
      finalGrade: null,
      deletedAt: null,
      droppedAt: null
    },
    create: {
      id: "enrollment-student1-eng101",
      studentId: student1.id,
      termId: IDS.spring2026,
      sectionId: sectionEng101,
      status: EnrollmentStatus.ENROLLED
    }
  });

  await prisma.enrollment.upsert({
    where: { id: "enrollment-student1-bus101" },
    update: {
      studentId: student1.id,
      termId: IDS.spring2026,
      sectionId: sectionBus101,
      status: EnrollmentStatus.ENROLLED,
      waitlistPosition: null,
      finalGrade: null,
      deletedAt: null,
      droppedAt: null
    },
    create: {
      id: "enrollment-student1-bus101",
      studentId: student1.id,
      termId: IDS.spring2026,
      sectionId: sectionBus101,
      status: EnrollmentStatus.ENROLLED
    }
  });

  await prisma.enrollment.upsert({
    where: { id: "enrollment-student2-waitlist-cs201" },
    update: {
      studentId: student2.id,
      termId: IDS.spring2026,
      sectionId: sectionCs201,
      status: EnrollmentStatus.WAITLISTED,
      waitlistPosition: 1,
      finalGrade: null,
      deletedAt: null,
      droppedAt: null
    },
    create: {
      id: "enrollment-student2-waitlist-cs201",
      studentId: student2.id,
      termId: IDS.spring2026,
      sectionId: sectionCs201,
      status: EnrollmentStatus.WAITLISTED,
      waitlistPosition: 1
    }
  });

  for (let index = 0; index < fullSectionStudentIds.length; index += 1) {
    const studentId = fullSectionStudentIds[index];
    const suffix = String(index + 1).padStart(2, "0");

    await prisma.enrollment.upsert({
      where: { id: `enrollment-full-cs201-${suffix}` },
      update: {
        studentId,
        termId: IDS.spring2026,
        sectionId: sectionCs201,
        status: EnrollmentStatus.ENROLLED,
        waitlistPosition: null,
        finalGrade: null,
        deletedAt: null,
        droppedAt: null
      },
      create: {
        id: `enrollment-full-cs201-${suffix}`,
        studentId,
        termId: IDS.spring2026,
        sectionId: sectionCs201,
        status: EnrollmentStatus.ENROLLED
      }
    });

    await prisma.enrollment.upsert({
      where: { id: `enrollment-full-math101-${suffix}` },
      update: {
        studentId,
        termId: IDS.spring2026,
        sectionId: sectionMath101,
        status: EnrollmentStatus.ENROLLED,
        waitlistPosition: null,
        finalGrade: null,
        deletedAt: null,
        droppedAt: null
      },
      create: {
        id: `enrollment-full-math101-${suffix}`,
        studentId,
        termId: IDS.spring2026,
        sectionId: sectionMath101,
        status: EnrollmentStatus.ENROLLED
      }
    });
  }

  await prisma.auditLog.upsert({
    where: { id: "audit-seed-admin-login" },
    update: {
      actorUserId: admin.id,
      action: "login",
      entityType: "auth",
      entityId: admin.id,
      metadata: { seeded: true, actor: "admin" }
    },
    create: {
      id: "audit-seed-admin-login",
      actorUserId: admin.id,
      action: "login",
      entityType: "auth",
      entityId: admin.id,
      metadata: { seeded: true, actor: "admin" }
    }
  });

  await prisma.auditLog.upsert({
    where: { id: "audit-seed-registration-submit" },
    update: {
      actorUserId: student1.id,
      action: "registration_submit",
      entityType: "enrollment",
      entityId: "enrollment-student1-cs102",
      metadata: { seeded: true }
    },
    create: {
      id: "audit-seed-registration-submit",
      actorUserId: student1.id,
      action: "registration_submit",
      entityType: "enrollment",
      entityId: "enrollment-student1-cs102",
      metadata: { seeded: true }
    }
  });

  await prisma.auditLog.upsert({
    where: { id: "audit-seed-faculty-assignment" },
    update: {
      actorUserId: admin.id,
      action: "faculty_assignment_seed",
      entityType: "section",
      entityId: sectionCs201,
      metadata: { facultyUserId: faculty.id, seeded: true }
    },
    create: {
      id: "audit-seed-faculty-assignment",
      actorUserId: admin.id,
      action: "faculty_assignment_seed",
      entityType: "section",
      entityId: sectionCs201,
      metadata: { facultyUserId: faculty.id, seeded: true }
    }
  });

  await prisma.auditLog.upsert({
    where: { id: "audit-seed-advisor-assignment" },
    update: {
      actorUserId: admin.id,
      action: "advisor_assignment_seed",
      entityType: "student",
      entityId: student1.id,
      metadata: { advisorUserId: advisor.id, seeded: true }
    },
    create: {
      id: "audit-seed-advisor-assignment",
      actorUserId: admin.id,
      action: "advisor_assignment_seed",
      entityType: "student",
      entityId: student1.id,
      metadata: { advisorUserId: advisor.id, seeded: true }
    }
  });

  await prisma.advisorNote.upsert({
    where: { id: "advisor-note-student1-initial" },
    update: {
      advisorId: advisor.id,
      studentId: student1.id,
      body: "Initial advising note: monitor registration progress for Spring 2026."
    },
    create: {
      id: "advisor-note-student1-initial",
      advisorId: advisor.id,
      studentId: student1.id,
      body: "Initial advising note: monitor registration progress for Spring 2026."
    }
  });

  await prisma.auditLog.upsert({
    where: { id: "audit-seed-waitlist" },
    update: {
      actorUserId: admin.id,
      action: "promote_waitlist",
      entityType: "waitlist",
      entityId: sectionCs201,
      metadata: { seeded: false, note: "Queue seeded for demo" }
    },
    create: {
      id: "audit-seed-waitlist",
      actorUserId: admin.id,
      action: "promote_waitlist",
      entityType: "waitlist",
      entityId: sectionCs201,
      metadata: { seeded: false, note: "Queue seeded for demo" }
    }
  });

  await Promise.all([
    prisma.systemSetting.upsert({
      where: { key: "maintenance_mode" },
      update: { value: "false" },
      create: { key: "maintenance_mode", value: "false" }
    }),
    prisma.systemSetting.upsert({
      where: { key: "max_credits_per_term" },
      update: { value: "18" },
      create: { key: "max_credits_per_term", value: "18" }
    }),
    prisma.systemSetting.upsert({
      where: { key: "registration_message" },
      update: { value: "" },
      create: { key: "registration_message", value: "" }
    })
  ]);

  console.log("Demo accounts:", {
    admin: "admin@sis.edu / Admin@2026!",
    student1: "student1@sis.edu / Student@2026!",
    student2: "student2@sis.edu / Student@2026!",
    faculty1: "faculty1@sis.edu / Faculty@2026!",
    advisor1: "advisor1@sis.edu / Advisor@2026!",
    inviteCodes: ["OPEN-2026", "LIMIT10-2026"]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
