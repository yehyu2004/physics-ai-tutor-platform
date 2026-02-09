"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  FileText,
  Plus,
  Clock,
  Users,
  Loader2,
  CheckCircle2,
  BookOpen,
  Upload,
} from "lucide-react";
// Card components available if needed
// import { Card, CardContent } from "@/components/ui/card";
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
}

export default function AssignmentsPage() {
  const { data: session } = useSession();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "QUIZ" | "FILE_UPLOAD">("ALL");

  const userRole = (session?.user as { role?: string })?.role || "STUDENT";

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
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        <p className="text-sm text-neutral-400">Loading assignments...</p>
      </div>
    );
  }

  const typeColor = (type: string) =>
    type === "QUIZ" ? "border-l-indigo-500" : "border-l-violet-500";

  const isDueSoon = (dueDate: string | null) => {
    if (!dueDate) return false;
    const diff = new Date(dueDate).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Assignments
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {userRole === "STUDENT"
              ? "View and submit your assignments"
              : "Manage assignments and view submissions"}
          </p>
        </div>
        {(userRole === "TA" || userRole === "ADMIN") && (
          <Link href="/assignments/create">
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
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
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              filter === type
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-200"
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
        <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center animate-slide-up">
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-800">
            No assignments found
          </h3>
          <p className="text-sm text-neutral-400 mt-1 max-w-sm mx-auto">
            {filter !== "ALL"
              ? "No assignments match this filter. Try selecting a different type."
              : userRole === "STUDENT"
                ? "Check back later for new assignments."
                : "Create your first assignment to get started."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredAssignments.map((assignment, index) => (
            <Link key={assignment.id} href={`/assignments/${assignment.id}`}>
              <div
                className={`group bg-white rounded-xl border border-neutral-200 border-l-4 ${typeColor(assignment.type)} p-5 hover:shadow-lg transition-all duration-200 cursor-pointer`}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className={`p-1.5 rounded-lg ${assignment.type === "QUIZ" ? "bg-indigo-50" : "bg-violet-50"}`}>
                        {assignment.type === "QUIZ" ? (
                          <BookOpen className={`h-4 w-4 ${assignment.type === "QUIZ" ? "text-indigo-600" : "text-violet-600"}`} />
                        ) : (
                          <Upload className="h-4 w-4 text-violet-600" />
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-neutral-900 truncate group-hover:text-indigo-600 transition-colors">
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
                      <p className="text-sm text-neutral-500 line-clamp-1 mb-3 ml-9">
                        {assignment.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-neutral-400 ml-9">
                      <Badge variant="secondary" className="font-medium">
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
                      {assignment.dueDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Due {formatShortDate(assignment.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-2xl font-bold text-indigo-600">
                      {assignment.totalPoints}
                    </p>
                    <p className="text-xs text-neutral-400 font-medium">points</p>
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
