"use client";

import React from "react";
import {
  Loader2,
  Send,
  MessageSquare,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ImageUpload } from "@/components/ui/image-upload";
import { formatShortDate } from "@/lib/utils";
import { isStaff as isStaffRole } from "@/lib/constants";
import type { AssignmentQuestion } from "@/types/assignment";
import type { GradeAppealData } from "@/types/submission";

interface StaffAppealsSectionProps {
  appeals: GradeAppealData[];
  questions: AssignmentQuestion[];
  appealFilter: "ALL" | "OPEN";
  setAppealFilter: (filter: "ALL" | "OPEN") => void;
  expandedAppeals: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  appealMessages: Record<string, string>;
  onAppealMessageChange: (id: string, value: string) => void;
  appealNewScores: Record<string, string>;
  onAppealNewScoreChange: (id: string, value: string) => void;
  appealImages: Record<string, string[]>;
  onAppealImagesChange: (key: string, imgs: string[]) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  uploadingImage: boolean;
  resolvingAppeal: string | null;
  onResolveAppeal: (appealId: string, status: "RESOLVED" | "REJECTED" | "OPEN") => void;
  onSendAppealMessage: (appealId: string) => void;
}

export function StaffAppealsSection({
  appeals,
  questions,
  appealFilter,
  setAppealFilter,
  expandedAppeals,
  onToggleExpand,
  appealMessages,
  onAppealMessageChange,
  appealNewScores,
  onAppealNewScoreChange,
  appealImages,
  onAppealImagesChange,
  onUploadImage,
  uploadingImage,
  resolvingAppeal,
  onResolveAppeal,
  onSendAppealMessage,
}: StaffAppealsSectionProps) {
  const openCount = appeals.filter((a) => a.status === "OPEN").length;
  const filteredAppeals = appealFilter === "OPEN" ? appeals.filter((a) => a.status === "OPEN") : appeals;

  return (
    <Card className="border-orange-200 dark:border-orange-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
            <ShieldAlert className="h-5 w-5" />
            Grade Appeals
          </CardTitle>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setAppealFilter("OPEN")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                appealFilter === "OPEN"
                  ? "bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Open ({openCount})
            </button>
            <button
              onClick={() => setAppealFilter("ALL")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                appealFilter === "ALL"
                  ? "bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              All ({appeals.length})
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {filteredAppeals.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            {appealFilter === "OPEN" ? "No open appeals -- all caught up!" : "No appeals found."}
          </p>
        )}
        {filteredAppeals.map((appeal) => {
          const question = questions.find(
            (q) => q.id === appeal.submissionAnswer.questionId
          );
          const studentName =
            appeal.student.name ||
            (appeal.submissionAnswer as unknown as { submission?: { user?: { name?: string } } }).submission?.user?.name ||
            "Student";
          const isExpanded = expandedAppeals[appeal.id];
          return (
            <div
              key={appeal.id}
              className={`rounded-lg border p-4 space-y-3 transition-colors overflow-hidden ${
                appeal.status === "OPEN"
                  ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20"
                  : "border-gray-200 dark:border-gray-700 opacity-80"
              }`}
            >
              {/* Header row */}
              <button
                onClick={() => onToggleExpand(appeal.id)}
                className="w-full flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Q{(appeal.submissionAnswer.question.order ?? 0) + 1} — {studentName}
                  </span>
                  <Badge
                    className={`text-xs gap-1 ${
                      appeal.status === "OPEN"
                        ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-400 dark:border-amber-700"
                        : appeal.status === "RESOLVED"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-400 dark:border-emerald-700"
                          : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-400 dark:border-red-700"
                    }`}
                  >
                    {appeal.status === "OPEN" ? (
                      <><ShieldAlert className="h-3 w-3" /> Pending</>
                    ) : appeal.status === "RESOLVED" ? (
                      <><CheckCircle2 className="h-3 w-3" /> Accepted</>
                    ) : (
                      <><XCircle className="h-3 w-3" /> Denied</>
                    )}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {appeal.submissionAnswer.score ?? "?"}/{question?.points ?? "?"}
                  </span>
                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>

              {isExpanded && (
                <div className="space-y-3 pt-1">
                  {/* Context: Student answer + grader feedback */}
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2 overflow-hidden">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Grading Context</p>
                    <div className="grid gap-1.5 text-sm min-w-0">
                      <div className="flex gap-2 min-w-0">
                        <span className="text-gray-500 dark:text-gray-400 shrink-0">Question:</span>
                        <MarkdownContent content={appeal.submissionAnswer.question.questionText} className="text-gray-700 dark:text-gray-300 line-clamp-2" />
                      </div>
                      {appeal.submissionAnswer.feedback && (
                        <div className="flex gap-2 min-w-0">
                          <span className="text-gray-500 dark:text-gray-400 shrink-0">Feedback:</span>
                          <MarkdownContent content={appeal.submissionAnswer.feedback} className="text-gray-700 dark:text-gray-300" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Original appeal reason */}
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 overflow-hidden">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {studentName}
                      </span>
                      <span className="text-xs text-amber-500 dark:text-amber-600">
                        {formatShortDate(appeal.createdAt)}
                      </span>
                    </div>
                    <MarkdownContent content={appeal.reason} className="text-sm text-amber-800 dark:text-amber-300" />
                    {appeal.imageUrls && (appeal.imageUrls as string[]).length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {(appeal.imageUrls as string[]).map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Attachment ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-amber-200 dark:border-amber-700 hover:opacity-80 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Messages */}
                  {appeal.messages.map((msg) => {
                    const isMsgStaff = isStaffRole(msg.user.role);
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-lg p-3 border overflow-hidden ${
                          isMsgStaff
                            ? "bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800"
                            : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-semibold ${
                              isMsgStaff
                                ? "text-indigo-700 dark:text-indigo-400"
                                : "text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {msg.user.name || "User"}
                          </span>
                          {isMsgStaff && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-600 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-400 dark:border-indigo-700">
                              {msg.user.role}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {formatShortDate(msg.createdAt)}
                          </span>
                        </div>
                        <MarkdownContent content={msg.content} className="text-sm text-gray-800 dark:text-gray-200" />
                        {msg.imageUrls && (msg.imageUrls as string[]).length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {(msg.imageUrls as string[]).map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={`Attachment ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 hover:opacity-80 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Reply + resolve/reject controls */}
                  <div className="space-y-3 pt-1 border-t border-gray-200 dark:border-gray-700">
                    <Textarea
                      value={appealMessages[appeal.id] || ""}
                      onChange={(e) => onAppealMessageChange(appeal.id, e.target.value)}
                      placeholder={appeal.status === "OPEN" ? "Write a reply or leave a note before resolving..." : "Add a follow-up message..."}
                      rows={2}
                      className="text-sm"
                    />
                    <ImageUpload
                      images={appealImages[appeal.id] || []}
                      onImagesChange={(imgs) => onAppealImagesChange(appeal.id, imgs)}
                      onUpload={onUploadImage}
                      uploading={uploadingImage}
                      maxImages={3}
                    />
                    {appeal.status === "OPEN" && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max={question?.points ?? 100}
                          value={appealNewScores[appeal.id] || ""}
                          onChange={(e) => onAppealNewScoreChange(appeal.id, e.target.value)}
                          placeholder={`New score (max ${question?.points ?? "?"})`}
                          className="w-44 text-sm"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {appeal.status === "OPEN" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onResolveAppeal(appeal.id, "RESOLVED")}
                            disabled={resolvingAppeal === appeal.id}
                            className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                          >
                            {resolvingAppeal === appeal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Accept & Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onResolveAppeal(appeal.id, "REJECTED")}
                            disabled={resolvingAppeal === appeal.id}
                            className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                          >
                            {resolvingAppeal === appeal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Deny
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onResolveAppeal(appeal.id, "OPEN")}
                          disabled={resolvingAppeal === appeal.id}
                          className="gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950"
                        >
                          {resolvingAppeal === appeal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                          Reopen
                        </Button>
                      )}
                      <div className="flex-1" />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSendAppealMessage(appeal.id)}
                        disabled={!appealMessages[appeal.id]?.trim()}
                        className="gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Reply
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
