"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  ImagePlus,
  X,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MermaidDiagram from "@/components/chat/MermaidDiagram";
import Link from "next/link";

interface Question {
  questionText: string;
  questionType: "MC" | "NUMERIC" | "FREE_RESPONSE";
  options: string[];
  correctAnswer: string;
  points: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diagram?: { type: "svg" | "mermaid"; content: string } | any;
  imageUrl?: string | null;
  imageFile?: File | null;
  imagePreview?: string | null;
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

export default function EditAssignmentPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [type, setType] = useState<"QUIZ" | "FILE_UPLOAD">("QUIZ");
  const [totalPoints, setTotalPoints] = useState(100);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/assignments/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        const a = data.assignment;
        if (!a) return;
        setTitle(a.title);
        setDescription(a.description || "");
        setDueDate(a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 16) : "");
        setType(a.type);
        setTotalPoints(a.totalPoints);
        setPdfUrl(a.pdfUrl || null);
        setQuestions(
          (a.questions || []).map((q: { questionText: string; questionType: "MC" | "NUMERIC" | "FREE_RESPONSE"; options: string[] | null; correctAnswer: string | null; points: number; diagram?: { type: "svg" | "mermaid"; content: string } | null; imageUrl?: string | null }) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options || ["", "", "", ""],
            correctAnswer: q.correctAnswer || "",
            points: q.points,
            diagram: q.diagram || null,
            imageUrl: q.imageUrl || null,
          }))
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        questionText: "",
        questionType: "MC",
        options: ["", "", "", ""],
        correctAnswer: "",
        points: 10,
      },
    ]);
  };

  const updateQuestion = (index: number, field: keyof Question, value: unknown) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const newOptions = [...q.options];
        newOptions[oIndex] = value;
        return { ...q, options: newOptions };
      })
    );
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImageUpload = (qIndex: number, file: File) => {
    const preview = URL.createObjectURL(file);
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex ? { ...q, imageFile: file, imagePreview: preview } : q
      )
    );
  };

  const removeImage = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex ? { ...q, imageFile: null, imagePreview: null, imageUrl: null } : q
      )
    );
  };

  const handlePdfUpload = async (file: File) => {
    setPdfFile(file);
    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setPdfUrl(data.url);
      }
    } catch (err) {
      console.error("PDF upload failed:", err);
    } finally {
      setUploadingPdf(false);
    }
  };

  const removePdf = () => {
    setPdfFile(null);
    setPdfUrl(null);
  };

  const handleSave = async (publish: boolean) => {
    if (!title.trim()) return;
    setSaving(true);

    try {
      // Upload images for questions that have new files
      const questionsWithUrls = await Promise.all(
        questions.map(async (q) => {
          let imageUrl = q.imageUrl || undefined;
          if (q.imageFile) {
            const formData = new FormData();
            formData.append("file", q.imageFile);
            const uploadRes = await fetch("/api/upload", {
              method: "POST",
              body: formData,
            });
            if (uploadRes.ok) {
              const data = await uploadRes.json();
              imageUrl = data.url;
            }
          }
          return {
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options,
            correctAnswer: q.correctAnswer,
            points: q.points,
            diagram: q.diagram || null,
            ...(imageUrl && { imageUrl }),
          };
        })
      );

      await fetch(`/api/assignments/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          dueDate: dueDate || null,
          totalPoints,
          pdfUrl: pdfUrl || null,
          published: publish ? true : undefined,
          questions: type === "QUIZ" ? questionsWithUrls : [],
        }),
      });

      router.push(`/assignments/${params.id}`);
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/assignments/${params.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Assignment</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Modify assignment details, questions, and scoring
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assignment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Homework 3: Newton's Laws"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Assignment instructions..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "QUIZ" | "FILE_UPLOAD")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="QUIZ">Quiz (Answer in browser)</SelectItem>
                  <SelectItem value="FILE_UPLOAD">File Upload</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Total Points</Label>
              <Input
                type="number"
                value={totalPoints}
                onChange={(e) => setTotalPoints(Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {type === "QUIZ" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Quiz PDF (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-500 mb-3">
              Upload a PDF with quiz content. Students will see it inline above the questions.
            </p>
            {pdfUrl ? (
              <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
                <span className="text-sm text-emerald-700 truncate flex-1">
                  {pdfFile?.name || "PDF uploaded"}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={removePdf}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-neutral-50 transition-colors">
                {uploadingPdf ? (
                  <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
                ) : (
                  <FileText className="h-8 w-8 text-neutral-300" />
                )}
                <span className="text-sm text-neutral-500">
                  {uploadingPdf ? "Uploading..." : "Click to upload a PDF"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePdfUpload(file);
                  }}
                />
              </label>
            )}
          </CardContent>
        </Card>
      )}

      {type === "QUIZ" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Questions</h2>
            <Button onClick={addQuestion} variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Add Question
            </Button>
          </div>

          {questions.map((q, qIndex) => (
            <Card key={qIndex}>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium text-neutral-500">
                    Question {qIndex + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 h-8 w-8"
                    onClick={() => removeQuestion(qIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Question Text (supports Markdown and LaTeX: $...$)</Label>
                  <Textarea
                    value={q.questionText}
                    onChange={(e) => updateQuestion(qIndex, "questionText", e.target.value)}
                    placeholder="Enter the question (supports Markdown and LaTeX: $...$)"
                    rows={2}
                  />
                </div>

                {(() => {
                  const diag = getDiagramContent(q.diagram);
                  if (!diag) return null;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Generated Diagram</Label>
                        <button
                          type="button"
                          onClick={() => updateQuestion(qIndex, "diagram", null)}
                          className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                        >
                          <X className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 overflow-auto max-w-full flex justify-center [&_svg]:w-full [&_svg]:h-auto">
                        {diag.type === "svg" ? (
                          <div
                            className="w-full"
                            dangerouslySetInnerHTML={{ __html: diag.content }}
                          />
                        ) : (
                          <MermaidDiagram content={diag.content} />
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-2">
                  <Label>Question Image (optional)</Label>
                  {q.imagePreview || q.imageUrl ? (
                    <div className="relative inline-block">
                      <img
                        src={q.imagePreview || q.imageUrl || ""}
                        alt="Question image"
                        className="rounded-lg border border-gray-200 dark:border-gray-700 max-h-40"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(qIndex)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-fit">
                      <ImagePlus className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      <span className="text-sm text-gray-500 dark:text-gray-400">Add image</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(qIndex, file);
                        }}
                      />
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={q.questionType}
                      onValueChange={(v) => updateQuestion(qIndex, "questionType", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MC">Multiple Choice</SelectItem>
                        <SelectItem value="NUMERIC">Numeric Answer</SelectItem>
                        <SelectItem value="FREE_RESPONSE">Free Response</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Points</Label>
                    <Input
                      type="number"
                      value={q.points}
                      onChange={(e) => updateQuestion(qIndex, "points", Number(e.target.value))}
                    />
                  </div>
                </div>

                {q.questionType === "MC" && (
                  <div className="space-y-2">
                    <Label>Options</Label>
                    {q.options.map((opt, oIndex) => (
                      <div key={oIndex} className="flex items-center gap-2">
                        <span className="text-sm font-medium w-6">
                          {String.fromCharCode(65 + oIndex)}.
                        </span>
                        <Input
                          value={opt}
                          onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Correct Answer</Label>
                  <Input
                    value={q.correctAnswer}
                    onChange={(e) => updateQuestion(qIndex, "correctAnswer", e.target.value)}
                    placeholder={
                      q.questionType === "MC"
                        ? "e.g., A"
                        : q.questionType === "NUMERIC"
                        ? "e.g., 9.8"
                        : "Sample answer (for reference)"
                    }
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          {questions.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-neutral-400">
                  No questions yet. Click &ldquo;Add Question&rdquo; to start building your quiz.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 pb-8">
        <Button
          variant="outline"
          onClick={() => handleSave(false)}
          disabled={saving || !title.trim()}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save
        </Button>
        <Button
          onClick={() => handleSave(true)}
          disabled={saving || !title.trim()}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save &amp; Publish
        </Button>
      </div>
    </div>
  );
}
