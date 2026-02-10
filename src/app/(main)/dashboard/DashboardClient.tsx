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
  ArrowRight,
  Clock,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/utils";

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
  const isStaffRole = userRole === "TA" || userRole === "PROFESSOR" || userRole === "ADMIN";
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
      label: "Grade Work",
      description: "Review and grade student submissions",
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
        },
        {
          value: adminStats.totalConversations,
          label: "Total Conversations",
          sublabel: "All users combined",
          icon: MessageSquare,
        },
        {
          value: adminStats.totalSubmissions,
          label: "Total Submissions",
          sublabel: "All assignments",
          icon: GraduationCap,
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
        },
        {
          value: taStats.pendingGrading,
          label: "Pending Grading",
          sublabel: "Submissions to review",
          icon: ClipboardList,
        },
        {
          value: taStats.openAppealCount,
          label: "Open Appeals",
          sublabel: "Awaiting response",
          icon: AlertCircle,
        },
      ];
    }
    return [
      {
        value: stats.conversationCount,
        label: "Questions Asked",
        sublabel: "AI conversations",
        icon: MessageSquare,
      },
      {
        value: stats.assignmentCount,
        label: "Assignments",
        sublabel: "Available assignments",
        icon: FileText,
      },
      {
        value: stats.submissionCount,
        label: "Submissions",
        sublabel: "Completed work",
        icon: GraduationCap,
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
            <div
              key={stat.label}
              className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl p-3 sm:p-5 hover:border-gray-200 dark:hover:border-gray-700 transition-colors animate-fade-in group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="hidden sm:flex items-center justify-between mb-3">
                <div className="h-9 w-9 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center group-hover:bg-gray-100 dark:group-hover:bg-gray-750 transition-colors">
                  <stat.icon className="h-4.5 w-4.5 text-gray-500 dark:text-gray-400" />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                {stat.value}
              </p>
              <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1 leading-tight">{stat.label}</p>
              <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-0.5 hidden sm:block">{stat.sublabel}</p>
            </div>
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
                <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500 mt-0.5 sm:mt-1 leading-relaxed hidden sm:block">
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
          {/* Recent Conversations */}
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl shadow-sm animate-fade-in">
            <div className="flex items-center justify-between p-4 sm:p-6 pb-3 sm:pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-indigo-500" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                  Recent Conversations
                </h3>
              </div>
              <Link
                href="/chat"
                className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="px-4 pb-4 sm:px-6 sm:pb-6">
              {recentConversations.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="flex justify-center gap-2 mb-4">
                    <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-indigo-300" />
                    </div>
                    <div className="h-10 w-10 rounded-full bg-violet-50 flex items-center justify-center -ml-2">
                      <Sparkles className="h-5 w-5 text-violet-300" />
                    </div>
                    <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center -ml-2">
                      <BookOpen className="h-5 w-5 text-indigo-300" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    No conversations yet
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Start chatting with the AI tutor to get help with physics!
                  </p>
                  <Link
                    href="/chat"
                    className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    Start your first conversation
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {recentConversations.map((conv) => (
                    <Link
                      key={conv.id}
                      href={`/chat/${conv.id}`}
                      className="flex items-start gap-3 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 -mx-2 px-2 rounded-lg transition-colors group first:pt-0"
                    >
                      <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-indigo-700 transition-colors">
                          {conv.title}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                          {conv.lastMessage}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 mt-0.5">
                        {formatShortDate(conv.updatedAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Open Appeals (staff) or Upcoming Assignments (students) */}
          {isStaffRole ? (
            <div
              className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl shadow-sm animate-fade-in"
              style={{ animationDelay: "100ms" }}
            >
              <div className="flex items-center justify-between p-4 sm:p-6 pb-3 sm:pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                    Open Appeals
                  </h3>
                </div>
                <Link
                  href="/grading"
                  className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="px-4 pb-4 sm:px-6 sm:pb-6">
                {openAppeals.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="flex justify-center gap-2 mb-4">
                      <div className="h-10 w-10 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                        <GraduationCap className="h-5 w-5 text-emerald-300 dark:text-emerald-600" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      No open appeals
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      All grade appeals have been resolved.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {openAppeals.map((appeal) => (
                      <Link
                        key={appeal.id}
                        href={`/assignments/${appeal.assignmentId}`}
                        className="flex items-start gap-3 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 -mx-2 px-2 rounded-lg transition-colors group first:pt-0"
                      >
                        <div className="h-8 w-8 rounded-full bg-amber-50 dark:bg-amber-950 flex items-center justify-center shrink-0 mt-0.5">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
                            {appeal.studentName}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {appeal.assignmentTitle}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 shrink-0">
                              <Clock className="h-3 w-3" />
                              {formatShortDate(appeal.createdAt)}
                            </span>
                          </div>
                        </div>
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800 text-[10px] shrink-0 mt-0.5">
                          Open
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl shadow-sm animate-fade-in"
              style={{ animationDelay: "100ms" }}
            >
              <div className="flex items-center justify-between p-4 sm:p-6 pb-3 sm:pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-violet-500" />
                  </div>
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                    Upcoming Assignments
                  </h3>
                </div>
                <Link
                  href="/assignments"
                  className="text-xs sm:text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="px-4 pb-4 sm:px-6 sm:pb-6">
                {upcomingAssignments.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="flex justify-center gap-2 mb-4">
                      <div className="h-10 w-10 rounded-full bg-violet-50 flex items-center justify-center">
                        <FileText className="h-5 w-5 text-violet-300" />
                      </div>
                      <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center -ml-2">
                        <GraduationCap className="h-5 w-5 text-emerald-300" />
                      </div>
                      <div className="h-10 w-10 rounded-full bg-violet-50 flex items-center justify-center -ml-2">
                        <Clock className="h-5 w-5 text-violet-300" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      No upcoming assignments
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      You are all caught up! Check back later for new work.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {upcomingAssignments.map((assignment) => (
                      <Link
                        key={assignment.id}
                        href={`/assignments/${assignment.id}`}
                        className="flex items-start gap-3 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 -mx-2 px-2 rounded-lg transition-colors group first:pt-0"
                      >
                        <div className="h-8 w-8 rounded-full bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                          <FileText className="h-3.5 w-3.5 text-violet-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-violet-700 transition-colors">
                            {assignment.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge
                              variant="secondary"
                              className="text-xs bg-violet-50 text-violet-700 hover:bg-violet-100 border-0"
                            >
                              {assignment.type === "QUIZ"
                                ? "Quiz"
                                : "File Upload"}
                            </Badge>
                            {assignment.dueDate && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Due {formatShortDate(assignment.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
