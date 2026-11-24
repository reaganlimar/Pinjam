"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Native modal <dialog> for confirming important admin actions. Rendered inside a <form>,
 * so a submit button in `children` submits that form.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="confirm-title"
      className={cn(
        "m-auto w-[min(92vw,480px)] rounded-[16px] border border-line bg-surface p-5 text-ink shadow-xl",
        "backdrop:bg-black/50",
        className,
      )}
    >
      <h2 id="confirm-title" className="text-[18px] font-semibold">
        {title}
      </h2>
      <div className="mt-2 space-y-4">{children}</div>
    </dialog>
  );
}
