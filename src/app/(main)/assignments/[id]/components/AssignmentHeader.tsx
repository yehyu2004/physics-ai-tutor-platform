"use client";

import React from "react";
import {
  ArrowLeft,
  Clock,
  Loader2,
  Eye,
  FileText,
  Download,
  Pencil,
  Trash2,
  Lock,
  Unlock,
  CalendarClock,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { formatShortDate } from "@/lib/utils";
import { isStaff as isStaffRole } from "@/lib/constants";
import Link from "next/link";
import type { AssignmentDetail } from "@/types/assignment";

interface AssignmentHeaderProps {
  assignment: AssignmentDetail;
  userRole: string;
  onPublish: () => void;
  onSchedule: () => void;
  onCancelSchedule: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onExportLatex: () => void;
  exportingLatex: boolean;
  deleting: boolean;
}

export function AssignmentHeader({
  assignment,
  userRole,
  onPublish,
  onSchedule,
  onCancelSchedule,
  onToggleLock,
  onDelete,
  onExportLatex,
  exportingLatex,
  deleting,
}: AssignmentHeaderProps) {
  return (
    <>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Link href="/assignments" className="shrink-0 mt-1">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{assignment.title}</h1>
              {!assignment.published && !assignment.scheduledPublishAt && <Badge variant="warning">Draft</Badge>}
              {!assignment.published && assignment.scheduledPublishAt && (
                <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800 gap-1">
                  <CalendarClock className="h-3 w-3" />
                  Scheduled: {new Date(assignment.scheduledPublishAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </Badge>
              )}
              {assignment.lockAfterSubmit ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  <Lock className="h-3 w-3" />
                  Locked after submit
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <Unlock className="h-3 w-3" />
                  Resubmit allowed
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
              <span>By {assignment.createdBy.name || "Unknown"}</span>
              {assignment.publishedBy && assignment.publishedBy.name !== assignment.createdBy.name && (
                <span>Published by {assignment.publishedBy.name}</span>
              )}
              {assignment.dueDate && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Due {formatShortDate(assignment.dueDate)}
                </span>
              )}
              <span>{assignment.totalPoints} points</span>
            </div>
            {assignment.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{assignment.description}</p>
            )}
          </div>
        </div>
        {isStaffRole(userRole) && (
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
            <Link href={`/assignments/${assignment.id}/edit`} className="contents">
              <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs sm:text-sm">
                <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Edit
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs sm:text-sm" onClick={onPublish}>
              <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              {assignment.published ? "Unpublish" : "Publish"}
            </Button>
            {!assignment.published && !assignment.scheduledPublishAt && (
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto text-xs sm:text-sm gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950"
                onClick={onSchedule}
              >
                <CalendarClock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Schedule
              </Button>
            )}
            {!assignment.published && assignment.scheduledPublishAt && (
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto text-xs sm:text-sm text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                onClick={onCancelSchedule}
              >
                <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Cancel Schedule
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className={`w-full sm:w-auto text-xs sm:text-sm ${assignment.lockAfterSubmit ? "text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950" : ""}`}
              onClick={onToggleLock}
            >
              {assignment.lockAfterSubmit ? "🔒 Locked" : "🔓 Unlocked"}
            </Button>
            <Link href={`/grading?assignmentId=${assignment.id}`} className="contents">
              <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs sm:text-sm">
                Grade ({assignment._count.submissions})
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs sm:text-sm" onClick={onExportLatex} disabled={exportingLatex}>
              {exportingLatex ? (
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              )}
              {exportingLatex ? "Exporting..." : "Export LaTeX"}
            </Button>
            <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs sm:text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950" onClick={onDelete} disabled={deleting}>
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        )}
      </div>

      {assignment.description && (
        <Card>
          <CardContent className="p-6">
            <MarkdownContent content={assignment.description} className="text-sm" />
          </CardContent>
        </Card>
      )}

      {assignment.pdfUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Quiz PDF
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <iframe
              src={assignment.pdfUrl}
              className="w-full h-[600px] rounded-lg border border-neutral-200"
              title="Quiz PDF"
            />
            <a
              href={assignment.pdfUrl}
              download
              className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </CardContent>
        </Card>
      )}
    </>
  );
}
