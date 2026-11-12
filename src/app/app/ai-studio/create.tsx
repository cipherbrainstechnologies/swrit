"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MediaThumb, type ThumbMedia } from "@/components/media-thumb";
import type { VideoRecipeOption } from "@/studio/catalog";

type Pipeline = { name: string; description: string; sourceLed: boolean };
type Profile = { name: string; width: number; height: number };

const examples = [
  "Create a 90-second cinematic montage from the videos I select.",
  "Turn the selected trip photographs into a landscape film.",
  "Create a vertical reel from the selected videos.",
  "Create a family film with the captions already written on the pictures.",
];

type LibraryItem = ThumbMedia & { filename: string; caption: string | null };

export function CreateProduction({
  pipelines,
  profiles,
  recipes,
}: {
  pipelines: Pipeline[];
  profiles: Profile[];
  recipes: VideoRecipeOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("Untitled production");
  const [prompt, setPrompt] = useState(examples[0]);
  const [pipeline, setPipeline] = useState("cinematic");
  const [profile, setProfile] = useState("youtube_landscape");
  const [recipeId, setRecipeId] = useState("");
  const [allReady, setAllReady] = useState(false);
  const [acknowledgeLarge, setAcknowledgeLarge] = useState(false);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>("0");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const templateRecipes = recipes.filter((row) => row.kind === "template");
  const skillRecipes = recipes.filter((row) => row.kind === "skill");

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

  function applyRecipe(id: string) {
    setRecipeId(id);
    const recipe = recipes.find((row) => row.id === id);
    if (!recipe) return;
    setPipeline(recipe.pipeline);
    setProfile(recipe.profile);
    setPrompt(recipe.prompt);
    if (recipe.kind === "template") setTitle(recipe.title);
  }

  return (
    <form
      className="card space-y-5 p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink">Title</span>
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink">Direction</span>
        <textarea className="field min-h-32" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <button key={example} type="button" className="rounded-full border border-ivory-2 bg-white/70 px-3 py-2 text-left text-xs text-slate hover:border-gold" onClick={() => setPrompt(example)}>
            {example}
          </button>
        ))}
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink">Recipe</span>
        <select className="field" value={recipeId} onChange={(event) => applyRecipe(event.target.value)}>
          <option value="">Choose a starting point</option>
          {templateRecipes.length > 0 ? (
            <optgroup label="Family recipes">
              {templateRecipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.title}
                </option>
              ))}
            </optgroup>
          ) : null}
          {skillRecipes.length > 0 ? (
            <optgroup label="OpenMontage skills (pinned checkout)">
              {skillRecipes.map((recipe) => (
                <option key={recipe.id} value={recipe.id}>
                  {recipe.title}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <p className="text-xs text-slate">Skills are read from the pinned OpenMontage commit. They guide the proposal; paid providers are not called.</p>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">Pipeline</span>
          <select className="field" value={pipeline} onChange={(event) => setPipeline(event.target.value)}>
            {pipelines.map((item) => (
              <option key={item.name} value={item.name} disabled={!item.sourceLed}>
                {item.name}
                {item.sourceLed ? "" : " — provider required"}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">Output profile</span>
          <select className="field" value={profile} onChange={(event) => setProfile(event.target.value)}>
            {profiles.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} · {item.width}×{item.height}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-slate">{pipelines.find((item) => item.name === pipeline)?.description}</p>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-dark"
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
          {picked.length > 0 ? <span className="text-sm text-slate">{picked.length} selected</span> : null}
        </div>
        {items.length > 0 ? (
          <ul className="grid max-h-[28rem] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
            {items.map((item) => {
              const selected = picked.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`block w-full rounded-xl ${selected ? "ring-4 ring-gold" : ""}`}
                    aria-pressed={selected}
                    aria-label={item.caption || item.filename}
                    onClick={() =>
                      setPicked((current) =>
                        selected ? current.filter((id) => id !== item.id) : [...current, item.id],
                      )
                    }
                  >
                    <MediaThumb m={item} label={item.caption || item.filename} />
                    <p className="mt-1 truncate px-0.5 text-[11px] text-slate">{item.caption || item.filename}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate">Load the library to preview photographs and videos before you select them.</p>
        )}
      </div>
      <label className="flex items-start gap-3 text-sm text-ink">
        <input type="checkbox" checked={allReady} onChange={(event) => setAllReady(event.target.checked)} />
        <span>Use every ready photograph and video in the library. Duplicates stay in the library and are left out of the cut.</span>
      </label>
      <label className="flex items-start gap-3 text-sm text-ink">
        <input type="checkbox" checked={acknowledgeLarge} onChange={(event) => setAcknowledgeLarge(event.target.checked)} />
        <span>I understand a large selection is kept in full and will take longer to render.</span>
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink">Reference link, optional</span>
        <input className="field" value={referenceUrl} placeholder="https://" onChange={(event) => setReferenceUrl(event.target.value)} />
        <p className="text-xs text-slate">Stored for context only. Not downloaded.</p>
      </label>
      <p className="text-sm text-slate">
        Music can be chosen from files already in the library, or downloaded by you from{" "}
        <a className="text-gold-deep underline" href="https://pixabay.com/music/" target="_blank" rel="noreferrer">
          Pixabay Music
        </a>{" "}
        and then uploaded. The studio does not fetch it.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button className="btn btn-gold" type="submit" disabled={busy}>
        {busy ? "Planning…" : "Create proposal"}
      </button>
    </form>
  );
}
