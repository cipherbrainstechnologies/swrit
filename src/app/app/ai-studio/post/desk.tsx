"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaThumb, type ThumbMedia } from "@/components/media-thumb";
import { analyzeLibrary, EDIT_PATTERNS, POST_PLATFORMS, type LibraryShot } from "@/studio/post-cut";

type Item = ThumbMedia & { filename: string; caption: string | null; durationMs: number | null };

const DEFAULT_PATTERNS = ["caption-bottom", "bookend", "local-picture", "hero-open", "motion-keep", "highlight-window"];

export function PostDesk() {
  const router = useRouter();
  const [theme, setTheme] = useState("");
  const [hook, setHook] = useState("");
  const [platform, setPlatform] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>("0");
  const [picked, setPicked] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>(DEFAULT_PATTERNS);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = picked.map((id) => items.find((item) => item.id === id)).filter((item): item is Item => Boolean(item));
  const analysis = useMemo(() => {
    const shots: LibraryShot[] = selected.map((item) => ({
      mediaId: item.id,
      kind: item.kind === "video" ? "video" : "image",
      durationMs: item.durationMs,
      caption: item.caption,
    }));
    return shots.length ? analyzeLibrary(shots) : null;
  }, [selected]);

  async function loadMore() {
    if (!cursor) return;
    const response = await fetch(`/api/media?limit=60&cursor=${cursor}`);
    const body = await response.json();
    setItems((current) => [...current, ...(body.items ?? [])]);
    setCursor(body.nextCursor);
  }

  function toggle(id: string) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((row) => row !== id);
      if (current.length >= 12) return current;
      return [...current, id];
    });
  }

  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/studio/post-cut", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        hook,
        theme,
        platform,
        mediaIds: picked,
        patternIds: patterns,
        captions: selected.map((item) => ({ mediaId: item.id, text: captions[item.id] ?? item.caption ?? "" })),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.message || "The cut was not created.");
      return;
    }
    router.push(`/app/ai-studio/${body.id}`);
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
        <span className="text-sm font-medium text-ink">Theme</span>
        <input className="field" value={theme} onChange={(event) => setTheme(event.target.value)} placeholder="What this set is about, in your words" required />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink">Hook on screen</span>
        <input className="field" value={hook} maxLength={80} onChange={(event) => setHook(event.target.value)} placeholder="The opening line you want people to read" required />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Platform</legend>
        <div className="flex flex-wrap gap-2">
          {POST_PLATFORMS.map((row) => (
            <label key={row.id} className={`rounded-full border px-3 py-2 text-sm ${platform === row.id ? "border-gold text-ink" : "border-ivory-2 text-slate"}`}>
              <input className="sr-only" type="radio" name="platform" value={row.id} checked={platform === row.id} onChange={() => setPlatform(row.id)} required />
              {row.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-3">
        <button type="button" className="btn btn-dark" onClick={() => void loadMore()}>{items.length ? "Load more" : "Choose from the library"}</button>
        {picked.length > 0 ? <p className="text-sm text-slate">{picked.length} selected. Twelve is the maximum for one post.</p> : null}
        {items.length > 0 ? (
          <ul className="grid max-h-[28rem] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5">
            {items.filter((item) => item.kind === "image" || item.kind === "video").map((item) => (
              <li key={item.id}>
                <button type="button" className={`block w-full rounded-xl border p-1 ${picked.includes(item.id) ? "border-gold" : "border-transparent"}`} onClick={() => toggle(item.id)}>
                  <MediaThumb m={item} label={item.filename} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {analysis ? (
        <section className="rounded-2xl bg-ivory-2 p-4 text-sm text-ink">
          <p>{analysis.images} photographs, {analysis.videos} videos, {analysis.captioned} already captioned.</p>
          <p className="mt-1 text-slate">{analysis.engine.reason}</p>
        </section>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Edit patterns</legend>
        <p className="text-sm text-slate">Ten public edit structures. Instagram does not publish a list of the current top videos, and other people’s films are not downloaded.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {EDIT_PATTERNS.map((pattern) => (
            <li key={pattern.id}>
              <label className="flex gap-2 rounded-xl border border-ivory-2 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={patterns.includes(pattern.id)}
                  onChange={(event) => setPatterns((current) => event.target.checked ? [...current, pattern.id] : current.filter((id) => id !== pattern.id))}
                />
                <span>
                  <span className="block text-ink">{pattern.title}</span>
                  <span className="text-slate">{pattern.edit}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {selected.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Captions you write</legend>
          {selected.map((item, index) => (
            <label key={item.id} className="block text-sm text-slate">
              Shot {index + 1} · {item.kind}
              <input
                className="field mt-1"
                maxLength={120}
                value={captions[item.id] ?? item.caption ?? ""}
                onChange={(event) => setCaptions((current) => ({ ...current, [item.id]: event.target.value }))}
                placeholder="Leave blank if this shot should have no words"
              />
            </label>
          ))}
        </fieldset>
      ) : null}
      {error ? <p className="text-sm text-gold-deep">{error}</p> : null}
      <button className="btn btn-gold" type="submit" disabled={busy || !platform || picked.length < 1}>Create the cut</button>
    </form>
  );
}
