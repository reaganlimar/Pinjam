import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/misc";
import { RegisterForm } from "./register-form";
import { CAMPUS_LABEL, UNIVERSITY } from "@/lib/site";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  const short = UNIVERSITY.split(" ")[0];
  return (
    <div className="pb-10 pt-10 md:rounded-[16px] md:border md:border-line-soft md:bg-surface md:px-10 md:py-10">
      <Logo className="text-[30px]" />
      <h1 className="mt-1 text-[26px] font-semibold leading-tight text-ink">Create Account</h1>
      <p className="mt-1 text-[14px] leading-snug text-muted">
        Use your {short} student details to start borrowing and upload your {short} student ID card to verify your
        identity.
      </p>
      <RegisterForm />
      <div className="mt-6 text-center text-[13px] text-muted">
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover">
            Sign in
          </Link>
        </p>
        <p className="mt-1">{CAMPUS_LABEL}</p>
      </div>
    </div>
  );
}
