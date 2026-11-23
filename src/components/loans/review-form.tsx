"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { reviewAction } from "@/server/actions/loans";
import { FormMessage, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";

const WORDS = ["", "Poor", "Okay", "Good", "Great", "Excellent"];

/** "How was the lender?" star rating (Figma Rating Component). */
export function ReviewForm({ loanId, question }: { loanId: number; question: string }) {
  const [state, action] = useActionState(reviewAction.bind(null, loanId), {});
  const [rating, setRating] = useState(Number(state.values?.rating ?? 0));
  const [hover, setHover] = useState(0);
  if (state.success) return <FormMessage success={state.success} />;
  const shown = hover || rating;
  return (
    <form action={action} className="space-y-3 rounded-[12px] border border-line bg-surface p-4" noValidate>
      <fieldset>
        <legend className="text-[15px] font-semibold text-ink">{question}</legend>
        <div className="mt-2 flex items-center gap-2" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                className="peer sr-only"
              />
              <Star
                aria-hidden
                className={cn(
                  "size-9 text-primary transition-transform peer-focus-visible:scale-110 peer-focus-visible:outline-2",
                  n <= shown ? "fill-primary" : "fill-transparent",
                )}
                strokeWidth={1.5}
              />
              <span className="sr-only">{n} star{n === 1 ? "" : "s"}</span>
            </label>
          ))}
          <span className="ml-2 text-[13px] text-muted">{WORDS[shown]}</span>
        </div>
        {state.fieldErrors?.rating && <p className="mt-1 text-[13px] text-danger">{state.fieldErrors.rating}</p>}
      </fieldset>
      <Textarea name="comment" maxLength={500} placeholder="Add a comment (optional)" className="min-h-20" defaultValue={state.values?.comment} />
      <FormMessage error={state.error} />
      <SubmitButton size="md" className="w-full" disabled={!rating} pendingLabel="Sending…">
        Submit review
      </SubmitButton>
    </form>
  );
}
