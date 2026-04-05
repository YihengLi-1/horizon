import bcrypt from "bcryptjs";
import { EnrollmentStatus, Modality, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const NOW = new Date("2026-03-16T12:00:00.000Z");

const IDS = {
  admin: "seed-admin-univ",
  fall2024: "seed-term-fall-2024",
  spring2025: "seed-term-spring-2025",
  fall2025: "seed-term-fall-2025-current"
} as const;

type DemoStudent = {
  id: string;
  email: string;
  studentId: string;
  legalName: string;
  programMajor: string;
  degreeProgram?: string;
  dob: string;
  address: string;
  emergencyContact: string;
};

type CourseSeed = {
  id: string;
  code: string;
  title: string;
  credits: number;
  description: string;
};

type SectionSeed = {
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
  pattern: keyof typeof MEETING_PATTERNS;
};

const demoStudents: DemoStudent[] = [
  {
    id: "seed-student-1",
    email: "student1@univ.edu",
    studentId: "U250001",
    legalName: "张小明",
    programMajor: "计算机科学与技术",
    degreeProgram: "计算机科学（理学学士）",
    dob: "1999-03-15T00:00:00.000Z",
    address: "上海市杨浦区国定路100号",
    emergencyContact: "张建华 13800000001 父亲"
  },
  {
    id: "seed-student-2",
    email: "student2@univ.edu",
    studentId: "U250002",
    legalName: "李雅文",
    programMajor: "工商管理",
    degreeProgram: "经济学（文学学士）",
    dob: "2000-07-22T00:00:00.000Z",
    address: "浙江省杭州市西湖区学院路28号",
    emergencyContact: "李秀兰 13800000002 母亲"
  },
  {
    id: "seed-student-3",
    email: "student3@univ.edu",
    studentId: "U250003",
    legalName: "王浩然",
    programMajor: "数学与应用数学",
    degreeProgram: "计算机科学（理学学士）",
    dob: "1998-11-08T00:00:00.000Z",
    address: "江苏省南京市鼓楼区汉口路12号",
    emergencyContact: "王志强 13800000003 父亲"
  },
  {
    id: "seed-student-4",
    email: "student4@univ.edu",
    studentId: "U250004",
    legalName: "陈思宇",
    programMajor: "英语",
    dob: "2000-01-19T00:00:00.000Z",
    address: "广东省广州市海珠区新港西路55号",
    emergencyContact: "陈美琴 13800000004 母亲"
  },
  {
    id: "seed-student-5",
    email: "student5@univ.edu",
    studentId: "U250005",
    legalName: "刘晨曦",
    programMajor: "金融学",
    dob: "1999-09-30T00:00:00.000Z",
    address: "湖北省武汉市武昌区珞珈山路18号",
    emergencyContact: "刘海峰 13800000005 父亲"
  }
];

const fillerNames = [
  "赵雨桐", "孙嘉豪", "周梦琪", "吴俊杰", "郑可欣", "冯子涵", "褚嘉宁", "卫子轩", "蒋思远", "沈悦然",
  "韩书航", "杨静怡", "朱明哲", "秦安琪", "尤子昂", "许若彤", "何亦凡", "吕佳宁", "施雨辰", "张嘉慧",
  "孔书睿", "曹天佑", "严雪晴", "华思源", "金子墨", "魏安然", "陶俊熙", "姜若溪", "戚一鸣", "谢清妍"
] as const;

const fillerMajors = ["计算机科学与技术", "工商管理", "数学与应用数学", "英语", "金融学"] as const;

const fillerStudents: DemoStudent[] = fillerNames.map((legalName, index) => ({
  id: `seed-filler-student-${String(index + 1).padStart(2, "0")}`,
  email: `capacity${String(index + 1).padStart(2, "0")}@univ.edu`,
  studentId: `U25${String(index + 101).padStart(4, "0")}`,
  legalName,
  programMajor: fillerMajors[index % fillerMajors.length],
  degreeProgram: fillerMajors[index % fillerMajors.length] === "计算机科学与技术" ? "计算机科学（理学学士）" : undefined,
  dob: new Date(Date.UTC(1999 + (index % 4), (index * 2) % 12, 5 + (index % 20))).toISOString(),
  address: `示范校区学生公寓${(index % 8) + 1}号楼${(index % 5) + 201}室`,
  emergencyContact: `${legalName.slice(0, 1)}家长 1390000${String(index + 1000).slice(-4)} 监护人`
}));

const courses: CourseSeed[] = [
  { id: "course-cs101", code: "CS101", title: "计算机科学导论", credits: 3, description: "介绍计算思维、程序设计基础与信息系统的核心概念。" },
  { id: "course-cs201", code: "CS201", title: "数据结构与算法", credits: 3, description: "学习线性表、树、图及常用算法设计与分析方法。" },
  { id: "course-cs301", code: "CS301", title: "操作系统原理", credits: 3, description: "理解进程管理、内存管理、文件系统与并发控制机制。" },
  { id: "course-cs401", code: "CS401", title: "软件工程", credits: 3, description: "围绕需求分析、架构设计、测试与项目协作展开实践。" },
  { id: "course-cs450", code: "CS450", title: "数据库系统", credits: 3, description: "涵盖关系模型、SQL、事务与数据库应用开发。" },
  { id: "course-math101", code: "MATH101", title: "微积分I", credits: 4, description: "系统学习函数、极限、导数及其在科学问题中的应用。" },
  { id: "course-math201", code: "MATH201", title: "线性代数", credits: 3, description: "学习矩阵运算、线性方程组、特征值与向量空间。" },
  { id: "course-math301", code: "MATH301", title: "概率论与数理统计", credits: 3, description: "建立概率模型并掌握统计推断的核心思想与方法。" },
  { id: "course-eng101", code: "ENG101", title: "大学英语I", credits: 2, description: "强化听说读写综合能力，为后续英语课程打基础。" },
  { id: "course-eng201", code: "ENG201", title: "学术写作", credits: 2, description: "训练学术论文结构、论证表达与文献引用规范。" },
  { id: "course-bus101", code: "BUS101", title: "管理学原理", credits: 3, description: "了解计划、组织、领导与控制等管理核心职能。" },
  { id: "course-bus201", code: "BUS201", title: "市场营销", credits: 3, description: "分析消费者行为、市场细分与营销组合策略。" },
  { id: "course-bus301", code: "BUS301", title: "财务会计", credits: 3, description: "掌握财务报表编制、会计循环与经营结果分析。" },
  { id: "course-bus401", code: "BUS401", title: "战略管理", credits: 3, description: "从行业竞争与组织资源视角理解企业战略决策。" },
  { id: "course-bus450", code: "BUS450", title: "商业伦理", credits: 2, description: "讨论商业情境中的伦理困境、合规责任与社会价值。" }
];

const MEETING_PATTERNS = {
  mwf0800: [
    { weekday: 1, startMinutes: 480, endMinutes: 540 },
    { weekday: 3, startMinutes: 480, endMinutes: 540 },
    { weekday: 5, startMinutes: 480, endMinutes: 540 }
  ],
  tr1000: [
    { weekday: 2, startMinutes: 600, endMinutes: 690 },
    { weekday: 4, startMinutes: 600, endMinutes: 690 }
  ],
  mw1300: [
    { weekday: 1, startMinutes: 780, endMinutes: 870 },
    { weekday: 3, startMinutes: 780, endMinutes: 870 }
  ],
  tr1400: [
    { weekday: 2, startMinutes: 840, endMinutes: 930 },
    { weekday: 4, startMinutes: 840, endMinutes: 930 }
  ],
  mwf1100: [
    { weekday: 1, startMinutes: 660, endMinutes: 720 },
    { weekday: 3, startMinutes: 660, endMinutes: 720 },
    { weekday: 5, startMinutes: 660, endMinutes: 720 }
  ],
  mw1500: [
    { weekday: 1, startMinutes: 900, endMinutes: 990 },
    { weekday: 3, startMinutes: 900, endMinutes: 990 }
  ],
  tr0830: [
    { weekday: 2, startMinutes: 510, endMinutes: 600 },
    { weekday: 4, startMinutes: 510, endMinutes: 600 }
  ],
  fri1300: [{ weekday: 5, startMinutes: 780, endMinutes: 960 }],
  mw1030: [
    { weekday: 1, startMinutes: 630, endMinutes: 720 },
    { weekday: 3, startMinutes: 630, endMinutes: 720 }
  ],
  tr1600: [
    { weekday: 2, startMinutes: 960, endMinutes: 1050 },
    { weekday: 4, startMinutes: 960, endMinutes: 1050 }
  ]
} as const;

const currentSections: SectionSeed[] = [
  { id: "sec-f25-cs101-a", termId: IDS.fall2025, courseSeedId: "course-cs101", sectionCode: "CS101-A", capacity: 30, modality: Modality.ON_CAMPUS, instructorName: "陈建国", instructorUserId: "seed-faculty-1", location: "信息楼101", startDate: "2026-02-23T00:00:00.000Z", pattern: "mwf0800" },
  { id: "sec-f25-cs101-b", termId: IDS.fall2025, courseSeedId: "course-cs101", sectionCode: "CS101-B", capacity: 36, modality: Modality.ON_CAMPUS, instructorName: "李晓华", location: "信息楼103", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr1000" },
  { id: "sec-f25-cs201-a", termId: IDS.fall2025, courseSeedId: "course-cs201", sectionCode: "CS201-A", capacity: 32, modality: Modality.ON_CAMPUS, instructorName: "王建国", location: "信息楼205", startDate: "2026-02-23T00:00:00.000Z", pattern: "mw1300" },
  { id: "sec-f25-cs201-b", termId: IDS.fall2025, courseSeedId: "course-cs201", sectionCode: "CS201-B", capacity: 35, modality: Modality.HYBRID, instructorName: "陈雅琴", location: "信息楼207", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr1400" },
  { id: "sec-f25-cs301-a", termId: IDS.fall2025, courseSeedId: "course-cs301", sectionCode: "CS301-A", capacity: 30, modality: Modality.ON_CAMPUS, instructorName: "刘明远", location: "信息楼301", startDate: "2026-02-23T00:00:00.000Z", pattern: "mwf1100" },
  { id: "sec-f25-cs401-a", termId: IDS.fall2025, courseSeedId: "course-cs401", sectionCode: "CS401-A", capacity: 32, modality: Modality.HYBRID, instructorName: "陈建国", instructorUserId: "seed-faculty-1", location: "信息楼401", startDate: "2026-02-23T00:00:00.000Z", pattern: "mw1500" },
  { id: "sec-f25-cs450-a", termId: IDS.fall2025, courseSeedId: "course-cs450", sectionCode: "CS450-A", capacity: 40, modality: Modality.ON_CAMPUS, instructorName: "李晓华", location: "信息楼305", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr0830" },
  { id: "sec-f25-math101-a", termId: IDS.fall2025, courseSeedId: "course-math101", sectionCode: "MATH101-A", capacity: 48, modality: Modality.ON_CAMPUS, instructorName: "陈雅琴", location: "理学楼120", startDate: "2026-02-23T00:00:00.000Z", pattern: "mwf0800" },
  { id: "sec-f25-math101-b", termId: IDS.fall2025, courseSeedId: "course-math101", sectionCode: "MATH101-B", capacity: 42, modality: Modality.ON_CAMPUS, instructorName: "刘明远", location: "理学楼122", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr1000" },
  { id: "sec-f25-math201-a", termId: IDS.fall2025, courseSeedId: "course-math201", sectionCode: "MATH201-A", capacity: 38, modality: Modality.ON_CAMPUS, instructorName: "张伟明", location: "理学楼220", startDate: "2026-02-23T00:00:00.000Z", pattern: "mw1030" },
  { id: "sec-f25-math301-a", termId: IDS.fall2025, courseSeedId: "course-math301", sectionCode: "MATH301-A", capacity: 35, modality: Modality.ON_CAMPUS, instructorName: "李晓华", location: "理学楼320", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr1600" },
  { id: "sec-f25-eng101-a", termId: IDS.fall2025, courseSeedId: "course-eng101", sectionCode: "ENG101-A", capacity: 30, modality: Modality.ON_CAMPUS, instructorName: "王建国", location: "人文楼108", startDate: "2026-02-23T00:00:00.000Z", pattern: "mw1300" },
  { id: "sec-f25-eng101-b", termId: IDS.fall2025, courseSeedId: "course-eng101", sectionCode: "ENG101-B", capacity: 34, modality: Modality.ON_CAMPUS, instructorName: "陈雅琴", location: "人文楼110", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr1400" },
  { id: "sec-f25-eng201-a", termId: IDS.fall2025, courseSeedId: "course-eng201", sectionCode: "ENG201-A", capacity: 32, modality: Modality.HYBRID, instructorName: "刘明远", location: "人文楼206", startDate: "2026-02-23T00:00:00.000Z", pattern: "mw1500" },
  { id: "sec-f25-bus101-a", termId: IDS.fall2025, courseSeedId: "course-bus101", sectionCode: "BUS101-A", capacity: 30, modality: Modality.ON_CAMPUS, instructorName: "张伟明", location: "商学院201", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr1000" },
  { id: "sec-f25-bus101-b", termId: IDS.fall2025, courseSeedId: "course-bus101", sectionCode: "BUS101-B", capacity: 45, modality: Modality.ON_CAMPUS, instructorName: "李晓华", location: "商学院203", startDate: "2026-02-23T00:00:00.000Z", pattern: "mw1030" },
  { id: "sec-f25-bus201-a", termId: IDS.fall2025, courseSeedId: "course-bus201", sectionCode: "BUS201-A", capacity: 38, modality: Modality.ON_CAMPUS, instructorName: "王建国", location: "商学院305", startDate: "2026-02-23T00:00:00.000Z", pattern: "mwf1100" },
  { id: "sec-f25-bus301-a", termId: IDS.fall2025, courseSeedId: "course-bus301", sectionCode: "BUS301-A", capacity: 36, modality: Modality.ON_CAMPUS, instructorName: "陈雅琴", location: "商学院401", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr1400" },
  { id: "sec-f25-bus401-a", termId: IDS.fall2025, courseSeedId: "course-bus401", sectionCode: "BUS401-A", capacity: 32, modality: Modality.HYBRID, instructorName: "刘明远", location: "商学院405", startDate: "2026-02-23T00:00:00.000Z", pattern: "tr0830" },
  { id: "sec-f25-bus450-a", termId: IDS.fall2025, courseSeedId: "course-bus450", sectionCode: "BUS450-A", capacity: 33, modality: Modality.ONLINE, instructorName: "张伟明", location: "在线教学", startDate: "2026-02-23T00:00:00.000Z", pattern: "fri1300" }
];

const historicalSections: SectionSeed[] = [
  { id: "sec-f24-cs101", termId: IDS.fall2024, courseSeedId: "course-cs101", sectionCode: "CS101-F24", capacity: 40, modality: Modality.ON_CAMPUS, instructorName: "张伟明", location: "信息楼101", startDate: "2024-09-02T00:00:00.000Z", pattern: "mwf0800" },
  { id: "sec-f24-math101", termId: IDS.fall2024, courseSeedId: "course-math101", sectionCode: "MATH101-F24", capacity: 42, modality: Modality.ON_CAMPUS, instructorName: "李晓华", location: "理学楼120", startDate: "2024-09-02T00:00:00.000Z", pattern: "tr1000" },
  { id: "sec-f24-eng101", termId: IDS.fall2024, courseSeedId: "course-eng101", sectionCode: "ENG101-F24", capacity: 40, modality: Modality.ON_CAMPUS, instructorName: "王建国", location: "人文楼108", startDate: "2024-09-02T00:00:00.000Z", pattern: "mw1300" },
  { id: "sec-f24-bus101", termId: IDS.fall2024, courseSeedId: "course-bus101", sectionCode: "BUS101-F24", capacity: 40, modality: Modality.ON_CAMPUS, instructorName: "陈雅琴", location: "商学院201", startDate: "2024-09-02T00:00:00.000Z", pattern: "tr1400" },
  { id: "sec-s25-cs201", termId: IDS.spring2025, courseSeedId: "course-cs201", sectionCode: "CS201-S25", capacity: 36, modality: Modality.ON_CAMPUS, instructorName: "刘明远", location: "信息楼205", startDate: "2025-02-17T00:00:00.000Z", pattern: "mwf1100" },
  { id: "sec-s25-cs301", termId: IDS.spring2025, courseSeedId: "course-cs301", sectionCode: "CS301-S25", capacity: 34, modality: Modality.HYBRID, instructorName: "张伟明", location: "信息楼301", startDate: "2025-02-17T00:00:00.000Z", pattern: "mw1500" },
  { id: "sec-s25-math201", termId: IDS.spring2025, courseSeedId: "course-math201", sectionCode: "MATH201-S25", capacity: 36, modality: Modality.ON_CAMPUS, instructorName: "李晓华", location: "理学楼220", startDate: "2025-02-17T00:00:00.000Z", pattern: "tr0830" },
  { id: "sec-s25-bus201", termId: IDS.spring2025, courseSeedId: "course-bus201", sectionCode: "BUS201-S25", capacity: 38, modality: Modality.ON_CAMPUS, instructorName: "王建国", location: "商学院305", startDate: "2025-02-17T00:00:00.000Z", pattern: "tr1600" }
];

function addDays(base: Date, days: number) {
  return new Date(base.getTime() + days * 86_400_000);
}

function buildMeetingTimes(sectionId: string, pattern: keyof typeof MEETING_PATTERNS) {
  return MEETING_PATTERNS[pattern].map((meeting, index) => ({
    id: `${sectionId}-mt-${index + 1}`,
    weekday: meeting.weekday,
    startMinutes: meeting.startMinutes,
    endMinutes: meeting.endMinutes
  }));
}

async function resetDatabase() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const quoted = tables.map((table) => `"${table.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

async function seedUsers() {
  const adminPasswordHash = await bcrypt.hash("Admin1234!", 12);
  const studentPasswordHash = await bcrypt.hash("Student1234!", 12);
  const facultyPasswordHash = await bcrypt.hash("Faculty1234!", 12);
  const advisorPasswordHash = await bcrypt.hash("Advisor1234!", 12);

  await prisma.user.create({
    data: {
      id: IDS.admin,
      email: "admin@univ.edu",
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      emailVerifiedAt: NOW
    }
  });

  // Demo faculty account
  await prisma.user.create({
    data: {
      id: "seed-faculty-1",
      email: "faculty1@univ.edu",
      passwordHash: facultyPasswordHash,
      role: Role.FACULTY,
      emailVerifiedAt: NOW,
      facultyProfile: {
        create: {
          displayName: "陈建国",
          department: "计算机科学",
          title: "副教授"
        }
      }
    }
  });

  // Demo advisor account
  await prisma.user.create({
    data: {
      id: "seed-advisor-1",
      email: "advisor1@univ.edu",
      passwordHash: advisorPasswordHash,
      role: Role.ADVISOR,
      emailVerifiedAt: NOW,
      advisorProfile: {
        create: {
          displayName: "刘晓燕",
          department: "学生事务处",
          officeLocation: "行政楼 B201"
        }
      }
    }
  });

  const allStudents = [...demoStudents, ...fillerStudents];
  for (const student of allStudents) {
    await prisma.user.create({
      data: {
        id: student.id,
        email: student.email,
        studentId: student.studentId,
        passwordHash: studentPasswordHash,
        role: Role.STUDENT,
        degreeProgram: student.degreeProgram ?? null,
        emailVerifiedAt: NOW,
        studentProfile: {
          create: {
            legalName: student.legalName,
            programMajor: student.programMajor,
            dob: new Date(student.dob),
            address: student.address,
            emergencyContact: student.emergencyContact,
            enrollmentStatus: "ACTIVE",
            academicStatus: "GOOD_STANDING"
          }
        }
      }
    });
  }
}

async function seedDegreePrograms() {
  await prisma.degreeProgram.create({
    data: {
      name: "计算机科学（理学学士）",
      totalCredits: 120,
      minGpa: 2.0,
      requirements: {
        create: [
          {
            category: "core",
            label: "计算机核心课程",
            minCredits: 36,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["CS"],
            minGrade: "D"
          },
          {
            category: "distribution",
            label: "数学要求",
            minCredits: 12,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["MATH"],
            minGrade: "D"
          },
          {
            category: "elective",
            label: "自由选修",
            minCredits: 30,
            minCourses: 0,
            courseCodes: [],
            prefixes: [],
            minGrade: "D"
          }
        ]
      }
    }
  });

  await prisma.degreeProgram.create({
    data: {
      name: "经济学（文学学士）",
      totalCredits: 120,
      minGpa: 2.0,
      requirements: {
        create: [
          {
            category: "core",
            label: "经济学核心课程",
            minCredits: 30,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["ECON"],
            minGrade: "D"
          },
          {
            category: "elective",
            label: "社会科学选修",
            minCredits: 18,
            minCourses: 0,
            courseCodes: [],
            prefixes: [],
            minGrade: "D"
          }
        ]
      }
    }
  });

  await prisma.degreeProgram.create({
    data: {
      name: "工商管理（学士）",
      totalCredits: 120,
      minGpa: 2.0,
      requirements: {
        create: [
          {
            category: "core",
            label: "管理学核心课程",
            minCredits: 36,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["MGMT", "ACCT", "MKTG", "FINA"],
            minGrade: "D"
          },
          {
            category: "distribution",
            label: "经济学基础",
            minCredits: 12,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["ECON"],
            minGrade: "D"
          },
          {
            category: "elective",
            label: "自由选修",
            minCredits: 30,
            minCourses: 0,
            courseCodes: [],
            prefixes: [],
            minGrade: "D"
          }
        ]
      }
    }
  });

  await prisma.degreeProgram.create({
    data: {
      name: "数学（理学学士）",
      totalCredits: 120,
      minGpa: 2.0,
      requirements: {
        create: [
          {
            category: "core",
            label: "数学核心课程",
            minCredits: 42,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["MATH"],
            minGrade: "C-"
          },
          {
            category: "distribution",
            label: "自然科学要求",
            minCredits: 12,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["PHYS", "CS"],
            minGrade: "D"
          },
          {
            category: "elective",
            label: "自由选修",
            minCredits: 24,
            minCourses: 0,
            courseCodes: [],
            prefixes: [],
            minGrade: "D"
          }
        ]
      }
    }
  });

  await prisma.degreeProgram.create({
    data: {
      name: "英语（文学学士）",
      totalCredits: 120,
      minGpa: 2.0,
      requirements: {
        create: [
          {
            category: "core",
            label: "英语语言文学核心",
            minCredits: 36,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["ENGL"],
            minGrade: "D"
          },
          {
            category: "distribution",
            label: "人文社科选修",
            minCredits: 18,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["HIST", "PHIL", "SOC"],
            minGrade: "D"
          },
          {
            category: "elective",
            label: "自由选修",
            minCredits: 24,
            minCourses: 0,
            courseCodes: [],
            prefixes: [],
            minGrade: "D"
          }
        ]
      }
    }
  });

  await prisma.degreeProgram.create({
    data: {
      name: "金融学（经济学士）",
      totalCredits: 120,
      minGpa: 2.3,
      requirements: {
        create: [
          {
            category: "core",
            label: "金融学核心课程",
            minCredits: 36,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["FINA"],
            minGrade: "C"
          },
          {
            category: "distribution",
            label: "经济与管理基础",
            minCredits: 18,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["ECON", "ACCT", "MGMT"],
            minGrade: "D"
          },
          {
            category: "distribution",
            label: "数学与统计要求",
            minCredits: 12,
            minCourses: 0,
            courseCodes: [],
            prefixes: ["MATH", "STAT"],
            minGrade: "C-"
          },
          {
            category: "elective",
            label: "自由选修",
            minCredits: 18,
            minCourses: 0,
            courseCodes: [],
            prefixes: [],
            minGrade: "D"
          }
        ]
      }
    }
  });
}

async function seedTerms() {
  await prisma.term.createMany({
    data: [
      {
        id: IDS.fall2024,
        name: "2024年秋季学期",
        startDate: new Date("2024-09-02T00:00:00.000Z"),
        endDate: new Date("2024-12-20T23:59:59.000Z"),
        registrationOpenAt: new Date("2024-06-10T08:00:00.000Z"),
        registrationCloseAt: new Date("2024-09-06T23:59:59.000Z"),
        registrationOpen: false,
        dropDeadline: new Date("2024-09-20T23:59:59.000Z"),
        maxCredits: 18,
        timezone: "America/Los_Angeles"
      },
      {
        id: IDS.spring2025,
        name: "2025年春季学期",
        startDate: new Date("2025-02-17T00:00:00.000Z"),
        endDate: new Date("2025-06-20T23:59:59.000Z"),
        registrationOpenAt: new Date("2024-12-10T08:00:00.000Z"),
        registrationCloseAt: new Date("2025-02-21T23:59:59.000Z"),
        registrationOpen: false,
        dropDeadline: new Date("2025-03-07T23:59:59.000Z"),
        maxCredits: 18,
        timezone: "America/Los_Angeles"
      },
      {
        id: IDS.fall2025,
        name: "2025年秋季学期",
        startDate: addDays(NOW, -21),
        endDate: addDays(NOW, 90),
        registrationOpenAt: addDays(NOW, -45),
        registrationCloseAt: addDays(NOW, 90),
        registrationOpen: true,
        dropDeadline: addDays(NOW, 30),
        maxCredits: 20,
        timezone: "America/Los_Angeles"
      }
    ]
  });
}

async function seedCourses() {
  await prisma.course.createMany({
    data: courses.map((course) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      credits: course.credits,
      description: course.description
    }))
  });

  const prerequisites = [
    ["course-cs201", "course-cs101"],
    ["course-cs301", "course-cs201"],
    ["course-cs401", "course-cs301"]
  ] as const;

  await prisma.coursePrerequisite.createMany({
    data: prerequisites.map(([courseId, prerequisiteCourseId]) => ({
      courseId,
      prerequisiteCourseId
    }))
  });
}

async function seedSections() {
  const allSections = [...currentSections, ...historicalSections];

  for (const section of allSections) {
    const course = courses.find((courseItem) => courseItem.id === section.courseSeedId);
    if (!course) {
      throw new Error(`课程未找到：${section.courseSeedId}`);
    }

    await prisma.section.create({
      data: {
        id: section.id,
        termId: section.termId,
        courseId: section.courseSeedId,
        sectionCode: section.sectionCode,
        modality: section.modality,
        capacity: section.capacity,
        credits: course.credits,
        instructorName: section.instructorName,
        instructorUserId: section.instructorUserId ?? null,
        location: section.location,
        startDate: new Date(section.startDate),
        meetingTimes: {
          create: buildMeetingTimes(section.id, section.pattern)
        }
      }
    });
  }
}

async function seedAnnouncements() {
  await prisma.announcement.createMany({
    data: [
      {
        title: "2025年秋季选课将于9月1日08:00开放，请提前确认学籍状态",
        body: "请同学们在选课开始前检查个人学籍状态、课程先修要求及选课限制，避免影响正式提交。",
        audience: "ALL",
        pinned: true,
        active: true
      },
      {
        title: "关于期末考试安排的通知",
        body: "本学期期末考试时间表将在教学事务系统内统一发布，请及时关注院系通知并按时参加考试。",
        audience: "ALL",
        pinned: false,
        active: true,
        expiresAt: addDays(NOW, 10)
      },
      {
        title: "图书馆数字资源访问升级公告",
        body: "图书馆已完成电子期刊与数据库访问升级，校外访问请通过统一身份认证入口登录。",
        audience: "ALL",
        pinned: false,
        active: true
      }
    ]
  });
}

async function seedEnrollments() {
  const getUserId = (email: string) => {
    const match = [...demoStudents, ...fillerStudents].find((student) => student.email === email);
    if (!match) throw new Error(`未找到学生账号：${email}`);
    return match.id;
  };

  const enrollmentSeeds: Array<{
    id: string;
    studentId: string;
    termId: string;
    sectionId: string;
    status: EnrollmentStatus;
    finalGrade?: string | null;
    waitlistPosition?: number | null;
    droppedAt?: Date | null;
  }> = [
    { id: "enr-s1-f24-cs101", studentId: "seed-student-1", termId: IDS.fall2024, sectionId: "sec-f24-cs101", status: EnrollmentStatus.COMPLETED, finalGrade: "A" },
    { id: "enr-s1-f24-math101", studentId: "seed-student-1", termId: IDS.fall2024, sectionId: "sec-f24-math101", status: EnrollmentStatus.COMPLETED, finalGrade: "B+" },
    { id: "enr-s1-f24-eng101", studentId: "seed-student-1", termId: IDS.fall2024, sectionId: "sec-f24-eng101", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "enr-s1-f24-bus101", studentId: "seed-student-1", termId: IDS.fall2024, sectionId: "sec-f24-bus101", status: EnrollmentStatus.COMPLETED, finalGrade: "B" },
    { id: "enr-s1-s25-cs201", studentId: "seed-student-1", termId: IDS.spring2025, sectionId: "sec-s25-cs201", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "enr-s1-s25-cs301", studentId: "seed-student-1", termId: IDS.spring2025, sectionId: "sec-s25-cs301", status: EnrollmentStatus.COMPLETED, finalGrade: "B+" },
    { id: "enr-s1-s25-math201", studentId: "seed-student-1", termId: IDS.spring2025, sectionId: "sec-s25-math201", status: EnrollmentStatus.COMPLETED, finalGrade: "B" },
    { id: "enr-s1-s25-bus201", studentId: "seed-student-1", termId: IDS.spring2025, sectionId: "sec-s25-bus201", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },

    { id: "enr-s2-f24-bus101", studentId: "seed-student-2", termId: IDS.fall2024, sectionId: "sec-f24-bus101", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "enr-s2-s25-bus201", studentId: "seed-student-2", termId: IDS.spring2025, sectionId: "sec-s25-bus201", status: EnrollmentStatus.COMPLETED, finalGrade: "B+" },
    { id: "enr-s3-f24-math101", studentId: "seed-student-3", termId: IDS.fall2024, sectionId: "sec-f24-math101", status: EnrollmentStatus.COMPLETED, finalGrade: "A" },
    { id: "enr-s3-s25-math201", studentId: "seed-student-3", termId: IDS.spring2025, sectionId: "sec-s25-math201", status: EnrollmentStatus.COMPLETED, finalGrade: "A-" },
    { id: "enr-s4-f24-eng101", studentId: "seed-student-4", termId: IDS.fall2024, sectionId: "sec-f24-eng101", status: EnrollmentStatus.COMPLETED, finalGrade: "B+" },
    { id: "enr-s4-s25-bus201", studentId: "seed-student-4", termId: IDS.spring2025, sectionId: "sec-s25-bus201", status: EnrollmentStatus.COMPLETED, finalGrade: "B" },
    { id: "enr-s5-f24-bus101", studentId: "seed-student-5", termId: IDS.fall2024, sectionId: "sec-f24-bus101", status: EnrollmentStatus.COMPLETED, finalGrade: "B" },
    { id: "enr-s5-s25-math201", studentId: "seed-student-5", termId: IDS.spring2025, sectionId: "sec-s25-math201", status: EnrollmentStatus.COMPLETED, finalGrade: "B-" },

    { id: "enr-s1-f25-cs401", studentId: "seed-student-1", termId: IDS.fall2025, sectionId: "sec-f25-cs401-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s1-f25-cs450", studentId: "seed-student-1", termId: IDS.fall2025, sectionId: "sec-f25-cs450-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s1-f25-eng201", studentId: "seed-student-1", termId: IDS.fall2025, sectionId: "sec-f25-eng201-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s2-f25-bus301", studentId: "seed-student-2", termId: IDS.fall2025, sectionId: "sec-f25-bus301-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s2-f25-bus401", studentId: "seed-student-2", termId: IDS.fall2025, sectionId: "sec-f25-bus401-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s2-f25-math301", studentId: "seed-student-2", termId: IDS.fall2025, sectionId: "sec-f25-math301-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s3-f25-cs450", studentId: "seed-student-3", termId: IDS.fall2025, sectionId: "sec-f25-cs450-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s3-f25-math201", studentId: "seed-student-3", termId: IDS.fall2025, sectionId: "sec-f25-math201-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s3-f25-eng101b", studentId: "seed-student-3", termId: IDS.fall2025, sectionId: "sec-f25-eng101-b", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s4-f25-math101b", studentId: "seed-student-4", termId: IDS.fall2025, sectionId: "sec-f25-math101-b", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s4-f25-bus201", studentId: "seed-student-4", termId: IDS.fall2025, sectionId: "sec-f25-bus201-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s4-f25-bus450", studentId: "seed-student-4", termId: IDS.fall2025, sectionId: "sec-f25-bus450-a", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s5-f25-cs201b", studentId: "seed-student-5", termId: IDS.fall2025, sectionId: "sec-f25-cs201-b", status: EnrollmentStatus.ENROLLED },
    { id: "enr-s5-f25-bus101b", studentId: "seed-student-5", termId: IDS.fall2025, sectionId: "sec-f25-bus101-b", status: EnrollmentStatus.ENROLLED },

    { id: "enr-s2-wait-cs101a", studentId: "seed-student-2", termId: IDS.fall2025, sectionId: "sec-f25-cs101-a", status: EnrollmentStatus.WAITLISTED, waitlistPosition: 1 },
    { id: "enr-s4-wait-bus101a", studentId: "seed-student-4", termId: IDS.fall2025, sectionId: "sec-f25-bus101-a", status: EnrollmentStatus.WAITLISTED, waitlistPosition: 1 },
    { id: "enr-s5-wait-cs101a", studentId: "seed-student-5", termId: IDS.fall2025, sectionId: "sec-f25-cs101-a", status: EnrollmentStatus.WAITLISTED, waitlistPosition: 2 }
  ];

  for (const filler of fillerStudents) {
    enrollmentSeeds.push({
      id: `enr-${filler.id}-cs101a`,
      studentId: filler.id,
      termId: IDS.fall2025,
      sectionId: "sec-f25-cs101-a",
      status: EnrollmentStatus.ENROLLED
    });

    enrollmentSeeds.push({
      id: `enr-${filler.id}-bus101a`,
      studentId: filler.id,
      termId: IDS.fall2025,
      sectionId: "sec-f25-bus101-a",
      status: EnrollmentStatus.ENROLLED
    });
  }

  await prisma.enrollment.createMany({
    data: enrollmentSeeds.map((enrollment) => ({
      id: enrollment.id,
      studentId: enrollment.studentId,
      termId: enrollment.termId,
      sectionId: enrollment.sectionId,
      status: enrollment.status,
      finalGrade: enrollment.finalGrade ?? null,
      waitlistPosition: enrollment.waitlistPosition ?? null,
      droppedAt: enrollment.droppedAt ?? null
    }))
  });
}

async function seedAdvisorAssignments() {
  // Assign advisor1 to the first 3 demo students so advisor dashboard shows real data
  await prisma.advisorAssignment.createMany({
    data: [
      { studentId: "seed-student-1", advisorId: "seed-advisor-1", assignedByUserId: IDS.admin, active: true },
      { studentId: "seed-student-2", advisorId: "seed-advisor-1", assignedByUserId: IDS.admin, active: true },
      { studentId: "seed-student-3", advisorId: "seed-advisor-1", assignedByUserId: IDS.admin, active: true },
    ]
  });
}

async function seedSupportData() {
  await prisma.systemSetting.createMany({
    data: [
      { key: "max_credits_per_term", value: "20" },
      { key: "registration_message", value: "请同学们在提交选课前确认时间冲突、先修要求与学分上限。" }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      {
        id: "audit-seed-s1-enroll-f24",
        actorUserId: "seed-student-1",
        action: "ENROLL_SUBMIT",
        entityType: "enrollment",
        entityId: "enr-s1-f24-cs101",
        metadata: { termId: IDS.fall2024, sectionId: "sec-f24-cs101", courseCode: "CS101" }
      },
      {
        id: "audit-seed-s1-enroll-s25",
        actorUserId: "seed-student-1",
        action: "ENROLL_SUBMIT",
        entityType: "enrollment",
        entityId: "enr-s1-s25-cs201",
        metadata: { termId: IDS.spring2025, sectionId: "sec-s25-cs201", courseCode: "CS201" }
      },
      {
        id: "audit-seed-s1-drop-note",
        actorUserId: "seed-student-1",
        action: "DROP_VIEW",
        entityType: "enrollment",
        entityId: "enr-s1-f25-eng201",
        metadata: { termId: IDS.fall2025, sectionId: "sec-f25-eng201-a", courseCode: "ENG201" }
      }
    ]
  });
}

async function seedInviteCodes() {
  // Seed a demo open invite code so students can self-register without needing a pre-issued code.
  await prisma.inviteCode.upsert({
    where: { code: "OPEN-2026" },
    update: {},
    create: {
      code: "OPEN-2026",
      maxUses: 1000,
      usedCount: 0,
      active: true,
      expiresAt: new Date("2027-12-31T23:59:59Z"),
    },
  });
}

async function main() {
  await resetDatabase();
  await seedDegreePrograms();
  await seedUsers();
  await seedTerms();
  await seedCourses();
  await seedSections();
  await seedAnnouncements();
  await seedEnrollments();
  await seedAdvisorAssignments();
  await seedInviteCodes();
  await seedSupportData();

  const [
    termCount,
    courseCount,
    currentSectionCount,
    totalSectionCount,
    demoUserCount,
    totalUserCount,
    enrollmentCount,
    announcementCount
  ] = await Promise.all([
    prisma.term.count(),
    prisma.course.count({ where: { deletedAt: null } }),
    prisma.section.count({ where: { termId: IDS.fall2025 } }),
    prisma.section.count(),
    prisma.user.count({ where: { email: { in: ["admin@univ.edu", ...demoStudents.map((student) => student.email)] }, deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.enrollment.count({ where: { deletedAt: null } }),
    prisma.announcement.count({ where: { active: true } })
  ]);

  console.log("Demo accounts:", {
    admin:    "admin@univ.edu    / Admin1234!",
    faculty:  "faculty1@univ.edu / Faculty1234!",
    advisor:  "advisor1@univ.edu / Advisor1234!",
    student1: "student1@univ.edu / Student1234!",
    student2: "student2@univ.edu / Student1234!",
    student3: "student3@univ.edu / Student1234!",
    student4: "student4@univ.edu / Student1234!",
    student5: "student5@univ.edu / Student1234!",
    inviteCode: "OPEN-2026 (use at /register to create new student accounts)"
  });
  console.log(`Terms: ${termCount}, Courses: ${courseCount}, Sections: ${currentSectionCount}, Users: ${demoUserCount}, Enrollments: ${enrollmentCount}`);
  console.log(`Seed extras: TotalSections=${totalSectionCount}, TotalUsers=${totalUserCount}, Announcements=${announcementCount}, CapacityFillers=${fillerStudents.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
