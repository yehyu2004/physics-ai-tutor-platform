"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useEffectiveSession } from "@/lib/effective-session-context";
import { useTrackTime } from "@/lib/use-track-time";
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
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  useTrackTime("ASSIGNMENT_VIEW");
  const effectiveSession = useEffectiveSession();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "PUBLISHED" | "DRAFTS">("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const userRole = effectiveSession.role;

  const fetchAssignments = useCallback((f?: string, p?: number, ps?: number) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(p ?? 1));
    params.set("pageSize", String(ps ?? 10));
    const filterVal = f ?? "ALL";
    if (filterVal === "PUBLISHED") params.set("filter", "published");
    else if (filterVal === "DRAFTS") params.set("filter", "drafts");
    fetch(`/api/assignments?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setAssignments(data.assignments || []);
        setTotalCount(data.totalCount ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAssignments(filter, page, pageSize);
  }, [fetchAssignments, filter, page, pageSize]);

  const handleFilterChange = (f: "ALL" | "PUBLISHED" | "DRAFTS") => {
    setFilter(f);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  const isDueSoon = (dueDate: string | null) => {
    if (!dueDate) return false;
    const diff = new Date(dueDate).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  };

  const canManage = userRole === "TA" || userRole === "ADMIN" || userRole === "PROFESSOR";

  const handleDeleteDraft = async (e: React.MouseEvent, assignmentId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this draft assignment? This cannot be undone.")) return;
    setDeletingId(assignmentId);
    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, { method: "DELETE" });
      if (res.ok) {
        setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
        setTotalCount((c) => c - 1);
      } else {
        alert("Failed to delete assignment");
      }
    } catch {
      alert("Failed to delete assignment");
    } finally {
      setDeletingId(null);
    }
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
        {(userRole === "TA" || userRole === "ADMIN" || userRole === "PROFESSOR") && (
          <Link href="/assignments/create" className="shrink-0">
            <Button className="gap-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg shadow-sm w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Create Assignment
            </Button>
          </Link>
        )}
      </div>

      {/* Filter Tabs */}
      {canManage && (
        <div className="flex items-center gap-2">
          {(["ALL", "PUBLISHED", "DRAFTS"] as const).map((type) => (
            <button
              key={type}
              onClick={() => handleFilterChange(type)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                filter === type
                  ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-sm"
                  : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
              }`}
            >
              {type === "ALL" ? "All" : type === "PUBLISHED" ? "Published" : "Drafts"}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading assignments...</p>
        </div>
      ) : assignments.length === 0 ? (
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
        <>
          {/* Assignment Cards */}
          <div className="grid gap-3">
            {assignments.map((assignment) => (
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
                        {(userRole === "TA" || userRole === "ADMIN" || userRole === "PROFESSOR") && assignment.ungradedCount !== undefined && assignment.ungradedCount > 0 && (
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
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      {canManage && !assignment.published && (
                        <button
                          onClick={(e) => handleDeleteDraft(e, assignment.id)}
                          disabled={deletingId === assignment.id}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/50 transition-colors disabled:opacity-50"
                          title="Delete draft"
                        >
                          {deletingId === assignment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      <div className="text-right">
                        {canManage && !assignment.mySubmitted ? (
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
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <span>Rows per page:</span>
                <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="w-20 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {totalPages > 1 && <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  &lt;
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce<number[]>((acc, p) => {
                    if (acc.length > 0 && p - acc[acc.length - 1] > 1) acc.push(-1);
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === -1 ? (
                      <span key={`gap-${i}`} className="px-2 text-sm text-neutral-400">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                          p === page
                            ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                            : "border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  &gt;
                </button>
              </div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
