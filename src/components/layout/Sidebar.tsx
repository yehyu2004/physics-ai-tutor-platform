"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageSquare,
  FileText,
  GraduationCap,
  Sparkles,
  Users,
  Settings,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  BarChart3,
  Menu,
  X,
  Atom,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { UserRole } from "@/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: UserRole[];
  children?: { label: string; href: string }[];
}

const navItems: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "AI Chat", href: "/chat", icon: MessageSquare },
  {
    label: "Assignments",
    href: "/assignments",
    icon: FileText,
    children: [
      { label: "All Assignments", href: "/assignments" },
      { label: "Create New", href: "/assignments/create" },
    ],
  },
  { label: "Grades", href: "/grades", icon: GraduationCap },
  {
    label: "Problem Generator",
    href: "/problems/generate",
    icon: Sparkles,
    roles: ["TA", "ADMIN"],
  },
  {
    label: "Grading",
    href: "/grading",
    icon: ClipboardList,
    roles: ["TA", "ADMIN"],
  },
];

const adminItems: NavItem[] = [
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Q&A History", href: "/admin/qa-history", icon: BarChart3 },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

interface SidebarProps {
  userRole: UserRole;
  userName: string;
}

export default function Sidebar({ userRole, userName }: SidebarProps) {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleExpand = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label)
        ? prev.filter((i) => i !== label)
        : [...prev, label]
    );
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const filteredNavItems = navItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900">
            <Atom className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold">PhysTutor</span>
        </Link>

        <Link href="/chat">
          <Button variant="outline" className="w-full justify-center gap-2">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </Link>
      </div>

      <div className="px-4 mb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search..."
            className="pl-8 h-9 bg-neutral-50 border-neutral-200"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-1 p-2">
          <p className="px-2 text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
            Main Menu
          </p>
          {filteredNavItems.map((item) => (
            <div key={item.label}>
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleExpand(item.label)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-neutral-100 text-neutral-900"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {expandedItems.includes(item.label) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {expandedItems.includes(item.label) && (
                    <div className="ml-7 space-y-1 mt-1">
                      {item.children
                        .filter((child) => {
                          if (child.href === "/assignments/create") {
                            return userRole === "TA" || userRole === "ADMIN";
                          }
                          return true;
                        })
                        .map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              "block rounded-lg px-3 py-1.5 text-sm transition-colors",
                              pathname === child.href
                                ? "text-neutral-900 font-medium"
                                : "text-neutral-500 hover:text-neutral-900"
                            )}
                          >
                            {child.label}
                          </Link>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )}
            </div>
          ))}

          {userRole === "ADMIN" && (
            <>
              <Separator className="my-3" />
              <p className="px-2 text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
                Administration
              </p>
              {adminItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.href)
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-medium">
            {userName?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-neutral-400 capitalize">{userRole.toLowerCase()}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 lg:hidden rounded-lg p-2 bg-white border shadow-sm"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 border-r bg-white transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
