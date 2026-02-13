"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { EffectiveSessionProvider } from "@/lib/effective-session-context";
import type { UserRole } from "@/types";

interface MainLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userImage?: string;
  userRole: UserRole;
  userId: string;
  isImpersonating?: boolean;
  realAdminName?: string;
}

export default function MainLayoutClient({
  children,
  userName,
  userEmail,
  userImage,
  userRole,
  userId,
  isImpersonating,
  realAdminName,
}: MainLayoutClientProps) {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setSidebarCollapsed(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }, []);
  const [stopping, setStopping] = useState(false);

  const handleStopImpersonating = async () => {
    setStopping(true);
    try {
      await fetch("/api/admin/impersonate", { method: "DELETE" });
      router.refresh();
    } catch {
      setStopping(false);
    }
  };

  return (
    <div className="h-screen h-[100dvh] bg-white dark:bg-gray-950 overflow-hidden">
      {isImpersonating && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3 z-50">
          <EyeOff className="h-4 w-4" />
          <span>
            Impersonating <strong>{userName}</strong> ({userRole})
            {realAdminName && <> — logged in as {realAdminName}</>}
          </span>
          <button
            onClick={handleStopImpersonating}
            disabled={stopping}
            className="ml-2 px-3 py-0.5 bg-white text-amber-700 rounded-md text-xs font-semibold hover:bg-amber-50 transition-colors disabled:opacity-50"
          >
            {stopping ? "Stopping..." : "Stop Impersonating"}
          </button>
        </div>
      )}
      <Sidebar
        userRole={userRole}
        userName={userName}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileSidebarOpen}
        onMobileToggle={setMobileSidebarOpen}
      />
      <div
        className={`flex flex-col transition-[margin] duration-300 ease-in-out ${
          sidebarCollapsed ? "lg:ml-[68px]" : "lg:ml-64"
        }`}
        style={{ height: isImpersonating ? "calc(100dvh - 40px)" : "100dvh" }}
      >
        <Topbar
          userName={userName}
          userEmail={userEmail}
          userImage={userImage}
          userRole={userRole}
          onMobileMenuToggle={() => setMobileSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 p-3 sm:p-6 bg-gray-50/50 dark:bg-gray-950 overflow-auto">
          <EffectiveSessionProvider
            session={{
              id: userId,
              name: userName,
              email: userEmail,
              role: userRole,
              image: userImage,
              isImpersonating: !!isImpersonating,
            }}
          >
            {children}
          </EffectiveSessionProvider>
        </main>
      </div>
    </div>
  );
}
