"use client";

import { useState } from "react";
import { Maximize2, Minimize2, RotateCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shows a student ID photo from the admin-only image route (no public URL, never cached).
 * Zoom and rotate help read small print on phone photos.
 */
export function IdImageViewer({ src, alt }: { src: string; alt: string }) {
  const [zoomed, setZoomed] = useState(false);
  const [rotation, setRotation] = useState(0);
  const tool =
    "inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-sunken";
  return (
    <figure className="overflow-hidden rounded-[12px] border border-line bg-surface">
      <div className={cn("flex items-center justify-center bg-sunken", zoomed ? "max-h-[75vh] overflow-auto" : "p-3")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private image from an authorised route */}
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          draggable={false}
          style={{ transform: `rotate(${rotation}deg)` }}
          className={cn(
            "transition-transform",
            zoomed ? "max-w-none" : "max-h-[420px] w-auto max-w-full object-contain",
          )}
        />
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 border-t border-line p-2">
        <button type="button" className={tool} onClick={() => setZoomed((z) => !z)} aria-pressed={zoomed}>
          {zoomed ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          {zoomed ? "Fit" : "Actual size"}
        </button>
        <button type="button" className={tool} onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw className="size-4" /> Rotate
        </button>
        <a href={src} target="_blank" rel="noreferrer noopener" className={cn(tool, "ml-auto")}>
          <ExternalLink className="size-4" /> Open
        </a>
      </figcaption>
    </figure>
  );
}
