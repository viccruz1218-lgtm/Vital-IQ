"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

interface Msg {
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

const TOTAL_QUESTIONS = 5;

const WELCOME_MESSAGE: Msg = {
  role: "assistant",
  content:
    "Welcome to VitalIQ. Before we build your plan, I want to understand who you're becoming.\n\nWho are you becoming — what does that version of you six months from now look like?",
};

export function OnboardingChat({ initialHistory }: { initialHistory: Msg[] }) {
  const router = useRouter();
  // The welcome message above asks Q1 but is never written to chat_messages
  // (see /api/onboarding/chat) — it's re-derived here on every load, then any
  // real history already saved server-side is appended after it so a refresh
  // mid-conversation resumes exactly where it left off instead of restarting.
  const [messages, setMessages] = useState<Msg[]>([WELCOME_MESSAGE, ...initialHistory]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const questionsAnswered = messages.filter((m) => m.role === "user").length;
  const currentStep = Math.min(TOTAL_QUESTIONS, questionsAnswered + 1);

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
        setCompleted(true);
        setTimeout(() => router.push("/dashboard"), 1200);
      }
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
    <div className="mx-auto flex h-screen w-full max-w-lg flex-col px-4 py-6">
      <div className="mb-1 font-display text-lg font-semibold">
        Vital<span className="text-pulse">IQ</span> onboarding
      </div>
      <p className="mb-4 font-mono text-xs text-muted">
        {completed ? "Building your first plan…" : `Question ${currentStep} of ${TOTAL_QUESTIONS}`}
      </p>
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-pulse px-3.5 py-2.5 text-sm text-pulse-fg"
                : m.isError
                  ? "max-w-[85%] rounded-lg rounded-tl-sm border border-pulse/40 bg-pulse/10 px-3.5 py-2.5 text-sm text-pulse"
                  : "max-w-[85%] rounded-lg rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-sm"
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
