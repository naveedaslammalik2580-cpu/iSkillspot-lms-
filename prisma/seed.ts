import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const hash = (p: string) => bcrypt.hash(p, 12);
const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_SEED) {
    throw new Error(
      "Refusing to seed in production. Set ALLOW_SEED=1 to override."
    );
  }

  console.log("Seeding iSkillSpot…");

  // Reset (dev only)
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.fee.deleteMany();
  await db.certificate.deleteMany();
  await db.grade.deleteMany();
  await db.quizAttempt.deleteMany();
  await db.quizQuestion.deleteMany();
  await db.quiz.deleteMany();
  await db.assignmentSubmission.deleteMany();
  await db.assignment.deleteMany();
  await db.attendance.deleteMany();
  await db.lessonProgress.deleteMany();
  await db.lessonResource.deleteMany();
  await db.lesson.deleteMany();
  await db.module.deleteMany();
  await db.enrollment.deleteMany();
  await db.batch.deleteMany();
  await db.course.deleteMany();
  await db.announcement.deleteMany();
  await db.notification.deleteMany();
  await db.student.deleteMany();
  await db.teacher.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();

  // Settings
  const settings: Record<string, string> = {
    instituteName: "iSkillSpot",
    studentIdPrefix: "ISP",
    currency: "PKR",
    timezone: "Asia/Karachi",
    attendanceThreshold: "75",
    passingScore: "70",
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.create({ data: { key, value } });
  }

  // Super admin
  await db.user.create({
    data: {
      username: "admin",
      email: "admin@iskillspot.com",
      passwordHash: await hash("Admin@123"),
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  // Teachers
  const teacherSpecs = [
    { name: "Bilal Ahmed", spec: "Video Editing & Motion" },
    { name: "Sana Khan", spec: "Graphic Design" },
    { name: "Usman Tariq", spec: "Digital Marketing & SEO" },
  ];
  const teachers = [];
  for (let i = 0; i < teacherSpecs.length; i++) {
    const t = teacherSpecs[i];
    const user = await db.user.create({
      data: {
        username: `teacher${i + 1}`,
        email: `teacher${i + 1}@iskillspot.com`,
        passwordHash: await hash("Teacher@123"),
        role: "TEACHER",
        status: "ACTIVE",
      },
    });
    const teacher = await db.teacher.create({
      data: { userId: user.id, fullName: t.name, specialization: t.spec, email: user.email, status: "ACTIVE" },
    });
    teachers.push(teacher);
  }

  // Courses
  const courseTitles = [
    "Professional Video Editing",
    "Graphic Design",
    "Digital Marketing",
    "YouTube Automation",
    "Web Development",
  ];
  const courses = [];
  for (const title of courseTitles) {
    const course = await db.course.create({
      data: {
        title,
        slug: slugify(title),
        description: `Comprehensive ${title} course at iSkillSpot.`,
        level: "BEGINNER",
        status: "PUBLISHED",
        duration: "12 weeks",
      },
    });
    // modules + lessons
    for (let m = 1; m <= 3; m++) {
      const mod = await db.module.create({
        data: { courseId: course.id, title: `Module ${m}`, order: m },
      });
      for (let l = 1; l <= 5; l++) {
        await db.lesson.create({
          data: { moduleId: mod.id, title: `Lesson ${m}.${l}`, order: l, isPublished: true },
        });
      }
    }
    courses.push(course);
  }

  // Batches (2 per course)
  const year = new Date().getFullYear();
  const batches = [];
  for (let c = 0; c < courses.length; c++) {
    for (let b = 1; b <= 2; b++) {
      const code = `${courses[c].slug.slice(0, 2).toUpperCase()}-0${b}-${year}`;
      const batch = await db.batch.create({
        data: {
          name: `${courses[c].title} — Batch 0${b}`,
          code,
          courseId: courses[c].id,
          teacherId: teachers[c % teachers.length].id,
          status: "ONGOING",
          schedule: "Mon/Wed/Fri",
          startTime: "18:00",
          endTime: "20:00",
        },
      });
      batches.push(batch);
    }
  }

  // Students
  const firstNames = ["Ahmed", "Ali", "Usman", "Hamza", "Fatima", "Ayesha", "Zain", "Hassan", "Maryam", "Bilal", "Sara", "Omar", "Hira", "Noman", "Iqra", "Saad", "Rabia", "Talha", "Kiran", "Faisal"];
  const statuses = ["ACTIVE", "ACTIVE", "ACTIVE", "COMPLETED", "ON_HOLD", "DROPPED"] as const;

  for (let i = 0; i < 20; i++) {
    const seq = String(i + 1).padStart(4, "0");
    const studentId = `ISP-${year}-${seq}`;
    const fullName = `${firstNames[i]} ${rand(["Khan", "Malik", "Sheikh", "Butt", "Raza"])}`;
    const username = `${firstNames[i].toLowerCase()}.${seq}`;
    const user = await db.user.create({
      data: {
        username,
        email: `${username}@student.iskillspot.com`,
        passwordHash: await hash("Student@123"),
        role: "STUDENT",
        status: "ACTIVE",
        mustChangePassword: i % 4 === 0,
      },
    });
    const batch = batches[i % batches.length];
    const status = statuses[i % statuses.length];
    const student = await db.student.create({
      data: {
        userId: user.id,
        studentId,
        fullName,
        email: user.email,
        phone: `0300${String(1000000 + i).slice(-7)}`,
        city: rand(["Lahore", "Karachi", "Multan", "Islamabad"]),
        status,
        gender: i % 2 === 0 ? "MALE" : "FEMALE",
      },
    });

    const progress = Math.floor(Math.random() * 100);
    await db.enrollment.create({
      data: {
        studentId: student.id,
        courseId: batch.courseId,
        batchId: batch.id,
        progress,
        status: status === "COMPLETED" ? "COMPLETED" : "ACTIVE",
      },
    });

    // Attendance (14 days, varied)
    for (let d = 0; d < 14; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);
      const r = Math.random();
      const attStatus = r < 0.7 ? "PRESENT" : r < 0.85 ? "LATE" : "ABSENT";
      await db.attendance.create({
        data: { studentId: student.id, batchId: batch.id, date, status: attStatus as never },
      });
    }

    // Fee (varied)
    const total = 25000;
    const paid = rand([0, 10000, 25000]);
    await db.fee.create({
      data: {
        studentId: student.id,
        courseId: batch.courseId,
        totalFee: total,
        finalFee: total,
        amountPaid: paid,
        remainingBalance: total - paid,
        status: paid === 0 ? "UNPAID" : paid >= total ? "PAID" : "PARTIAL",
      },
    });

    // A couple of grades
    await db.grade.create({
      data: {
        studentId: student.id,
        courseId: batch.courseId,
        type: "QUIZ",
        title: "Module 1 Quiz",
        score: 60 + Math.floor(Math.random() * 40),
        maxScore: 100,
        percentage: 60 + Math.floor(Math.random() * 40),
      },
    });
  }

  // Announcement
  const admin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  await db.announcement.create({
    data: {
      title: "Welcome to iSkillSpot",
      content: "Your learning journey starts here. Check your dashboard for upcoming classes.",
      createdBy: admin!.id,
      targetRole: "STUDENT",
    },
  });

  console.log("Seed complete.");
  console.log("Login → admin / Admin@123 · teacher1 / Teacher@123 · <student username> / Student@123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
