"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Loader2,
  Copy,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GeneratedProblem {
  questionText: string;
  questionType: string;
  options?: string[];
  correctAnswer: string;
  solution: string;
  points: number;
}

export default function ProblemGeneratorPage() {
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("3");
  const [count, setCount] = useState(3);
  const [questionType, setQuestionType] = useState("MC");
  const [loading, setLoading] = useState(false);
  const [problems, setProblems] = useState<GeneratedProblem[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setProblems([]);

    try {
      const res = await fetch("/api/problems/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          difficulty: Number(difficulty),
          count,
          questionType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProblems(data.problems || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyProblem = (index: number) => {
    const p = problems[index];
    const text = `${p.questionText}\n\n${
      p.options ? p.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n") + "\n\n" : ""
    }Answer: ${p.correctAnswer}\n\nSolution: ${p.solution}`;
    navigator.clipboard.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  const topics = [
    "Kinematics",
    "Newton's Laws",
    "Work & Energy",
    "Momentum & Collisions",
    "Rotational Motion",
    "Oscillations & Waves",
    "Electrostatics",
    "Electric Circuits",
    "Magnetism",
    "Electromagnetic Induction",
    "Thermodynamics",
    "Optics",
    "Modern Physics",
    "Fluid Mechanics",
    "Gravitation",
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Problem Generator</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Generate physics problems using AI for assignments and practice
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Topic</Label>
            <Select value={topic} onValueChange={setTopic}>
              <SelectTrigger>
                <SelectValue placeholder="Select a physics topic" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Difficulty (1-5)</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Easy</SelectItem>
                  <SelectItem value="2">2 - Below Average</SelectItem>
                  <SelectItem value="3">3 - Average</SelectItem>
                  <SelectItem value="4">4 - Hard</SelectItem>
                  <SelectItem value="5">5 - Very Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Question Type</Label>
              <Select value={questionType} onValueChange={setQuestionType}>
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
              <Label>Number of Questions</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || !topic}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Problems
          </Button>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400 mx-auto mb-4" />
            <p className="text-sm text-neutral-500">
              Generating {count} {topic} problems...
            </p>
          </CardContent>
        </Card>
      )}

      {problems.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Generated Problems ({problems.length})
          </h2>
          {problems.map((problem, index) => (
            <Card key={index}>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium text-neutral-500">
                    Problem {index + 1} ({problem.points} pts)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyProblem(index)}
                      className="gap-1"
                    >
                      {copied === index ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied === index ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <p className="text-sm whitespace-pre-wrap">{problem.questionText}</p>

                {problem.options && (
                  <div className="space-y-1 pl-4">
                    {problem.options.map((opt, i) => (
                      <p key={i} className="text-sm">
                        {String.fromCharCode(65 + i)}. {opt}
                      </p>
                    ))}
                  </div>
                )}

                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                  <p className="text-xs font-medium text-emerald-700 mb-1">
                    Correct Answer
                  </p>
                  <p className="text-sm text-emerald-800">{problem.correctAnswer}</p>
                </div>

                <div className="bg-neutral-50 rounded-lg p-3 border">
                  <p className="text-xs font-medium text-neutral-500 mb-1">
                    Solution
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{problem.solution}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
