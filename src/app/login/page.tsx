import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/access";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dear Swritsinh · Private" };

export default async function LoginPage() {
  const user = await getSessionUser(new Headers(await headers()));
  if (user) redirect("/app");
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-midnight px-5 py-16 text-ivory">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, rgba(221,187,120,0.18), transparent 60%), radial-gradient(40rem 30rem at 100% 110%, rgba(221,187,120,0.08), transparent 60%)",
        }}
      />
      <div className="relative w-full max-w-sm fade-in">
        <p className="eyebrow text-center text-gold">Private family archive</p>
        <h1 className="font-display mt-4 text-center text-5xl font-medium tracking-wide sm:text-6xl">
          Dear Swritsinh
        </h1>
        <p className="mt-3 text-center text-sm text-slate-light">Every moment. Every milestone. Forever yours.</p>
        <LoginForm />
        <p className="mt-10 text-center text-xs leading-relaxed text-slate-light">
          This archive is private. Access is limited to family members invited by its owner.
        </p>
      </div>
    </main>
  );
}
