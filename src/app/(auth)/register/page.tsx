import type { Metadata } from "next";
import Link from "next/link";
import { PinjamLogo } from "@/components/ui/pinjam-logo";
import { RegisterForm } from "./register-form";
import { CAMPUS_LABEL, UNIVERSITY } from "@/lib/site";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  const short = UNIVERSITY.split(" ")[0];
  return (
    <div className="pb-10 pt-10 md:rounded-[16px] md:border md:border-line-soft md:bg-surface md:px-10 md:py-10">
      <PinjamLogo subtitle={CAMPUS_LABEL} />
      <h1 className="mt-6 text-[26px] font-semibold leading-tight text-ink">Create Account</h1>
      <p className="mt-1 text-[14px] leading-snug text-muted">
        Use your {short} student details to create an account. After signing up, verify your {short} student ID to
        borrow and lend.
      </p>
      <RegisterForm />
      <div className="mt-6 text-center text-[13px] text-muted">
        <p>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
