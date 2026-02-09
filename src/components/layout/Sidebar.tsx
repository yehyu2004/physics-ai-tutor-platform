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
import type { UserRole } from "@/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: UserRole[];
  children?: { label: string; href: string }[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const mainItems: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "AI Chat", href: "/chat", icon: MessageSquare },
  { label: "Grades", href: "/grades", icon: GraduationCap },
];

const toolItems: NavItem[] = [
  {
    label: "Assignments",
    href: "/assignments",
    icon: FileText,
    children: [
      { label: "All Assignments", href: "/assignments" },
      { label: "Create New", href: "/assignments/create" },
    ],
  },
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

  const filterByRole = (items: NavItem[]) =>
    items.filter((item) => !item.roles || item.roles.includes(userRole));

  const sections: NavSection[] = [
    { label: "MAIN", items: filterByRole(mainItems) },
    { label: "TOOLS", items: filterByRole(toolItems) },
  ];

  if (userRole === "ADMIN") {
    sections.push({ label: "ADMIN", items: adminItems });
  }

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);

    if (item.children) {
      const expanded = expandedItems.includes(item.label);
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleExpand(item.label)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200",
                active
                  ? "bg-indigo-100 text-indigo-600"
                  : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
              )}
            >
              <item.icon className="h-4 w-4" />
            </div>
            <span className="flex-1 text-left">{item.label}</span>
            <div
              className={cn(
                "transition-transform duration-200",
                expanded ? "rotate-0" : "-rotate-90"
              )}
            >
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              expanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="ml-10 mt-1 space-y-0.5 border-l-2 border-slate-100 pl-3">
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
                      "block rounded-lg px-3 py-1.5 text-sm transition-all duration-200",
                      pathname === child.href
                        ? "text-indigo-700 font-medium bg-indigo-50/50"
                        : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    {child.label}
                  </Link>
                ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
          active
            ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        )}
      >
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200",
            active
              ? "bg-indigo-100 text-indigo-600"
              : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-700"
          )}
        >
          <item.icon className="h-4 w-4" />
        </div>
        {item.label}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-gradient-to-b from-white via-white to-slate-50/80">
      {/* Branding */}
      <div className="px-5 pt-5 pb-4">
        <Link
          href="/dashboard"
          className="group flex items-center gap-3 mb-5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-200 transition-all duration-200 group-hover:shadow-indigo-300 group-hover:scale-105">
            <Atom className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-700 to-violet-700 bg-clip-text text-transparent">
              PhysTutor
            </span>
            <p className="text-[10px] font-medium text-slate-400 tracking-wide uppercase -mt-0.5">
              AI Physics Platform
            </p>
          </div>
        </Link>

        <Link href="/chat">
          <Button className="w-full justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300 transition-all duration-200 hover:from-indigo-700 hover:to-violet-700 h-10 font-medium">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="px-5 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search..."
            className="pl-9 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:border-indigo-300 focus:ring-indigo-200 transition-all duration-200"
          />
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-6 py-2">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map(renderNavItem)}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* User profile */}
      <div className="border-t border-slate-100 p-4 mx-3 mb-2">
        <div className="flex items-center gap-3 rounded-xl p-2 hover:bg-slate-50 transition-all duration-200 cursor-pointer">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-sm font-semibold text-white shadow-sm">
            {userName?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {userName}
            </p>
            <p className="text-xs text-slate-400 capitalize font-medium">
              {userRole.toLowerCase()}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-300" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden rounded-xl p-2.5 bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? (
          <X className="h-5 w-5 text-slate-700" />
        ) : (
          <Menu className="h-5 w-5 text-slate-700" />
        )}
      </button>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-300",
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-200 bg-white transition-all duration-300 ease-in-out lg:translate-x-0",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
