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
    <div className="min-h-screen bg-[#fafafa]">
      <Sidebar userRole={userRole} userName={userName} />
      <div className="lg:ml-64">
        <Topbar
          userName={userName}
          userEmail={userEmail}
          userImage={userImage}
          userRole={userRole}
        />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
