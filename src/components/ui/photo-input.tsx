"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/cn";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Dashed photo drop area from the Figma ("Add student ID photo" / "Add a photo").
 * Keeps the chosen files in a real <input type="file"> so they submit with the form.
 */
export function PhotoInput({
  name,
  label,
  multiple = false,
  maxFiles = 1,
  error,
  className,
}: {
  name: string;
  label: string;
  multiple?: boolean;
  maxFiles?: number;
  error?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  // React resets forms after a server action runs; clear the previews with it.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => setPreviews([]);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  function sync(files: File[]) {
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    setPreviews(files.map((f) => ({ url: URL.createObjectURL(f), name: f.name })));
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    const tooBig = chosen.find((f) => f.size > MAX_BYTES);
    const wrongType = chosen.find((f) => !ACCEPT.split(",").includes(f.type));
    if (tooBig || wrongType) {
      setLocalError(tooBig ? "Each photo must be 5 MB or smaller." : "Use JPG, PNG or WebP photos.");
      sync([]);
      return;
    }
    if (chosen.length > maxFiles) {
      setLocalError(`Choose up to ${maxFiles} photo${maxFiles === 1 ? "" : "s"}.`);
      sync(chosen.slice(0, maxFiles));
      return;
    }
    setLocalError(null);
    sync(chosen);
  }

  function remove(index: number) {
    const files = Array.from(inputRef.current?.files ?? []).filter((_, i) => i !== index);
    sync(files);
  }

  const shownError = localError ?? error;

  return (
    <div className={className}>
      <label
        className={cn(
          "flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed",
          "border-primary bg-primary-soft px-4 py-5 text-[14px] font-medium text-primary transition-colors hover:bg-primary-soft/70",
          "focus-within:ring-2 focus-within:ring-primary/30",
          shownError && "border-danger",
        )}
      >
        <Camera className="size-7" strokeWidth={1.6} aria-hidden />
        <span>{previews.length ? (multiple ? "Add or change photos" : "Change photo") : label}</span>
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={ACCEPT}
          multiple={multiple}
          onChange={onChange}
          className="sr-only"
        />
      </label>
      {previews.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {previews.map((p, i) => (
            <li key={p.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob */}
              <img src={p.url} alt={p.name} className="size-20 rounded-[10px] object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${p.name}`}
                className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-ink text-bg"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {shownError && (
        <p className="mt-2 text-[13px] text-danger" role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}
