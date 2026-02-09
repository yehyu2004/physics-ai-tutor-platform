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
  Atom,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        {subtitle && (
          <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex-1 h-px bg-neutral-200" />
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
}: DashboardClientProps) {
  const quickStartItems = [
    {
      icon: MessageSquare,
      label: "Ask AI",
      description: "Chat with your AI physics tutor",
      href: "/chat",
      roles: ["STUDENT", "TA", "ADMIN"],
      color: "bg-indigo-100 text-indigo-600",
    },
    {
      icon: FileText,
      label: "Assignments",
      description: "View and complete assignments",
      href: "/assignments",
      roles: ["STUDENT", "TA", "ADMIN"],
      color: "bg-violet-100 text-violet-600",
    },
    {
      icon: Upload,
      label: "Submit Work",
      description: "Upload your homework solutions",
      href: "/assignments",
      roles: ["STUDENT"],
      color: "bg-emerald-100 text-emerald-600",
    },
    {
      icon: Sparkles,
      label: "Generate Problems",
      description: "Create problems with AI assistance",
      href: "/problems/generate",
      roles: ["TA", "ADMIN"],
      color: "bg-amber-100 text-amber-600",
    },
    {
      icon: PenTool,
      label: "Create Assignment",
      description: "Design a new assignment for students",
      href: "/assignments/create",
      roles: ["TA", "ADMIN"],
      color: "bg-rose-100 text-rose-600",
    },
    {
      icon: ClipboardList,
      label: "Grade Work",
      description: "Review and grade student submissions",
      href: "/grading",
      roles: ["TA", "ADMIN"],
      color: "bg-cyan-100 text-cyan-600",
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
          borderColor: "border-l-indigo-500",
          iconBg: "bg-indigo-100",
          iconColor: "text-indigo-600",
        },
        {
          value: adminStats.totalConversations,
          label: "Total Conversations",
          sublabel: "All users combined",
          icon: MessageSquare,
          borderColor: "border-l-violet-500",
          iconBg: "bg-violet-100",
          iconColor: "text-violet-600",
        },
        {
          value: adminStats.totalSubmissions,
          label: "Total Submissions",
          sublabel: "All assignments",
          icon: GraduationCap,
          borderColor: "border-l-emerald-500",
          iconBg: "bg-emerald-100",
          iconColor: "text-emerald-600",
        },
      ];
    }
    if (userRole === "TA" && taStats) {
      return [
        {
          value: stats.conversationCount,
          label: "My Chats",
          sublabel: "AI conversations",
          icon: MessageSquare,
          borderColor: "border-l-indigo-500",
          iconBg: "bg-indigo-100",
          iconColor: "text-indigo-600",
        },
        {
          value: taStats.pendingGrading,
          label: "Pending Grading",
          sublabel: "Submissions to review",
          icon: ClipboardList,
          borderColor: "border-l-violet-500",
          iconBg: "bg-violet-100",
          iconColor: "text-violet-600",
        },
        {
          value: taStats.createdAssignments,
          label: "My Assignments",
          sublabel: "Created by you",
          icon: FileText,
          borderColor: "border-l-emerald-500",
          iconBg: "bg-emerald-100",
          iconColor: "text-emerald-600",
        },
      ];
    }
    return [
      {
        value: stats.conversationCount,
        label: "Questions Asked",
        sublabel: "AI conversations",
        icon: MessageSquare,
        borderColor: "border-l-indigo-500",
        iconBg: "bg-indigo-100",
        iconColor: "text-indigo-600",
      },
      {
        value: stats.assignmentCount,
        label: "Assignments",
        sublabel: "Available assignments",
        icon: FileText,
        borderColor: "border-l-violet-500",
        iconBg: "bg-violet-100",
        iconColor: "text-violet-600",
      },
      {
        value: stats.submissionCount,
        label: "Submissions",
        sublabel: "Completed work",
        icon: GraduationCap,
        borderColor: "border-l-emerald-500",
        iconBg: "bg-emerald-100",
        iconColor: "text-emerald-600",
      },
    ];
  })();

  return (
    <div className="space-y-10 pb-8">
      {/* Welcome Hero */}
      <div
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-500 p-8 text-white shadow-lg animate-fade-in"
      >
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-1/2 -mb-8 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute top-4 right-8 opacity-20">
          <Atom className="h-20 w-20" />
        </div>

        <div className="relative">
          <p className="text-indigo-200 text-sm font-medium mb-1">{date}</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Welcome back, {userName}
          </h1>
          <p className="text-indigo-100 mt-2 text-base max-w-lg">
            Ready to explore physics today? Pick up where you left off or start
            something new.
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors backdrop-blur-sm"
          >
            <MessageSquare className="h-4 w-4" />
            Start a conversation
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div>
        <SectionHeading title="Overview" subtitle="Your activity at a glance" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {statCards.map((stat, index) => (
            <Card
              key={stat.label}
              className={`border-l-4 ${stat.borderColor} shadow-md hover:shadow-lg transition-shadow animate-fade-in`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-3xl font-bold text-neutral-900">
                      {stat.value}
                    </p>
                    <p className="text-sm font-medium text-neutral-700 mt-1">
                      {stat.label}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {stat.sublabel}
                    </p>
                  </div>
                  <div
                    className={`h-11 w-11 rounded-full ${stat.iconBg} flex items-center justify-center shrink-0`}
                  >
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick Start */}
      <div>
        <SectionHeading title="Quick Start" subtitle="Jump into your tools" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredQuickStart.slice(0, 6).map((item, index) => (
            <Link key={item.href + item.label} href={item.href}>
              <Card
                className="hover:shadow-lg transition-all duration-200 cursor-pointer h-full group border-neutral-200/80 hover:border-indigo-200"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <CardContent className="p-6 animate-fade-in">
                  <div
                    className={`h-12 w-12 rounded-xl ${item.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}
                  >
                    <item.icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-neutral-900">
                    {item.label}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-1 mt-3 text-xs font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    Open
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
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
          <Card className="shadow-md animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                </div>
                <CardTitle className="text-base">
                  Recent Conversations
                </CardTitle>
              </div>
              <Link
                href="/chat"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent>
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
                  <p className="text-sm font-medium text-neutral-600">
                    No conversations yet
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
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
                <div className="space-y-2">
                  {recentConversations.map((conv) => (
                    <Link
                      key={conv.id}
                      href={`/chat/${conv.id}`}
                      className="flex items-start gap-3 rounded-lg p-3 hover:bg-indigo-50/50 transition-colors group"
                    >
                      <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-800 truncate group-hover:text-indigo-700 transition-colors">
                          {conv.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate mt-0.5">
                          {conv.lastMessage}
                        </p>
                      </div>
                      <span className="text-xs text-neutral-400 shrink-0 mt-0.5">
                        {formatShortDate(conv.updatedAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Assignments */}
          <Card className="shadow-md animate-fade-in" style={{ animationDelay: "100ms" }}>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-violet-600" />
                </div>
                <CardTitle className="text-base">
                  Upcoming Assignments
                </CardTitle>
              </div>
              <Link
                href="/assignments"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardHeader>
            <CardContent>
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
                  <p className="text-sm font-medium text-neutral-600">
                    No upcoming assignments
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    You are all caught up! Check back later for new work.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingAssignments.map((assignment) => (
                    <Link
                      key={assignment.id}
                      href={`/assignments/${assignment.id}`}
                      className="flex items-start gap-3 rounded-lg p-3 hover:bg-violet-50/50 transition-colors group"
                    >
                      <div className="h-8 w-8 rounded-full bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="h-3.5 w-3.5 text-violet-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-800 truncate group-hover:text-violet-700 transition-colors">
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
                            <span className="text-xs text-neutral-400 flex items-center gap-1">
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
