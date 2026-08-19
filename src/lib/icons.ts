import {
  AlertTriangle,
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Presentation,
  ScrollText,
  Settings,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * Explicit map of every icon name actually referenced by string anywhere in
 * the app (nav items in src/lib/nav.ts, StatCard's `icon` prop across
 * admin/teacher/student), built from a full-repo grep rather than a guess.
 * Named imports above (instead of `import * as Icons from "lucide-react"`)
 * let the bundler tree-shake every icon that isn't in this list — the
 * previous namespace-import + dynamic-lookup pattern shipped the entire
 * icon library to the client on every route.
 *
 * Adding an icon anywhere by name (a new nav entry, a new StatCard call)
 * requires adding it here too, or it silently renders nothing — there's no
 * fallback to the full library anymore.
 */
export const ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Presentation,
  ScrollText,
  Settings,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Wallet,
  XCircle,
};
