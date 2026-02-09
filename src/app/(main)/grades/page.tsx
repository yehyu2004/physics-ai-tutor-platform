"use client";

import React, { useEffect, useState } from "react";
import {
  Loader2,
  GraduationCap,
  CheckCircle2,
  Clock,
  TrendingUp,
  Award,
  BarChart3,
} from "lucide-react";
// Card components available if needed
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/utils";

interface GradeEntry {
  id: string;
  assignmentTitle: string;
  assignmentType: string;
  totalPoints: number;
  score: number | null;
  gradedAt: string | null;
  submittedAt: string;
}

function getScoreColor(score: number, total: number) {
  const pct = (score / total) * 100;
  if (pct >= 80) return { text: "text-emerald-700", bg: "bg-emerald-500", light: "bg-emerald-50", border: "border-emerald-200" };
  if (pct >= 60) return { text: "text-amber-700", bg: "bg-amber-500", light: "bg-amber-50", border: "border-amber-200" };
  return { text: "text-red-700", bg: "bg-red-500", light: "bg-red-50", border: "border-red-200" };
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

  useEffect(() => {
    fetch("/api/grades")
      .then((res) => res.json())
      .then((data) => {
        setGrades(data.grades || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        <p className="text-sm text-neutral-400">Loading grades...</p>
      </div>
    );
  }

  const gradedEntries = grades.filter((g) => g.score !== null);
  const totalEarned = gradedEntries.reduce((sum, g) => sum + (g.score || 0), 0);
  const totalPossible = gradedEntries.reduce((sum, g) => sum + g.totalPoints, 0);
  const avgPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
  const pendingCount = grades.filter((g) => g.score === null).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Grades
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Track your performance across all assignments
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-neutral-200 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-50 rounded-full -mr-6 -mt-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-indigo-50">
                <TrendingUp className="h-4 w-4 text-indigo-600" />
              </div>
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Average</span>
            </div>
            <p className="text-3xl font-bold text-neutral-900">{avgPercent}%</p>
            <p className="text-xs text-neutral-400 mt-1">
              {gradedEntries.length > 0
                ? `Letter Grade: ${getLetterGrade(avgPercent)}`
                : "No graded work yet"}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-50 rounded-full -mr-6 -mt-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-emerald-50">
                <Award className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Points</span>
            </div>
            <p className="text-3xl font-bold text-neutral-900">
              {totalEarned}
              <span className="text-lg text-neutral-400 font-normal">/{totalPossible}</span>
            </p>
            <p className="text-xs text-neutral-400 mt-1">Total points earned</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-violet-50 rounded-full -mr-6 -mt-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-violet-50">
                <BarChart3 className="h-4 w-4 text-violet-600" />
              </div>
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Graded</span>
            </div>
            <p className="text-3xl font-bold text-neutral-900">{gradedEntries.length}</p>
            <p className="text-xs text-neutral-400 mt-1">Assignments graded</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-amber-50 rounded-full -mr-6 -mt-6" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Pending</span>
            </div>
            <p className="text-3xl font-bold text-neutral-900">{pendingCount}</p>
            <p className="text-xs text-neutral-400 mt-1">Awaiting grading</p>
          </div>
        </div>
      </div>

      {/* Grades List */}
      {grades.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center animate-slide-up">
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
            <GraduationCap className="h-8 w-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-800">No grades yet</h3>
          <p className="text-sm text-neutral-400 mt-1 max-w-sm mx-auto">
            Submit assignments to see your grades here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="text-base font-semibold text-neutral-900">All Grades</h2>
          </div>
          <div className="divide-y divide-neutral-100">
            {grades.map((grade) => {
              const scored = grade.score !== null;
              const pct = scored ? Math.round(((grade.score as number) / grade.totalPoints) * 100) : 0;
              const colors = scored ? getScoreColor(grade.score as number, grade.totalPoints) : null;

              return (
                <div
                  key={grade.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-neutral-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-neutral-900 truncate">
                      {grade.assignmentTitle}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <Badge variant="secondary" className="text-xs font-medium">
                        {grade.assignmentType === "QUIZ" ? "Quiz" : "File Upload"}
                      </Badge>
                      <span className="text-xs text-neutral-400">
                        Submitted {formatShortDate(grade.submittedAt)}
                      </span>
                    </div>
                  </div>

                  {scored && colors ? (
                    <div className="flex items-center gap-4 shrink-0">
                      {/* Progress bar */}
                      <div className="w-32 hidden sm:block">
                        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
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
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-400 shrink-0">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">Pending</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
