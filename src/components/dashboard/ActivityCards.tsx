"use client";

import React from "react";
import Link from "next/link";
import {
  FileText,
  GraduationCap,
  AlertCircle,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/utils";

interface OpenAppeal {
  id: string;
  studentName: string;
  assignmentTitle: string;
  assignmentId: string;
  status: string;
  createdAt: string;
}

interface UpcomingAssignment {
  id: string;
  title: string;
  dueDate: string | null;
  type: string;
}

interface OpenAppealsCardProps {
  appeals: OpenAppeal[];
}

export function OpenAppealsCard({ appeals }: OpenAppealsCardProps) {
  return (
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
        {appeals.length === 0 ? (
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
          <div className="divide-y divide-gray-100 dark:divide-gray-800" role="list" aria-label="Open appeals">
            {appeals.map((appeal) => (
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
  );
}

interface UpcomingAssignmentsCardProps {
  assignments: UpcomingAssignment[];
}

export function UpcomingAssignmentsCard({ assignments }: UpcomingAssignmentsCardProps) {
  return (
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
        {assignments.length === 0 ? (
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
          <div className="divide-y divide-gray-100 dark:divide-gray-800" role="list" aria-label="Upcoming assignments">
            {assignments.map((assignment) => (
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
  );
}
