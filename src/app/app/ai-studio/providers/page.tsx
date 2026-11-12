import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { declaredProviders, OPENMONTAGE_COMMIT } from "@/studio/catalog";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  await requirePageOwner();
  const providers = declaredProviders();
  return (
    <div className="space-y-6 py-8">
      <Link href="/app/ai-studio" className="text-sm text-gold">AI Studio</Link>
      <header>
        <h1 className="font-display text-4xl">Providers</h1>
        <p className="mt-2 max-w-2xl text-slate">
          These names are declared in OpenMontage {OPENMONTAGE_COMMIT.slice(0, 10)}. None of them is called. The spend cap is 0. Private photographs are not sent out. Pixabay music stays a link you open yourself: https://pixabay.com/music/
        </p>
      </header>
      <ul className="space-y-2">
        {providers.map((provider) => (
          <li key={provider.provider} className="rounded-2xl border border-white/10 px-4 py-3 text-sm">
            <span className="text-ivory">{provider.provider}</span>
            <span className="mt-1 block text-slate">{provider.local ? "Local tool" : "External tool, not configured"} · {provider.capabilities.slice(0, 4).join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
