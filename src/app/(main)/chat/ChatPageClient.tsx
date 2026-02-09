"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Send,
  ImageIcon,
  Loader2,
  MessageSquare,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

function renderContentWithLatex(content: string) {
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith("$$") && part.endsWith("$$")) {
      return (
        <div key={i} className="my-2 overflow-x-auto text-center font-mono text-sm bg-neutral-50 rounded p-2">
          {part.slice(2, -2)}
        </div>
      );
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return (
        <code key={i} className="px-1 py-0.5 bg-neutral-100 rounded text-sm font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversation = async (convId: string) => {
    setActiveConversationId(convId);
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
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !imageFile) return;

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
      content: input,
      imageUrl: uploadedImageUrl,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    removeImage();
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConversationId,
          message: input,
          imageUrl: uploadedImageUrl,
          model,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const data = await res.json();

      if (data.conversationId && !activeConversationId) {
        setActiveConversationId(data.conversationId);
        setConversations((prev) => [
          {
            id: data.conversationId,
            title: input.slice(0, 50) || "New Chat",
            updatedAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.content,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I encountered an error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Conversation List */}
      <Card className="w-72 shrink-0 flex flex-col hidden md:flex">
        <div className="p-3 border-b">
          <Button onClick={createNewChat} className="w-full gap-2" size="sm">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2 text-sm transition-colors group flex items-center justify-between",
                  activeConversationId === conv.id
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-50"
                )}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="text-xs text-neutral-400 text-center py-4">
                No conversations yet
              </p>
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col">
        {/* Model Selector */}
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-medium">
            {activeConversationId
              ? conversations.find((c) => c.id === activeConversationId)?.title || "Chat"
              : "New Conversation"}
          </h2>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-5-mini">GPT-5 Mini (OpenAI)</SelectItem>
              <SelectItem value="claude-haiku-4-5-20251001">Claude 4.5 Haiku</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center py-20">
                <div className="h-16 w-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-8 w-8 text-neutral-400" />
                </div>
                <h3 className="text-lg font-medium text-neutral-700">
                  Physics AI Tutor
                </h3>
                <p className="text-sm text-neutral-400 mt-2 max-w-md mx-auto">
                  Ask me anything about physics! I can help with mechanics, E&M,
                  thermodynamics, optics, and more. Upload an image of a problem
                  for visual analysis.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-900"
                  )}
                >
                  {msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt="Uploaded"
                      className="max-w-full rounded-lg mb-2 max-h-60 object-contain"
                    />
                  )}
                  <div className="whitespace-pre-wrap">
                    {renderContentWithLatex(msg.content)}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="bg-neutral-100 rounded-xl px-4 py-3">
                  <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Image Preview */}
        {imagePreview && (
          <div className="px-4 py-2 border-t bg-neutral-50">
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="Preview"
                className="h-20 rounded-lg object-contain"
              />
              <button
                onClick={removeImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0"
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a physics question..."
              className="flex-1"
              disabled={loading}
            />
            <Button type="submit" size="icon" disabled={loading || (!input.trim() && !imageFile)}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
