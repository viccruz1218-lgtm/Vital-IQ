"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Welcome to VitalIQ. Before we build your plan, I want to understand who you're becoming.\n\nWhat's the biggest change you want to make in your life over the next year?",
    },
  ]);
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
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) {
        throw new Error(data.error ?? "Vi couldn't respond — try again.");
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.onboardingCompleted) {
        setTimeout(() => router.push("/dashboard"), 1200);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: err instanceof Error ? err.message : "Vi couldn't respond — try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-screen w-full max-w-lg flex-col px-4 py-6">
      <div className="mb-4 font-display text-lg font-semibold">
        Vital<span className="text-pulse">IQ</span> onboarding
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "assistant"
                ? "max-w-[85%] rounded-lg rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-sm"
                : "ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-pulse px-3.5 py-2.5 text-sm text-pulse-fg"
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
          placeholder="Type your answer…"
        />
        <Button onClick={send} disabled={sending}>
          Send
        </Button>
      </div>
    </div>
  );
}
