"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
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
import Link from "next/link";

interface Question {
  questionText: string;
  questionType: "MC" | "NUMERIC" | "FREE_RESPONSE";
  options: string[];
  correctAnswer: string;
  points: number;
}

export default function CreateAssignmentPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [type, setType] = useState<"QUIZ" | "FILE_UPLOAD">("QUIZ");
  const [totalPoints, setTotalPoints] = useState(100);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (publish: boolean) => {
    if (!title.trim()) return;
    setLoading(true);

    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          dueDate: dueDate || null,
          type,
          totalPoints,
          questions: type === "QUIZ" ? questions : [],
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

      router.push("/assignments");
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
                  <Label>Question Text</Label>
                  <Textarea
                    value={q.questionText}
                    onChange={(e) => updateQuestion(qIndex, "questionText", e.target.value)}
                    placeholder="Enter the question (supports LaTeX: $...$)"
                    rows={2}
                  />
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
          onClick={() => handleSubmit(false)}
          disabled={loading || !title.trim()}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save as Draft
        </Button>
        <Button
          onClick={() => handleSubmit(true)}
          disabled={loading || !title.trim()}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Publish
        </Button>
      </div>
    </div>
  );
}
