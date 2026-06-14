"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronRight,
  Lightbulb,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getOpenClawWebSocketUrl } from "@/services/infrasight-api";

type ChatRole = "user" | "assistant";

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

const SUGGESTED_PROMPTS = [
  "Show me the top 5 unhealthiest resources",
  "Summarise all open critical alerts",
  "Which EC2 instances are running but unmonitored?",
  "Generate an incident summary for today",
  "List all databases and their current status",
  "What remediation steps do you recommend?",
  "Check if all EC2 instances are properly tagged",
  "Identify any security group misconfigurations",
];

export function OpenClawPage({ workspaceName }: { workspaceName?: string }) {
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
        `OpenClaw is online in read-only mode for ${workspaceName ?? "the selected workspace"}. I can query this workspace's infrastructure inventory, metrics, and alerts — then reason across it to surface insights and recommend investigation steps. What would you like to know?`,
    },
  ]);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const history = useMemo(
    () =>
      messages
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content })),
    [messages],
  );

  const sendMessage = (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || busy) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = { id: assistantId, role: "assistant", content: "", tools: [] };

    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);

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
            ? { ...m, content: "Could not reach the OpenClaw backend. Ensure FastAPI is running." }
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]" style={{ height: "calc(100vh - 140px)" }}>
      {/* Sidebar */}
      <div className="flex flex-col gap-4 min-h-0">
        {/* Branding */}
        <Card className="console-line p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="grid size-10 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary shadow-glow-sm">
              <Bot className="size-5" />
            </div>
            <div>
              <div className="font-semibold text-sm">OpenClaw</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3 text-primary" />
                <span>AI Ops Assistant</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge className="normal-case text-[10px]">{mode.replace("_", "-")}</Badge>
            {permissions.slice(0, 3).map((p) => (
              <Badge key={p} className="normal-case text-[10px] border-border bg-muted text-muted-foreground">
                {p.replaceAll("_", " ")}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Suggested prompts */}
        <Card className="console-line flex-1 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Lightbulb className="size-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Suggested
            </span>
          </div>
          <div className="overflow-y-auto p-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                disabled={busy}
                className="group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
              >
                <ChevronRight className="size-3.5 shrink-0 text-primary/50 transition-transform group-hover:translate-x-0.5" />
                <span className="line-clamp-2">{prompt}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Chat area */}
      <Card className="console-line flex min-h-0 flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
            >
              {message.role === "assistant" && (
                <div className="mr-3 mt-1 grid size-7 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                  <Sparkles className="size-3.5" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[82%] rounded-xl border px-4 py-3 text-sm leading-relaxed",
                  message.role === "user"
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-border bg-background/80 text-foreground",
                )}
              >
                {message.tools && message.tools.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
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
                        <Wrench className={cn("size-3", tool.status === "running" && "animate-spin")} />
                        {tool.name.replaceAll("_", " ")}
                        {tool.status === "completed" && " ✓"}
                      </span>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap">
                  {message.content || (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
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
        <form onSubmit={handleSubmit} className="border-t border-border p-4">
          <div className="flex gap-3">
            <textarea
              className="min-h-12 flex-1 resize-none rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/60 focus:shadow-glow-sm"
              placeholder="Ask OpenClaw about your infrastructure…"
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
              className="h-12 w-12 shrink-0 self-end rounded-xl p-0"
              disabled={busy || !input.trim()}
              type="submit"
            >
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            OpenClaw operates in read-only mode by default · Shift+Enter for new line
          </p>
        </form>
      </Card>
    </div>
  );
}
