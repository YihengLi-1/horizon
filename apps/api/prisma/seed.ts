import bcrypt from "bcryptjs";
import { EnrollmentStatus, Modality, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const NOW = new Date("2026-03-16T12:00:00.000Z");

const IDS = {
  admin: "seed-admin-univ",
  faculty: "seed-faculty-univ",
  advisor: "seed-advisor-univ",
  fall2024: "seed-term-fall-2024",
  spring2025: "seed-term-spring-2025",
  fall2025: "seed-term-fall-2025-current"
} as const;

type DemoStudent = {
  id: string;
  email: string;
  studentId: string;
  legalName: string;
  major: string;
};

type DemoCourse = {
  id: string;
  code: string;
  title: string;
  description: string;
  credits: number;
};

type DemoSection = {
  id: string;
  termId: string;
  courseSeedId: string;
  sectionCode: string;
  capacity: number;
  modality: Modality;
  instructorName: string;
  instructorUserId?: string;
  location: string;
  startDate: string;
  meetingTimes: Array<{
    id: string;
    weekday: number;
    startMinutes: number;
    endMinutes: number;
  }>;
};

const demoStudents: DemoStudent[] = [
  { id: "seed-student-1", email: "student1@univ.edu", studentId: "U250001", legalName: "Li Ming", major: "Computer Science" },
  { id: "seed-student-2", email: "student2@univ.edu", studentId: "U250002", legalName: "Wang Fang", major: "Business Analytics" },
  { id: "seed-student-3", email: "student3@univ.edu", studentId: "U250003", legalName: "Zhang Wei", major: "Mathematics" },
  { id: "seed-student-4", email: "student4@univ.edu", studentId: "U250004", legalName: "Liu Yang", major: "English" },
  { id: "seed-student-5", email: "student5@univ.edu", studentId: "U250005", legalName: "Chen Jing", major: "Business Administration" }
];

const fillerStudents: DemoStudent[] = Array.from({ length: 30 }, (_, index) => ({
  id: `seed-filler-student-${String(index + 1).padStart(2, "0")}`,
  email: `capacity${String(index + 1).padStart(2, "0")}@univ.edu`,
  studentId: `UF${String(index + 1).padStart(3, "0")}`,
  legalName: `Capacity Student ${String(index + 1).padStart(2, "0")}`,
  major: index % 2 === 0 ? "Computer Science" : "Business"
}));

const courses: DemoCourse[] = [
  { id: "course-cs101", code: "CS101", title: "Introduction to Programming", credits: 3, description: "Build foundational programming skills with practical coding labs." },
  { id: "course-cs102", code: "CS102", title: "Web Foundations", credits: 3, description: "Learn how modern websites are structured, styled, and deployed." },
  { id: "course-cs201", code: "CS201", title: "Data Structures", credits: 4, description: "Study lists, trees, graphs, and algorithmic problem solving." },
  { id: "course-cs301", code: "CS301", title: "Algorithms", credits: 4, description: "Design efficient algorithms with proof techniques and complexity analysis." },
  { id: "course-cs320", code: "CS320", title: "Database Systems", credits: 3, description: "Model data, write SQL, and reason about transactions and indexing." },
  { id: "course-math101", code: "MATH101", title: "College Algebra", credits: 3, description: "Strengthen algebraic reasoning for STEM and business pathways." },
  { id: "course-math201", code: "MATH201", title: "Calculus I", credits: 4, description: "Explore limits, derivatives, and their applications." },
  { id: "course-math220", code: "MATH220", title: "Discrete Mathematics", credits: 3, description: "Cover logic, sets, proofs, and combinatorics for computing." },
  { id: "course-math240", code: "MATH240", title: "Statistics for Decision Making", credits: 3, description: "Apply descriptive and inferential statistics to real scenarios." },
  { id: "course-eng101", code: "ENG101", title: "Academic Writing", credits: 3, description: "Practice analytical writing, source use, and revision." },
  { id: "course-eng201", code: "ENG201", title: "Public Speaking", credits: 2, description: "Develop speaking confidence, structure, and delivery." },
  { id: "course-eng220", code: "ENG220", title: "Technical Communication", credits: 3, description: "Write clear professional and technical documents." },
  { id: "course-bus101", code: "BUS101", title: "Principles of Management", credits: 3, description: "Survey planning, leadership, and organizational behavior." },
  { id: "course-bus210", code: "BUS210", title: "Business Analytics", credits: 3, description: "Use data to support forecasting, reporting, and business choices." },
  { id: "course-bus310", code: "BUS310", title: "Finance Fundamentals", credits: 3, description: "Introduce budgeting, valuation, and financial decision tools." }
];

const sections: DemoSection[] = [
  {
    id: "seed-section-cs101-a",
    termId: IDS.fall2025,
    courseSeedId: "course-cs101",
    sectionCode: "CS101-A",
    capacity: 30,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Ada Stone",
    instructorUserId: IDS.faculty,
    location: "ENG-101",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-cs101-a-1", weekday: 1, startMinutes: 540, endMinutes: 615 },
      { id: "seed-mt-cs101-a-2", weekday: 3, startMinutes: 540, endMinutes: 615 }
    ]
  },
  {
    id: "seed-section-cs101-b",
    termId: IDS.fall2025,
    courseSeedId: "course-cs101",
    sectionCode: "CS101-B",
    capacity: 36,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Rivera",
    location: "ENG-102",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-cs101-b-1", weekday: 2, startMinutes: 660, endMinutes: 735 },
      { id: "seed-mt-cs101-b-2", weekday: 4, startMinutes: 660, endMinutes: 735 }
    ]
  },
  {
    id: "seed-section-cs102-a",
    termId: IDS.fall2025,
    courseSeedId: "course-cs102",
    sectionCode: "CS102-A",
    capacity: 34,
    modality: Modality.ONLINE,
    instructorName: "Dr. Nolan",
    location: "Online",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [{ id: "seed-mt-cs102-a-1", weekday: 5, startMinutes: 600, endMinutes: 675 }]
  },
  {
    id: "seed-section-cs201-a",
    termId: IDS.fall2025,
    courseSeedId: "course-cs201",
    sectionCode: "CS201-A",
    capacity: 32,
    modality: Modality.HYBRID,
    instructorName: "Prof. Ada Stone",
    instructorUserId: IDS.faculty,
    location: "SCI-210",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-cs201-a-1", weekday: 1, startMinutes: 720, endMinutes: 795 },
      { id: "seed-mt-cs201-a-2", weekday: 3, startMinutes: 720, endMinutes: 795 }
    ]
  },
  {
    id: "seed-section-cs301-a",
    termId: IDS.fall2025,
    courseSeedId: "course-cs301",
    sectionCode: "CS301-A",
    capacity: 34,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Gomez",
    location: "SCI-305",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-cs301-a-1", weekday: 2, startMinutes: 840, endMinutes: 915 },
      { id: "seed-mt-cs301-a-2", weekday: 4, startMinutes: 840, endMinutes: 915 }
    ]
  },
  {
    id: "seed-section-cs320-a",
    termId: IDS.fall2025,
    courseSeedId: "course-cs320",
    sectionCode: "CS320-A",
    capacity: 38,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Patel",
    location: "SCI-120",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-cs320-a-1", weekday: 1, startMinutes: 960, endMinutes: 1035 },
      { id: "seed-mt-cs320-a-2", weekday: 3, startMinutes: 960, endMinutes: 1035 }
    ]
  },
  {
    id: "seed-section-math101-a",
    termId: IDS.fall2025,
    courseSeedId: "course-math101",
    sectionCode: "MATH101-A",
    capacity: 40,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Ortiz",
    location: "MATH-120",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-math101-a-1", weekday: 2, startMinutes: 540, endMinutes: 615 },
      { id: "seed-mt-math101-a-2", weekday: 4, startMinutes: 540, endMinutes: 615 }
    ]
  },
  {
    id: "seed-section-math101-b",
    termId: IDS.fall2025,
    courseSeedId: "course-math101",
    sectionCode: "MATH101-B",
    capacity: 42,
    modality: Modality.ONLINE,
    instructorName: "Dr. Lee",
    location: "Online",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [{ id: "seed-mt-math101-b-1", weekday: 5, startMinutes: 780, endMinutes: 855 }]
  },
  {
    id: "seed-section-math201-a",
    termId: IDS.fall2025,
    courseSeedId: "course-math201",
    sectionCode: "MATH201-A",
    capacity: 36,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Sullivan",
    location: "MATH-220",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-math201-a-1", weekday: 1, startMinutes: 840, endMinutes: 915 },
      { id: "seed-mt-math201-a-2", weekday: 3, startMinutes: 840, endMinutes: 915 }
    ]
  },
  {
    id: "seed-section-math220-a",
    termId: IDS.fall2025,
    courseSeedId: "course-math220",
    sectionCode: "MATH220-A",
    capacity: 34,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Rao",
    location: "MATH-310",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-math220-a-1", weekday: 2, startMinutes: 900, endMinutes: 975 },
      { id: "seed-mt-math220-a-2", weekday: 4, startMinutes: 900, endMinutes: 975 }
    ]
  },
  {
    id: "seed-section-math240-a",
    termId: IDS.fall2025,
    courseSeedId: "course-math240",
    sectionCode: "MATH240-A",
    capacity: 34,
    modality: Modality.HYBRID,
    instructorName: "Dr. Kapoor",
    location: "MATH-315",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-math240-a-1", weekday: 1, startMinutes: 1080, endMinutes: 1155 },
      { id: "seed-mt-math240-a-2", weekday: 3, startMinutes: 1080, endMinutes: 1155 }
    ]
  },
  {
    id: "seed-section-eng101-a",
    termId: IDS.fall2025,
    courseSeedId: "course-eng101",
    sectionCode: "ENG101-A",
    capacity: 32,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Harper",
    location: "HUM-110",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-eng101-a-1", weekday: 1, startMinutes: 660, endMinutes: 735 },
      { id: "seed-mt-eng101-a-2", weekday: 3, startMinutes: 660, endMinutes: 735 }
    ]
  },
  {
    id: "seed-section-eng101-b",
    termId: IDS.fall2025,
    courseSeedId: "course-eng101",
    sectionCode: "ENG101-B",
    capacity: 36,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Harper",
    location: "HUM-115",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-eng101-b-1", weekday: 2, startMinutes: 780, endMinutes: 855 },
      { id: "seed-mt-eng101-b-2", weekday: 4, startMinutes: 780, endMinutes: 855 }
    ]
  },
  {
    id: "seed-section-eng201-a",
    termId: IDS.fall2025,
    courseSeedId: "course-eng201",
    sectionCode: "ENG201-A",
    capacity: 30,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Morgan",
    location: "HUM-205",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [{ id: "seed-mt-eng201-a-1", weekday: 5, startMinutes: 900, endMinutes: 960 }]
  },
  {
    id: "seed-section-eng220-a",
    termId: IDS.fall2025,
    courseSeedId: "course-eng220",
    sectionCode: "ENG220-A",
    capacity: 30,
    modality: Modality.HYBRID,
    instructorName: "Dr. Morgan",
    location: "HUM-310",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-eng220-a-1", weekday: 1, startMinutes: 1140, endMinutes: 1215 },
      { id: "seed-mt-eng220-a-2", weekday: 3, startMinutes: 1140, endMinutes: 1215 }
    ]
  },
  {
    id: "seed-section-bus101-a",
    termId: IDS.fall2025,
    courseSeedId: "course-bus101",
    sectionCode: "BUS101-A",
    capacity: 45,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Kim",
    location: "BUS-201",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-bus101-a-1", weekday: 2, startMinutes: 1020, endMinutes: 1095 },
      { id: "seed-mt-bus101-a-2", weekday: 4, startMinutes: 1020, endMinutes: 1095 }
    ]
  },
  {
    id: "seed-section-bus101-b",
    termId: IDS.fall2025,
    courseSeedId: "course-bus101",
    sectionCode: "BUS101-B",
    capacity: 40,
    modality: Modality.HYBRID,
    instructorName: "Dr. Kim",
    location: "BUS-205",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-bus101-b-1", weekday: 1, startMinutes: 780, endMinutes: 855 },
      { id: "seed-mt-bus101-b-2", weekday: 3, startMinutes: 780, endMinutes: 855 }
    ]
  },
  {
    id: "seed-section-bus210-a",
    termId: IDS.fall2025,
    courseSeedId: "course-bus210",
    sectionCode: "BUS210-A",
    capacity: 38,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Chen",
    location: "BUS-310",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-bus210-a-1", weekday: 2, startMinutes: 1140, endMinutes: 1215 },
      { id: "seed-mt-bus210-a-2", weekday: 4, startMinutes: 1140, endMinutes: 1215 }
    ]
  },
  {
    id: "seed-section-bus210-b",
    termId: IDS.fall2025,
    courseSeedId: "course-bus210",
    sectionCode: "BUS210-B",
    capacity: 34,
    modality: Modality.HYBRID,
    instructorName: "Prof. Chen",
    location: "BUS-315",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-bus210-b-1", weekday: 1, startMinutes: 900, endMinutes: 975 },
      { id: "seed-mt-bus210-b-2", weekday: 3, startMinutes: 900, endMinutes: 975 }
    ]
  },
  {
    id: "seed-section-bus310-a",
    termId: IDS.fall2025,
    courseSeedId: "course-bus310",
    sectionCode: "BUS310-A",
    capacity: 34,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Patel",
    location: "BUS-410",
    startDate: "2026-01-12T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-bus310-a-1", weekday: 5, startMinutes: 1020, endMinutes: 1095 }
    ]
  },
  {
    id: "seed-section-f24-cs101",
    termId: IDS.fall2024,
    courseSeedId: "course-cs101",
    sectionCode: "CS101-F24",
    capacity: 40,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Ada Stone",
    instructorUserId: IDS.faculty,
    location: "ENG-101",
    startDate: "2024-08-26T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-f24-cs101-1", weekday: 1, startMinutes: 540, endMinutes: 615 },
      { id: "seed-mt-f24-cs101-2", weekday: 3, startMinutes: 540, endMinutes: 615 }
    ]
  },
  {
    id: "seed-section-f24-math101",
    termId: IDS.fall2024,
    courseSeedId: "course-math101",
    sectionCode: "MATH101-F24",
    capacity: 40,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Ortiz",
    location: "MATH-120",
    startDate: "2024-08-26T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-f24-math101-1", weekday: 2, startMinutes: 540, endMinutes: 615 },
      { id: "seed-mt-f24-math101-2", weekday: 4, startMinutes: 540, endMinutes: 615 }
    ]
  },
  {
    id: "seed-section-f24-eng101",
    termId: IDS.fall2024,
    courseSeedId: "course-eng101",
    sectionCode: "ENG101-F24",
    capacity: 40,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Harper",
    location: "HUM-110",
    startDate: "2024-08-26T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-f24-eng101-1", weekday: 1, startMinutes: 720, endMinutes: 795 },
      { id: "seed-mt-f24-eng101-2", weekday: 3, startMinutes: 720, endMinutes: 795 }
    ]
  },
  {
    id: "seed-section-f24-bus101",
    termId: IDS.fall2024,
    courseSeedId: "course-bus101",
    sectionCode: "BUS101-F24",
    capacity: 40,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Kim",
    location: "BUS-201",
    startDate: "2024-08-26T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-f24-bus101-1", weekday: 2, startMinutes: 900, endMinutes: 975 },
      { id: "seed-mt-f24-bus101-2", weekday: 4, startMinutes: 900, endMinutes: 975 }
    ]
  },
  {
    id: "seed-section-s25-cs201",
    termId: IDS.spring2025,
    courseSeedId: "course-cs201",
    sectionCode: "CS201-S25",
    capacity: 36,
    modality: Modality.HYBRID,
    instructorName: "Prof. Ada Stone",
    instructorUserId: IDS.faculty,
    location: "SCI-210",
    startDate: "2025-01-13T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-s25-cs201-1", weekday: 1, startMinutes: 630, endMinutes: 705 },
      { id: "seed-mt-s25-cs201-2", weekday: 3, startMinutes: 630, endMinutes: 705 }
    ]
  },
  {
    id: "seed-section-s25-math201",
    termId: IDS.spring2025,
    courseSeedId: "course-math201",
    sectionCode: "MATH201-S25",
    capacity: 36,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Sullivan",
    location: "MATH-220",
    startDate: "2025-01-13T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-s25-math201-1", weekday: 2, startMinutes: 840, endMinutes: 915 },
      { id: "seed-mt-s25-math201-2", weekday: 4, startMinutes: 840, endMinutes: 915 }
    ]
  },
  {
    id: "seed-section-s25-eng220",
    termId: IDS.spring2025,
    courseSeedId: "course-eng220",
    sectionCode: "ENG220-S25",
    capacity: 32,
    modality: Modality.ON_CAMPUS,
    instructorName: "Dr. Morgan",
    location: "HUM-310",
    startDate: "2025-01-13T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-s25-eng220-1", weekday: 1, startMinutes: 1020, endMinutes: 1095 },
      { id: "seed-mt-s25-eng220-2", weekday: 3, startMinutes: 1020, endMinutes: 1095 }
    ]
  },
  {
    id: "seed-section-s25-bus210",
    termId: IDS.spring2025,
    courseSeedId: "course-bus210",
    sectionCode: "BUS210-S25",
    capacity: 34,
    modality: Modality.ON_CAMPUS,
    instructorName: "Prof. Chen",
    location: "BUS-310",
    startDate: "2025-01-13T00:00:00.000Z",
    meetingTimes: [
      { id: "seed-mt-s25-bus210-1", weekday: 2, startMinutes: 1020, endMinutes: 1095 },
      { id: "seed-mt-s25-bus210-2", weekday: 4, startMinutes: 1020, endMinutes: 1095 }
    ]
  }
];

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 86_400_000);
}

