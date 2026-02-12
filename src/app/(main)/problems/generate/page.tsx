"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTrackTime } from "@/lib/use-track-time";
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
  Trash2,
  GripVertical,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownContent } from "@/components/ui/markdown-content";
import MermaidDiagram from "@/components/chat/MermaidDiagram";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diagram?: { type: "svg" | "mermaid"; content: string } | any;
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

interface ProblemSet {
  id: string;
  topic: string;
  difficulty: number;
  questionType: string;
  createdBy: string;
  createdById: string;
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

function formatQuestionType(type: string): string {
  const typeMap: Record<string, string> = {
    "FREE_RESPONSE": "Free Response",
    "MC": "Multiple Choice",
    "TF": "True/False",
  };
  return typeMap[type] || type;
}

function SortableProblemItem({
  id,
  index,
  problem,
  onRemove,
}: {
  id: string;
  index: number;
  problem: GeneratedProblem & { sourceTopic: string; _uid: string };
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
        isDragging ? "bg-indigo-50 dark:bg-indigo-950 shadow-lg rounded-lg" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-grab active:cursor-grabbing touch-none shrink-0"
        title="Drag to reorder"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 shrink-0">
            {problem.sourceTopic}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
            {problem.points} pts &middot; {problem.questionType}
          </span>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">
          {problem.questionText.replace(/\$\$?[^$]+\$\$?/g, "[math]").slice(0, 120)}
        </p>
      </div>
      <button
        onClick={onRemove}
        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors shrink-0"
        title="Remove"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function ProblemGeneratorPage() {
  useTrackTime("PROBLEM_GEN");
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [difficulty, setDifficulty] = useState("3");
  const [count, setCount] = useState(3);
  const [questionType, setQuestionType] = useState("MC");
  const [loading, setLoading] = useState(false);
  const [problems, setProblems] = useState<GeneratedProblem[]>([]);
  const [hasStreamText, setHasStreamText] = useState(false);
  const streamRef = useRef<HTMLPreElement>(null);
  const streamBufferRef = useRef("");
  const [copied, setCopied] = useState<number | null>(null);
  const [pastSets, setPastSets] = useState<ProblemSet[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [loadingPast, setLoadingPast] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const [deletingSetId, setDeletingSetId] = useState<string | null>(null);

  // Merge problem sets state
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [mergedProblems, setMergedProblems] = useState<(GeneratedProblem & { sourceTopic: string; _uid: string })[]>([]);
  const [showStagingArea, setShowStagingArea] = useState(false);
  const [creatingFromMerged, setCreatingFromMerged] = useState(false);
  const uidCounterRef = useRef(0);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (data?.user) {
          setCurrentUser({ id: data.user.id, role: data.user.role || "STUDENT" });
        }
      })
      .catch(() => {});
  }, []);

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

