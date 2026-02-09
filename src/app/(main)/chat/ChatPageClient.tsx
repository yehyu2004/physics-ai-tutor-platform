"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MarkdownContent } from "@/components/ui/markdown-content";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

interface ChatPageClientProps {
  conversations: Conversation[];
  userId: string;
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
}: ChatPageClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [model, setModel] = useState("gpt-5-mini");
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatMode, setChatMode] = useState<"normal" | "socratic">("normal");
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

  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const loadConversation = async (convId: string) => {
    setActiveConversationId(convId);
    setLoading(false);
    setMessages([]);
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() && !imageFile) return;

    let uploadedImageUrl: string | undefined;

    if (imageFile) {
      const formData = new FormData();
      formData.append("file", imageFile);
      try {
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedImageUrl = uploadData.url;
        }
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      imageUrl: uploadedImageUrl,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    removeImage();
    setLoading(true);

    const assistantMsgId = (Date.now() + 1).toString();

    // Add empty assistant message that will be streamed into
    setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          message: messageText,
          imageUrl: uploadedImageUrl,
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
  }, [activeConversationId, imageFile, model, chatMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() || imageFile) {
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

  return (
    <div className="flex h-[calc(100vh-6.5rem)] overflow-hidden">
      {/* Mobile sidebar overlay (only on small screens) */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/20 md:hidden transition-opacity duration-300",
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Conversation Sidebar */}
      <div
        className={cn(
          "bg-white border-r border-gray-100 flex flex-col transition-all duration-300",
          "fixed inset-y-0 left-0 z-40 md:relative md:z-0",
          sidebarOpen ? "translate-x-0 w-72" : "-translate-x-full w-72 md:translate-x-0 md:w-0 md:border-r-0 md:overflow-hidden"
        )}
      >
        {/* Sidebar Header */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900">Conversations</h2>
            <Button
              onClick={createNewChat}
              size="sm"
              className="h-7 gap-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs"
            >
              <Plus className="h-3 w-3" />
              New
            </Button>
          </div>
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="pl-9 h-8 bg-gray-50 border-gray-100 rounded-lg text-sm focus-visible:ring-gray-300"
            />
          </div>
        </div>

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
                  "w-full text-left rounded-lg px-3 py-2 transition-all group cursor-pointer",
                  activeConversationId === conv.id
                    ? "bg-gray-50 font-semibold"
                    : "hover:bg-gray-50/50"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      title={conv.title}
                      className={cn(
                        "text-sm truncate leading-tight",
                        activeConversationId === conv.id
                          ? "font-semibold text-gray-900"
                          : "font-normal text-gray-600"
                      )}
                    >
                      {conv.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatRelativeDate(conv.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-all shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            {filteredConversations.length === 0 && (
              <div className="text-center py-8 px-4">
                <MessageSquare className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  {searchQuery ? "No matching conversations" : "No conversations yet"}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-xs text-gray-500 hover:text-gray-700 mt-1 underline"
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
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Chat Header */}
        <div className="h-14 border-b border-gray-100 flex items-center justify-between px-4 shrink-0 bg-white">
          <div className="flex items-center gap-3">
            {/* Conversation list toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5 text-gray-500" />
              ) : (
                <PanelLeftOpen className="h-5 w-5 text-gray-500" />
              )}
            </button>
            <div>
              <h2 className="text-sm font-medium text-gray-900 leading-tight">
                {activeConversation?.title || "New Conversation"}
              </h2>
              <p className="text-xs text-gray-400">Physics AI Tutor</p>
            </div>
          </div>

          {/* Socratic Mode Toggle + Model Selector */}
          <div className="flex items-center gap-2">
            {/* Socratic Mode Toggle */}
            <Button
              type="button"
              variant={chatMode === "socratic" ? "outline" : "ghost"}
              size="sm"
              onClick={() => setChatMode(chatMode === "socratic" ? "normal" : "socratic")}
              className={cn(
                "h-8 gap-1.5 text-xs",
                chatMode === "socratic"
                  ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200 hover:text-amber-800"
                  : ""
              )}
              title="Socratic guided mode"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Socratic
            </Button>

            {/* Model Selector - Minimal Pill */}
            <div className="flex items-center bg-gray-100 rounded-full p-0.5">
              <button
                onClick={() => setModel("gpt-5-mini")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
                  model === "gpt-5-mini"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Sparkles className="h-3 w-3" />
                <span className="hidden sm:inline">GPT-5 Mini</span>
                <span className="sm:hidden">GPT</span>
              </button>
              <button
                onClick={() => setModel("claude-haiku-4-5-20251001")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
                  model === "claude-haiku-4-5-20251001"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
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
        {chatMode === "socratic" && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center">
            Socratic guided mode: AI will guide your thinking through questions rather than giving direct answers
          </div>
        )}

        {/* Messages Area */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6">
            {/* Empty State */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="h-16 w-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-6">
                  <Atom className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  Start a Conversation
                </h3>
                <p className="text-sm text-gray-400 text-center max-w-sm mb-10 leading-relaxed">
                  Ask me anything about physics -- mechanics, electromagnetism,
                  thermodynamics, optics, quantum mechanics, and more.
                </p>

                {/* Suggested Topics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                  {SUGGESTED_TOPICS.map((topic) => (
                    <button
                      key={topic.label}
                      onClick={() => handleSuggestedTopic(topic.label)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all text-left group"
                    >
                      <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                        <topic.icon className="h-4 w-4 text-gray-400" />
                      </div>
                      <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                        {topic.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Upload hint */}
                <div className="flex items-center gap-2 mt-10 text-xs text-gray-400">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Upload an image of a problem for visual analysis
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="space-y-5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {/* AI Avatar */}
                  {msg.role === "assistant" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 self-end">
                      <Bot className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "text-sm leading-relaxed overflow-hidden",
                      msg.role === "user"
                        ? "max-w-[75%] bg-gray-100 text-gray-900 rounded-2xl rounded-br-md px-4 py-3"
                        : "flex-1 min-w-0 text-gray-900 py-1"
                    )}
                  >
                    {msg.imageUrl && (
                      <img
                        src={msg.imageUrl}
                        alt="Uploaded"
                        className="max-w-full rounded-lg mb-3 max-h-60 object-contain"
                      />
                    )}
                    {msg.role === "assistant" && !msg.content ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <div className="prose-sm overflow-x-auto">
                        <MarkdownContent content={msg.content} />
                      </div>
                    )}
                  </div>

                  {/* User Avatar */}
                  {msg.role === "user" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 self-end">
                      <User className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Image Preview */}
        {imagePreview && (
          <div className="px-4 py-2 border-t border-gray-100">
            <div className="max-w-3xl mx-auto">
              <div className="relative inline-block">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="h-20 rounded-lg object-contain border border-gray-200"
                />
                <button
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 bg-gray-900 hover:bg-gray-800 text-white rounded-full p-1 shadow-sm transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input Area - Clean Card */}
        <div className="p-4">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
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
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none py-2 px-1 max-h-32 leading-relaxed disabled:opacity-50"
                style={{ minHeight: "36px" }}
              />
              <button
                type="submit"
                disabled={loading || (!input.trim() && !imageFile)}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all",
                  loading || (!input.trim() && !imageFile)
                    ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                    : "bg-gray-900 hover:bg-gray-800 text-white"
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
