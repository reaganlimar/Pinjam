"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CornerDownLeft } from "lucide-react";
import { sendMessageAction } from "@/server/actions/account";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/server/services/chat";

const POLL_MS = 4000;

/** Message bubbles + composer. New messages arrive by polling every few seconds. */
export function ChatThread({ conversationId, meId, initial }: { conversationId: number; meId: number; initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/chat/${conversationId}/messages?after=${lastId}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const { messages: fresh } = (await res.json()) as { messages: ChatMessage[] };
        if (fresh.length) {
          setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
        }
      } catch {
        // Ignore transient network errors; the next poll retries.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [conversationId, lastId]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    startSending(async () => {
      const res = await sendMessageAction(conversationId, body);
      if (res.message) {
        const msg = res.message;
        setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
        setDraft("");
        setError(null);
      } else {
        setError(res.error ?? "Message not sent.");
      }
    });
  }

  return (
    <>
      <div className="-mx-4 flex-1 overflow-y-auto px-4 py-5 md:mx-0 md:border-x md:border-line md:bg-bg" aria-live="polite">
        {messages.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">Say hi and agree on a pickup time.</p>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const mine = m.senderId === meId;
              return (
                <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <p
                    className={cn(
                      "max-w-[75%] whitespace-pre-wrap break-words rounded-[12px] px-4 py-2.5 text-[15px]",
                      mine ? "bg-primary text-on-primary" : "border border-ink/70 bg-surface text-ink",
                    )}
                  >
                    {m.body}
                    <span className={cn("mt-0.5 block text-[11px]", mine ? "text-on-primary/70" : "text-muted")}>
                      {new Date(m.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={send}
        className="-mx-4 flex items-center gap-3 border-t border-line bg-surface px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:mx-0 md:rounded-b-[12px] md:border"
      >
        <label className="flex-1">
          <span className="sr-only">Message</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            placeholder="Write a message"
            className="h-[52px] w-full rounded-full border border-line bg-surface px-5 text-[15px] text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send"
          className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <CornerDownLeft className="size-6" strokeWidth={2.4} />
        </button>
      </form>
      {error && <p className="pb-2 text-center text-[13px] text-danger">{error}</p>}
    </>
  );
}