  const deleteProblemSet = async (e: React.MouseEvent, psId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this problem set? This cannot be undone.")) return;
    setDeletingSetId(psId);
    try {
      const res = await fetch("/api/problems/generate", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: psId }),
      });
      if (res.ok) {
        setPastSets((prev) => prev.filter((s) => s.id !== psId));
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingSetId(null);
    }
  };

  const canDeleteSet = (ps: ProblemSet) => {
    if (!currentUser) return false;
    return currentUser.role === "ADMIN" || ps.createdById === currentUser.id;
  };

  const toggleSetSelection = (psId: string) => {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(psId)) next.delete(psId);
      else next.add(psId);
      return next;
    });
  };

  const handleMergeSelected = () => {
    const selected = pastSets.filter((ps) => selectedSetIds.has(ps.id));
    const merged = selected.flatMap((ps) =>
      ps.problems.map((p) => {
        uidCounterRef.current += 1;
        return { ...p, sourceTopic: ps.topic, _uid: `mp-${uidCounterRef.current}` };
      })
    );
    setMergedProblems(merged);
    setShowStagingArea(true);
    setSelectedSetIds(new Set());
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setMergedProblems((prev) => {
        const oldIndex = prev.findIndex((p) => p._uid === active.id);
        const newIndex = prev.findIndex((p) => p._uid === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const removeMergedProblem = (index: number) => {
    setMergedProblems((prev) => prev.filter((_, i) => i !== index));
  };

  const createAssignmentFromMerged = async () => {
    if (mergedProblems.length === 0) return;
    setCreatingFromMerged(true);
    try {
      const totalPoints = mergedProblems.reduce((sum, p) => sum + p.points, 0);
      const topics = Array.from(new Set(mergedProblems.map((p) => p.sourceTopic)));
      const title = topics.length <= 3
        ? `${topics.join(", ")} - Merged Problems`
        : `${topics.slice(0, 2).join(", ")} + ${topics.length - 2} more - Merged Problems`;
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: `Merged ${mergedProblems.length} problems from ${topics.length} topic(s): ${topics.join(", ")}.`,
          type: "QUIZ",
          totalPoints,
          questions: mergedProblems.map((p) => ({
            questionText: p.questionText,
            questionType: p.questionType,
            options: p.options || null,
            correctAnswer: p.correctAnswer,
            points: p.points,
            diagram: p.diagram || null,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/assignments/${data.assignment.id}/edit`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingFromMerged(false);
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

  const appendStreamText = useCallback((text: string) => {
    streamBufferRef.current += text;
    if (streamRef.current) {
      streamRef.current.textContent = streamBufferRef.current + "|";
    }
  }, []);

  const effectiveTopic = topic === "__custom__" ? customTopic.trim() : topic;

  const handleGenerate = async () => {
    if (!effectiveTopic) return;
    setLoading(true);
    setProblems([]);
    streamBufferRef.current = "";
    setHasStreamText(false);

    try {
      const res = await fetch("/api/problems/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: effectiveTopic,
          difficulty: Number(difficulty),
          count,
          questionType,
          customInstructions: customInstructions.trim() || undefined,
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
              if (!streamBufferRef.current) {
                setHasStreamText(true);
              }
              appendStreamText(event.content);
            } else if (event.type === "done") {
              setProblems(event.problems || []);
              streamBufferRef.current = "";
              setHasStreamText(false);
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
          title: `${effectiveTopic} - Generated Problems`,
          description: `Auto-generated ${problems.length} ${formatQuestionType(questionType)} problems on ${effectiveTopic} (difficulty ${difficulty}/5).`,
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
        router.push(`/assignments/${data.assignment.id}/edit`);
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
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Problem Generator
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 ml-[52px]">
          Generate physics problems using AI for assignments and practice
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Configuration</h2>
        </div>
        <div className="p-6 space-y-6">
          {/* Topic Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Physics Topic</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {topics.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTopic(t); setCustomTopic(""); }}
                  className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${
                    topic === t
                      ? "bg-gray-900 dark:bg-gray-100 border-gray-900 dark:border-gray-100 text-white dark:text-gray-900 shadow-sm"
                      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <span className={topic === t ? "text-gray-300 dark:text-gray-600" : "text-gray-400 dark:text-gray-500"}>
                    {topicIcons[t] || <Atom className="h-4 w-4" />}
                  </span>
                  <span className="truncate">{t}</span>
                </button>
              ))}
              <button
                onClick={() => setTopic("__custom__")}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${
                  topic === "__custom__"
                    ? "bg-gray-900 dark:bg-gray-100 border-gray-900 dark:border-gray-100 text-white dark:text-gray-900 shadow-sm"
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 border-dashed"
                }`}
              >
                <span className={topic === "__custom__" ? "text-gray-300 dark:text-gray-600" : "text-gray-400 dark:text-gray-500"}>
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="truncate">Custom Topic</span>
              </button>
            </div>
            {topic === "__custom__" && (
              <Input
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="e.g., Projectile motion with air resistance, RC circuits, Doppler effect..."
                className="border-gray-200 dark:border-gray-700 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600"
              />
            )}
          </div>

          {/* Additional Instructions (Optional) */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Additional Instructions <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
            </Label>
            <Textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g., Focus on conservation of energy with springs, include problems with inclined planes, use SI units only..."
              rows={2}
              className="border-gray-200 dark:border-gray-700 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 resize-none text-sm"
            />
          </div>

          {/* Difficulty Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Difficulty Level</Label>
            <div className="flex gap-2">
              {difficultyConfig.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  className={`flex-1 py-2.5 text-xs font-semibold rounded-lg border transition-colors ${
                    difficulty === d.value
                      ? d.color + " shadow-sm"
                      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
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
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Question Type</Label>
              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger className="border-gray-200 dark:border-gray-700 rounded-lg focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600">
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
              <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Number of Questions</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="border-gray-200 dark:border-gray-700 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600"
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={loading || !effectiveTopic}
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
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-gray-500 dark:text-gray-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Generating {count} {effectiveTopic} problems...
            </p>
          </div>
          {hasStreamText ? (
            <pre ref={streamRef} className="p-6 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed" />
          ) : (
            <div className="p-10 text-center">
              <Sparkles className="h-7 w-7 text-gray-300 animate-pulse mx-auto mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">Waiting for AI response...</p>
            </div>
          )}
        </div>
      )}

      {/* Generated Problems */}
      {problems.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Generated Problems
              <span className="ml-2 text-sm font-normal text-gray-400 dark:text-gray-500">
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
              className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Problem Header */}
              <div className="flex items-center justify-between px-6 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Problem {index + 1}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
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
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
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
                  className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed"
                />

                {(() => {
                  const diag = getDiagramContent(problem.diagram);
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

                {problem.options && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {problem.options.map((opt, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800"
                      >
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold shrink-0 mt-0.5">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <MarkdownContent content={opt} className="text-sm text-gray-700 dark:text-gray-300" />
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

                <div className="rounded-lg p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                    Solution
                  </p>
                  <MarkdownContent content={problem.solution} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Staging Area (Merged Problems) */}
      {showStagingArea && mergedProblems.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                Staging Area
              </h2>
              <span className="text-xs text-indigo-500 dark:text-indigo-400">
                ({mergedProblems.length} problems)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={createAssignmentFromMerged}
                disabled={creatingFromMerged || mergedProblems.length === 0}
                size="sm"
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
              >
                {creatingFromMerged ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FilePlus className="h-3.5 w-3.5" />
                )}
                Create Assignment
              </Button>
              <Button
                onClick={() => { setShowStagingArea(false); setMergedProblems([]); }}
                size="sm"
                variant="outline"
                className="gap-1.5 text-gray-600 dark:text-gray-400 rounded-lg"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={mergedProblems.map((p) => p._uid)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {mergedProblems.map((p, index) => (
                  <SortableProblemItem
                    key={p._uid}
                    id={p._uid}
                    index={index}
                    problem={p}
                    onRemove={() => removeMergedProblem(index)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Problem Bank */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        <button
          onClick={loadPastSets}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Problem Bank</h2>
            {pastSets.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">({pastSets.length} sets)</span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${showPast ? "rotate-180" : ""}`} />
        </button>

        {/* Merge toolbar */}
        {showPast && selectedSetIds.size >= 2 && (
          <div className="px-6 py-3 bg-indigo-50 dark:bg-indigo-950 border-t border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              {selectedSetIds.size} sets selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setSelectedSetIds(new Set())}
                size="sm"
                variant="outline"
                className="text-xs rounded-lg"
              >
                Clear
              </Button>
              <Button
                onClick={handleMergeSelected}
                size="sm"
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs"
              >
                <Layers className="h-3.5 w-3.5" />
                Merge Selected
              </Button>
            </div>
          </div>
        )}

        {loadingPast && (
          <div className="px-6 py-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500 mx-auto" />
          </div>
        )}

        {showPast && pastSets.length === 0 && !loadingPast && (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">No saved problem sets yet. Generate some problems above!</p>
          </div>
        )}

        {showPast && pastSets.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-800">
            {pastSets.map((ps) => (
              <div
                key={ps.id}
                className={`flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-b-0 ${
                  selectedSetIds.has(ps.id) ? "bg-indigo-50/50 dark:bg-indigo-950/30" : ""
                }`}
              >
                <div className="flex items-center flex-1 min-w-0">
                  <label
                    className="flex items-center pl-4 sm:pl-6 py-3 cursor-pointer shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSetIds.has(ps.id)}
                      onChange={() => toggleSetSelection(ps.id)}
                      className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                  <button
                    onClick={() => loadProblemSet(ps)}
                    className="flex-1 px-3 py-3 text-left min-w-0"
                  >
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ps.topic}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {ps.problems.length} problems &middot; {ps.questionType} &middot; Difficulty {ps.difficulty}/5
                      {ps.createdBy && ` \u00B7 by ${ps.createdBy}`}
                    </p>
                  </button>
                </div>
                <div className="flex items-center gap-2 pr-4">
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {new Date(ps.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  {canDeleteSet(ps) && (
                    <button
                      onClick={(e) => deleteProblemSet(e, ps.id)}
                      disabled={deletingSetId === ps.id}
                      className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
                      title="Delete problem set"
                    >
                      {deletingSetId === ps.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
