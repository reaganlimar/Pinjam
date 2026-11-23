import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/misc";
import { LoginForm } from "./login-form";
import { CAMPUS_LABEL } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-1 flex-col pb-8 pt-28 md:flex-none md:rounded-[16px] md:border md:border-line-soft md:bg-surface md:px-10 md:py-12">
      <Logo className="text-[88px]" />
      <LoginForm next={typeof next === "string" ? next : ""} />
      <div className="mt-auto pt-16 text-center text-[13px] text-muted md:mt-10 md:pt-0">
        <Link href="/register" className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover">
          Create Account
        </Link>
        <p className="mt-1">{CAMPUS_LABEL}</p>
      </div>
    </div>
  );
}
