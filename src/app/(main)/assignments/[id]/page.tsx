"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import MermaidDiagram from "@/components/chat/MermaidDiagram";
import { formatShortDate } from "@/lib/utils";
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
  diagram?: { type: "svg" | "mermaid"; content: string } | null;
  imageUrl?: string | null;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  type: "QUIZ" | "FILE_UPLOAD";
  totalPoints: number;
  published: boolean;
  pdfUrl: string | null;
  createdBy: { name: string | null };
  questions: Question[];
  _count: { submissions: number };
}

export default function AssignmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const userRole = (session?.user as { role?: string })?.role || "STUDENT";

  useEffect(() => {
    fetch(`/api/assignments/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        setAssignment(data.assignment);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  const handleSubmit = async () => {
    if (!assignment) return;
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

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId: assignment.id,
          answers: Object.entries(answers).map(([questionId, answer]) => ({
            questionId,
            answer,
          })),
          fileUrl,
        }),
      });

      if (res.ok) {
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

  const handlePublish = async () => {
    if (!assignment) return;
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
      <div className="flex items-center gap-4">
        <Link href="/assignments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
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
        </div>
        {(userRole === "TA" || userRole === "ADMIN") && (
          <div className="flex gap-2">
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

      {assignment.type === "QUIZ" && (
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

                {q.diagram && (
                  <div className="my-3 flex justify-center">
                    {q.diagram.type === "svg" ? (
                      <div
                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 overflow-auto max-w-full"
                        dangerouslySetInnerHTML={{ __html: q.diagram.content }}
                      />
                    ) : (
                      <MermaidDiagram content={q.diagram.content} />
                    )}
                  </div>
                )}

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

      {assignment.type === "QUIZ" && userRole === "STUDENT" && (
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
                onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
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

      {assignment.type === "FILE_UPLOAD" && (
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
                onChange={(e) => setFile(e.target.files?.[0] || null)}
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

      {userRole === "STUDENT" && (
        <div className="flex justify-end pb-8">
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
      )}
    </div>
  );
}
