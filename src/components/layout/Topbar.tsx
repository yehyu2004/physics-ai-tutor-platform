"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Bell, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TopbarProps {
  userName: string;
  userEmail: string;
  userImage?: string;
  userRole: string;
}

const routeLabels: Record<string, string> = {
  "/dashboard": "Home",
  "/chat": "AI Chat",
  "/assignments": "Assignments",
  "/assignments/create": "Create Assignment",
  "/grades": "Grades",
  "/problems/generate": "Problem Generator",
  "/grading": "Grading",
  "/admin/users": "Users",
  "/admin/qa-history": "Q&A History",
  "/admin/settings": "Settings",
};

export default function Topbar({ userName, userEmail, userImage, userRole }: TopbarProps) {
  const pathname = usePathname();

  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];

    let currentPath = "";
    for (const segment of segments) {
      currentPath += `/${segment}`;
      const label = routeLabels[currentPath] || segment.charAt(0).toUpperCase() + segment.slice(1);
      crumbs.push({ label, href: currentPath });
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white/80 backdrop-blur-sm px-6">
      <div className="flex items-center gap-1 text-sm text-neutral-500">
        <span className="font-medium text-neutral-900">PhysTutor</span>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={crumb.href}>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className={i === breadcrumbs.length - 1 ? "text-neutral-900" : ""}>
              {crumb.label}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback className="text-xs">
                  {userName?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-neutral-500">{userEmail}</p>
                <p className="text-xs text-neutral-400 capitalize">{userRole.toLowerCase()}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-red-600 focus:text-red-600"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