function addMonths(base: Date, months: number) {
  const result = new Date(base);
  result.setMonth(result.getMonth() + months);
  return result;
}

async function upsertStudent(student: DemoStudent, passwordHash: string) {
  return prisma.user.upsert({
    where: { email: student.email },
    update: {
      id: student.id,
      studentId: student.studentId,
      passwordHash,
      role: Role.STUDENT,
      emailVerifiedAt: NOW,
      deletedAt: null,
      studentProfile: {
        upsert: {
          create: {
            legalName: student.legalName,
            programMajor: student.major,
            dob: new Date("2005-01-15T00:00:00.000Z"),
            address: "123 Campus Way",
            emergencyContact: "Campus Emergency Contact",
            enrollmentStatus: "ACTIVE",
            academicStatus: "GOOD_STANDING"
          },
          update: {
            legalName: student.legalName,
            programMajor: student.major,
            dob: new Date("2005-01-15T00:00:00.000Z"),
            address: "123 Campus Way",
            emergencyContact: "Campus Emergency Contact",
            enrollmentStatus: "ACTIVE",
            academicStatus: "GOOD_STANDING"
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
      emailVerifiedAt: NOW,
      studentProfile: {
        create: {
          legalName: student.legalName,
          programMajor: student.major,
          dob: new Date("2005-01-15T00:00:00.000Z"),
          address: "123 Campus Way",
          emergencyContact: "Campus Emergency Contact",
          enrollmentStatus: "ACTIVE",
          academicStatus: "GOOD_STANDING"
        }
      }
    }
  });
}

async function upsertStaff() {
  const adminPasswordHash = await bcrypt.hash("Admin1234!", 12);
  const facultyPasswordHash = await bcrypt.hash("Faculty1234!", 12);
  const advisorPasswordHash = await bcrypt.hash("Advisor1234!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@univ.edu" },
    update: {
      id: IDS.admin,
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      emailVerifiedAt: NOW,
      deletedAt: null
    },
    create: {
      id: IDS.admin,
      email: "admin@univ.edu",
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      emailVerifiedAt: NOW
    }
  });

  const faculty = await prisma.user.upsert({
    where: { email: "faculty1@univ.edu" },
    update: {
      id: IDS.faculty,
      passwordHash: facultyPasswordHash,
      role: Role.FACULTY,
      emailVerifiedAt: NOW,
      deletedAt: null,
      facultyProfile: {
        upsert: {
          create: {
            displayName: "Prof. Ada Stone",
            employeeId: "F-1001",
            department: "Computer Science",
            title: "Professor"
          },
          update: {
            displayName: "Prof. Ada Stone",
            employeeId: "F-1001",
            department: "Computer Science",
            title: "Professor"
          }
        }
      }
    },
    create: {
      id: IDS.faculty,
      email: "faculty1@univ.edu",
      passwordHash: facultyPasswordHash,
      role: Role.FACULTY,
      emailVerifiedAt: NOW,
      facultyProfile: {
        create: {
          displayName: "Prof. Ada Stone",
          employeeId: "F-1001",
          department: "Computer Science",
          title: "Professor"
        }
      }
    }
  });

  const advisor = await prisma.user.upsert({
    where: { email: "advisor1@univ.edu" },
    update: {
      id: IDS.advisor,
      passwordHash: advisorPasswordHash,
      role: Role.ADVISOR,
      emailVerifiedAt: NOW,
      deletedAt: null,
      advisorProfile: {
        upsert: {
          create: {
            displayName: "Jordan Reyes",
            employeeId: "A-1001",
            department: "Student Success",
            officeLocation: "SSC 210"
          },
          update: {
            displayName: "Jordan Reyes",
            employeeId: "A-1001",
            department: "Student Success",
            officeLocation: "SSC 210"
          }
        }
      }
    },
    create: {
      id: IDS.advisor,
      email: "advisor1@univ.edu",
      passwordHash: advisorPasswordHash,
      role: Role.ADVISOR,
      emailVerifiedAt: NOW,
      advisorProfile: {
        create: {
          displayName: "Jordan Reyes",
          employeeId: "A-1001",
          department: "Student Success",
          officeLocation: "SSC 210"
        }
      }
    }
  });

  return { admin, faculty, advisor };
}

async function seedTerms() {
  const currentCloseAt = addMonths(NOW, 3);
  const currentDropDeadline = addDays(NOW, 30);

  await prisma.term.upsert({
    where: { id: IDS.fall2024 },
    update: {
      name: "2024秋",
      startDate: new Date("2024-08-26T00:00:00.000Z"),
      endDate: new Date("2024-12-20T23:59:59.000Z"),
      registrationOpenAt: new Date("2024-04-15T00:00:00.000Z"),
      registrationCloseAt: new Date("2024-09-05T23:59:59.000Z"),
      registrationOpen: false,
      dropDeadline: new Date("2024-09-13T23:59:59.000Z"),
      maxCredits: 18,
      timezone: "America/Los_Angeles"
    },
    create: {
      id: IDS.fall2024,
      name: "2024秋",
      startDate: new Date("2024-08-26T00:00:00.000Z"),
      endDate: new Date("2024-12-20T23:59:59.000Z"),
      registrationOpenAt: new Date("2024-04-15T00:00:00.000Z"),
      registrationCloseAt: new Date("2024-09-05T23:59:59.000Z"),
      registrationOpen: false,
      dropDeadline: new Date("2024-09-13T23:59:59.000Z"),
      maxCredits: 18,
      timezone: "America/Los_Angeles"
    }
  });

  await prisma.term.upsert({
    where: { id: IDS.spring2025 },
    update: {
      name: "2025春",
      startDate: new Date("2025-01-13T00:00:00.000Z"),
      endDate: new Date("2025-05-16T23:59:59.000Z"),
      registrationOpenAt: new Date("2024-11-15T00:00:00.000Z"),
      registrationCloseAt: new Date("2025-01-31T23:59:59.000Z"),
      registrationOpen: false,
      dropDeadline: new Date("2025-02-14T23:59:59.000Z"),
      maxCredits: 18,
      timezone: "America/Los_Angeles"
    },
    create: {
      id: IDS.spring2025,
      name: "2025春",
      startDate: new Date("2025-01-13T00:00:00.000Z"),
      endDate: new Date("2025-05-16T23:59:59.000Z"),
      registrationOpenAt: new Date("2024-11-15T00:00:00.000Z"),
      registrationCloseAt: new Date("2025-01-31T23:59:59.000Z"),
      registrationOpen: false,
      dropDeadline: new Date("2025-02-14T23:59:59.000Z"),
      maxCredits: 18,
      timezone: "America/Los_Angeles"
    }
  });

  await prisma.term.upsert({
    where: { id: IDS.fall2025 },
    update: {
      name: "2025秋",
      startDate: addDays(NOW, -45),
      endDate: addDays(NOW, 90),
      registrationOpenAt: addDays(NOW, -90),
      registrationCloseAt: currentCloseAt,
      registrationOpen: true,
      dropDeadline: currentDropDeadline,
      maxCredits: 20,
      timezone: "America/Los_Angeles"
    },
    create: {
      id: IDS.fall2025,
      name: "2025秋",
      startDate: addDays(NOW, -45),
      endDate: addDays(NOW, 90),
      registrationOpenAt: addDays(NOW, -90),
      registrationCloseAt: currentCloseAt,
      registrationOpen: true,
      dropDeadline: currentDropDeadline,
      maxCredits: 20,
      timezone: "America/Los_Angeles"
    }
  });
}

async function seedCourses() {
  const courseIds = new Map<string, string>();
  for (const course of courses) {
    const stored = await prisma.course.upsert({
      where: { code: course.code },
      update: {
        title: course.title,
        description: course.description,
        credits: course.credits,
        deletedAt: null
      },
      create: {
        id: course.id,
        code: course.code,
        title: course.title,
        description: course.description,
        credits: course.credits
      }
    });
    courseIds.set(course.id, stored.id);
  }

  const prereqPairs = [
    ["course-cs201", "course-cs101"],
    ["course-cs301", "course-cs201"]
  ] as const;

  for (const [courseSeedId, prereqSeedId] of prereqPairs) {
    const courseId = courseIds.get(courseSeedId);
    const prerequisiteCourseId = courseIds.get(prereqSeedId);
    if (!courseId || !prerequisiteCourseId) {
      throw new Error(`Unable to resolve prerequisite link ${courseSeedId} -> ${prereqSeedId}`);
    }
    await prisma.coursePrerequisite.upsert({
      where: {
        courseId_prerequisiteCourseId: {
          courseId,
          prerequisiteCourseId
        }
      },
      update: {},
      create: {
        courseId,
        prerequisiteCourseId
      }
    });
  }

  return courseIds;
}

async function seedSections(courseIds: Map<string, string>) {
  const sectionIds = new Map<string, string>();

  for (const section of sections) {
    const courseId = courseIds.get(section.courseSeedId);
    if (!courseId) throw new Error(`Missing course for section ${section.sectionCode}`);

    const stored = await prisma.section.upsert({
      where: {
        termId_sectionCode: {
          termId: section.termId,
          sectionCode: section.sectionCode
        }
      },
      update: {
        courseId,
        instructorUserId: section.instructorUserId ?? null,
        modality: section.modality,
        capacity: section.capacity,
        credits: courses.find((course) => course.id === section.courseSeedId)?.credits ?? 3,
        instructorName: section.instructorName,
        location: section.location,
        requireApproval: false,
        startDate: new Date(section.startDate)
      },
      create: {
        id: section.id,
        termId: section.termId,
        courseId,
        sectionCode: section.sectionCode,
        instructorUserId: section.instructorUserId ?? null,
        modality: section.modality,
        capacity: section.capacity,
        credits: courses.find((course) => course.id === section.courseSeedId)?.credits ?? 3,
        instructorName: section.instructorName,
        location: section.location,
        requireApproval: false,
        startDate: new Date(section.startDate)
      }
    });

    await prisma.meetingTime.deleteMany({ where: { sectionId: stored.id } });
    await prisma.meetingTime.createMany({
      data: section.meetingTimes.map((meetingTime) => ({
        id: meetingTime.id,
        sectionId: stored.id,
        weekday: meetingTime.weekday,
        startMinutes: meetingTime.startMinutes,
        endMinutes: meetingTime.endMinutes
      }))
    });

    sectionIds.set(section.sectionCode, stored.id);
  }

  return sectionIds;
}

async function seedAnnouncements() {
  const titles = [
    "欢迎来到 2025 秋学期",
    "奖助学金材料截止提醒",
    "图书馆周末开放调整"
  ];

  await prisma.announcement.deleteMany({
    where: { title: { in: titles } }
  });

  await prisma.announcement.createMany({
    data: [
      {
        title: titles[0],
        body: "课程注册、课表查看、成绩和审批流程都已经开放演示。",
        audience: "ALL",
        pinned: true
      },
      {
        title: titles[1],
        body: "请在本周内补交奖助学金材料，逾期将自动关闭补件入口。",
        audience: "STUDENT",
        pinned: false,
        expiresAt: addDays(NOW, 7)
      },
      {
        title: titles[2],
        body: "考试周前夕图书馆将延长夜间开放时间，请留意新安排。",
        audience: "ALL",
        pinned: false
      }
    ]
  });
}

async function seedEnrollments(sectionIds: Map<string, string>) {
  const users = [...demoStudents, ...fillerStudents];
  const userByEmail = new Map<string, { id: string }>();
  const fetchedUsers = await prisma.user.findMany({
    where: { email: { in: users.map((user) => user.email) } },
    select: { id: true, email: true }
  });
  for (const user of fetchedUsers) {
    userByEmail.set(user.email, { id: user.id });
  }

  const mustSection = (sectionCode: string) => {
    const sectionId = sectionIds.get(sectionCode);
    if (!sectionId) throw new Error(`Section ${sectionCode} was not created`);
    return sectionId;
  };

  const enrollmentSeeds: Array<{
    id: string;
    studentEmail: string;
    termId: string;
    sectionCode: string;
    status: EnrollmentStatus;
    finalGrade?: string | null;
    waitlistPosition?: number | null;
    droppedAt?: Date | null;
  }> = [
    { id: "seed-e-s1-f24-cs101", studentEmail: "student1@univ.edu", termId: IDS.fall2024, sectionCode: "CS101-F24", status: EnrollmentStatus.COMPLETED, finalGrade: "A" },
    { id: "seed-e-s1-f24-math101", studentEmail: "student1@univ.edu", termId: IDS.fall2024, sectionCode: "MATH101-F24", status: EnrollmentStatus.COMPLETED, finalGrade: "B+" },
    { id: "seed-e-s1-f24-eng101", studentEmail: "student1@univ.edu", termId: IDS.fall2024, sectionCode: "ENG101-F24", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "seed-e-s1-f24-bus101", studentEmail: "student1@univ.edu", termId: IDS.fall2024, sectionCode: "BUS101-F24", status: EnrollmentStatus.COMPLETED, finalGrade: "B" },
    { id: "seed-e-s1-s25-cs201", studentEmail: "student1@univ.edu", termId: IDS.spring2025, sectionCode: "CS201-S25", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "seed-e-s1-s25-math201", studentEmail: "student1@univ.edu", termId: IDS.spring2025, sectionCode: "MATH201-S25", status: EnrollmentStatus.COMPLETED, finalGrade: "B" },
    { id: "seed-e-s1-s25-eng220", studentEmail: "student1@univ.edu", termId: IDS.spring2025, sectionCode: "ENG220-S25", status: EnrollmentStatus.COMPLETED, finalGrade: "B+" },
    { id: "seed-e-s2-f24-bus101", studentEmail: "student2@univ.edu", termId: IDS.fall2024, sectionCode: "BUS101-F24", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "seed-e-s2-s25-bus210", studentEmail: "student2@univ.edu", termId: IDS.spring2025, sectionCode: "BUS210-S25", status: EnrollmentStatus.COMPLETED, finalGrade: "B+" },
    { id: "seed-e-s3-f24-math101", studentEmail: "student3@univ.edu", termId: IDS.fall2024, sectionCode: "MATH101-F24", status: EnrollmentStatus.COMPLETED, finalGrade: "A" },
    { id: "seed-e-s3-s25-math201", studentEmail: "student3@univ.edu", termId: IDS.spring2025, sectionCode: "MATH201-S25", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "seed-e-s4-f24-eng101", studentEmail: "student4@univ.edu", termId: IDS.fall2024, sectionCode: "ENG101-F24", status: EnrollmentStatus.COMPLETED, finalGrade: "B+" },
    { id: "seed-e-s4-s25-eng220", studentEmail: "student4@univ.edu", termId: IDS.spring2025, sectionCode: "ENG220-S25", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "seed-e-s5-f24-bus101", studentEmail: "student5@univ.edu", termId: IDS.fall2024, sectionCode: "BUS101-F24", status: EnrollmentStatus.COMPLETED, finalGrade: "B" },
    { id: "seed-e-s5-s25-bus210", studentEmail: "student5@univ.edu", termId: IDS.spring2025, sectionCode: "BUS210-S25", status: EnrollmentStatus.COMPLETED, finalGrade: "B-" },

    { id: "seed-e-s1-current-cs301", studentEmail: "student1@univ.edu", termId: IDS.fall2025, sectionCode: "CS301-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s1-current-eng220", studentEmail: "student1@univ.edu", termId: IDS.fall2025, sectionCode: "ENG220-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s1-current-bus210", studentEmail: "student1@univ.edu", termId: IDS.fall2025, sectionCode: "BUS210-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s2-current-math201", studentEmail: "student2@univ.edu", termId: IDS.fall2025, sectionCode: "MATH201-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s2-current-bus310", studentEmail: "student2@univ.edu", termId: IDS.fall2025, sectionCode: "BUS310-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s3-current-cs102", studentEmail: "student3@univ.edu", termId: IDS.fall2025, sectionCode: "CS102-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s3-current-math240", studentEmail: "student3@univ.edu", termId: IDS.fall2025, sectionCode: "MATH240-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s4-current-eng201", studentEmail: "student4@univ.edu", termId: IDS.fall2025, sectionCode: "ENG201-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s4-current-bus101", studentEmail: "student4@univ.edu", termId: IDS.fall2025, sectionCode: "BUS101-A", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s5-current-bus210", studentEmail: "student5@univ.edu", termId: IDS.fall2025, sectionCode: "BUS210-B", status: EnrollmentStatus.ENROLLED },
    { id: "seed-e-s5-current-math101", studentEmail: "student5@univ.edu", termId: IDS.fall2025, sectionCode: "MATH101-A", status: EnrollmentStatus.ENROLLED },

    { id: "seed-e-s2-wait-cs201", studentEmail: "student2@univ.edu", termId: IDS.fall2025, sectionCode: "CS201-A", status: EnrollmentStatus.WAITLISTED, waitlistPosition: 1 },
    { id: "seed-e-s4-wait-eng101", studentEmail: "student4@univ.edu", termId: IDS.fall2025, sectionCode: "ENG101-A", status: EnrollmentStatus.WAITLISTED, waitlistPosition: 1 },
    { id: "seed-e-s5-wait-cs101", studentEmail: "student5@univ.edu", termId: IDS.fall2025, sectionCode: "CS101-A", status: EnrollmentStatus.WAITLISTED, waitlistPosition: 1 }
  ];

  const fullCs101Students = fillerStudents.slice(0, 30);
  for (const student of fullCs101Students) {
    enrollmentSeeds.push({
      id: `seed-e-${student.studentId.toLowerCase()}-cs101a`,
      studentEmail: student.email,
      termId: IDS.fall2025,
      sectionCode: "CS101-A",
      status: EnrollmentStatus.ENROLLED
    });
  }

  const fullEng101Students = [...fillerStudents.slice(0, 30), demoStudents[1], demoStudents[2]];
  for (const student of fullEng101Students) {
    enrollmentSeeds.push({
      id: `seed-e-${student.studentId.toLowerCase()}-eng101a`,
      studentEmail: student.email,
      termId: IDS.fall2025,
      sectionCode: "ENG101-A",
      status: EnrollmentStatus.ENROLLED
    });
  }

  for (const enrollment of enrollmentSeeds) {
    const studentId = userByEmail.get(enrollment.studentEmail)?.id;
    if (!studentId) throw new Error(`Missing user for ${enrollment.studentEmail}`);
    await prisma.enrollment.upsert({
      where: { id: enrollment.id },
      update: {
        studentId,
        termId: enrollment.termId,
        sectionId: mustSection(enrollment.sectionCode),
        status: enrollment.status,
        finalGrade: enrollment.finalGrade ?? null,
        waitlistPosition: enrollment.waitlistPosition ?? null,
        droppedAt: enrollment.droppedAt ?? null,
        deletedAt: null
      },
      create: {
        id: enrollment.id,
        studentId,
        termId: enrollment.termId,
        sectionId: mustSection(enrollment.sectionCode),
        status: enrollment.status,
        finalGrade: enrollment.finalGrade ?? null,
        waitlistPosition: enrollment.waitlistPosition ?? null,
        droppedAt: enrollment.droppedAt ?? null
      }
    });
  }
}

async function seedSupportData(adminId: string, advisorId: string, student1Id: string) {
  await prisma.systemSetting.upsert({
    where: { key: "max_credits_per_term" },
    update: { value: "20" },
    create: { key: "max_credits_per_term", value: "20" }
  });

  await prisma.advisorAssignment.upsert({
    where: { id: "seed-advisor-assignment-student1" },
    update: {
      studentId: student1Id,
      advisorId,
      assignedByUserId: adminId,
      active: true,
      endedAt: null,
      notes: "Primary advisor for demo student 1"
    },
    create: {
      id: "seed-advisor-assignment-student1",
      studentId: student1Id,
      advisorId,
      assignedByUserId: adminId,
      active: true,
      notes: "Primary advisor for demo student 1"
    }
  });

  const seedLogs = [
    { id: "seed-audit-login-admin", actorUserId: adminId, action: "LOGIN", entityType: "auth", entityId: adminId, metadata: { seeded: true } },
    { id: "seed-audit-enroll-s1", actorUserId: student1Id, action: "ENROLL_SUBMIT", entityType: "enrollment", entityId: "seed-e-s1-current-cs301", metadata: { sectionCode: "CS301-A", seeded: true } },
    { id: "seed-audit-drop-s1", actorUserId: student1Id, action: "DROP_VIEW", entityType: "enrollment", entityId: "seed-e-s1-current-eng220", metadata: { sectionCode: "ENG220-A", seeded: true } }
  ];

  for (const log of seedLogs) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      update: log,
      create: log
    });
  }
}

