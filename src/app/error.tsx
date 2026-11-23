"use client";

import { Button, LinkButton } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[22px] font-semibold text-ink">Something went wrong</h1>
      <p className="mt-1 text-[15px] text-muted">Please try again. If it keeps happening, reload the page.</p>
      <div className="mt-8 grid w-full grid-cols-2 gap-3">
        <LinkButton href="/browse" variant="outline">
          Browse
        </LinkButton>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
