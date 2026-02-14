"use client";

import React from "react";
import Link from "next/link";
import {
  MessageSquare,
  FileText,
  GraduationCap,
  Sparkles,
  Upload,
  PenTool,
  Users,
  ClipboardList,
  AlertCircle,
} from "lucide-react";
import { isStaff } from "@/lib/constants";
import { RecentConversationsCard } from "@/components/dashboard/RecentConversationsCard";
import { OpenAppealsCard, UpcomingAssignmentsCard } from "@/components/dashboard/ActivityCards";

interface DashboardClientProps {
  userName: string;
  userRole: string;
  date: string;
  stats: {
    conversationCount: number;
    assignmentCount: number;
    submissionCount: number;
  };
  adminStats: {
    totalUsers: number;
    totalConversations: number;
    totalSubmissions: number;
  } | null;
  taStats: {
    pendingGrading: number;
    createdAssignments: number;
    openAppealCount: number;
  } | null;
  recentConversations: {
    id: string;
    title: string;
    updatedAt: string;
    lastMessage: string;
  }[];
  upcomingAssignments: {
    id: string;
    title: string;
    dueDate: string | null;
    type: string;
  }[];
  openAppeals?: {
    id: string;
    studentName: string;
    assignmentTitle: string;
    assignmentId: string;
    status: string;
    createdAt: string;
  }[];
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      {subtitle && (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

export default function DashboardClient({
  userName,
  userRole,
  date,
  stats,
  adminStats,
  taStats,
  recentConversations,
  upcomingAssignments,
  openAppeals = [],
}: DashboardClientProps) {
  const isStaffRole = isStaff(userRole);
  const quickStartItems = [
    {
      icon: MessageSquare,
      label: "Ask AI",
      description: "Chat with your AI physics tutor",
      href: "/chat",
      roles: ["STUDENT", "TA", "PROFESSOR", "ADMIN"],
    },
    {
      icon: FileText,
      label: "Assignments",
      description: "View and complete assignments",
      href: "/assignments",
      roles: ["STUDENT", "TA", "PROFESSOR", "ADMIN"],
    },
    {
      icon: Upload,
      label: "Submit Work",
      description: "Upload your homework solutions",
      href: "/assignments",
      roles: ["STUDENT"],
    },
    {
      icon: Sparkles,
      label: "Generate Problems",
      description: "Create problems with AI assistance",
      href: "/problems/generate",
      roles: ["TA", "PROFESSOR", "ADMIN"],
    },
    {
      icon: PenTool,
      label: "Create Assignment",
      description: "Design a new assignment for students",
      href: "/assignments/create",
      roles: ["TA", "PROFESSOR", "ADMIN"],
    },
    {
      icon: ClipboardList,
      label: "Grading",
      description: "Review and grade submissions",
      href: "/grading",
      roles: ["TA", "PROFESSOR", "ADMIN"],
    },
  ];

  const filteredQuickStart = quickStartItems.filter((item) =>
    item.roles.includes(userRole)
  );

  const statCards = (() => {
    if (userRole === "ADMIN" && adminStats) {
      return [
        {
          value: adminStats.totalUsers,
          label: "Total Users",
          sublabel: "Platform-wide",
          icon: Users,
          href: "/admin/users",
        },
        {
          value: adminStats.totalConversations,
          label: "Total Conversations",
          sublabel: "All users combined",
          icon: MessageSquare,
          href: "/admin/qa-history",
        },
        {
          value: adminStats.totalSubmissions,
          label: "Total Submissions",
          sublabel: "All assignments",
          icon: GraduationCap,
          href: "/assignments",
        },
      ];
    }
    if ((userRole === "TA" || userRole === "PROFESSOR") && taStats) {
      return [
        {
          value: stats.conversationCount,
          label: "My Chats",
          sublabel: "AI conversations",
          icon: MessageSquare,
          href: "/chat",
        },
        {
          value: taStats.pendingGrading,
          label: "Pending Grading",
          sublabel: "Submissions to review",
          icon: ClipboardList,
          href: "/grading",
        },
        {
          value: taStats.openAppealCount,
          label: "Open Appeals",
          sublabel: "Awaiting response",
          icon: AlertCircle,
          href: "/grading",
        },
      ];
    }
    return [
      {
        value: stats.conversationCount,
        label: "Questions Asked",
        sublabel: "AI conversations",
        icon: MessageSquare,
        href: "/chat",
      },
      {
        value: stats.assignmentCount,
        label: "Assignments",
        sublabel: "Available assignments",
        icon: FileText,
        href: "/assignments",
      },
      {
        value: stats.submissionCount,
        label: "Submissions",
        sublabel: "Completed work",
        icon: GraduationCap,
        href: "/grades",
      },
    ];
  })();

  return (
    <div className="space-y-6 sm:space-y-10 pb-8">
      {/* Welcome Section — plain text, no colored background */}
      <div className="pt-2 animate-fade-in">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-gray-100">
          Welcome Back, {userName}
        </h1>
        <p className="text-gray-400 dark:text-gray-500 mt-1">{date}</p>
      </div>

      {/* Stat Cards */}
      <div>
        <SectionHeading title="Overview" subtitle="Your activity at a glance" />
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {statCards.map((stat, index) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl p-3 sm:p-5 hover:border-gray-200 dark:hover:border-gray-700 transition-colors animate-fade-in group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="h-7 w-7 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center group-hover:bg-gray-100 dark:group-hover:bg-gray-750 transition-colors">
                  <stat.icon className="h-3.5 w-3.5 sm:h-4.5 sm:w-4.5 text-gray-500 dark:text-gray-400" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {stat.value}
              </p>
              <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight">{stat.label}</p>
              <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-0.5 hidden sm:block">{stat.sublabel}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Start */}
      <div>
        <SectionHeading title="Quick Start" subtitle="Top physics tools" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredQuickStart.slice(0, 8).map((item, index) => (
            <Link key={item.href + item.label} href={item.href}>
              <div
                className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 hover:border-gray-200 dark:hover:border-gray-700 transition-all duration-200 cursor-pointer h-full group animate-fade-in"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-2.5 sm:mb-3 group-hover:bg-gray-100 dark:group-hover:bg-gray-750 transition-colors">
                  <item.icon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 dark:text-gray-400" />
                </div>

                <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  {item.label}
                </p>
                <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-0.5 sm:mt-1 leading-relaxed line-clamp-1 sm:line-clamp-none">
                  {item.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <SectionHeading
          title="Recent Activity"
          subtitle="Your conversations and upcoming work"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentConversationsCard conversations={recentConversations} />
          {isStaffRole ? (
            <OpenAppealsCard appeals={openAppeals} />
          ) : (
            <UpcomingAssignmentsCard assignments={upcomingAssignments} />
          )}
        </div>
      </div>
    </div>
  );
}
