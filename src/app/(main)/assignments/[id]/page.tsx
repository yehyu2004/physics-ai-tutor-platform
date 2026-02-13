"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useEffectiveSession } from "@/lib/effective-session-context";
import { useTrackTime } from "@/lib/use-track-time";
import {
  ArrowLeft,
  Clock,
  Loader2,
  Upload,
  Send,
  CheckCircle,
  Eye,
  FileText,
  Download,
  Pencil,
  Trash2,
  AlertTriangle,
  MessageSquare,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ImageUpload } from "@/components/ui/image-upload";
import MermaidDiagram from "@/components/chat/MermaidDiagram";
import { formatShortDate } from "@/lib/utils";
import { useAutoSave } from "@/hooks/useAutoSave";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Question {
  id: string;
  questionText: string;
  questionType: "MC" | "NUMERIC" | "FREE_RESPONSE";
  options: string[] | null;
  correctAnswer: string | null;
  points: number;
  order: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diagram?: { type: "svg" | "mermaid"; content: string } | any;
  imageUrl?: string | null;
}

function getDiagramContent(diagram: unknown): { type: string; content: string } | null {
  if (!diagram) return null;
  if (typeof diagram === "object" && diagram !== null) {
    const d = diagram as Record<string, unknown>;
    if (d.content && typeof d.content === "string") {
      return { type: String(d.type || "svg").toLowerCase(), content: d.content };
    }
    if (d.svg && typeof d.svg === "string") return { type: "svg", content: d.svg };
    if (d.mermaid && typeof d.mermaid === "string") return { type: "mermaid", content: d.mermaid };
    if (d.code && typeof d.code === "string") return { type: String(d.type || "svg").toLowerCase(), content: d.code };
  }
  if (typeof diagram === "string" && diagram.trim().startsWith("<svg")) {
    return { type: "svg", content: diagram.trim() };
  }
  return null;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  type: "QUIZ" | "FILE_UPLOAD";
  totalPoints: number;
  published: boolean;
  lockAfterSubmit: boolean;
  pdfUrl: string | null;
  createdBy: { name: string | null };
  questions: Question[];
  _count: { submissions: number };
}

interface SubmissionAnswer {
  id: string;
  questionId: string;
  answer: string | null;
  score: number | null;
  feedback: string | null;
  feedbackImageUrls?: string[];
  autoGraded: boolean;
}

interface ExistingSubmission {
  id: string;
  fileUrl: string | null;
  submittedAt: string;
  totalScore: number | null;
  isDraft?: boolean;
  answers: SubmissionAnswer[];
}

interface AppealMessageData {
  id: string;
  userId: string;
  content: string;
  imageUrls?: string[];
  createdAt: string;
  user: { id: string; name: string | null; role: string };
}

interface GradeAppealData {
  id: string;
  submissionAnswerId: string;
  studentId: string;
  reason: string;
  imageUrls?: string[];
  status: "OPEN" | "RESOLVED" | "REJECTED";
  createdAt: string;
  student: { id: true; name: string | null };
  submissionAnswer: {
    id: string;
    questionId: string;
    score: number | null;
    feedback: string | null;
    question: { questionText: string; points: number; order: number };
  };
  messages: AppealMessageData[];
}

