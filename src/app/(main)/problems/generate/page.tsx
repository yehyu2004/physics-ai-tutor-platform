"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Copy,
  CheckCircle2,
  Atom,
  Zap,
  Waves,
  FlaskConical,
  Magnet,
  Sun,
  Lightbulb,
  ChevronDown,
  FilePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownContent, MermaidDiagram } from "@/components/ui/markdown-content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GeneratedProblem {
  id?: string;
  questionText: string;
  questionType: string;
  options?: string[];
  correctAnswer: string;
  solution: string;
  points: number;
  diagram?: { type: "svg" | "mermaid"; content: string };
}

interface ProblemSet {
  id: string;
  topic: string;
  difficulty: number;
  questionType: string;
  createdBy: string;
  createdAt: string;
  problems: GeneratedProblem[];
}

const topicIcons: Record<string, React.ReactNode> = {
  Kinematics: <Zap className="h-4 w-4" />,
  "Newton's Laws": <Zap className="h-4 w-4" />,
  "Work & Energy": <Zap className="h-4 w-4" />,
  "Momentum & Collisions": <Zap className="h-4 w-4" />,
  "Rotational Motion": <Atom className="h-4 w-4" />,
  "Oscillations & Waves": <Waves className="h-4 w-4" />,
  Electrostatics: <Magnet className="h-4 w-4" />,
  "Electric Circuits": <Lightbulb className="h-4 w-4" />,
  Magnetism: <Magnet className="h-4 w-4" />,
  "Electromagnetic Induction": <Magnet className="h-4 w-4" />,
  Thermodynamics: <FlaskConical className="h-4 w-4" />,
  Optics: <Sun className="h-4 w-4" />,
  "Modern Physics": <Atom className="h-4 w-4" />,
  "Fluid Mechanics": <Waves className="h-4 w-4" />,
  Gravitation: <Atom className="h-4 w-4" />,
};

const difficultyConfig = [
  { value: "1", label: "Easy", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "2", label: "Medium", color: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "3", label: "Average", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: "4", label: "Hard", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "5", label: "Expert", color: "bg-red-50 text-red-700 border-red-200" },
];

