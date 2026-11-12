import { env } from "@/server/env";
import { Uploader } from "./uploader";
import { ImportPanel } from "./import-panel";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  const maxMb = env().MAX_UPLOAD_MB;
  return (
    <div className="space-y-10 py-8">
      <header>
        <p className="eyebrow text-slate">Memory Vault</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Add memories</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Choose photos and videos straight from your phone’s gallery. Originals are stored privately, exactly as they are. Files up to{" "}
          {maxMb >= 1024 ? `${(maxMb / 1024).toFixed(maxMb % 1024 ? 1 : 0)} GB` : `${maxMb} MB`} each.
        </p>
      </header>
      <Uploader />
      <ImportPanel />
    </div>
  );
}
