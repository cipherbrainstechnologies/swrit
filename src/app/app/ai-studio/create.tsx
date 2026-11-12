"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Pipeline = { name: string; description: string; sourceLed: boolean };
type Profile = { name: string; width: number; height: number };
type Template = { id: string; title: string; pipeline: string; profile: string; prompt: string };

const examples = [
  "Create a 90-second cinematic montage from the videos I select.",
  "Turn the selected trip photographs into a landscape film.",
  "Create a vertical reel from the selected videos.",
  "Create a family film with the captions already written on the pictures.",
];

export function CreateProduction({ pipelines, profiles, templates }: { pipelines: Pipeline[]; profiles: Profile[]; templates: Template[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("Untitled production");
  const [prompt, setPrompt] = useState(examples[0]);
  const [pipeline, setPipeline] = useState("cinematic");
  const [profile, setProfile] = useState("youtube_landscape");
  const [allReady, setAllReady] = useState(false);
  const [acknowledgeLarge, setAcknowledgeLarge] = useState(false);
  const [items, setItems] = useState<{ id: string; filename: string; kind: string; caption: string | null }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>("0");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/studio/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        prompt,
        pipeline,
        profile,
        allReady,
        acknowledgeLarge,
        mediaIds: allReady ? undefined : picked,
        referenceUrl: referenceUrl || undefined,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.status === 409 && body.error === "large_collection") {
      setError(`${body.message} Tick the confirmation and submit again.`);
      setAcknowledgeLarge(true);
      return;
    }
    if (!response.ok) {
      setError(body.message || "The production could not be created.");
      return;
    }
    router.push(`/app/ai-studio/${body.id}`);
  }

  return (
    <form
      className="space-y-4 rounded-3xl border border-white/10 p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="block space-y-2">
        <span className="text-sm text-slate">Title</span>
        <input className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-3" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm text-slate">Direction</span>
        <textarea className="min-h-32 w-full rounded-xl border border-white/10 bg-transparent px-3 py-3" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <button key={example} type="button" className="rounded-full border border-white/10 px-3 py-2 text-left text-xs text-slate" onClick={() => setPrompt(example)}>
            {example}
          </button>
        ))}
      </div>
      <label className="block space-y-2">
        <span className="text-sm text-slate">Template</span>
        <select
          className="w-full rounded-xl border border-white/10 bg-midnight px-3 py-3"
          defaultValue=""
          onChange={(event) => {
            const template = templates.find((item) => item.id === event.target.value);
            if (!template) return;
            setPipeline(template.pipeline);
            setProfile(template.profile);
            setPrompt(template.prompt);
            setTitle(template.title);
          }}
        >
          <option value="">Choose a starting point</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>{template.title}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm text-slate">Pipeline</span>
          <select className="w-full rounded-xl border border-white/10 bg-midnight px-3 py-3" value={pipeline} onChange={(event) => setPipeline(event.target.value)}>
            {pipelines.map((item) => (
              <option key={item.name} value={item.name} disabled={!item.sourceLed}>{item.name}{item.sourceLed ? "" : " — provider required"}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-sm text-slate">Output profile</span>
          <select className="w-full rounded-xl border border-white/10 bg-midnight px-3 py-3" value={profile} onChange={(event) => setProfile(event.target.value)}>
            {profiles.map((item) => (
              <option key={item.name} value={item.name}>{item.name} · {item.width}×{item.height}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-slate">{pipelines.find((item) => item.name === pipeline)?.description}</p>
      <div className="space-y-2">
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (!cursor) return;
            const response = await fetch(`/api/media?limit=60&cursor=${cursor}`);
            const body = await response.json();
            setItems((current) => [...current, ...(body.items ?? [])]);
            setCursor(body.nextCursor);
          }}
        >
          {items.length ? "Load more" : "Choose from the library"}
        </button>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(item.id)}
                  onChange={(event) => setPicked((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                />
                <span>{item.kind} · {item.caption || item.filename}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={allReady} onChange={(event) => setAllReady(event.target.checked)} />
        <span>Use every ready photograph and video in the library. Duplicates stay in the library and are left out of the cut.</span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={acknowledgeLarge} onChange={(event) => setAcknowledgeLarge(event.target.checked)} />
        <span>I understand a large selection is kept in full and will take longer to render.</span>
      </label>
      <label className="block space-y-2">
        <span className="text-sm text-slate">Reference link, optional. It is stored and not downloaded.</span>
        <input className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-3" value={referenceUrl} placeholder="https://" onChange={(event) => setReferenceUrl(event.target.value)} />
      </label>
      <p className="text-sm text-slate">
        Music can be chosen from files already in the library, or downloaded by you from <a className="text-gold" href="https://pixabay.com/music/" target="_blank" rel="noreferrer">Pixabay Music</a> and then uploaded. The studio does not fetch it.
      </p>
      {error ? <p className="text-sm text-gold">{error}</p> : null}
      <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Planning…" : "Create proposal"}</button>
    </form>
  );
}
