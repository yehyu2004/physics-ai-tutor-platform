"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  ClipboardList,
  Sparkles,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!assignmentId) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Grading</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-700">
              Select an assignment to grade
            </h3>
            <p className="text-sm text-neutral-400 mt-1">
              Go to an assignment and click &ldquo;Grade&rdquo; to start grading submissions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Grading</h1>

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Submission List */}
        <Card className="w-80 shrink-0 flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm">Submissions ({submissions.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto space-y-2 p-3">
            {submissions.map((sub) => (
              <button
                key={sub.id}
                onClick={() => selectSubmission(sub)}
                className={`w-full text-left rounded-lg p-3 border transition-colors ${
                  selectedSubmission?.id === sub.id
                    ? "bg-neutral-100 border-neutral-300"
                    : "hover:bg-neutral-50"
                }`}
              >
                <p className="text-sm font-medium truncate">{sub.userName}</p>
                <p className="text-xs text-neutral-400 truncate">{sub.userEmail}</p>
                <div className="mt-1">
                  {sub.totalScore !== null ? (
                    <Badge variant="success" className="text-xs">
                      Graded: {sub.totalScore}
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-xs">
                      Pending
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Grading Panel */}
        <Card className="flex-1 flex flex-col overflow-auto">
          {selectedSubmission ? (
            <>
              <CardHeader className="flex flex-row items-center justify-between shrink-0">
                <div>
                  <CardTitle>{selectedSubmission.userName}</CardTitle>
                  <p className="text-sm text-neutral-400">{selectedSubmission.userEmail}</p>
                </div>
                <Button onClick={handleSaveGrades} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Grades
                </Button>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto space-y-4">
                {selectedSubmission.fileUrl && (
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium mb-2">Uploaded File</p>
                    <a
                      href={selectedSubmission.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View Submission File
                    </a>
                  </div>
                )}

                {selectedSubmission.answers.map((answer, index) => (
                  <div key={answer.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          Question {index + 1}
                          <span className="text-neutral-400 font-normal ml-2">
                            ({answer.maxPoints} pts)
                          </span>
                        </p>
                        <p className="text-sm text-neutral-600 mt-1">{answer.questionText}</p>
                      </div>
                      {answer.autoGraded && (
                        <Badge variant="secondary" className="text-xs">Auto-graded</Badge>
                      )}
                    </div>

                    <div className="bg-neutral-50 rounded-lg p-3">
                      <p className="text-xs text-neutral-400 mb-1">Student Answer:</p>
                      <p className="text-sm">{answer.answer || "No answer provided"}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Score (/{answer.maxPoints})</label>
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
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAIGrade(answer.id)}
                          disabled={aiLoading === answer.id}
                          className="gap-1"
                        >
                          {aiLoading === answer.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          AI Assist
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Feedback</label>
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
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex-1 flex items-center justify-center">
              <p className="text-neutral-400 text-sm">
                Select a submission from the left to start grading.
              </p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
