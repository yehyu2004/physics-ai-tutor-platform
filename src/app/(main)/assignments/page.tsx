"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useEffectiveSession } from "@/lib/effective-session-context";
import {
  FileText,
  Plus,
  Clock,
  Users,
  Loader2,
  CheckCircle2,
  BookOpen,
  Upload,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/utils";

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  type: "QUIZ" | "FILE_UPLOAD";
  totalPoints: number;
  published: boolean;
  createdAt: string;
  createdBy: { name: string | null };
  _count: { submissions: number; questions: number };
  myScore: number | null;
  mySubmitted: boolean;
  ungradedCount?: number;
  openAppealCount?: number;
}

export default function AssignmentsPage() {
  const effectiveSession = useEffectiveSession();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "QUIZ" | "FILE_UPLOAD">("ALL");

  const userRole = effectiveSession.role;

  useEffect(() => {
    fetch("/api/assignments")
      .then((res) => res.json())
      .then((data) => {
        setAssignments(data.assignments || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredAssignments =
    filter === "ALL"
      ? assignments
      : assignments.filter((a) => a.type === filter);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading assignments...</p>
      </div>
    );
  }

  const isDueSoon = (dueDate: string | null) => {
    if (!dueDate) return false;
    const diff = new Date(dueDate).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Assignments
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {userRole === "STUDENT"
              ? "View and submit your assignments"
              : "Manage assignments and view submissions"}
          </p>
        </div>
        {(userRole === "TA" || userRole === "ADMIN") && (
          <Link href="/assignments/create" className="shrink-0">
            <Button className="gap-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg shadow-sm w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Create Assignment
            </Button>
          </Link>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        {(["ALL", "QUIZ", "FILE_UPLOAD"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              filter === type
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
            }`}
          >
            {type === "ALL"
              ? `All (${assignments.length})`
              : type === "QUIZ"
                ? `Quizzes (${assignments.filter((a) => a.type === "QUIZ").length})`
                : `File Upload (${assignments.filter((a) => a.type === "FILE_UPLOAD").length})`}
          </button>
        ))}
      </div>

      {/* Assignment Cards */}
      {filteredAssignments.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 py-16 text-center shadow-sm">
          <div className="mx-auto w-14 h-14 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4">
            <FileText className="h-7 w-7 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            No assignments found
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            {filter !== "ALL"
              ? "No assignments match this filter. Try selecting a different type."
              : userRole === "STUDENT"
                ? "Check back later for new assignments."
                : "Create your first assignment to get started."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredAssignments.map((assignment) => (
            <Link key={assignment.id} href={`/assignments/${assignment.id}`}>
              <div className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 hover:shadow-md transition-all cursor-pointer shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 mb-1.5">
                      <div className="p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 shrink-0 hidden sm:block">
                        {assignment.type === "QUIZ" ? (
                          <BookOpen className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        ) : (
                          <Upload className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors break-words min-w-0">
                        {assignment.title}
                      </h3>
                      {!assignment.published && (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                          Draft
                        </Badge>
                      )}
                      {isDueSoon(assignment.dueDate) && (
                        <Badge className="bg-red-50 text-red-600 border-red-200 text-xs">
                          Due Soon
                        </Badge>
                      )}
                    </div>
                    {assignment.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mb-3 sm:ml-9">
                        {assignment.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-gray-400 dark:text-gray-500 ml-0 sm:ml-9">
                      <Badge variant="secondary" className="font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700">
                        {assignment.type === "QUIZ" ? "Quiz" : "File Upload"}
                      </Badge>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {assignment._count.questions} questions
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {assignment._count.submissions} submissions
                      </span>
                      {(userRole === "TA" || userRole === "ADMIN") && assignment.ungradedCount !== undefined && assignment.ungradedCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                          <Clock className="h-3 w-3" />
                          {assignment.ungradedCount} ungraded
                        </span>
                      )}
                      {assignment.openAppealCount !== undefined && assignment.openAppealCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
                          <ShieldAlert className="h-3 w-3" />
                          {assignment.openAppealCount} open appeal{assignment.openAppealCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {assignment.dueDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Due {formatShortDate(assignment.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    {(userRole === "TA" || userRole === "ADMIN") && !assignment.mySubmitted ? (
                      <>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          {assignment._count.submissions}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                          submission{assignment._count.submissions !== 1 ? "s" : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          <span className={assignment.myScore !== null ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}>
                            {assignment.myScore !== null ? assignment.myScore : "_"}
                          </span>
                          <span className="text-gray-300 dark:text-gray-600">/</span>
                          {assignment.totalPoints}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                          {assignment.myScore !== null
                            ? "graded"
                            : assignment.mySubmitted
                              ? "submitted"
                              : "points"}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
