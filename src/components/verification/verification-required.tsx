import { ShieldAlert } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { denialMessage, type Actor, type Capability } from "@/lib/permissions";
import { cn } from "@/lib/cn";

/**
 * Shown in place of a feature an unverified student can't use yet (listing, borrowing,
 * approving). The server enforces the same rule; this only explains it.
 */
export function VerificationRequired({
  actor,
  capability,
  compact = false,
  className,
}: {
  actor: Actor;
  capability: Capability;
  compact?: boolean;
  className?: string;
}) {
  const pending = actor.verificationStatus === "PENDING";
  return (
    <div
      role="note"
      className={cn(
        "rounded-[12px] border border-warning/30 bg-warning-bg text-warning",
        compact ? "px-3 py-2.5 text-[13px]" : "p-4 text-[14px]",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className={cn("shrink-0", compact ? "mt-px size-4" : "mt-0.5 size-5")} aria-hidden />
        <div className="min-w-0 flex-1">
          {!compact && <p className="font-semibold">Student ID verification required</p>}
          <p className={compact ? "" : "mt-0.5"}>{denialMessage(actor, capability)}</p>
          {!compact && (
            <LinkButton href="/verification" size="sm" variant={pending ? "outline" : "primary"} className="mt-3">
              {pending ? "View verification status" : "Verify my student ID"}
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}
