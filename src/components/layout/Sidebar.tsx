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
  PanelLeftClose,
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ userRole, userName, collapsed = false, onToggleCollapse }: SidebarProps) {
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
    { label: "MAIN MENU", items: filterByRole(mainItems) },
    { label: "TOOLS", items: filterByRole(toolItems) },
  ];

  if (userRole === "ADMIN") {
    sections.push({ label: "ADMIN", items: adminItems });
  }

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);

    if (item.children && !collapsed) {
      const expanded = expandedItems.includes(item.label);
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleExpand(item.label)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-gray-50 text-gray-900 font-semibold"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            <div
              className={cn(
                "transition-transform duration-200",
                expanded ? "rotate-0" : "-rotate-90"
              )}
            >
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </div>
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              expanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="ml-8 mt-1 space-y-0.5 border-l border-gray-200 pl-3">
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
                        ? "text-gray-900 font-medium"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
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
        title={item.label}
        className={cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          active
            ? "bg-gray-50 text-gray-900 font-semibold"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
          collapsed && "justify-center px-2"
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        {!collapsed && item.label}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      {/* Logo and collapse */}
      <div className={cn("flex items-center justify-between pt-5 pb-4", collapsed ? "px-3" : "px-5")}>
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5"
        >
          <Atom className="h-6 w-6 text-gray-900 shrink-0" />
          {!collapsed && (
            <span className="text-lg font-semibold text-gray-900 tracking-tight">
              PhysTutor
            </span>
          )}
        </Link>
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <PanelLeftClose className={cn("h-4 w-4 transition-transform duration-300", collapsed && "rotate-180")} />
        </button>
      </div>

      {/* New Conversation button */}
      <div className={cn("mb-3", collapsed ? "px-2" : "px-4")}>
        <Link href="/chat">
          <Button
            variant="outline"
            className={cn(
              "w-full justify-center gap-2 rounded-lg border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 h-9 text-sm font-medium",
              collapsed && "px-0"
            )}
            title="New Conversation"
          >
            <Plus className="h-4 w-4 shrink-0" />
            {!collapsed && "New Conversation"}
          </Button>
        </Link>
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="px-4 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search..."
              className="pl-9 pr-12 h-9 bg-white border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:border-gray-300 focus:ring-gray-200"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-2 inline-flex h-5 items-center rounded border border-gray-200 bg-gray-50 px-1.5 text-[10px] font-medium text-gray-400">
              &#8984;K
            </kbd>
          </div>
        </div>
      )}

      {/* Navigation */}
      <ScrollArea className={cn("flex-1", collapsed ? "px-1.5" : "px-3")}>
        <div className="space-y-6 py-1">
          {sections.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="px-3 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map(renderNavItem)}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* User profile */}
      <div className={cn("border-t border-gray-200", collapsed ? "p-2" : "p-4")}>
        <div className={cn(
          "flex items-center rounded-lg hover:bg-gray-50 transition-colors cursor-pointer",
          collapsed ? "justify-center p-2" : "gap-3 p-2"
        )}>
          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600 shrink-0">
            {userName?.[0]?.toUpperCase() || "U"}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {userName}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {userRole.toLowerCase()}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden rounded-lg p-2 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? (
          <X className="h-5 w-5 text-gray-700" />
        ) : (
          <Menu className="h-5 w-5 text-gray-700" />
        )}
      </button>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 lg:hidden transition-opacity duration-300",
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r border-gray-200 bg-white transition-all duration-300 ease-in-out lg:translate-x-0",
          collapsed ? "lg:w-[68px]" : "lg:w-64",
          mobileOpen ? "translate-x-0 shadow-xl w-64" : "-translate-x-full w-64"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
