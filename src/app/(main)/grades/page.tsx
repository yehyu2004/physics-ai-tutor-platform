"use client";

import React, { useEffect, useState } from "react";
import { Loader2, GraduationCap, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  const totalEarned = grades.reduce((sum, g) => sum + (g.score || 0), 0);
  const totalPossible = grades
    .filter((g) => g.score !== null)
    .reduce((sum, g) => sum + g.totalPoints, 0);
  const avgPercent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Grades</h1>
        <p className="text-sm text-neutral-500 mt-1">View your assignment scores</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="gradient-card-green border-0">
          <CardContent className="p-6">
            <div className="text-3xl font-bold">{avgPercent}%</div>
            <p className="text-sm font-medium mt-1">Average Score</p>
            <p className="text-xs text-neutral-500">Across graded assignments</p>
          </CardContent>
        </Card>
        <Card className="gradient-card-blue border-0">
          <CardContent className="p-6">
            <div className="text-3xl font-bold">{totalEarned}/{totalPossible}</div>
            <p className="text-sm font-medium mt-1">Points Earned</p>
            <p className="text-xs text-neutral-500">Total points</p>
          </CardContent>
        </Card>
        <Card className="gradient-card-purple border-0">
          <CardContent className="p-6">
            <div className="text-3xl font-bold">{grades.length}</div>
            <p className="text-sm font-medium mt-1">Submissions</p>
            <p className="text-xs text-neutral-500">Total submitted</p>
          </CardContent>
        </Card>
      </div>

      {grades.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-700">No grades yet</h3>
            <p className="text-sm text-neutral-400 mt-1">
              Submit assignments to see your grades here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Grades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {grades.map((grade) => (
                <div
                  key={grade.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex-1">
                    <p className="font-medium">{grade.assignmentTitle}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {grade.assignmentType === "QUIZ" ? "Quiz" : "File Upload"}
                      </Badge>
                      <span className="text-xs text-neutral-400">
                        Submitted {formatShortDate(grade.submittedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    {grade.score !== null ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-lg font-bold">
                          {grade.score}/{grade.totalPoints}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-neutral-400">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm">Pending</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
