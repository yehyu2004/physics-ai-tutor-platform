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
      description: "Chat with AI tutor",
      href: "/chat",
      roles: ["STUDENT", "TA", "ADMIN"],
    },
    {
      icon: FileText,
      label: "Assignments",
      description: "View assignments",
      href: "/assignments",
      roles: ["STUDENT", "TA", "ADMIN"],
    },
    {
      icon: Upload,
      label: "Submit Work",
      description: "Upload homework",
      href: "/assignments",
      roles: ["STUDENT"],
    },
    {
      icon: Sparkles,
      label: "Generate Problems",
      description: "AI problem creator",
      href: "/problems/generate",
      roles: ["TA", "ADMIN"],
    },
    {
      icon: PenTool,
      label: "Create Assignment",
      description: "New assignment",
      href: "/assignments/create",
      roles: ["TA", "ADMIN"],
    },
    {
      icon: ClipboardList,
      label: "Grade Work",
      description: "Review submissions",
      href: "/grading",
      roles: ["TA", "ADMIN"],
    },
  ];

  const filteredQuickStart = quickStartItems.filter((item) =>
    item.roles.includes(userRole)
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome Back, {userName}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">{date}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {userRole === "ADMIN" && adminStats ? (
          <>
            <Card className="gradient-card-purple border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{adminStats.totalUsers}</div>
                <div className="flex items-center gap-2 mt-2">
                  <Users className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">Total Users</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">Platform-wide</p>
              </CardContent>
            </Card>
            <Card className="gradient-card-pink border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{adminStats.totalConversations}</div>
                <div className="flex items-center gap-2 mt-2">
                  <MessageSquare className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">Total Conversations</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">All users combined</p>
              </CardContent>
            </Card>
            <Card className="gradient-card-blue border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{adminStats.totalSubmissions}</div>
                <div className="flex items-center gap-2 mt-2">
                  <GraduationCap className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">Total Submissions</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">All assignments</p>
              </CardContent>
            </Card>
          </>
        ) : userRole === "TA" && taStats ? (
          <>
            <Card className="gradient-card-purple border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{stats.conversationCount}</div>
                <div className="flex items-center gap-2 mt-2">
                  <MessageSquare className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">My Chats</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">AI conversations</p>
              </CardContent>
            </Card>
            <Card className="gradient-card-pink border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{taStats.pendingGrading}</div>
                <div className="flex items-center gap-2 mt-2">
                  <ClipboardList className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">Pending Grading</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">Submissions to review</p>
              </CardContent>
            </Card>
            <Card className="gradient-card-blue border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{taStats.createdAssignments}</div>
                <div className="flex items-center gap-2 mt-2">
                  <FileText className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">My Assignments</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">Created by you</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="gradient-card-purple border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{stats.conversationCount}</div>
                <div className="flex items-center gap-2 mt-2">
                  <MessageSquare className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">Questions Asked</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">AI conversations</p>
              </CardContent>
            </Card>
            <Card className="gradient-card-pink border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{stats.assignmentCount}</div>
                <div className="flex items-center gap-2 mt-2">
                  <FileText className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">Assignments</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">Available assignments</p>
              </CardContent>
            </Card>
            <Card className="gradient-card-blue border-0">
              <CardContent className="p-6">
                <div className="text-3xl font-bold">{stats.submissionCount}</div>
                <div className="flex items-center gap-2 mt-2">
                  <GraduationCap className="h-4 w-4 text-neutral-600" />
                  <span className="text-sm font-medium">Submissions</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">Completed work</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Quick Start */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Quick Start</h2>
        <p className="text-sm text-neutral-500 mb-4">Top tools</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {filteredQuickStart.slice(0, 4).map((item) => (
            <Link key={item.href + item.label} href={item.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="h-12 w-12 rounded-full bg-neutral-50 border flex items-center justify-center mb-3">
                    <item.icon className="h-5 w-5 text-neutral-600" />
                  </div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-neutral-400 mt-1">{item.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity & Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Conversations</CardTitle>
            <Link
              href="/chat"
              className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentConversations.length === 0 ? (
              <p className="text-sm text-neutral-400 py-4 text-center">
                No conversations yet. Start chatting with the AI tutor!
              </p>
            ) : (
              <div className="space-y-3">
                {recentConversations.map((conv) => (
                  <Link
                    key={conv.id}
                    href={`/chat/${conv.id}`}
                    className="block rounded-lg border p-3 hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{conv.title}</p>
                        <p className="text-xs text-neutral-400 truncate mt-1">
                          {conv.lastMessage}
                        </p>
                      </div>
                      <span className="text-xs text-neutral-400 ml-2 shrink-0">
                        {formatShortDate(conv.updatedAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Upcoming Assignments</CardTitle>
            <Link
              href="/assignments"
              className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {upcomingAssignments.length === 0 ? (
              <p className="text-sm text-neutral-400 py-4 text-center">
                No upcoming assignments.
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingAssignments.map((assignment) => (
                  <Link
                    key={assignment.id}
                    href={`/assignments/${assignment.id}`}
                    className="block rounded-lg border p-3 hover:bg-neutral-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{assignment.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {assignment.type === "QUIZ" ? "Quiz" : "File Upload"}
                          </Badge>
                          {assignment.dueDate && (
                            <span className="text-xs text-neutral-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Due {formatShortDate(assignment.dueDate)}
                            </span>
                          )}
                        </div>
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
  );
}
