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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assignments</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {userRole === "STUDENT"
              ? "View and submit your assignments"
              : "Manage assignments and view submissions"}
          </p>
        </div>
        {(userRole === "TA" || userRole === "ADMIN") && (
          <Link href="/assignments/create">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Assignment
            </Button>
          </Link>
        )}
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-700">No assignments yet</h3>
            <p className="text-sm text-neutral-400 mt-1">
              {userRole === "STUDENT"
                ? "Check back later for new assignments."
                : "Create your first assignment to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {assignments.map((assignment) => (
            <Link key={assignment.id} href={`/assignments/${assignment.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold truncate">
                          {assignment.title}
                        </h3>
                        {!assignment.published && (
                          <Badge variant="warning">Draft</Badge>
                        )}
                      </div>
                      {assignment.description && (
                        <p className="text-sm text-neutral-500 line-clamp-2 mb-3">
                          {assignment.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-neutral-400">
                        <Badge variant="secondary">
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
                      <p className="text-2xl font-bold">{assignment.totalPoints}</p>
                      <p className="text-xs text-neutral-400">points</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
