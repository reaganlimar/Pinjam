import { LinkButton } from "@/components/ui/button";
import { Logo } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Logo className="text-[48px]" />
      <h1 className="mt-4 text-[22px] font-semibold text-ink">We couldn&apos;t find that page</h1>
      <p className="mt-1 text-[15px] text-muted">It may have been removed, or the link is wrong.</p>
      <LinkButton href="/browse" className="mt-8 w-full">
        Back to browse
      </LinkButton>
    </div>
  );
}
