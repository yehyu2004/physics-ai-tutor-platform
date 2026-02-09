"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import type { UserRole } from "@/types";

interface MainLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userImage?: string;
  userRole: UserRole;
}

export default function MainLayoutClient({
  children,
  userName,
  userEmail,
  userImage,
  userRole,
}: MainLayoutClientProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen bg-white overflow-hidden">
      <Sidebar
        userRole={userRole}
        userName={userName}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div
        className={`h-screen flex flex-col transition-[margin] duration-300 ease-in-out ${
          sidebarCollapsed ? "lg:ml-[68px]" : "lg:ml-64"
        }`}
      >
        <Topbar
          userName={userName}
          userEmail={userEmail}
          userImage={userImage}
          userRole={userRole}
        />
        <main className="flex-1 p-6 bg-gray-50/50 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
