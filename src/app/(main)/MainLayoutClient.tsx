"use client";

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
  return (
    <div className="min-h-screen bg-white">
      <Sidebar userRole={userRole} userName={userName} />
      <div className="lg:ml-64 min-h-screen flex flex-col">
        <Topbar
          userName={userName}
          userEmail={userEmail}
          userImage={userImage}
          userRole={userRole}
        />
        <main className="flex-1 p-6 bg-gray-50/50">{children}</main>
      </div>
    </div>
  );
}
