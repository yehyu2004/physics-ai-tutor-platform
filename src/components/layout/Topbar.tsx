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

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 bg-white px-6">
      <div className="flex flex-col">
        <div className="flex items-center gap-1 text-sm">
          <Link
            href="/dashboard"
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            PhysTutor
          </Link>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.href}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
              {i === breadcrumbs.length - 1 ? (
                <span className="text-gray-900 font-medium">{crumb.label}</span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
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
          className="relative rounded-lg h-8 w-8 hover:bg-gray-50 transition-colors"
        >
          <Bell className="h-4 w-4 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative flex items-center gap-2 rounded-lg pl-2 pr-3 h-9 hover:bg-gray-50 transition-colors"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={userImage} alt={userName} />
                <AvatarFallback className="text-xs font-medium bg-gray-200 text-gray-600">
                  {userName?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-sm font-medium text-gray-700">
                  {userName}
                </span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 rotate-90" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 rounded-lg p-1.5" align="end" sideOffset={8}>
            <DropdownMenuLabel className="font-normal px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={userImage} alt={userName} />
                  <AvatarFallback className="text-sm font-medium bg-gray-200 text-gray-600">
                    {userName?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <p className="text-sm font-medium text-gray-900">{userName}</p>
                  <p className="text-xs text-gray-500">{userEmail}</p>
                  <span className="mt-0.5 inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 capitalize w-fit">
                    {userRole.toLowerCase()}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem className="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              <User className="mr-2.5 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              <Settings className="mr-2.5 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              className="cursor-pointer rounded-md px-3 py-2 text-sm text-red-600 focus:text-red-600 focus:bg-red-50 transition-colors"
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