export default function ProblemGeneratorPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("3");
  const [count, setCount] = useState(3);
  const [questionType, setQuestionType] = useState("MC");
  const [loading, setLoading] = useState(false);
  const [problems, setProblems] = useState<GeneratedProblem[]>([]);
  const [streamText, setStreamText] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const [pastSets, setPastSets] = useState<ProblemSet[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);

  const loadPastSets = async () => {
    if (pastSets.length > 0) {
      setShowPast(!showPast);
      return;
    }
    setLoadingPast(true);
    try {
      const res = await fetch("/api/problems/generate");
      if (res.ok) {
        const data = await res.json();
        setPastSets(data.problemSets || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPast(false);
      setShowPast(true);
    }
  };

  const loadProblemSet = (ps: ProblemSet) => {
    setProblems(ps.problems);
    setTopic(ps.topic);
    setDifficulty(String(ps.difficulty));
    setQuestionType(ps.questionType);
    setShowPast(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setProblems([]);
    setStreamText("");

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

      if (!res.ok) {
        throw new Error("Generation failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "delta") {
              setStreamText((prev) => prev + event.content);
            } else if (event.type === "done") {
              setProblems(event.problems || []);
              setStreamText("");
              if (pastSets.length > 0) {
                setPastSets([]);
              }
            } else if (event.type === "error") {
              console.error("Generation error:", event.message);
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const [creatingAssignment, setCreatingAssignment] = useState(false);

  const createAssignmentFromProblems = async () => {
    if (problems.length === 0) return;
    setCreatingAssignment(true);
    try {
      const totalPoints = problems.reduce((sum, p) => sum + p.points, 0);
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${topic} - Generated Problems`,
          description: `Auto-generated ${problems.length} ${questionType} problems on ${topic} (difficulty ${difficulty}/5).`,
          type: "QUIZ",
          totalPoints,
          questions: problems.map((p) => ({
            questionText: p.questionText,
            questionType: p.questionType || questionType,
            options: p.options || null,
            correctAnswer: p.correctAnswer,
            points: p.points,
            diagram: p.diagram || null,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/assignments/${data.assignment.id}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingAssignment(false);
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 rounded-xl bg-gray-900 shadow-sm">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Problem Generator
          </h1>
        </div>
        <p className="text-sm text-gray-500 mt-2 ml-[52px]">
          Generate physics problems using AI for assignments and practice
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Configuration</h2>
        </div>
        <div className="p-6 space-y-6">
          {/* Topic Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-700">Physics Topic</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {topics.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${
                    topic === t
                      ? "bg-gray-900 border-gray-900 text-white shadow-sm"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <span className={topic === t ? "text-gray-300" : "text-gray-400"}>
                    {topicIcons[t] || <Atom className="h-4 w-4" />}
                  </span>
                  <span className="truncate">{t}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-700">Difficulty Level</Label>
            <div className="flex gap-2">
              {difficultyConfig.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`flex-1 py-2.5 text-xs font-semibold rounded-lg border transition-colors ${
                    difficulty === d.value
                      ? d.color + " shadow-sm"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Type + Count Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Question Type</Label>
              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger className="border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-300">
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
              <Label className="text-sm font-semibold text-gray-700">Number of Questions</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="border-gray-200 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300"
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || !topic}
            className="gap-2 bg-gray-900 hover:bg-gray-800 text-white shadow-sm w-full sm:w-auto rounded-lg"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate Problems
          </Button>
        </div>
      </div>

      {/* Loading State with streaming preview */}
      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            <p className="text-sm font-medium text-gray-700">
              Generating {count} {topic} problems...
            </p>
          </div>
          {streamText ? (
            <pre className="p-6 text-xs font-mono text-gray-500 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed">
              {streamText}
              <span className="animate-pulse">|</span>
            </pre>
          ) : (
            <div className="p-10 text-center">
              <Sparkles className="h-7 w-7 text-gray-300 animate-pulse mx-auto mb-2" />
              <p className="text-xs text-gray-400">Waiting for AI response...</p>
            </div>
          )}
        </div>
      )}

      {/* Generated Problems */}
      {problems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Generated Problems
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({problems.length})
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Auto-saved
              </span>
              <Button
                onClick={createAssignmentFromProblems}
                disabled={creatingAssignment}
                size="sm"
                className="gap-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg"
              >
                {creatingAssignment ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FilePlus className="h-3.5 w-3.5" />
                )}
                Create Assignment
              </Button>
            </div>
          </div>

          {problems.map((problem, index) => (
            <div
              key={problem.id || index}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Problem Header */}
              <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 text-gray-700 text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-600">
                    Problem {index + 1}
                  </span>
                  <span className="text-xs text-gray-400">
                    {problem.points} pts
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyProblem(index)}
                  className={`gap-1.5 text-xs ${
                    copied === index
                      ? "text-emerald-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {copied === index ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied === index ? "Copied!" : "Copy"}
                </Button>
              </div>

              {/* Problem Body */}
              <div className="p-6 space-y-4">
                <MarkdownContent
                  content={problem.questionText}
                  className="text-sm text-gray-800 leading-relaxed"
                />

                {problem.diagram && (
                  <div className="my-3 flex justify-center">
                    {problem.diagram.type === "svg" ? (
                      <div
                        className="rounded-lg border border-gray-200 bg-white p-4 overflow-auto max-w-full"
                        dangerouslySetInnerHTML={{ __html: problem.diagram.content }}
                      />
                    ) : (
                      <MermaidDiagram content={problem.diagram.content} />
                    )}
                  </div>
                )}

                {problem.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {problem.options.map((opt, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg bg-gray-50 border border-gray-100"
                      >
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-700 text-xs font-bold shrink-0 mt-0.5">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <MarkdownContent content={opt} className="text-sm text-gray-700" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-lg p-4 bg-emerald-50 border border-emerald-200">
                  <p className="text-xs font-semibold text-emerald-700 mb-1.5 uppercase tracking-wider">
                    Correct Answer
                  </p>
                  <MarkdownContent content={problem.correctAnswer} className="text-sm text-emerald-800 font-medium" />
                </div>

                <div className="rounded-lg p-4 bg-gray-50 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">
                    Solution
                  </p>
                  <MarkdownContent content={problem.solution} className="text-sm text-gray-700 leading-relaxed" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Problem Bank */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <button
          onClick={loadPastSets}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Problem Bank</h2>
            {pastSets.length > 0 && (
              <span className="text-xs text-gray-400">({pastSets.length} sets)</span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${showPast ? "rotate-180" : ""}`} />
        </button>

        {loadingPast && (
          <div className="px-6 py-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
          </div>
        )}

        {showPast && pastSets.length === 0 && !loadingPast && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-400">No saved problem sets yet. Generate some problems above!</p>
          </div>
        )}

        {showPast && pastSets.length > 0 && (
          <div className="border-t border-gray-100">
            {pastSets.map((ps) => (
              <button
                key={ps.id}
                onClick={() => loadProblemSet(ps)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-b-0 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">{ps.topic}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {ps.problems.length} problems &middot; {ps.questionType} &middot; Difficulty {ps.difficulty}/5
                    {ps.createdBy && ` &middot; by ${ps.createdBy}`}
                  </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-4">
                  {new Date(ps.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
