"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, ShieldCheck, Sparkles, Wrench, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOpenClawWebSocketUrl } from "@/services/infrasight-api";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  tools?: { name: string; status: "running" | "completed" }[];
};

type OpenClawEvent =
  | { type: "start"; conversation_id: string; mode: string; permissions?: string[] }
  | { type: "tool_call"; conversation_id: string; tool: string }
  | { type: "tool_result"; conversation_id: string; tool: string; status: string }
  | { type: "token"; conversation_id: string; delta: string }
  | { type: "done"; conversation_id: string; tools_used: string[] }
  | { type: "error"; conversation_id?: string; message: string };

export function OpenClawAssistant({ workspaceName }: { workspaceName?: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("read_only");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        `OpenClaw is online as a read-only infrastructure analyst for ${workspaceName ?? "the selected workspace"}. Ask why a resource is unhealthy, what evidence exists, or what to check next.`,
    },
  ]);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const history = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content })),
    [messages],
  );

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", tools: [] };

    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    const socket = new WebSocket(getOpenClawWebSocketUrl());
    let completed = false;
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ message: trimmed, conversation_id: conversationId, history }));
    };

    socket.onmessage = (ev) => {
      const data = JSON.parse(ev.data) as OpenClawEvent;

      if ("conversation_id" in data && data.conversation_id) {
        setConversationId(data.conversation_id);
      }

      if (data.type === "start") {
        setMode(data.mode);
        setPermissions(data.permissions ?? []);
      }

      if (data.type === "tool_call") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, tools: [...(m.tools ?? []), { name: data.tool, status: "running" }] }
              : m,
          ),
        );
      }

      if (data.type === "tool_result") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  tools: (m.tools ?? []).map((t) =>
                    t.name === data.tool ? { ...t, status: "completed" } : t,
                  ),
                }
              : m,
          ),
        );
      }

      if (data.type === "token") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + data.delta } : m,
          ),
        );
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }

      if (data.type === "done") {
        completed = true;
        setBusy(false);
        socket.close();
      }

      if (data.type === "error") {
        completed = true;
        setBusy(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: data.message } : m,
          ),
        );
        socket.close();
      }
    };

    socket.onerror = () => {
      completed = true;
      setBusy(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Could not reach the OpenClaw backend. Check that FastAPI is running.",
              }
            : m,
        ),
      );
    };

    socket.onclose = () => {
      if (completed) return;
      completed = true;
      setBusy(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId && !m.content
            ? { ...m, content: "OpenClaw connection closed before a response completed." }
            : m,
        ),
      );
    };
  };

  const closePanel = () => {
    socketRef.current?.close();
    setBusy(false);
    setOpen(false);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex h-[min(680px,calc(100vh-5rem))] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-console"
          >
            {/* Header */}
            <header className="console-line flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary shadow-glow-sm">
                  <Bot className="size-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">OpenClaw</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3 text-primary" />
                    <span>AI Ops · {mode.replace("_", "-")}</span>
                  </div>
                  {workspaceName && (
                    <div className="max-w-[210px] truncate text-[10px] text-muted-foreground">
                      {workspaceName}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="normal-case text-[10px]">{mode.replace("_", "-")}</Badge>
                <Button size="sm" variant="ghost" onClick={closePanel} aria-label="Close">
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            {/* Permissions */}
            {permissions.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2">
                {permissions.map((p) => (
                  <span
                    key={p}
                    className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {p.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-xl border px-3 py-2.5 text-sm leading-relaxed",
                      message.role === "user"
                        ? "border-primary/35 bg-primary/10 text-foreground"
                        : "border-border bg-background/70 text-foreground",
                    )}
                  >
                    {message.tools && message.tools.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {message.tools.map((tool) => (
                          <span
                            key={`${message.id}-${tool.name}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
                              tool.status === "running"
                                ? "border-accent/30 bg-accent/10 text-accent"
                                : "border-border bg-muted text-muted-foreground",
                            )}
                          >
                            <Wrench
                              className={cn(
                                "size-3",
                                tool.status === "running" && "animate-spin",
                              )}
                            />
                            {tool.name.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">
                      {message.content || (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="border-t border-border p-3">
              <div className="flex gap-2">
                <textarea
                  className="min-h-11 flex-1 resize-none rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-glow-sm"
                  placeholder="Ask OpenClaw…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={2}
                />
                <Button
                  className="h-11 w-11 shrink-0 self-end rounded-xl p-0"
                  disabled={busy || !input.trim()}
                  type="submit"
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group relative flex h-12 items-center gap-2.5 rounded-xl border px-4 text-sm font-semibold shadow-console transition-all",
          open
            ? "border-primary/50 bg-primary text-primary-foreground"
            : "border-primary/30 bg-card text-foreground hover:border-primary/50 hover:shadow-glow-primary",
        )}
      >
        {/* Animated ring for idle state */}
        {!open && (
          <span className="absolute -inset-0.5 rounded-xl border border-primary/20 animate-pulse-ring" />
        )}
        <Sparkles className={cn("size-4", open ? "text-primary-foreground" : "text-primary")} />
        <span>OpenClaw</span>
      </button>
    </div>
  );
}
