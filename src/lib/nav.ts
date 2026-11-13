import type { Role } from "@prisma/client";

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
}

export const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: "LayoutDashboard" },
  { label: "User Accounts", href: "/admin/accounts", icon: "UserCheck" },
  { label: "Students", href: "/admin/students", icon: "Users" },
  { label: "Teachers", href: "/admin/teachers", icon: "GraduationCap" },
  { label: "Courses", href: "/admin/courses", icon: "BookOpen" },
  { label: "Batches", href: "/admin/batches", icon: "Layers" },
  { label: "Attendance", href: "/admin/attendance", icon: "CalendarCheck" },
  { label: "Assignments", href: "/admin/assignments", icon: "FileText" },
  { label: "Quizzes", href: "/admin/quizzes", icon: "ClipboardList" },
  { label: "Grades", href: "/admin/grades", icon: "Award" },
  { label: "Fees", href: "/admin/fees", icon: "Wallet" },
  { label: "Payments", href: "/admin/payments", icon: "CreditCard" },
  { label: "Certificates", href: "/admin/certificates", icon: "BadgeCheck" },
  { label: "Announcements", href: "/admin/announcements", icon: "Megaphone" },
  { label: "Reports", href: "/admin/reports", icon: "BarChart3" },
  { label: "Audit Logs", href: "/admin/audit-logs", icon: "ScrollText" },
];

export const TEACHER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/teacher/dashboard", icon: "LayoutDashboard" },
  { label: "My Batches", href: "/teacher/batches", icon: "Layers" },
  { label: "My Students", href: "/teacher/students", icon: "Users" },
  { label: "My Courses", href: "/teacher/courses", icon: "BookOpen" },
  { label: "Assignments", href: "/teacher/assignments", icon: "FileText" },
  { label: "Quizzes", href: "/teacher/quizzes", icon: "ClipboardList" },
  { label: "Attendance", href: "/teacher/attendance", icon: "CalendarCheck" },
  { label: "Grades", href: "/teacher/grades", icon: "Award" },
  { label: "Reports", href: "/teacher/reports", icon: "BarChart3" },
  { label: "Announcements", href: "/teacher/announcements", icon: "Megaphone" },
];

export const STUDENT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/student/dashboard", icon: "LayoutDashboard" },
  { label: "My Courses", href: "/student/courses", icon: "BookOpen" },
  { label: "Assignments", href: "/student/assignments", icon: "FileText" },
  { label: "Quizzes", href: "/student/quizzes", icon: "ClipboardList" },
  { label: "Attendance", href: "/student/attendance", icon: "CalendarCheck" },
  { label: "Grades", href: "/student/grades", icon: "Award" },
  { label: "Certificates", href: "/student/certificates", icon: "BadgeCheck" },
  { label: "Fees", href: "/student/fees", icon: "Wallet" },
  { label: "Announcements", href: "/student/announcements", icon: "Megaphone" },
  { label: "Profile", href: "/student/profile", icon: "User" },
];

export function navFor(role: Role): NavItem[] {
  switch (role) {
    case "SUPER_ADMIN":
      return [...ADMIN_NAV, { label: "Settings", href: "/admin/settings", icon: "Settings" }];
    case "ADMIN":
      return ADMIN_NAV;
    case "TEACHER":
      return TEACHER_NAV;
    case "STUDENT":
      return STUDENT_NAV;
  }
}