async function main() {
  const studentPasswordHash = await bcrypt.hash("Student1234!", 12);
  const { admin, advisor } = await upsertStaff();

  for (const student of [...demoStudents, ...fillerStudents]) {
    await upsertStudent(student, studentPasswordHash);
  }

  await seedTerms();
  const courseIds = await seedCourses();
  const sectionIds = await seedSections(courseIds);
  await seedAnnouncements();
  await seedEnrollments(sectionIds);

  const student1 = await prisma.user.findUnique({
    where: { email: "student1@univ.edu" },
    select: { id: true }
  });

  if (!student1) {
    throw new Error("student1@univ.edu was not created");
  }

  await seedSupportData(admin.id, advisor.id, student1.id);

  const [termCount, courseCount, sectionCount, userCount, enrollmentCount] = await Promise.all([
    prisma.term.count(),
    prisma.course.count({ where: { deletedAt: null } }),
    prisma.section.count(),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.enrollment.count({ where: { deletedAt: null } })
  ]);

  console.log("Demo accounts:", {
    admin: "admin@univ.edu / Admin1234!",
    student1: "student1@univ.edu / Student1234!",
    student2: "student2@univ.edu / Student1234!",
    student3: "student3@univ.edu / Student1234!",
    student4: "student4@univ.edu / Student1234!",
    student5: "student5@univ.edu / Student1234!"
  });
  console.log(`Terms: ${termCount}, Courses: ${courseCount}, Sections: ${sectionCount}, Users: ${userCount}, Enrollments: ${enrollmentCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
