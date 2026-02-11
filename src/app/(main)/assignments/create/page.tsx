"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  ImagePlus,
  X,
  FileText,
  Mail,
  Send,
  CheckCircle2,
  SkipForward,
  ChevronUp,
  ChevronDown,
  Download,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownContent } from "@/components/ui/markdown-content";
import Link from "next/link";

interface Question {
  questionText: string;
  questionType: "MC" | "NUMERIC" | "FREE_RESPONSE";
  options: string[];
  correctAnswer: string;
  points: number;
  imageFile?: File | null;
  imagePreview?: string | null;
}

export default function CreateAssignmentPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [type, setType] = useState<"QUIZ" | "FILE_UPLOAD">("QUIZ");
  const [totalPoints, setTotalPoints] = useState(100);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [lockAfterSubmit, setLockAfterSubmit] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportingLatex, setExportingLatex] = useState(false);

  // Reminder dialog state
  interface ReminderUser {
    id: string;
    name: string | null;
    email: string;
    role: string;
    isBanned: boolean;
  }
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderSubject, setReminderSubject] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderSuccess, setReminderSuccess] = useState(false);
  const [allUsers, setAllUsers] = useState<ReminderUser[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [loadingStudents, setLoadingStudents] = useState(false);

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

  const moveQuestion = (index: number, direction: "up" | "down") => {
    setQuestions((prev) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
        i === qIndex ? { ...q, imageFile: null, imagePreview: null } : q
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

  const handleSubmit = async (publish: boolean) => {
    if (!title.trim()) return;
    setLoading(true);

    try {
      // Upload images for questions that have them
      const questionsWithUrls = await Promise.all(
        questions.map(async (q) => {
          let imageUrl: string | undefined;
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
            ...(imageUrl && { imageUrl }),
          };
        })
      );

      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          dueDate: dueDate || null,
          type,
          totalPoints,
          pdfUrl: pdfUrl || null,
          lockAfterSubmit,
          questions: type === "QUIZ" ? questionsWithUrls : [],
        }),
      });

      if (!res.ok) throw new Error("Failed to create assignment");

      const data = await res.json();

      if (publish) {
        await fetch(`/api/assignments/${data.assignment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ published: true }),
        });
      }

      // Show reminder dialog instead of immediate redirect
      const dueDateStr = dueDate
        ? new Date(dueDate).toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "No due date set";
      setReminderSubject(`New Assignment: ${title}`);
      setReminderMessage(
        `A new assignment has been posted on PhysTutor.\n\nTitle: ${title}${description ? `\nDescription: ${description}` : ""}\nDue: ${dueDateStr}\nPoints: ${totalPoints}\n\nPlease log in to PhysTutor to view the full assignment details.`
      );

      // Fetch all users for reminder
      setLoadingStudents(true);
      try {
        const usersRes = await fetch("/api/admin/users");
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          const eligible = (usersData.users || []).filter(
            (u: ReminderUser) => !u.isBanned
          );
          setAllUsers(eligible);
          // Default: select only students
          setSelectedStudents(new Set(
            eligible.filter((u: ReminderUser) => u.role === "STUDENT").map((u: ReminderUser) => u.id)
          ));
        }
      } catch {
        // If fetching users fails, still show dialog
      } finally {
        setLoadingStudents(false);
      }

      setReminderOpen(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndExportLatex = async () => {
    if (!title.trim()) return;
    setExportingLatex(true);

    try {
      // Upload images for questions that have them
      const questionsWithUrls = await Promise.all(
        questions.map(async (q) => {
          let imageUrl: string | undefined;
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
            ...(imageUrl && { imageUrl }),
          };
        })
      );

      // Create assignment as draft
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          dueDate: dueDate || null,
          type,
          totalPoints,
          pdfUrl: pdfUrl || null,
          lockAfterSubmit,
          questions: type === "QUIZ" ? questionsWithUrls : [],
        }),
      });

      if (!res.ok) throw new Error("Failed to create assignment");

      const data = await res.json();
      const newId = data.assignment.id;

      // Fetch LaTeX export
      const exportRes = await fetch(`/api/assignments/${newId}/export-latex`);
      if (!exportRes.ok) throw new Error("Export failed");

      const blob = await exportRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 60)}_latex.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Redirect to the new assignment
      router.push(`/assignments/${newId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to save and export LaTeX");
    } finally {
      setExportingLatex(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/assignments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Assignment</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Set up a new assignment or quiz for students
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

          <label className="flex items-center gap-3 pt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={lockAfterSubmit}
              onChange={(e) => setLockAfterSubmit(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Lock after submission</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Students cannot delete or resubmit once they submit. Useful for timed quizzes.</p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {type === "QUIZ" ? "Quiz PDF (Optional)" : "Assignment PDF (Optional)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500 mb-3">
            {type === "QUIZ"
              ? "Upload a PDF with quiz content. Students will see it inline above the questions."
              : "Upload a PDF with assignment instructions. Students will see it when viewing the assignment."}
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
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveQuestion(qIndex, "up")}
                        disabled={qIndex === 0}
                        className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(qIndex, "down")}
                        disabled={qIndex === questions.length - 1}
                        className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="text-sm font-medium text-neutral-500">
                      Question {qIndex + 1}
                    </span>
                  </div>
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
                  {q.questionText && (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 text-sm overflow-x-auto">
                      <p className="text-xs text-gray-400 mb-1.5">Preview</p>
                      <MarkdownContent content={q.questionText} />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Question Image (optional)</Label>
                  {q.imagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={q.imagePreview}
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
                      <div key={oIndex}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium w-6">
                            {String.fromCharCode(65 + oIndex)}.
                          </span>
                          <Input
                            value={opt}
                            onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                          />
                        </div>
                        {opt.includes("$") && (
                          <div className="ml-8 mt-1 text-sm overflow-x-auto">
                            <MarkdownContent content={opt} />
                          </div>
                        )}
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
                  {q.correctAnswer.includes("$") && (
                    <div className="text-sm mt-1 overflow-x-auto">
                      <MarkdownContent content={q.correctAnswer} />
                    </div>
                  )}
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

      <div className="flex flex-wrap justify-end gap-3 pb-8">
        <Button
          variant="outline"
          onClick={() => handleSubmit(false)}
          disabled={loading || exportingLatex || !title.trim()}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save as Draft
        </Button>
        {type === "QUIZ" && (
          <Button
            variant="outline"
            onClick={handleSaveAndExportLatex}
            disabled={loading || exportingLatex || !title.trim()}
          >
            {exportingLatex ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Save & Download LaTeX
          </Button>
        )}
        <Button
          onClick={() => handleSubmit(true)}
          disabled={loading || exportingLatex || !title.trim()}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Publish
        </Button>
      </div>

      {/* Assignment Reminder Dialog */}
      <Dialog
        open={reminderOpen}
        onOpenChange={(open) => {
          if (!open && !reminderSending) {
            router.push("/assignments");
            router.refresh();
          }
        }}
      >
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-500" />
              Notify Users
            </DialogTitle>
            <DialogDescription>
              Send a reminder email about the new assignment. Select recipients by role or individually.
            </DialogDescription>
          </DialogHeader>

          {reminderSuccess ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Reminder sent successfully
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Recipients with role toggles */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-gray-700 dark:text-gray-300">
                    Recipients ({selectedStudents.size} of {allUsers.length} selected)
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      if (selectedStudents.size === allUsers.length) {
                        setSelectedStudents(new Set());
                      } else {
                        setSelectedStudents(new Set(allUsers.map((s) => s.id)));
                      }
                    }}
                  >
                    {selectedStudents.size === allUsers.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                {/* Role filter buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["STUDENT", "TA", "PROFESSOR", "ADMIN"] as const).map((role) => {
                    const roleUsers = allUsers.filter((u) => u.role === role);
                    const allRoleSelected = roleUsers.length > 0 && roleUsers.every((u) => selectedStudents.has(u.id));
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          setSelectedStudents((prev) => {
                            const next = new Set(prev);
                            if (allRoleSelected) {
                              roleUsers.forEach((u) => next.delete(u.id));
                            } else {
                              roleUsers.forEach((u) => next.add(u.id));
                            }
                            return next;
                          });
                        }}
                        className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                          allRoleSelected
                            ? "bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-700 dark:text-indigo-300"
                            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {role === "STUDENT" ? "Students" : role === "TA" ? "TAs" : role === "PROFESSOR" ? "Professors" : "Admins"} ({roleUsers.length})
                      </button>
                    );
                  })}
                </div>
                {loadingStudents ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 p-2 space-y-1">
                    {allUsers.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-1 py-0.5">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(s.id)}
                          onChange={() => {
                            setSelectedStudents((prev) => {
                              const next = new Set(prev);
                              if (next.has(s.id)) next.delete(s.id);
                              else next.add(s.id);
                              return next;
                            });
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
                        />
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {s.name || "No name"}
                        </span>
                        <span className={`text-[10px] px-1 py-px rounded ${
                          s.role === "ADMIN" || s.role === "PROFESSOR" ? "bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
                          : s.role === "TA" ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {s.role}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 truncate">{s.email}</span>
                      </label>
                    ))}
                    {allUsers.length === 0 && (
                      <p className="text-xs text-gray-400 py-2 text-center">No eligible users found</p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminder-subject" className="text-gray-700 dark:text-gray-300">
                  Subject
                </Label>
                <Input
                  id="reminder-subject"
                  value={reminderSubject}
                  onChange={(e) => setReminderSubject(e.target.value)}
                  placeholder="Email subject line"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminder-message" className="text-gray-700 dark:text-gray-300">
                  Message
                </Label>
                <Textarea
                  id="reminder-message"
                  value={reminderMessage}
                  onChange={(e) => setReminderMessage(e.target.value)}
                  placeholder="Notification message..."
                  rows={6}
                  className="rounded-lg resize-none"
                />
              </div>
            </div>
          )}

          {!reminderSuccess && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReminderOpen(false);
                  router.push("/assignments");
                  router.refresh();
                }}
                className="rounded-lg gap-1.5"
              >
                <SkipForward className="h-4 w-4" />
                Skip
              </Button>
              <Button
                onClick={async () => {
                  if (selectedStudents.size === 0 || !reminderSubject.trim() || !reminderMessage.trim()) return;
                  setReminderSending(true);
                  try {
                    const res = await fetch("/api/admin/email", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        userIds: Array.from(selectedStudents),
                        subject: reminderSubject.trim(),
                        message: reminderMessage.trim(),
                      }),
                    });
                    if (res.ok) {
                      setReminderSuccess(true);
                      setTimeout(() => {
                        setReminderOpen(false);
                        router.push("/assignments");
                        router.refresh();
                      }, 2000);
                    }
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setReminderSending(false);
                  }
                }}
                disabled={reminderSending || selectedStudents.size === 0 || !reminderSubject.trim() || !reminderMessage.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg gap-1.5"
              >
                {reminderSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Reminder
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
