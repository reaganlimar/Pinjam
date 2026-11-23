import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";

/** Sign in / register: a single centred column like the Figma mobile screens. */
export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getCurrentUser()) redirect("/browse");
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-6 md:justify-center md:py-12">
        {children}
      </div>
    </div>
  );
}
