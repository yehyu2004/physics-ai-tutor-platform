"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useTrackTime } from "@/lib/use-track-time";
import {
  Plus,
  Send,
  ImageIcon,
  MessageSquare,
  Trash2,
  X,
  Search,
  Atom,
  Sparkles,
  Bot,
  User,
  Zap,
  Lightbulb,
  FlaskConical,
  PanelLeftOpen,
  PanelLeftClose,
  ShieldAlert,
  Check,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrls?: string[];
  thinking?: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatPageClientProps {
  conversations: Conversation[];
  userId: string;
  conversationLimit: number;
}


function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SUGGESTED_TOPICS = [
  { icon: Zap, label: "Explain Newton's Laws" },
  { icon: Atom, label: "Quantum mechanics basics" },
  { icon: Lightbulb, label: "How does light travel?" },
  { icon: FlaskConical, label: "Thermodynamics concepts" },
];

export default function ChatPageClient({
  conversations: initialConversations,
  conversationLimit,
}: ChatPageClientProps) {
  useTrackTime("AI_CHAT");
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [model, setModel] = useState("gpt-5.2");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpenRaw] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("chat-sidebar-open");
    if (saved !== null) setSidebarOpenRaw(saved === "true");
    // Detect mobile and close sidebar by default
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpenRaw(false);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  const setSidebarOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setSidebarOpenRaw((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      localStorage.setItem("chat-sidebar-open", String(next));
      return next;
    });
  }, []);
  const [chatMode, setChatMode] = useState<"normal" | "socratic">("normal");
  const [examModeActive, setExamModeActive] = useState(false);
  const [examBannerDismissed, setExamBannerDismissed] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Only auto-scroll if user is near the bottom (within 200px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    fetch("/api/exam-mode")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setExamModeActive(data.isActive); })
      .catch(() => {});
  }, []);

  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const loadConversation = async (convId: string) => {
    setActiveConversationId(convId);
    setLoading(false);
    setMessages([]);
    if (isMobile) setSidebarOpen(false);
    try {
      const res = await fetch(`/api/conversations/${convId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  };

  const createNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setSidebarOpen(false);
  };

  const autoResizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, []);

  const MAX_IMAGES = 5;
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const totalCount = imageFiles.length + files.length;
    if (totalCount > MAX_IMAGES) {
      setImageError(`You can upload at most ${MAX_IMAGES} images at a time.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const oversized = files.find((f) => f.size > MAX_IMAGE_SIZE);
    if (oversized) {
      setImageError(`Image "${oversized.name}" exceeds the 5 MB limit. Please use a smaller image.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImageError(null);
    const newFiles = [...imageFiles, ...files];
    setImageFiles(newFiles);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setImageError(null);
  };

  const clearImages = () => {
    setImageFiles([]);
    setImagePreviews([]);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() && !imageFiles.length) return;

    const uploadedUrls: string[] = [];

    for (const file of imageFiles) {
      try {
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/upload/client",
        });
        uploadedUrls.push(blob.url);
      } catch {
        setImageError("Failed to upload image. Please try again.");
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      imageUrls: uploadedUrls.length ? uploadedUrls : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    clearImages();
    setLoading(true);

    const assistantMsgId = (Date.now() + 1).toString();

    // Add empty assistant message that will be streamed into
    setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "", thinking: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          message: messageText,
          imageUrls: uploadedUrls.length ? uploadedUrls : undefined,
          model,
          mode: chatMode,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Chat request failed" }));
        throw new Error(errData.error || "Chat request failed");
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
          const jsonStr = line.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === "meta" && event.conversationId && !activeConversationId) {
              setActiveConversationId(event.conversationId);
              setConversations((prev) => [
                {
                  id: event.conversationId,
                  title: messageText.slice(0, 50) || "New Chat",
                  updatedAt: new Date().toISOString(),
                },
                ...prev,
              ]);
            } else if (event.type === "title" && event.title && event.conversationId) {
              setConversations((prev) =>
                prev.map((conv) =>
                  conv.id === event.conversationId
                    ? { ...conv, title: event.title }
                    : conv
                )
              );
            } else if (event.type === "thinking") {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, thinking: (msg.thinking || "") + event.content }
                    : msg
                )
              );
            } else if (event.type === "delta") {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: msg.content + event.content }
                    : msg
                )
              );
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      const errorMsg = err instanceof Error ? err.message : "Sorry, I encountered an error. Please try again.";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId && !msg.content
            ? { ...msg, content: errorMsg }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  }, [activeConversationId, imageFiles, model, chatMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || imageFiles.length) {
        submitMessage(input);
      }
    }
  };

  const handleSuggestedTopic = (topic: string) => {
    setInput(topic);
    submitMessage(topic);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        createNewChat();
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  const copyMessage = async (messageId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedMessageId(messageId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] sm:h-[calc(100vh-6.5rem)] overflow-hidden">
      {/* Mobile sidebar overlay (only on small screens) */}
      {isMobile && (
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300",
            sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Conversation Sidebar */}
      <div
        className={cn(
          "bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800 flex flex-col transition-all duration-300 overflow-x-hidden",
          isMobile
            ? cn("fixed inset-y-0 left-0 z-50 w-72 shadow-xl", sidebarOpen ? "translate-x-0" : "-translate-x-full")
            : cn("relative shrink-0", sidebarOpen ? "w-72" : "w-0 border-r-0 overflow-hidden")
        )}
      >
        {/* Sidebar Header */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Conversations</h2>
            <Button
              onClick={createNewChat}
              size="sm"
              disabled={conversations.length >= conversationLimit}
              title={conversations.length >= conversationLimit ? `Limit of ${conversationLimit} conversations reached. Delete old ones first.` : "New conversation"}
              className="h-7 gap-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" />
              New
            </Button>
          </div>
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-9 h-8 bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-800 rounded-lg text-sm focus-visible:ring-gray-300"
            />
          </div>
        </div>

        {/* Conversation Limit Warning */}
        {conversations.length >= conversationLimit && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
            You&apos;ve reached the limit of {conversationLimit} conversations. Delete old ones to start new chats.
          </div>
        )}

        {/* Conversation List */}
        <ScrollArea className="flex-1">
          <div className="px-2 pb-2 space-y-0.5">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") loadConversation(conv.id); }}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2 transition-all group cursor-pointer relative",
                  activeConversationId === conv.id
                    ? "bg-gray-50 dark:bg-gray-800 font-semibold"
                    : "hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
                )}
              >
                <div className="pr-7">
                    <p
                      title={conv.title}
                      className={cn(
                        "text-sm truncate leading-tight",
                        activeConversationId === conv.id
                          ? "font-semibold text-gray-900 dark:text-gray-100"
                          : "font-normal text-gray-600 dark:text-gray-400"
                      )}
                    >
                      {conv.title}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {formatRelativeDate(conv.updatedAt)}
                    </p>
                </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
              </div>
            ))}
            {filteredConversations.length === 0 && (
              <div className="text-center py-8 px-4">
                <MessageSquare className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {searchQuery ? "No matching conversations" : "No conversations yet"}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 mt-1 underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950">
        {/* Chat Header */}
        <div className="h-14 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-3 sm:px-4 shrink-0 bg-white dark:bg-gray-950">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {/* Conversation list toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              ) : (
                <PanelLeftOpen className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              )}
            </button>
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight truncate">
                {activeConversation?.title || "New Conversation"}
              </h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">Physics AI Tutor</p>
            </div>
          </div>

          {/* Socratic Mode Toggle + Model Selector */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Socratic Mode Toggle — hidden during exam mode */}
            {!examModeActive && (
              <Button
                type="button"
                variant={chatMode === "socratic" ? "outline" : "ghost"}
                size="sm"
                onClick={() => setChatMode(chatMode === "socratic" ? "normal" : "socratic")}
                className={cn(
                  "h-8 gap-1.5 text-xs px-2 sm:px-3",
                  chatMode === "socratic"
                    ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 hover:text-amber-800"
                    : ""
                )}
                title="Socratic guided mode"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Socratic</span>
              </Button>
            )}

            {/* Model Selector - Minimal Pill */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full p-0.5 gap-0.5">
              <button
                onClick={() => setModel("gpt-5.2")}
                className={cn(
                  "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs font-medium transition-all",
                  model === "gpt-5.2"
                    ? "bg-blue-500 text-white shadow-md scale-105"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                )}
              >
                <Sparkles className="h-3 w-3" />
                <span className="hidden sm:inline">GPT-5.2</span>
                <span className="sm:hidden">GPT</span>
              </button>
              <button
                onClick={() => setModel("claude-haiku-4-5-20251001")}
                className={cn(
                  "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full text-xs font-medium transition-all",
                  model === "claude-haiku-4-5-20251001"
                    ? "bg-purple-500 text-white shadow-md scale-105"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                )}
              >
                <Atom className="h-3 w-3" />
                <span className="hidden sm:inline">Claude Haiku</span>
                <span className="sm:hidden">Claude</span>
              </button>
            </div>
          </div>
        </div>

        {/* Socratic Mode Banner */}
        {chatMode === "socratic" && !examModeActive && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center">
            Socratic guided mode: AI will guide your thinking through questions rather than giving direct answers
          </div>
        )}

        {/* Exam Mode Banner */}
        {examModeActive && !examBannerDismissed && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center justify-center gap-1.5 relative">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            Exam Mode: AI will provide guidance and help you understand concepts, but will not give direct answers
            <button
              onClick={() => setExamBannerDismissed(true)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-red-100 text-red-400 hover:text-red-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Messages Area */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6">
            {/* Empty State */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="h-16 w-16 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-800 flex items-center justify-center mb-6">
                  <Atom className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                  Start a Conversation
                </h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center max-w-sm mb-10 leading-relaxed">
                  Ask me anything about physics -- mechanics, electromagnetism,
                  thermodynamics, optics, quantum mechanics, and more.
                </p>

                {/* Suggested Topics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                  {SUGGESTED_TOPICS.map((topic) => (
                    <button
                      key={topic.label}
                      onClick={() => handleSuggestedTopic(topic.label)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-left group"
                    >
                      <div className="h-8 w-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        <topic.icon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-900 transition-colors">
                        {topic.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Upload hint */}
                <div className="flex items-center gap-2 mt-10 text-xs text-gray-400 dark:text-gray-500">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Upload up to 5 images of a problem for visual analysis
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="space-y-5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 group",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {/* AI Avatar */}
                  {msg.role === "assistant" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 self-start">
                      <Bot className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    </div>
                  )}

                  {msg.role === "user" ? (
                    /* User message with inline copy button */
                    <div className="flex items-start gap-2 max-w-[75%]">
                      {/* Copy button - shows on hover, positioned to the left of bubble */}
                      <button
                        onClick={() => copyMessage(msg.id, msg.content)}
                        className={cn(
                          "transition-all mt-2 p-1.5 rounded-md",
                          copiedMessageId === msg.id
                            ? "opacity-100 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                            : "opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        )}
                        title="Copy message"
                      >
                        {copiedMessageId === msg.id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <div className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed">
                        {msg.imageUrls && msg.imageUrls.length > 0 && (
                          <div className={cn(
                            "mb-3 gap-2",
                            msg.imageUrls.length === 1 ? "flex" : "grid grid-cols-2"
                          )}>
                            {msg.imageUrls.map((url, idx) => (
                              <img
                                key={idx}
                                src={url}
                                alt={`Uploaded ${idx + 1}`}
                                className="max-w-full rounded-lg max-h-60 object-contain"
                              />
                            ))}
                          </div>
                        )}
                        <div className="prose-sm overflow-x-auto">
                          <MarkdownContent content={msg.content} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Assistant message with action bar below */
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-relaxed text-gray-900 dark:text-gray-100 py-1">
                        {msg.imageUrls && msg.imageUrls.length > 0 && (
                          <div className={cn(
                            "mb-3 gap-2",
                            msg.imageUrls.length === 1 ? "flex" : "grid grid-cols-2"
                          )}>
                            {msg.imageUrls.map((url, idx) => (
                              <img
                                key={idx}
                                src={url}
                                alt={`Uploaded ${idx + 1}`}
                                className="max-w-full rounded-lg max-h-60 object-contain"
                              />
                            ))}
                          </div>
                        )}
                        {msg.thinking && (
                          <details className="mb-2 group/thinking">
                            <summary className="flex items-center gap-1.5 cursor-pointer text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 select-none">
                              <Sparkles className="h-3 w-3" />
                              <span className="font-medium">Thinking</span>
                              <svg className="h-3 w-3 transition-transform group-open/thinking:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </summary>
                            <div className="mt-1.5 pl-4 border-l-2 border-purple-200 dark:border-purple-800 text-xs text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                              {msg.thinking}
                            </div>
                          </details>
                        )}
                        {!msg.content ? (
                          <div className="flex items-center gap-1.5 py-1">
                            {msg.thinking ? (
                              <span className="text-xs text-purple-500 dark:text-purple-400 animate-pulse flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3" />
                                Thinking...
                              </span>
                            ) : (
                              <>
                                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="prose-sm overflow-x-auto">
                            <MarkdownContent content={msg.content} />
                          </div>
                        )}
                      </div>

                      {/* Action bar - shows on hover */}
                      {msg.content && (
                        <div className={cn(
                          "flex items-center gap-2 mt-1 transition-opacity",
                          copiedMessageId === msg.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}>
                          <button
                            onClick={() => copyMessage(msg.id, msg.content)}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all",
                              copiedMessageId === msg.id
                                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                            )}
                            title="Copy message"
                          >
                            {copiedMessageId === msg.id ? (
                              <>
                                <Check className="h-3 w-3" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* User Avatar */}
                  {msg.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 dark:bg-gray-700 self-start">
                      <User className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Image Error */}
        {imageError && (
          <div className="px-4 py-2 border-t border-red-100 bg-red-50">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <span className="text-sm text-red-600">{imageError}</span>
              <button
                onClick={() => setImageError(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Image Previews */}
        {imagePreviews.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
            <div className="max-w-3xl mx-auto flex gap-2 flex-wrap">
              {imagePreviews.map((preview, idx) => (
                <div key={idx} className="relative inline-block">
                  <img
                    src={preview}
                    alt={`Preview ${idx + 1}`}
                    className="h-20 rounded-lg object-contain border border-gray-200 dark:border-gray-700"
                  />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-2 -right-2 bg-gray-900 hover:bg-gray-800 text-white rounded-full p-1 shadow-sm transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <span className="self-end text-xs text-gray-400 dark:text-gray-500 pb-1">
                {imagePreviews.length}/{MAX_IMAGES}
              </span>
            </div>
          </div>
        )}

        {/* Input Area - Clean Card */}
        <div className="p-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-2 flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResizeTextarea();
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask a physics question..."
                disabled={loading}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none py-2 px-1 max-h-32 leading-relaxed disabled:opacity-50"
                style={{ minHeight: "36px" }}
              />
              <button
                type="submit"
                disabled={loading || (!input.trim() && !imageFiles.length)}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
                  loading || (!input.trim() && !imageFiles.length)
                    ? "bg-gray-50 dark:bg-gray-800 text-gray-300 cursor-not-allowed"
                    : "bg-gray-900 hover:bg-gray-800 text-white"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
