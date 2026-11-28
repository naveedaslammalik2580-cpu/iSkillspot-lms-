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
  { label: "Admissions", href: "/admin/admissions", icon: "UserCheck" },
  { label: "Courses", href: "/admin/courses", icon: "BookOpen" },
  { label: "Batches", href: "/admin/batches", icon: "Layers" },
  { label: "Assignments", href: "/admin/assignments", icon: "FileText" },
  { label: "Quizzes", href: "/admin/quizzes", icon: "ClipboardList" },
  { label: "Fees", href: "/admin/fees", icon: "Wallet" },
  { label: "Payments", href: "/admin/payments", icon: "CreditCard" },
  { label: "Announcements", href: "/admin/announcements", icon: "Megaphone" },
  { label: "Support", href: "/admin/support", icon: "LifeBuoy" },
  { label: "Audit Logs", href: "/admin/audit-logs", icon: "ScrollText" },
];

export const STUDENT_NAV: NavItem[] = [
  { label: "My Courses", href: "/student/courses", icon: "BookOpen" },
  { label: "Quizzes", href: "/student/quizzes", icon: "ClipboardList" },
  { label: "Assignments", href: "/student/assignments", icon: "FileText" },
  { label: "Help & Support", href: "/student/support", icon: "LifeBuoy" },
  { label: "Profile", href: "/student/profile", icon: "User" },
];

export function navFor(role: Role): NavItem[] {
  switch (role) {
    case "SUPER_ADMIN":
      return [...ADMIN_NAV, { label: "Settings", href: "/admin/settings", icon: "Settings" }];
    case "ADMIN":
      return ADMIN_NAV;
    case "STUDENT":
      return STUDENT_NAV;
  }
}
