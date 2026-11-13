import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { PostDesk } from "./desk";

export const dynamic = "force-dynamic";

export default async function PostCutPage() {
  await requirePageOwner();
  return (
    <div className="space-y-6 py-8">
      <Link href="/app/ai-studio" className="text-sm text-gold-deep hover:underline">← AI Studio</Link>
      <header>
        <p className="eyebrow text-slate">Ready to post</p>
        <h1 className="font-display mt-2 text-4xl">A vertical cut from your uploads</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Choose the platform first. The cut uses the photographs and videos you select, the hook you write, and ten public edit patterns.
          MoneyPrinterTurbo is not asked to replace your pictures with stock. Short Video Maker is not asked to invent a voiceover.
          AutoClip’s highlight window is applied here to long videos you already uploaded.
        </p>
      </header>
      <PostDesk />
    </div>
  );
}
