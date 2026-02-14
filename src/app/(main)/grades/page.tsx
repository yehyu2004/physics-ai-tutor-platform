"use client";

import React, { useEffect, useState } from "react";
import {
  GraduationCap,
  CheckCircle2,
  Clock,
  TrendingUp,
  Award,
  BarChart3,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/utils";
import { api } from "@/lib/api-client";
import Link from "next/link";

interface GradeEntry {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  assignmentType: string;
  totalPoints: number;
  score: number | null;
  gradedAt: string | null;
  gradedByName: string | null;
  submittedAt: string;
}

function getScoreColor(score: number, total: number) {
  const pct = (score / total) * 100;
  if (pct >= 80) return { text: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500", light: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-emerald-200 dark:border-emerald-800" };
  if (pct >= 60) return { text: "text-amber-700 dark:text-amber-400", bg: "bg-amber-500", light: "bg-amber-50 dark:bg-amber-950/50", border: "border-amber-200 dark:border-amber-800" };
  return { text: "text-red-700 dark:text-red-400", bg: "bg-red-500", light: "bg-red-50 dark:bg-red-950/50", border: "border-red-200 dark:border-red-800" };
}

function getLetterGrade(pct: number) {
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 60) return "D";
  return "F";
}

export default function GradesPage() {
  const [grades, setGrades] = useState<GradeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGrades = () => {
    setLoading(true);
    setError(null);
    api.get<{ grades: GradeEntry[] }>("/api/grades")
      .then((data) => {
        setGrades(data.grades || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[GradesPage] Failed to load grades:", err);
        setError("Failed to load grades. Please try again.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchGrades();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <LoadingSpinner message="Loading grades..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <GraduationCap className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        <button
          onClick={fetchGrades}
          className="rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const gradedEntries = grades.filter((g) => g.score !== null);
  const totalEarned = gradedEntries.reduce((sum, g) => sum + (g.score || 0), 0);
  const totalPossible = gradedEntries.reduce((sum, g) => sum + g.totalPoints, 0);
  const avgPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
  const pendingCount = grades.filter((g) => g.score === null).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Grades
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Track your performance across all assignments
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <TrendingUp className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Average</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{avgPercent}%</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {gradedEntries.length > 0
              ? `Letter Grade: ${getLetterGrade(avgPercent)}`
              : "No graded work yet"}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <Award className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Points</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {totalEarned}
            <span className="text-lg text-gray-400 dark:text-gray-500 font-normal">/{totalPossible}</span>
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Total points earned</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <BarChart3 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Graded</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{gradedEntries.length}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Assignments graded</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pending</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{pendingCount}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Awaiting grading</p>
        </div>
      </div>

      {/* Grades List */}
      {grades.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No grades yet"
          description="Submit assignments to see your grades here."
        />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">All Grades</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800" role="list" aria-label="Grade entries">
            {grades.map((grade) => {
              const scored = grade.score !== null;
              const pct = scored ? Math.round(((grade.score as number) / grade.totalPoints) * 100) : 0;
              const colors = scored ? getScoreColor(grade.score as number, grade.totalPoints) : null;

              return (
                <Link
                  href={`/assignments/${grade.assignmentId}`}
                  key={grade.id}
                  role="listitem"
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate hover:underline">
                      {grade.assignmentTitle}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <Badge variant="secondary" className="text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700">
                        {grade.assignmentType === "QUIZ" ? "Quiz" : "File Upload"}
                      </Badge>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Submitted {formatShortDate(grade.submittedAt)}
                      </span>
                      {grade.gradedByName && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          Graded by {grade.gradedByName}
                        </span>
                      )}
                    </div>
                  </div>

                  {scored && colors ? (
                    <div className="flex items-center gap-4 shrink-0">
                      {/* Progress bar */}
                      <div className="w-32 hidden sm:block">
                        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${colors.bg}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${colors.light} ${colors.border} border`}>
                        <CheckCircle2 className={`h-4 w-4 ${colors.text}`} />
                        <span className={`text-sm font-bold ${colors.text}`}>
                          {grade.score}/{grade.totalPoints}
                        </span>
                        <span className={`text-xs font-medium ${colors.text} opacity-70`}>
                          ({pct}%)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 shrink-0">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">Pending</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
