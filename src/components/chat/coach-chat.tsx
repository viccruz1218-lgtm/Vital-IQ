"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

interface Msg {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

export function CoachChat({ initialMessages }: { initialMessages: Msg[] }) {
  const [messages, setMessages] = useState<Msg[]>(
    initialMessages.length
      ? initialMessages
      : [{ role: "assistant", content: "Hey — what's going on today?" }],
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) {
        throw new Error(data.error ?? "Vi couldn't respond — try again.");
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Vi couldn't respond — try again.",
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[80%] rounded-lg rounded-tr-sm bg-pulse px-3.5 py-2.5 text-sm text-pulse-fg"
                : m.isError
                  ? "max-w-[80%] rounded-lg rounded-tl-sm border border-pulse/40 bg-pulse/10 px-3.5 py-2.5 text-sm text-pulse"
                  : "max-w-[80%] rounded-lg rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-sm"
            }
          >
            {m.content}
          </div>
        ))}
        {sending && <div className="text-xs text-muted">Vi is typing…</div>}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t border-border pt-3">
        <Textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message Vi…"
        />
        <Button onClick={send} disabled={sending}>
          Send
        </Button>
      </div>
    </div>
  );
}
