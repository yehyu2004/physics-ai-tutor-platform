"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  ClipboardList,
  Sparkles,
  Save,
  CheckCircle2,
  Clock,
  User,
  MessageSquare,
  Upload,
  FileText,
  X,
  Filter,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatShortDate } from "@/lib/utils";

interface AssignmentOption {
  id: string;
  title: string;
  type: string;
  totalPoints: number;
  submissionCount: number;
}

interface AssignmentInfo {
  title: string;
  type: string;
  totalPoints: number;
  dueDate: string | null;
}

interface SubmissionForGrading {
  id: string;
  userName: string;
  userEmail: string;
  submittedAt: string;
  totalScore: number | null;
  gradedAt: string | null;
  gradedByName: string | null;
  fileUrl: string | null;
  answers: {
    id: string;
    questionText: string;
    questionType: string;
    answer: string | null;
    score: number | null;
    feedback: string | null;
    autoGraded: boolean;
    maxPoints: number;
  }[];
}

type GradingMode = "per-question" | "overall";
type FilterMode = "all" | "ungraded" | "graded";

export default function GradingPage() {
  const searchParams = useSearchParams();
  const initialAssignmentId = searchParams.get("assignmentId");

  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>(initialAssignmentId || "");
  const [assignmentInfo, setAssignmentInfo] = useState<AssignmentInfo | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionForGrading[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionForGrading | null>(null);
  const [grades, setGrades] = useState<Record<string, { score: number; feedback: string }>>({});
  const [overallScore, setOverallScore] = useState<number>(0);
  const [overallFeedback, setOverallFeedback] = useState("");
  const [gradingMode, setGradingMode] = useState<GradingMode>("per-question");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [feedbackFile, setFeedbackFile] = useState<File | null>(null);
  const [uploadingFeedback, setUploadingFeedback] = useState(false);
  const [feedbackFileUrl, setFeedbackFileUrl] = useState<string | null>(null);

  // Fetch assignment list
  useEffect(() => {
    fetch("/api/assignments")
      .then((res) => res.json())
      .then((data) => {
        const list = (data.assignments || []).map((a: { id: string; title: string; type: string; totalPoints: number; _count?: { submissions: number } }) => ({
          id: a.id,
          title: a.title,
          type: a.type,
          totalPoints: a.totalPoints,
          submissionCount: a._count?.submissions || 0,
        }));
        setAssignments(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchSubmissions = useCallback((assignmentId: string) => {
    if (!assignmentId) return;
    setLoadingSubmissions(true);
    setSelectedSubmission(null);
    fetch(`/api/assignments/${assignmentId}/submissions`)
      .then((res) => res.json())
      .then((data) => {
        setAssignmentInfo(data.assignment || null);
        setSubmissions(data.submissions || []);
        setLoadingSubmissions(false);
      })
      .catch(() => setLoadingSubmissions(false));
  }, []);

  useEffect(() => {
    if (selectedAssignmentId) {
      fetchSubmissions(selectedAssignmentId);
    }
  }, [selectedAssignmentId, fetchSubmissions]);

  const selectSubmission = (sub: SubmissionForGrading) => {
    setSelectedSubmission(sub);
    setFeedbackFile(null);
    setFeedbackFileUrl(null);
    const initialGrades: Record<string, { score: number; feedback: string }> = {};
    sub.answers.forEach((a) => {
      initialGrades[a.id] = {
        score: a.score || 0,
        feedback: a.feedback || "",
      };
    });
    setGrades(initialGrades);
    setOverallScore(sub.totalScore || 0);
    setOverallFeedback("");
    // Auto-select grading mode
    if (sub.answers.length === 0 || assignmentInfo?.type === "FILE_UPLOAD") {
      setGradingMode("overall");
    } else {
      const allAutoGraded = sub.answers.every((a) => a.autoGraded);
      setGradingMode(allAutoGraded ? "overall" : "per-question");
    }
  };

  const handleAIGrade = async (answerId: string) => {
    setAiLoading(answerId);
    try {
      const res = await fetch("/api/grading", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerId }),
      });
      if (res.ok) {
        const data = await res.json();
        setGrades((prev) => ({
          ...prev,
          [answerId]: {
            score: data.suggestedScore,
            feedback: data.suggestedFeedback,
          },
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(null);
    }
  };

  const handleUploadFeedbackFile = async (file: File) => {
    setFeedbackFile(file);
    setUploadingFeedback(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setFeedbackFileUrl(data.url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingFeedback(false);
    }
  };

  const handleSaveGrades = async () => {
    if (!selectedSubmission) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        submissionId: selectedSubmission.id,
      };

      if (feedbackFileUrl) {
        body.feedbackFileUrl = feedbackFileUrl;
      }

      if (gradingMode === "per-question") {
        body.grades = Object.entries(grades).map(([answerId, g]) => ({
          answerId,
          score: g.score,
          feedback: g.feedback,
        }));
      } else {
        body.overallScore = overallScore;
        body.overallFeedback = overallFeedback;
      }

      const res = await fetch("/api/grading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setSubmissions((prev) =>
          prev.map((s) => {
            if (s.id !== selectedSubmission.id) return s;
            return {
              ...s,
              totalScore: data.totalScore,
              gradedAt: new Date().toISOString(),
              gradedByName: "You",
            };
          })
        );
        setSelectedSubmission((prev) =>
          prev ? { ...prev, totalScore: data.totalScore, gradedAt: new Date().toISOString(), gradedByName: "You" } : prev
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (filterMode === "ungraded") return s.totalScore === null;
    if (filterMode === "graded") return s.totalScore !== null;
    return true;
  });

  const gradedCount = submissions.filter((s) => s.totalScore !== null).length;
  const ungradedCount = submissions.length - gradedCount;
  const allAutoGraded = (selectedSubmission?.answers.length ?? 0) > 0 && (selectedSubmission?.answers.every((a) => a.autoGraded) ?? false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Grading</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review and grade student submissions</p>
        </div>
      </div>

      {/* Assignment Selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
          <SelectTrigger className="w-80">
            <SelectValue placeholder="Select an assignment to grade" />
          </SelectTrigger>
          <SelectContent>
            {assignments.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.title} ({a.submissionCount} submissions)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedAssignmentId && (
          <>
            <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
              <SelectTrigger className="w-44">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({submissions.length})</SelectItem>
                <SelectItem value="ungraded">Ungraded ({ungradedCount})</SelectItem>
                <SelectItem value="graded">Graded ({gradedCount})</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 ml-auto">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                {gradedCount} Graded
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                <Clock className="h-3 w-3" />
                {ungradedCount} Pending
              </span>
            </div>
          </>
        )}
      </div>

      {!selectedAssignmentId ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 py-16 text-center shadow-sm">
          <div className="mx-auto w-14 h-14 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4">
            <ClipboardList className="h-7 w-7 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Select an assignment to grade</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose an assignment from the dropdown above.</p>
        </div>
      ) : loadingSubmissions ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : (
        <div className="flex gap-6 h-[calc(100vh-16rem)]">
          {/* Submission List */}
          <div className="w-80 shrink-0 flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Submissions ({filteredSubmissions.length})
              </h2>
              {assignmentInfo && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                  {assignmentInfo.title} &middot; {assignmentInfo.totalPoints} pts
                </p>
              )}
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1.5">
              {filteredSubmissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ClipboardList className="h-6 w-6 text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {filterMode === "ungraded" ? "All submissions graded!" : "No submissions yet."}
                  </p>
                </div>
              ) : (
                filteredSubmissions.map((sub) => {
                  const isSelected = selectedSubmission?.id === sub.id;
                  const isGraded = sub.totalScore !== null;

                  return (
                    <button
                      key={sub.id}
                      onClick={() => selectSubmission(sub)}
                      className={`w-full text-left rounded-lg p-3 transition-colors border ${
                        isSelected
                          ? "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 shadow-sm"
                          : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSelected
                            ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                            : isGraded
                              ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                        }`}>
                          {sub.userName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{sub.userName}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{sub.userEmail}</p>
                        </div>
                      </div>
                      <div className="mt-2 ml-10 space-y-1">
                        {isGraded ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            Score: {sub.totalScore}/{assignmentInfo?.totalPoints}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                            <Clock className="h-3 w-3" />
                            Needs Grading
                          </span>
                        )}
                        {sub.gradedByName && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">
                            Graded by {sub.gradedByName}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Grading Panel */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
            {selectedSubmission ? (
              <>
                {/* Panel Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{selectedSubmission.userName}</h3>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Submitted {formatShortDate(selectedSubmission.submittedAt)}
                        </p>
                        {selectedSubmission.gradedByName && (
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            &middot; Graded by {selectedSubmission.gradedByName}
                          </p>
                        )}
                        {allAutoGraded && selectedSubmission.answers.length > 0 && (
                          <Badge className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 text-[10px]">
                            Auto-graded
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Grading mode toggle - only for QUIZ with questions */}
                    {selectedSubmission.answers.length > 0 && !allAutoGraded && (
                      <Select value={gradingMode} onValueChange={(v) => setGradingMode(v as GradingMode)}>
                        <SelectTrigger className="w-40 h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="per-question">By Question</SelectItem>
                          <SelectItem value="overall">Overall Grade</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      onClick={handleSaveGrades}
                      disabled={saving || allAutoGraded}
                      className="gap-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save Grades
                    </Button>
                  </div>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-auto p-6 space-y-5">
                  {/* Uploaded file (student submission) */}
                  {selectedSubmission.fileUrl && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Student Submission File</p>
                      <a
                        href={selectedSubmission.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <Download className="h-4 w-4" />
                        View / Download Submission
                      </a>
                    </div>
                  )}

                  {/* Auto-graded notice */}
                  {allAutoGraded && selectedSubmission.answers.length > 0 && (
                    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                        This submission was automatically graded.
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                        Score: {selectedSubmission.totalScore}/{assignmentInfo?.totalPoints} &mdash; No manual grading needed.
                      </p>
                    </div>
                  )}

                  {/* Overall grading mode */}
                  {gradingMode === "overall" && !allAutoGraded && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Overall Grade</h4>
                      <div className="flex items-end gap-4">
                        <div className="space-y-1.5 w-48">
                          <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                            Score (max {assignmentInfo?.totalPoints})
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={assignmentInfo?.totalPoints || 100}
                            value={overallScore}
                            onChange={(e) => setOverallScore(Number(e.target.value))}
                            className="font-semibold text-center"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Feedback</label>
                        <Textarea
                          value={overallFeedback}
                          onChange={(e) => setOverallFeedback(e.target.value)}
                          placeholder="Overall feedback for the student..."
                          rows={4}
                          className="resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Per-question grading */}
                  {gradingMode === "per-question" && selectedSubmission.answers.map((answer, index) => (
                    <div key={answer.id} className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                      {/* Question Header */}
                      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold">
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Question {index + 1}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            ({answer.maxPoints} pts)
                          </span>
                        </div>
                        {answer.autoGraded && (
                          <Badge className="bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 text-xs">
                            Auto-graded
                          </Badge>
                        )}
                      </div>

                      <div className="p-5 space-y-4">
                        <MarkdownContent content={answer.questionText} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" />

                        {/* Student Answer */}
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-100 dark:border-gray-800">
                          <div className="flex items-center gap-1.5 mb-2">
                            <MessageSquare className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Student Answer</p>
                          </div>
                          <p className="text-sm text-gray-800 dark:text-gray-200">{answer.answer || "No answer provided"}</p>
                        </div>

                        {/* Score + AI Assist */}
                        <div className="flex items-end gap-4">
                          <div className="space-y-1.5 flex-1 max-w-[200px]">
                            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                              Score (max {answer.maxPoints})
                            </label>
                            <Input
                              type="number"
                              min={0}
                              max={answer.maxPoints}
                              value={grades[answer.id]?.score || 0}
                              onChange={(e) =>
                                setGrades((prev) => ({
                                  ...prev,
                                  [answer.id]: {
                                    ...prev[answer.id],
                                    score: Number(e.target.value),
                                  },
                                }))
                              }
                              disabled={answer.autoGraded}
                              className="font-semibold text-center"
                            />
                          </div>
                          {!answer.autoGraded && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAIGrade(answer.id)}
                              disabled={aiLoading === answer.id}
                              className="gap-1.5 rounded-lg"
                            >
                              {aiLoading === answer.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                              AI Assist
                            </Button>
                          )}
                        </div>

                        {/* Feedback */}
                        {!answer.autoGraded && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Feedback</label>
                            <Textarea
                              value={grades[answer.id]?.feedback || ""}
                              onChange={(e) =>
                                setGrades((prev) => ({
                                  ...prev,
                                  [answer.id]: {
                                    ...prev[answer.id],
                                    feedback: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Add feedback for the student..."
                              rows={2}
                              className="resize-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Attach feedback file (for TA) */}
                  {!allAutoGraded && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Attach Feedback File (Optional)</p>
                      {feedbackFileUrl ? (
                        <div className="flex items-center gap-3 p-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                          <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="text-sm text-emerald-700 dark:text-emerald-400 truncate flex-1">
                            {feedbackFile?.name || "File attached"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500"
                            onClick={() => { setFeedbackFile(null); setFeedbackFileUrl(null); }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                          {uploadingFeedback ? (
                            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                          ) : (
                            <Upload className="h-4 w-4 text-gray-400" />
                          )}
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {uploadingFeedback ? "Uploading..." : "Upload annotated PDF or feedback file"}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadFeedbackFile(f);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-3">
                  <ClipboardList className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                  Select a submission to start grading
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                  Choose a student from the left panel
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
