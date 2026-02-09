"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Bell, ChevronRight, User, Settings } from "lucide-react";
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
  const pageTitle = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : "Home";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-6">
      <div className="flex flex-col">
        <h1 className="text-base font-semibold text-slate-900">{pageTitle}</h1>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Link
            href="/dashboard"
            className="hover:text-indigo-600 transition-colors duration-200"
          >
            PhysTutor
          </Link>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.href}>
              <ChevronRight className="h-3 w-3 text-slate-300" />
              {i === breadcrumbs.length - 1 ? (
                <span className="text-slate-600 font-medium">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-indigo-600 transition-colors duration-200"
                >
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-xl h-9 w-9 hover:bg-slate-100 transition-all duration-200"
        >
          <Bell className="h-4 w-4 text-slate-500" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-indigo-500 ring-2 ring-white" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative flex items-center gap-2.5 rounded-xl pl-2 pr-3 h-10 hover:bg-slate-100 transition-all duration-200"
            >
              <Avatar className="h-7 w-7 ring-2 ring-indigo-100">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                  {userName?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-sm font-medium text-slate-700">
                  {userName}
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400 rotate-90" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60 rounded-xl p-2" align="end" sideOffset={8}>
            <DropdownMenuLabel className="font-normal px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 ring-2 ring-indigo-100">
                  <AvatarImage src={userImage} alt={userName} />
                  <AvatarFallback className="text-sm font-semibold bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                    {userName?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <p className="text-sm font-semibold text-slate-900">{userName}</p>
                  <p className="text-xs text-slate-500">{userEmail}</p>
                  <span className="mt-0.5 inline-flex items-center rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 capitalize w-fit">
                    {userRole.toLowerCase()}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors duration-200">
              <User className="mr-2.5 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors duration-200">
              <Settings className="mr-2.5 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-red-600 focus:text-red-600 focus:bg-red-50 transition-colors duration-200"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="mr-2.5 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