export default function AssignmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  useTrackTime("ASSIGNMENT_VIEW");
  const router = useRouter();
  const effectiveSession = useEffectiveSession();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingSubmission, setDeletingSubmission] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [existingSubmission, setExistingSubmission] = useState<ExistingSubmission | null>(null);
  const [appeals, setAppeals] = useState<GradeAppealData[]>([]);
  const [appealReasons, setAppealReasons] = useState<Record<string, string>>({});
  const [appealMessages, setAppealMessages] = useState<Record<string, string>>({});
  const [appealNewScores, setAppealNewScores] = useState<Record<string, string>>({});
  const [submittingAppeal, setSubmittingAppeal] = useState<string | null>(null);
  const [expandedAppeals, setExpandedAppeals] = useState<Record<string, boolean>>({});
  const [resolvingAppeal, setResolvingAppeal] = useState<string | null>(null);
  const [appealFilter, setAppealFilter] = useState<"ALL" | "OPEN">("OPEN");
  const [appealImages, setAppealImages] = useState<Record<string, string[]>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const draftRestoredRef = useRef(false);
  const [exportingLatex, setExportingLatex] = useState(false);

  const userRole = effectiveSession.role;

  // Auto-save for quiz drafts
  const isQuizInProgress = assignment?.type === "QUIZ" && (!existingSubmission || existingSubmission.isDraft === true) && !submitted;

  const saveDraft = useCallback(async (data: Record<string, string>) => {
    if (!assignment) return;
    const answerEntries = Object.entries(data).filter(([, v]) => v.trim() !== "");
    if (answerEntries.length === 0) return;
    await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignmentId: assignment.id,
        isDraft: true,
        answers: answerEntries.map(([questionId, answer]) => ({ questionId, answer })),
      }),
    });
  }, [assignment]);

  const { status: autoSaveStatus, saveNow: flushAutoSave, markSaved } = useAutoSave({
    data: answers,
    saveFn: saveDraft,
    delayMs: 2000,
    enabled: isQuizInProgress,
  });

  // beforeunload warning when save is in progress
  useEffect(() => {
    if (autoSaveStatus !== "saving") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [autoSaveStatus]);

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

  useEffect(() => {
    fetch(`/api/assignments/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setAssignment(data.assignment);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Fetch existing submission
    fetch(`/api/submissions?assignmentId=${params.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.submission) {
            setExistingSubmission(data.submission);
            // Restore draft answers
            if (data.submission.isDraft && data.submission.answers?.length > 0 && !draftRestoredRef.current) {
              const restored: Record<string, string> = {};
              for (const a of data.submission.answers) {
                if (a.answer) restored[a.questionId] = a.answer;
              }
              setAnswers(restored);
              markSaved(restored);
              setDraftRestored(true);
              draftRestoredRef.current = true;
            }
            // Fetch appeals for this submission (student view)
            fetch(`/api/appeals?submissionId=${data.submission.id}`)
              .then((r) => r.json())
              .then((d) => {
                const fetched = d.appeals || [];
                setAppeals(fetched);
                // Auto-expand open appeals so students see them immediately
                const expanded: Record<string, boolean> = {};
                for (const a of fetched) {
                  if (a.status === "OPEN") expanded[a.id] = true;
                }
                setExpandedAppeals((prev) => ({ ...prev, ...expanded }));
              })
              .catch(() => {});
          }
        })
        .catch(() => {});

    // TA/Admin: fetch all appeals for this assignment
    if (userRole === "TA" || userRole === "ADMIN" || userRole === "PROFESSOR") {
      fetch(`/api/appeals?assignmentId=${params.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.appeals) {
            setAppeals(data.appeals);
            // Auto-expand open appeals
            const expanded: Record<string, boolean> = {};
            for (const a of data.appeals) {
              if (a.status === "OPEN") expanded[a.id] = true;
            }
            setExpandedAppeals((prev) => ({ ...prev, ...expanded }));
          }
        })
        .catch(() => {});
    }
  }, [params.id, userRole]);

  const isLate = (submittedAt: string) => {
    if (!assignment?.dueDate) return false;
    return new Date(submittedAt) > new Date(assignment.dueDate);
  };

  const handleDeleteSubmission = async () => {
    if (!existingSubmission) return;
    if (!window.confirm("Are you sure you want to delete your submission? You can resubmit afterward.")) return;
    setDeletingSubmission(true);
    try {
      const res = await fetch(`/api/submissions/${existingSubmission.id}`, { method: "DELETE" });
      if (res.ok) {
        setExistingSubmission(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingSubmission(false);
    }
  };

  const handleSubmit = async () => {
    if (!assignment) return;

    // Warn student if assignment is locked after submission
    if (assignment.lockAfterSubmit) {
      const confirmed = window.confirm(
        "Once you submit, you will NOT be able to change or resubmit your answers. Are you sure you want to submit?"
      );
      if (!confirmed) return;
    }

    setSubmitting(true);

    try {
      let fileUrl: string | undefined;

      const fileToUpload =
        assignment.type === "FILE_UPLOAD" ? file : attachmentFile;

      if (fileToUpload) {
        const formData = new FormData();
        formData.append("file", fileToUpload);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          fileUrl = data.url;
        }
      }

      // Flush any pending auto-save before final submit
      if (isQuizInProgress) flushAutoSave();

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignment.id,
          isDraft: false,
          answers: Object.entries(answers).map(([questionId, answer]) => ({
            questionId,
            answer,
          })),
          fileUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setExistingSubmission({
          id: data.submission.id,
          fileUrl: data.submission.fileUrl,
          submittedAt: data.submission.submittedAt,
          totalScore: data.submission.totalScore,
          answers: data.submission.answers || [],
        });
        setSubmitted(true);
      } else {
        const data = await res.json();
        alert(data.error || "Submission failed");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitAppeal = async (answerId: string) => {
    const reason = appealReasons[answerId];
    if (!reason?.trim()) return;
    setSubmittingAppeal(answerId);
    try {
      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionAnswerId: answerId,
          reason: reason.trim(),
          imageUrls: appealImages[answerId]?.length ? appealImages[answerId] : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppeals((prev) => [data.appeal, ...prev]);
        setAppealReasons((prev) => ({ ...prev, [answerId]: "" }));
        setAppealImages((prev) => ({ ...prev, [answerId]: [] }));
        setExpandedAppeals((prev) => ({ ...prev, [data.appeal.id]: true }));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to submit appeal");
      }
    } catch {
      alert("Failed to submit appeal");
    } finally {
      setSubmittingAppeal(null);
    }
  };

  const handleAppealMessage = async (appealId: string) => {
    const message = appealMessages[appealId];
    if (!message?.trim()) return;
    try {
      const res = await fetch("/api/appeals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appealId,
          message: message.trim(),
          imageUrls: appealImages[appealId]?.length ? appealImages[appealId] : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppeals((prev) => prev.map((a) => (a.id === appealId ? data.appeal : a)));
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
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppeals((prev) => prev.map((a) => (a.id === appealId ? data.appeal : a)));
        setAppealMessages((prev) => ({ ...prev, [appealId]: "" }));
        setAppealNewScores((prev) => ({ ...prev, [appealId]: "" }));
        // Refresh submission to get updated scores
        if (status === "RESOLVED" && newScore !== undefined) {
          fetch(`/api/submissions?assignmentId=${params.id}`)
            .then((r) => r.json())
            .then((d) => { if (d.submission) setExistingSubmission(d.submission); })
            .catch(() => {});
        }
      }
    } catch {
      alert("Failed to update appeal");
    } finally {
      setResolvingAppeal(null);
    }
  };

  const getAppealForAnswer = (answerId: string) =>
    appeals.find((a) => a.submissionAnswerId === answerId);

  const handlePublish = async () => {
    if (!assignment) return;
    if (assignment.published && !window.confirm("Unpublishing will hide this assignment from students. Continue?")) return;
    await fetch(`/api/assignments/${assignment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !assignment.published }),
    });
    setAssignment({ ...assignment, published: !assignment.published });
  };

  const handleDelete = async () => {
    if (!assignment) return;
    if (!window.confirm("Are you sure you want to delete this assignment? This will also delete all submissions and cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/assignments/${assignment.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/assignments");
      } else {
        alert("Failed to delete assignment");
      }
    } catch {
      alert("Failed to delete assignment");
    } finally {
      setDeleting(false);
    }
  };

  const handleExportLatex = async () => {
    if (!assignment) return;
    setExportingLatex(true);
    try {
      const res = await fetch(`/api/assignments/${assignment.id}/export-latex`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${assignment.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 60)}_latex.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to export LaTeX");
    } finally {
      setExportingLatex(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-500">Assignment not found.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Submitted!</h2>
        <p className="text-neutral-500 mb-6">
          Your submission has been recorded successfully.
        </p>
        <Link href="/assignments">
          <Button>Back to Assignments</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/assignments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{assignment.title}</h1>
            {!assignment.published && <Badge variant="warning">Draft</Badge>}
          </div>
          <div className="flex items-center gap-4 text-sm text-neutral-500 mt-1">
            <span>By {assignment.createdBy.name || "Unknown"}</span>
            {assignment.dueDate && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Due {formatShortDate(assignment.dueDate)}
              </span>
            )}
            <span>{assignment.totalPoints} points</span>
          </div>
          {assignment.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{assignment.description}</p>
          )}
        </div>
        {(userRole === "TA" || userRole === "ADMIN" || userRole === "PROFESSOR") && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/assignments/${assignment.id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handlePublish}>
              <Eye className="h-4 w-4 mr-2" />
              {assignment.published ? "Unpublish" : "Publish"}
            </Button>
            <Link href={`/grading?assignmentId=${assignment.id}`}>
              <Button variant="outline" size="sm">
                Grade ({assignment._count.submissions})
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleExportLatex} disabled={exportingLatex}>
              {exportingLatex ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {exportingLatex ? "Exporting..." : "Export LaTeX"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950">
              <Trash2 className="h-4 w-4 mr-2" />
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

      {assignment.type === "QUIZ" && (!existingSubmission || existingSubmission.isDraft) && (
        <div className="space-y-4">
          {assignment.questions.map((q, index) => (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  Question {index + 1}{" "}
                  <span className="text-neutral-400 font-normal">
                    ({q.points} pts)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <MarkdownContent content={q.questionText} className="text-sm" />

                {(() => {
                  const diag = getDiagramContent(q.diagram);
                  if (!diag) return null;
                  return (
                    <div className="my-3 flex justify-center">
                      {diag.type === "svg" ? (
                        <div
                          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 overflow-auto max-w-full [&_svg]:w-full [&_svg]:h-auto"
                          dangerouslySetInnerHTML={{ __html: diag.content }}
                        />
                      ) : (
                        <MermaidDiagram content={diag.content} />
                      )}
                    </div>
                  );
                })()}

                {q.imageUrl && (
                  <div className="my-3">
                    <img
                      src={q.imageUrl}
                      alt="Question diagram"
                      className="rounded-lg max-w-full border border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}

                {q.questionType === "MC" && q.options && (
                  <div className="space-y-2">
                    {(q.options as string[]).map((opt, oIndex) => (
                      <label
                        key={oIndex}
                        className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-neutral-50 transition-colors"
                      >
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={String.fromCharCode(65 + oIndex)}
                          checked={answers[q.id] === String.fromCharCode(65 + oIndex)}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                          className="shrink-0"
                        />
                        <MarkdownContent
                          content={`${String.fromCharCode(65 + oIndex)}. ${opt}`}
                          className="text-sm"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {q.questionType === "NUMERIC" && (
                  <div className="space-y-2">
                    <Label>Your Answer</Label>
                    <Input
                      type="text"
                      value={answers[q.id] || ""}
                      onChange={(e) =>
                        setAnswers({ ...answers, [q.id]: e.target.value })
                      }
                      placeholder="Enter a numeric value"
                    />
                  </div>
                )}

                {q.questionType === "FREE_RESPONSE" && (
                  <div className="space-y-2">
                    <Label>Your Answer</Label>
                    <Textarea
                      value={answers[q.id] || ""}
                      onChange={(e) =>
                        setAnswers({ ...answers, [q.id]: e.target.value })
                      }
                      placeholder="Write your answer... (supports LaTeX: $...$)"
                      rows={4}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {assignment.type === "QUIZ" && (!existingSubmission || existingSubmission.isDraft) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attach Your Work (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed rounded-xl p-6 text-center">
              <Upload className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm text-neutral-500 mb-3">
                Upload a PDF with your handwritten or additional work
              </p>
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f && f.size > 20 * 1024 * 1024) {
                    alert("File exceeds the 20 MB limit. Please use a smaller file.");
                    e.target.value = "";
                    return;
                  }
                  setAttachmentFile(f);
                }}
                className="text-sm"
                accept=".pdf"
              />
              {attachmentFile && (
                <p className="text-sm text-emerald-600 mt-2">
                  Selected: {attachmentFile.name}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Draft restored banner */}
      {draftRestored && (!existingSubmission || existingSubmission.isDraft) && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300">Your previous answers were restored from an auto-saved draft.</p>
          <button onClick={() => setDraftRestored(false)} className="ml-auto text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">
            <span className="sr-only">Dismiss</span>
            &times;
          </button>
        </div>
      )}

      {/* Existing submission display */}
      {existingSubmission && !existingSubmission.isDraft && !submitted && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="h-5 w-5" />
              Submission Recorded
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Submitted: {formatShortDate(existingSubmission.submittedAt)}
              </span>
              {isLate(existingSubmission.submittedAt) && (
                <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800 gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Late Submission
                </Badge>
              )}
              {existingSubmission.totalScore !== null ? (
                <Badge variant="secondary">
                  Score: {existingSubmission.totalScore} / {assignment.totalPoints}
                </Badge>
              ) : (
                <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 gap-1">
                  <Clock className="h-3 w-3" />
                  Not graded yet
                </Badge>
              )}
            </div>
            {existingSubmission.fileUrl && (
              <a
                href={existingSubmission.fileUrl}
                download
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <Download className="h-4 w-4" />
                Download your submission
              </a>
            )}
            {assignment.lockAfterSubmit || existingSubmission.totalScore !== null || existingSubmission.answers?.some(a => a.score !== null) ? (
              <div className="flex items-center gap-2 pt-2 px-3 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {assignment.lockAfterSubmit
                    ? "This assignment is locked. You cannot delete or resubmit."
                    : "This submission has been graded. You cannot delete or resubmit."}
                </p>
              </div>
            ) : (
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteSubmission}
                  disabled={deletingSubmission}
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                >
                  {deletingSubmission ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete & Resubmit
                </Button>
              </div>
            )}

            {/* Per-question feedback with appeal support */}
            {existingSubmission.answers && existingSubmission.answers.length > 0 && existingSubmission.totalScore !== null && (
              <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Grading Details</p>
                {existingSubmission.answers.map((ans, idx) => {
                  const question = assignment.questions.find(q => q.id === ans.questionId);
                  const appeal = getAppealForAnswer(ans.id);
                  return (
                    <div key={ans.id} className="rounded-lg border border-gray-100 dark:border-gray-800 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Question {idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          {appeal && (
                            <Badge className={`text-xs gap-1 ${
                              appeal.status === "OPEN"
                                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800"
                                : appeal.status === "RESOLVED"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800"
                                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800"
                            }`}>
                              {appeal.status === "OPEN" ? (
                                <><ShieldAlert className="h-3 w-3" /> Appeal Pending</>
                              ) : appeal.status === "RESOLVED" ? (
                                <><CheckCircle2 className="h-3 w-3" /> Appeal Accepted</>
                              ) : (
                                <><XCircle className="h-3 w-3" /> Appeal Denied</>
                              )}
                            </Badge>
                          )}
                          <span className={`text-sm font-semibold ${
                            ans.score !== null && question
                              ? ans.score >= question.points
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-gray-700 dark:text-gray-300"
                              : "text-gray-400 dark:text-gray-500"
                          }`}>
                            {ans.score !== null ? `${ans.score}/${question?.points ?? "?"}` : "Not graded"}
                          </span>
                        </div>
                      </div>
                      {ans.answer && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Your answer: {ans.answer}
                        </p>
                      )}
                      {ans.feedback && (
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                          <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Feedback</p>
                          <MarkdownContent content={ans.feedback} className="text-sm text-blue-800 dark:text-blue-300" />
                          {ans.feedbackImageUrls && ans.feedbackImageUrls.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {ans.feedbackImageUrls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={url} alt={`Feedback image ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-blue-200 dark:border-blue-700 hover:opacity-80 transition-opacity" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Appeal section */}
                      {ans.score !== null && !appeal && userRole === "STUDENT" && (
                        <div className="pt-2 space-y-2">
                          <button
                            onClick={() => setExpandedAppeals((prev) => ({ ...prev, [`new-${ans.id}`]: !prev[`new-${ans.id}`] }))}
                            className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Appeal this grade
                          </button>
                          {expandedAppeals[`new-${ans.id}`] && (
                            <div className="space-y-2 pl-5">
                              <Textarea
                                value={appealReasons[ans.id] || ""}
                                onChange={(e) => setAppealReasons((prev) => ({ ...prev, [ans.id]: e.target.value }))}
                                placeholder="Explain why you believe this grade should be reconsidered..."
                                rows={3}
                                className="text-sm"
                              />
                              <ImageUpload
                                images={appealImages[ans.id] || []}
                                onImagesChange={(imgs) => setAppealImages((prev) => ({ ...prev, [ans.id]: imgs }))}
                                onUpload={handleUploadImage}
                                uploading={uploadingImage}
                                maxImages={3}
                              />
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  onClick={() => handleSubmitAppeal(ans.id)}
                                  disabled={submittingAppeal === ans.id || !appealReasons[ans.id]?.trim()}
                                  className="gap-1.5"
                                >
                                  {submittingAppeal === ans.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Send className="h-3.5 w-3.5" />
                                  )}
                                  Submit Appeal
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Existing appeal thread */}
                      {appeal && (
                        <div className="pt-2 space-y-2">
                          <button
                            onClick={() => setExpandedAppeals((prev) => ({ ...prev, [appeal.id]: !prev[appeal.id] }))}
                            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {expandedAppeals[appeal.id] ? "Hide appeal thread" : `View appeal thread (${appeal.messages.length + 1} message${appeal.messages.length > 0 ? "s" : ""})`}
                          </button>
                          {expandedAppeals[appeal.id] && (
                            <div className="space-y-3 pl-5 border-l-2 border-amber-200 dark:border-amber-800">
                              {/* Original appeal reason */}
                              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                    {appeal.student.name || "Student"}
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

                              {/* Messages thread */}
                              {appeal.messages.map((msg) => {
                                const isStaff = msg.user.role === "TA" || msg.user.role === "ADMIN" || msg.user.role === "PROFESSOR";
                                return (
                                  <div
                                    key={msg.id}
                                    className={`rounded-lg p-3 border ${
                                      isStaff
                                        ? "bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800"
                                        : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={`text-xs font-semibold ${
                                        isStaff ? "text-indigo-700 dark:text-indigo-400" : "text-gray-700 dark:text-gray-300"
                                      }`}>
                                        {msg.user.name || "User"}
                                      </span>
                                      {isStaff && (
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

                              {/* Reply box */}
                              <div className="space-y-2">
                                <Textarea
                                  value={appealMessages[appeal.id] || ""}
                                  onChange={(e) => setAppealMessages((prev) => ({ ...prev, [appeal.id]: e.target.value }))}
                                  placeholder={appeal.status === "OPEN" ? "Write a reply..." : "Add a follow-up message..."}
                                  rows={2}
                                  className="text-sm"
                                />
                                <ImageUpload
                                  images={appealImages[appeal.id] || []}
                                  onImagesChange={(imgs) => setAppealImages((prev) => ({ ...prev, [appeal.id]: imgs }))}
                                  onUpload={handleUploadImage}
                                  uploading={uploadingImage}
                                  maxImages={3}
                                />

                                {/* TA/Admin: resolve/reject/reopen controls */}
                                {(userRole === "TA" || userRole === "ADMIN" || userRole === "PROFESSOR") && (
                                  <div className="space-y-2">
                                    {appeal.status === "OPEN" && (
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="number"
                                          step="0.5"
                                          min="0"
                                          max={question?.points ?? 100}
                                          value={appealNewScores[appeal.id] || ""}
                                          onChange={(e) => setAppealNewScores((prev) => ({ ...prev, [appeal.id]: e.target.value }))}
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
                                            onClick={() => handleResolveAppeal(appeal.id, "RESOLVED")}
                                            disabled={resolvingAppeal === appeal.id}
                                            className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                                          >
                                            {resolvingAppeal === appeal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            Accept & Resolve
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleResolveAppeal(appeal.id, "REJECTED")}
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
                                          onClick={() => handleResolveAppeal(appeal.id, "OPEN")}
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
                                        onClick={() => handleAppealMessage(appeal.id)}
                                        disabled={!appealMessages[appeal.id]?.trim()}
                                        className="gap-1.5"
                                      >
                                        <Send className="h-3.5 w-3.5" />
                                        Reply
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {/* Student: Send reply button */}
                                {userRole === "STUDENT" && (
                                  <div className="flex justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleAppealMessage(appeal.id)}
                                      disabled={!appealMessages[appeal.id]?.trim()}
                                      className="gap-1.5"
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                      Reply
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {assignment.type === "FILE_UPLOAD" && (!existingSubmission || existingSubmission.isDraft) && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Your Submission</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed rounded-xl p-8 text-center">
              <Upload className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500 mb-3">
                Upload your submission (PDF, images, etc.)
              </p>
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f && f.size > 20 * 1024 * 1024) {
                    alert("File exceeds the 20 MB limit. Please use a smaller file.");
                    e.target.value = "";
                    return;
                  }
                  setFile(f);
                }}
                className="text-sm"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              />
              {file && (
                <p className="text-sm text-emerald-600 mt-2">
                  Selected: {file.name}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(!existingSubmission || existingSubmission.isDraft) && (
        <div className="space-y-3 pb-8">
          {assignment.lockAfterSubmit && (
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                This assignment is locked after submission. You will <strong>not</strong> be able to change or resubmit your answers.
              </p>
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <SaveStatusIndicator status={autoSaveStatus} />
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit
            </Button>
          </div>
        </div>
      )}

      {/* TA/Admin: Grade Appeals Section */}
      {(userRole === "TA" || userRole === "ADMIN" || userRole === "PROFESSOR") && appeals.length > 0 && (() => {
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
                  {appealFilter === "OPEN" ? "No open appeals — all caught up!" : "No appeals found."}
                </p>
              )}
              {filteredAppeals.map((appeal) => {
                const question = assignment.questions.find(
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
                    className={`rounded-lg border p-4 space-y-3 transition-colors ${
                      appeal.status === "OPEN"
                        ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20"
                        : "border-gray-200 dark:border-gray-700 opacity-80"
                    }`}
                  >
                    {/* Header row */}
                    <button
                      onClick={() => setExpandedAppeals((prev) => ({ ...prev, [appeal.id]: !prev[appeal.id] }))}
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
                        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Grading Context</p>
                          <div className="grid gap-1.5 text-sm">
                            <div className="flex gap-2">
                              <span className="text-gray-500 dark:text-gray-400 shrink-0">Question:</span>
                              <span className="text-gray-700 dark:text-gray-300 line-clamp-2">{appeal.submissionAnswer.question.questionText}</span>
                            </div>
                            {appeal.submissionAnswer.feedback && (
                              <div className="flex gap-2">
                                <span className="text-gray-500 dark:text-gray-400 shrink-0">Feedback:</span>
                                <MarkdownContent content={appeal.submissionAnswer.feedback} className="text-gray-700 dark:text-gray-300" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Original appeal reason */}
                        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
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
                          const isStaff = msg.user.role === "TA" || msg.user.role === "ADMIN" || msg.user.role === "PROFESSOR";
                          return (
                            <div
                              key={msg.id}
                              className={`rounded-lg p-3 border ${
                                isStaff
                                  ? "bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800"
                                  : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className={`text-xs font-semibold ${
                                    isStaff
                                      ? "text-indigo-700 dark:text-indigo-400"
                                      : "text-gray-700 dark:text-gray-300"
                                  }`}
                                >
                                  {msg.user.name || "User"}
                                </span>
                                {isStaff && (
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
                            onChange={(e) =>
                              setAppealMessages((prev) => ({
                                ...prev,
                                [appeal.id]: e.target.value,
                              }))
                            }
                            placeholder={appeal.status === "OPEN" ? "Write a reply or leave a note before resolving..." : "Add a follow-up message..."}
                            rows={2}
                            className="text-sm"
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
                                max={question?.points ?? 100}
                                value={appealNewScores[appeal.id] || ""}
                                onChange={(e) =>
                                  setAppealNewScores((prev) => ({
                                    ...prev,
                                    [appeal.id]: e.target.value,
                                  }))
                                }
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
                                  onClick={() => handleResolveAppeal(appeal.id, "RESOLVED")}
                                  disabled={resolvingAppeal === appeal.id}
                                  className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                                >
                                  {resolvingAppeal === appeal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  Accept & Resolve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleResolveAppeal(appeal.id, "REJECTED")}
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
                                onClick={() => handleResolveAppeal(appeal.id, "OPEN")}
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
                              onClick={() => handleAppealMessage(appeal.id)}
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
      })()}
    </div>
  );
}
