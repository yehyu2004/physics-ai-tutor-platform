"use client";

import React, { useEffect, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";

interface SubmissionForGrading {
  id: string;
  userName: string;
  userEmail: string;
  submittedAt: string;
  totalScore: number | null;
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

export default function GradingPage() {
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignmentId");

  const [submissions, setSubmissions] = useState<SubmissionForGrading[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionForGrading | null>(null);
  const [grades, setGrades] = useState<Record<string, { score: number; feedback: string }>>({});
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!assignmentId) {
      setLoading(false);
      return;
    }

    fetch(`/api/assignments/${assignmentId}/submissions`)
      .then((res) => res.json())
      .then((data) => {
        setSubmissions(data.submissions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [assignmentId]);

  const selectSubmission = (sub: SubmissionForGrading) => {
    setSelectedSubmission(sub);
    const initialGrades: Record<string, { score: number; feedback: string }> = {};
    sub.answers.forEach((a) => {
      initialGrades[a.id] = {
        score: a.score || 0,
        feedback: a.feedback || "",
      };
    });
    setGrades(initialGrades);
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

  const handleSaveGrades = async () => {
    if (!selectedSubmission) return;
    setSaving(true);
    try {
      await fetch("/api/grading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: selectedSubmission.id,
          grades: Object.entries(grades).map(([answerId, g]) => ({
            answerId,
            score: g.score,
            feedback: g.feedback,
          })),
        }),
      });
      setSubmissions((prev) =>
        prev.map((s) => {
          if (s.id !== selectedSubmission.id) return s;
          const totalScore = Object.values(grades).reduce((sum, g) => sum + g.score, 0);
          return { ...s, totalScore };
        })
      );
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const gradedCount = submissions.filter((s) => s.totalScore !== null).length;
  const ungradedCount = submissions.length - gradedCount;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading submissions...</p>
      </div>
    );
  }

  if (!assignmentId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Grading</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Review and grade student submissions</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 py-16 text-center shadow-sm">
          <div className="mx-auto w-14 h-14 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4">
            <ClipboardList className="h-7 w-7 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Select an assignment to grade
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
            Go to an assignment and click &ldquo;Grade&rdquo; to start grading submissions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Grading</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              {gradedCount} Graded
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              <Clock className="h-3 w-3" />
              {ungradedCount} Pending
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Submission List */}
        <div className="w-80 shrink-0 flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Submissions ({submissions.length})
            </h2>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1.5">
            {submissions.map((sub) => {
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
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    }`}>
                      {sub.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{sub.userName}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{sub.userEmail}</p>
                    </div>
                  </div>
                  <div className="mt-2 ml-10">
                    {isGraded ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        Score: {sub.totalScore}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <Clock className="h-3 w-3" />
                        Needs Grading
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grading Panel */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
          {selectedSubmission ? (
            <>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{selectedSubmission.userName}</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{selectedSubmission.userEmail}</p>
                  </div>
                </div>
                <Button
                  onClick={handleSaveGrades}
                  disabled={saving}
                  className="gap-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Grades
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-6 space-y-5">
                {selectedSubmission.fileUrl && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Uploaded File</p>
                    <a
                      href={selectedSubmission.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-gray-900 dark:text-gray-100 hover:text-gray-600 dark:hover:text-gray-400 underline underline-offset-2"
                    >
                      View Submission File
                    </a>
                  </div>
                )}

                {selectedSubmission.answers.map((answer, index) => (
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
                        <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-xs">
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
                            className="font-semibold text-center border-gray-200 dark:border-gray-700 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAIGrade(answer.id)}
                          disabled={aiLoading === answer.id}
                          className="gap-1.5 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg"
                        >
                          {aiLoading === answer.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          AI Assist
                        </Button>
                      </div>

                      {/* Feedback */}
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
                          className="resize-none border-gray-200 dark:border-gray-700 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600"
                        />
                      </div>
                    </div>
                  </div>
                ))}
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
    </div>
  );
}
