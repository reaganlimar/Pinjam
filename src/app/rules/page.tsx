import type { Metadata } from "next";
import { Logo } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { getCurrentUser } from "@/server/session";
import { CAMPUS, UNIVERSITY } from "@/lib/site";

export const metadata: Metadata = { title: "Lending rules" };

const short = UNIVERSITY.split(" ")[0];

const RULES = [
  ["Who can borrow", `Only ${short} ${CAMPUS} students can borrow or lend items on Pinjam.`],
  [
    "Borrowing period",
    "Each item has a maximum loan period set by its lender. Return it by the due date shown in My Loans.",
  ],
  [
    "Pickup and return",
    "Pick up and return items at the agreed pickup point. Tap Confirm received when you collect an item, and wait for the lender to confirm your return.",
  ],
  [
    "Taking care of items",
    "Use items only for their intended purpose, keep them clean and complete, and never pass them on to someone else.",
  ],
  ["Late returns", "Late returns can lower your rating and limit your ability to borrow."],
  [
    "Damage or loss",
    "Report any problem right away. A borrower may be asked to repair or replace an item they damaged or lost.",
  ],
  [
    "Fees and payment",
    "Items are free unless the lender sets an optional price per day. Fees are paid directly to the lender at pickup, in cash or by transfer. Pinjam does not process payments.",
  ],
  [
    "Listing items",
    "Only list items you own or are allowed to lend, with honest photos and an accurate condition.",
  ],
  [
    "Ratings and conduct",
    "Be respectful and give honest ratings. Accounts that break these rules can be suspended.",
  ],
] as const;

const BACK: Record<string, string> = { register: "/register", profile: "/profile" };

export default async function RulesPage({ searchParams }: PageProps<"/rules">) {
  const { from } = await searchParams;
  const user = await getCurrentUser();
  const back = (typeof from === "string" && BACK[from]) || (user ? "/profile" : "/register");
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-2xl px-6 pb-36 pt-10 md:pb-16">
        <Logo className="text-[30px]" />
        <h1 className="mt-1 text-[26px] font-semibold leading-tight text-ink">Lending Rules</h1>
        <ol className="mt-5 space-y-4">
          {RULES.map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <div>
                <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
                <p className="text-[14px] leading-snug text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="fixed inset-x-0 bottom-0 border-t border-line-soft bg-bg/95 px-6 py-4 backdrop-blur md:static md:mt-10 md:border-0 md:bg-transparent md:p-0">
          <LinkButton href={back} className="mx-auto w-full max-w-2xl">
            I have read the lending rules stated
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
