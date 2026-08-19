"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Menu, Bell, LogOut } from "lucide-react";
import { ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";
import { logoutAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = ICONS[name];
  return Cmp ? <Cmp className={className} /> : null;
}

export function AppShell({
  nav,
  role,
  displayName,
  children,
}: {
  nav: NavItem[];
  role: string;
  displayName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const roleLabel = role.replace("_", " ").toLowerCase();

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold">iSkillSpot</div>
          <div className="text-[11px] capitalize text-muted-foreground">{roleLabel}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon name={item.icon} className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card shadow-xl">{SidebarInner}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Welcome, <span className="font-medium text-foreground">{displayName}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="#" className="relative rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Notifications">
              <Bell className="h-5 w-5" />
            </Link>
            <form action={logoutAction}>
              <Button variant="outline" size="sm" type="submit">
                <LogOut className="h-4 w-4" /> Logout
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
