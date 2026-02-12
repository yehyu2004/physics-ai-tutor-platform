"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTrackTime } from "@/lib/use-track-time";
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
  ShieldAlert,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ImageUpload } from "@/components/ui/image-upload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatShortDate } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { SaveStatusIndicator } from "@/components/ui/save-status";

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

interface AppealMessage {
  id: string;
  content: string;
  imageUrls?: string[];
  createdAt: string;
  user: { id: string; name: string | null; role: string };
}

interface Appeal {
  id: string;
  status: string;
  reason: string;
  imageUrls?: string[];
  createdAt: string;
  student: { id: string; name: string | null };
  messages: AppealMessage[];
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
  openAppealCount: number;
  totalAppealCount: number;
  answers: {
    id: string;
    questionText: string;
    questionType: string;
    answer: string | null;
    score: number | null;
    feedback: string | null;
    autoGraded: boolean;
    maxPoints: number;
    appeals: Appeal[];
  }[];
}

type GradingMode = "per-question" | "overall";
type FilterMode = "all" | "ungraded" | "graded" | "appeals";

export default function GradingPage() {
  useTrackTime("GRADING");
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
  const [feedbackImages, setFeedbackImages] = useState<Record<string, string[]>>({});
  const [appealMessages, setAppealMessages] = useState<Record<string, string>>({});
  const [appealNewScores, setAppealNewScores] = useState<Record<string, string>>({});
  const [resolvingAppeal, setResolvingAppeal] = useState<string | null>(null);
  const [expandedAppeals, setExpandedAppeals] = useState<Record<string, boolean>>({});
  const [appealImages, setAppealImages] = useState<Record<string, string[]>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [gradingDraftRestored, setGradingDraftRestored] = useState(false);
  const prevSubmissionIdRef = useRef<string | null>(null);

  // localStorage helpers for grading drafts
  const getLocalStorageKey = (submissionId: string) => `grading-draft-${submissionId}`;

  const saveToLocalStorage = useCallback((submissionId: string, g: Record<string, { score: number; feedback: string }>) => {
    try {
      localStorage.setItem(getLocalStorageKey(submissionId), JSON.stringify(g));
    } catch { /* quota exceeded or similar */ }
  }, []);

  const loadFromLocalStorage = useCallback((submissionId: string): Record<string, { score: number; feedback: string }> | null => {
    try {
      const data = localStorage.getItem(getLocalStorageKey(submissionId));
      if (data) return JSON.parse(data);
    } catch { /* parse error */ }
    return null;
  }, []);

  const clearLocalStorage = useCallback((submissionId: string) => {
    try {
      localStorage.removeItem(getLocalStorageKey(submissionId));
    } catch { /* ignore */ }
  }, []);

  // Save grades to localStorage on every change
  useEffect(() => {
    if (!selectedSubmission || Object.keys(grades).length === 0) return;
    saveToLocalStorage(selectedSubmission.id, grades);
  }, [grades, selectedSubmission, saveToLocalStorage]);

  // Server auto-save for grading drafts (5-second debounce)
  const saveGradingDraft = useCallback(async (data: Record<string, { score: number; feedback: string }>) => {
    if (!selectedSubmission) return;
    const gradeEntries = Object.entries(data);
    if (gradeEntries.length === 0) return;
    await fetch("/api/grading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: selectedSubmission.id,
        isDraft: true,
        grades: gradeEntries.map(([answerId, g]) => ({
          answerId,
          score: g.score,
          feedback: g.feedback,
        })),
      }),
    });
  }, [selectedSubmission]);

  const { status: gradingAutoSaveStatus, saveNow: flushGradingSave } = useAutoSave({
    data: grades,
    saveFn: saveGradingDraft,
    delayMs: 5000,
    enabled: !!selectedSubmission && gradingMode === "per-question",
  });

  const handleUploadImage = useCallback(async (file: File): Promise<string | null> => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
      return null;
    } catch {
      return null;
    } finally {
      setUploadingImage(false);
    }
  }, []);

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
    // Flush pending auto-save for the previous submission
    if (selectedSubmission && selectedSubmission.id !== sub.id) {
      flushGradingSave();
    }
    prevSubmissionIdRef.current = sub.id;

    setSelectedSubmission(sub);
    setFeedbackFile(null);
    setFeedbackFileUrl(null);
    setGradingDraftRestored(false);

    // Try to restore from localStorage
    const savedDraft = loadFromLocalStorage(sub.id);
    const initialGrades: Record<string, { score: number; feedback: string }> = {};
    let restored = false;

    sub.answers.forEach((a) => {
      if (savedDraft?.[a.id]) {
        initialGrades[a.id] = savedDraft[a.id];
        // Check if localStorage draft differs from server state
        if (savedDraft[a.id].score !== (a.score || 0) || savedDraft[a.id].feedback !== (a.feedback || "")) {
          restored = true;
        }
      } else {
        initialGrades[a.id] = {
          score: a.score || 0,
          feedback: a.feedback || "",
        };
      }
    });

    setGrades(initialGrades);
    if (restored) setGradingDraftRestored(true);

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
    if (file.size > 20 * 1024 * 1024) {
      alert("File exceeds the 20 MB limit. Please use a smaller file.");
      return;
    }
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
        // Include feedback images keyed by answerId
        const hasAnyImages = Object.values(feedbackImages).some((imgs) => imgs.length > 0);
        if (hasAnyImages) {
          body.feedbackImages = feedbackImages;
        }
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
        // Clear localStorage on successful final save
        clearLocalStorage(selectedSubmission.id);
        setGradingDraftRestored(false);
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

  const handleAppealMessage = async (appealId: string) => {
    const message = appealMessages[appealId]?.trim();
    if (!message) return;
    try {
      const res = await fetch("/api/appeals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appealId,
          message,
          imageUrls: appealImages[appealId]?.length ? appealImages[appealId] : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        updateAppealInSubmissions(appealId, data.appeal);
        setAppealMessages((prev) => ({ ...prev, [appealId]: "" }));
        setAppealImages((prev) => ({ ...prev, [appealId]: [] }));
      }
    } catch {
      alert("Failed to send message");
    }
  };

  const handleResolveAppeal = async (appealId: string, status: "RESOLVED" | "REJECTED" | "OPEN") => {
    const action = status === "RESOLVED" ? "resolve" : status === "REJECTED" ? "reject" : "reopen";
    if (!window.confirm(`Are you sure you want to ${action} this appeal?`)) return;
    const newScoreStr = appealNewScores[appealId];
    const newScore = status === "RESOLVED" && newScoreStr ? parseFloat(newScoreStr) : undefined;
    const message = appealMessages[appealId];
    setResolvingAppeal(appealId);
    try {
      const res = await fetch("/api/appeals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appealId,
          status,
          newScore,
          message: message?.trim() || undefined,
          imageUrls: appealImages[appealId]?.length ? appealImages[appealId] : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        updateAppealInSubmissions(appealId, data.appeal);
        setAppealMessages((prev) => ({ ...prev, [appealId]: "" }));
        setAppealImages((prev) => ({ ...prev, [appealId]: [] }));
        setAppealNewScores((prev) => ({ ...prev, [appealId]: "" }));
        // Refresh submissions to get updated scores
        if (status === "RESOLVED" && newScore !== undefined) {
          fetchSubmissions(selectedAssignmentId);
        }
      }
    } catch {
      alert("Failed to update appeal");
    } finally {
      setResolvingAppeal(null);
    }
  };

  const updateAppealInSubmissions = (appealId: string, updatedAppeal: Appeal) => {
    setSubmissions((prev) =>
      prev.map((sub) => ({
        ...sub,
        openAppealCount: sub.answers.reduce(
          (count, a) => count + a.appeals.filter((ap) => ap.id === appealId ? updatedAppeal.status === "OPEN" : ap.status === "OPEN").length,
          0
        ),
        answers: sub.answers.map((a) => ({
          ...a,
          appeals: a.appeals.map((ap) => ap.id === appealId ? updatedAppeal : ap),
        })),
      }))
    );
    setSelectedSubmission((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        answers: prev.answers.map((a) => ({
          ...a,
          appeals: a.appeals.map((ap) => ap.id === appealId ? updatedAppeal : ap),
        })),
      };
    });
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (filterMode === "ungraded") return s.totalScore === null;
    if (filterMode === "graded") return s.totalScore !== null;
    if (filterMode === "appeals") return s.openAppealCount > 0;
    return true;
  });

  const gradedCount = submissions.filter((s) => s.totalScore !== null).length;
  const ungradedCount = submissions.length - gradedCount;
  const appealsCount = submissions.filter((s) => s.openAppealCount > 0).length;
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
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
          <SelectTrigger className="w-full sm:w-80">
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
              <SelectTrigger className="w-32 sm:w-44">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ({submissions.length})</SelectItem>
                <SelectItem value="ungraded">Ungraded ({ungradedCount})</SelectItem>
                <SelectItem value="graded">Graded ({gradedCount})</SelectItem>
                {appealsCount > 0 && (
                  <SelectItem value="appeals">Has Appeals ({appealsCount})</SelectItem>
                )}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                const url = `/api/grading/export?assignmentId=${selectedAssignmentId}`;
                window.open(url, "_blank");
              }}
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">Export</span>
            </Button>

            <div className="flex items-center gap-2 ml-auto">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                {gradedCount} Graded
              </span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                <Clock className="h-3 w-3" />
                {ungradedCount} Pending
              </span>
              {appealsCount > 0 && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-orange-600 bg-orange-50 dark:bg-orange-950 px-2.5 py-1 rounded-full border border-orange-200 dark:border-orange-800">
                  <ShieldAlert className="h-3 w-3" />
                  {appealsCount} Appeals
                </span>
              )}
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
        <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:h-[calc(100vh-16rem)]">
          {/* Submission List */}
          <div className="w-full md:w-80 shrink-0 flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm max-h-[40vh] md:max-h-none">
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
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">Submitted {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(sub.submittedAt))}</p>
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
                        {sub.openAppealCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
                            <ShieldAlert className="h-3 w-3" />
                            {sub.openAppealCount} open appeal{sub.openAppealCount !== 1 ? "s" : ""}
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
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{selectedSubmission.userName}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
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
                  <div className="flex items-center gap-2 ml-auto">
                    {/* Grading mode toggle - only for QUIZ with questions */}
                    {selectedSubmission.answers.length > 0 && !allAutoGraded && (
                      <Select value={gradingMode} onValueChange={(v) => setGradingMode(v as GradingMode)}>
                        <SelectTrigger className="w-32 sm:w-40 h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="per-question">By Question</SelectItem>
                          <SelectItem value="overall">Overall Grade</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <SaveStatusIndicator status={gradingAutoSaveStatus} />
                    <Button
                      onClick={handleSaveGrades}
                      disabled={saving || allAutoGraded}
                      size="sm"
                      className="gap-1.5 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 rounded-lg"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span className="hidden sm:inline">Save Grades</span>
                      <span className="sm:hidden">Save</span>
                    </Button>
                  </div>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-auto p-6 space-y-5">
                  {/* Draft restored banner */}
                  {gradingDraftRestored && (
                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <p className="text-sm text-blue-700 dark:text-blue-300">Grading progress restored from a previous session.</p>
                      <button onClick={() => setGradingDraftRestored(false)} className="ml-auto text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">
                        &times;
                      </button>
                    </div>
                  )}

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
                            <ImageUpload
                              images={feedbackImages[answer.id] || []}
                              onImagesChange={(imgs) => setFeedbackImages((prev) => ({ ...prev, [answer.id]: imgs }))}
                              onUpload={handleUploadImage}
                              uploading={uploadingImage}
                              maxImages={3}
                            />
                          </div>
                        )}

                        {/* Appeals for this question */}
                        {answer.appeals.length > 0 && (
                          <div className="space-y-2">
                            {answer.appeals.map((appeal) => {
                              const isExpanded = expandedAppeals[appeal.id];
                              return (
                                <div
                                  key={appeal.id}
                                  className={`rounded-lg border p-3 space-y-2 ${
                                    appeal.status === "OPEN"
                                      ? "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/30"
                                      : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
                                  }`}
                                >
                                  <button
                                    onClick={() => setExpandedAppeals((prev) => ({ ...prev, [appeal.id]: !prev[appeal.id] }))}
                                    className="w-full flex items-center justify-between cursor-pointer group"
                                  >
                                    <div className="flex items-center gap-2">
                                      <ShieldAlert className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                        Appeal by {appeal.student.name || "Student"}
                                      </span>
                                      <Badge
                                        className={`text-[10px] px-1.5 py-0 gap-0.5 ${
                                          appeal.status === "OPEN"
                                            ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-400 dark:border-amber-700"
                                            : appeal.status === "RESOLVED"
                                              ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-400 dark:border-emerald-700"
                                              : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-400 dark:border-red-700"
                                        }`}
                                      >
                                        {appeal.status === "OPEN" ? "Pending" : appeal.status === "RESOLVED" ? "Accepted" : "Denied"}
                                      </Badge>
                                      {appeal.messages.length > 0 && (
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                          {appeal.messages.length} message{appeal.messages.length !== 1 ? "s" : ""}
                                        </span>
                                      )}
                                    </div>
                                    <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                  </button>

                                  {isExpanded && (
                                    <div className="space-y-2 pt-1">
                                      {/* Original reason */}
                                      <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-md p-2.5">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                                            {appeal.student.name || "Student"}
                                          </span>
                                          <span className="text-[10px] text-amber-500 dark:text-amber-600">
                                            {formatShortDate(appeal.createdAt)}
                                          </span>
                                        </div>
                                        <MarkdownContent content={appeal.reason} className="text-xs text-amber-800 dark:text-amber-300" />
                                        {appeal.imageUrls && appeal.imageUrls.length > 0 && (
                                          <div className="flex gap-2 mt-1.5 flex-wrap">
                                            {appeal.imageUrls.map((url, i) => (
                                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={url} alt={`Attachment ${i + 1}`} className="h-16 w-16 object-cover rounded border border-amber-200 dark:border-amber-700 hover:opacity-80 transition-opacity" />
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      {/* Messages */}
                                      {appeal.messages.map((msg) => {
                                        const isStaff = msg.user.role === "TA" || msg.user.role === "ADMIN" || msg.user.role === "PROFESSOR";
                                        return (
                                          <div
                                            key={msg.id}
                                            className={`rounded-md p-2.5 border ${
                                              isStaff
                                                ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800"
                                                : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 mb-0.5">
                                              <span className={`text-[10px] font-semibold ${isStaff ? "text-indigo-700 dark:text-indigo-400" : "text-gray-700 dark:text-gray-300"}`}>
                                                {msg.user.name || "User"}
                                              </span>
                                              {isStaff && (
                                                <Badge className="text-[9px] px-1 py-0 bg-indigo-100 text-indigo-600 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-400 dark:border-indigo-700">
                                                  {msg.user.role}
                                                </Badge>
                                              )}
                                              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                                {formatShortDate(msg.createdAt)}
                                              </span>
                                            </div>
                                            <MarkdownContent content={msg.content} className="text-xs text-gray-800 dark:text-gray-200" />
                                            {msg.imageUrls && msg.imageUrls.length > 0 && (
                                              <div className="flex gap-2 mt-1.5 flex-wrap">
                                                {msg.imageUrls.map((url, i) => (
                                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={url} alt={`Attachment ${i + 1}`} className="h-16 w-16 object-cover rounded border border-gray-200 dark:border-gray-700 hover:opacity-80 transition-opacity" />
                                                  </a>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}

                                      {/* Reply + action controls */}
                                      <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                                        <Textarea
                                          value={appealMessages[appeal.id] || ""}
                                          onChange={(e) => setAppealMessages((prev) => ({ ...prev, [appeal.id]: e.target.value }))}
                                          placeholder={appeal.status === "OPEN" ? "Reply or note before resolving..." : "Add a follow-up message..."}
                                          rows={2}
                                          className="text-xs"
                                        />
                                        <ImageUpload
                                          images={appealImages[appeal.id] || []}
                                          onImagesChange={(imgs) => setAppealImages((prev) => ({ ...prev, [appeal.id]: imgs }))}
                                          onUpload={handleUploadImage}
                                          uploading={uploadingImage}
                                          maxImages={3}
                                        />
                                        {appeal.status === "OPEN" && (
                                          <div className="flex items-center gap-2">
                                            <Input
                                              type="number"
                                              step="0.5"
                                              min="0"
                                              max={answer.maxPoints}
                                              value={appealNewScores[appeal.id] || ""}
                                              onChange={(e) => setAppealNewScores((prev) => ({ ...prev, [appeal.id]: e.target.value }))}
                                              placeholder={`New score (max ${answer.maxPoints})`}
                                              className="w-40 text-xs"
                                            />
                                          </div>
                                        )}
                                        <div className="flex items-center gap-1.5">
                                          {appeal.status === "OPEN" ? (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleResolveAppeal(appeal.id, "RESOLVED")}
                                                disabled={resolvingAppeal === appeal.id}
                                                className="gap-1 text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                                              >
                                                {resolvingAppeal === appeal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                                Accept
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleResolveAppeal(appeal.id, "REJECTED")}
                                                disabled={resolvingAppeal === appeal.id}
                                                className="gap-1 text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                                              >
                                                {resolvingAppeal === appeal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                                                Deny
                                              </Button>
                                            </>
                                          ) : (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleResolveAppeal(appeal.id, "OPEN")}
                                              disabled={resolvingAppeal === appeal.id}
                                              className="gap-1 text-xs h-7 text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950"
                                            >
                                              {resolvingAppeal === appeal.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
                                              Reopen
                                            </Button>
                                          )}
                                          <div className="flex-1" />
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleAppealMessage(appeal.id)}
                                            disabled={!appealMessages[appeal.id]?.trim()}
                                            className="gap-1 text-xs h-7"
                                          >
                                            <Send className="h-3 w-3" />
                                            Reply
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
