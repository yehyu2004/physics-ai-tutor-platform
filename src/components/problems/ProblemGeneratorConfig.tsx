"use client";

import React from "react";
import {
  Loader2,
  Sparkles,
  Atom,
  Zap,
  Waves,
  Magnet,
  Lightbulb,
  FlaskConical,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TOPICS = [
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

const TOPIC_ICONS: Record<string, React.ReactNode> = {
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

const DIFFICULTY_CONFIG = [
  { value: "1", label: "Easy", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "2", label: "Medium", color: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "3", label: "Average", color: "bg-gray-100 text-gray-700 border-gray-300" },
  { value: "4", label: "Hard", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "5", label: "Expert", color: "bg-red-50 text-red-700 border-red-200" },
];

interface ProblemGeneratorConfigProps {
  topic: string;
  onTopicChange: (topic: string) => void;
  customTopic: string;
  onCustomTopicChange: (value: string) => void;
  customInstructions: string;
  onCustomInstructionsChange: (value: string) => void;
  difficulty: string;
  onDifficultyChange: (value: string) => void;
  questionType: string;
  onQuestionTypeChange: (value: string) => void;
  count: number;
  onCountChange: (value: number) => void;
  loading: boolean;
  effectiveTopic: string;
  onGenerate: () => void;
}

export function ProblemGeneratorConfig({
  topic,
  onTopicChange,
  customTopic,
  onCustomTopicChange,
  customInstructions,
  onCustomInstructionsChange,
  difficulty,
  onDifficultyChange,
  questionType,
  onQuestionTypeChange,
  count,
  onCountChange,
  loading,
  effectiveTopic,
  onGenerate,
}: ProblemGeneratorConfigProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Configuration</h2>
      </div>
      <div className="p-6 space-y-6">
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Physics Topic</Label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => { onTopicChange(t); onCustomTopicChange(""); }}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${
                  topic === t
                    ? "bg-gray-900 dark:bg-gray-100 border-gray-900 dark:border-gray-100 text-white dark:text-gray-900 shadow-sm"
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                <span className={topic === t ? "text-gray-300 dark:text-gray-600" : "text-gray-400 dark:text-gray-500"}>
                  {TOPIC_ICONS[t] || <Atom className="h-4 w-4" />}
                </span>
                <span className="truncate">{t}</span>
              </button>
            ))}
            <button
              onClick={() => onTopicChange("__custom__")}
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
              onChange={(e) => onCustomTopicChange(e.target.value)}
              placeholder="e.g., Projectile motion with air resistance, RC circuits, Doppler effect..."
              className="border-gray-200 dark:border-gray-700 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600"
            />
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Additional Instructions <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
          </Label>
          <Textarea
            value={customInstructions}
            onChange={(e) => onCustomInstructionsChange(e.target.value)}
            placeholder="e.g., Focus on conservation of energy with springs, include problems with inclined planes, use SI units only..."
            rows={2}
            className="border-gray-200 dark:border-gray-700 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 resize-none text-sm"
          />
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Difficulty Level</Label>
          <div className="flex gap-2">
            {DIFFICULTY_CONFIG.map((d) => (
              <button
                key={d.value}
                onClick={() => onDifficultyChange(d.value)}
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

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Question Type</Label>
            <Select value={questionType} onValueChange={onQuestionTypeChange}>
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
              onChange={(e) => onCountChange(Number(e.target.value))}
              className="border-gray-200 dark:border-gray-700 rounded-lg focus-visible:ring-1 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600"
            />
          </div>
        </div>

        <Button
          onClick={onGenerate}
          disabled={loading || !effectiveTopic}
          className="gap-2 bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-gray-900 shadow-sm w-full sm:w-auto rounded-lg"
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
  );
}
