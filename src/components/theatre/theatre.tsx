"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilmPlan, Scene } from "@/film/plan";
import { FINALE_LABEL, INSTRUMENTAL_LABEL } from "@/film/melody";
import { ScorePlayer } from "./audio";

export type TheatreProps = {
  title: string;
  plan: FilmPlan;
  audio: { mediaId: string; durationMs: number | null; rightsConfirmed: boolean } | null;
  backHref: string;
  childName: string;
};

function sceneAt(scenes: Scene[], t: number): number {
  for (let i = scenes.length - 1; i >= 0; i--) if (t >= scenes[i].start) return i;
  return 0;
}

const FADE = 0.9;

/** Fetch a private image once (through the auth redirect) and keep it as a blob URL. */
function usePrivateImages(ids: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const inflight = useRef(new Set<string>());
  const load = useCallback(async (id: string) => {
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`/api/media/${id}/access?v=display`, { credentials: "same-origin" });
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.src = url;
        await img.decode().catch(() => {});
        setUrls((u) => ({ ...u, [id]: url }));
        return;
      } catch {
        await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
      }
    }
  }, []);
  useEffect(() => () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u)), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { urls, load, ids };
}

export function Theatre({ title, plan, audio, backHref, childName }: TheatreProps) {
  const scenes = plan.scenes;
  const total = plan.totalSeconds;
  const rootRef = useRef<HTMLDivElement>(null);
  const songRef = useRef<HTMLAudioElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [reduced, setReduced] = useState(false);
  const clock = useRef({ base: 0, at: 0 });
  const score = useRef<ScorePlayer | null>(null);
  const useSong = !!audio;

  const imageIds = useMemo(() => {
    const ids: string[] = [];
    for (const s of scenes) {
      if (s.type === "photo") ids.push(s.mediaId);
      if ((s.type === "opening" || s.type === "closing") && s.coverMediaId) ids.push(s.coverMediaId);
    }
    return [...new Set(ids)];
  }, [scenes]);
  const { urls, load } = usePrivateImages(imageIds);

  const idx = sceneAt(scenes, t);
  const scene = scenes[idx];

  // Preload the current and next few scenes; warm the first ones before play.
  useEffect(() => {
    const upcoming = scenes.slice(idx, idx + 6);
    for (const s of upcoming) {
      if (s.type === "photo") void load(s.mediaId);
      if ((s.type === "opening" || s.type === "closing") && s.coverMediaId) void load(s.coverMediaId);
    }
    const closing = scenes[scenes.length - 1];
    if (closing.type === "closing" && closing.coverMediaId) void load(closing.coverMediaId);
  }, [idx, scenes, load]);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    score.current = new ScorePlayer(total, plan.finaleStartSeconds, useSong);
    return () => score.current?.stop();
  }, [total, plan.finaleStartSeconds, useSong]);

  const now = () => (playing ? clock.current.base + (performance.now() - clock.current.at) / 1000 : clock.current.base);

  const syncSong = useCallback(
    (time: number, play: boolean) => {
      const el = songRef.current;
      if (!el) return;
      if (play && time >= plan.finaleStartSeconds) {
        const target = time - plan.finaleStartSeconds;
        if (Math.abs(el.currentTime - target) > 0.4) el.currentTime = target;
        if (el.paused) void el.play().catch(() => {});
      } else if (!el.paused) el.pause();
      if (time < plan.finaleStartSeconds) el.currentTime = 0;
    },
    [plan.finaleStartSeconds],
  );

  const play = useCallback(
    (from?: number) => {
      const start = Math.min(Math.max(0, from ?? clock.current.base), total);
      clock.current = { base: start >= total ? 0 : start, at: performance.now() };
      setT(clock.current.base);
      setPlaying(true);
      score.current?.start(clock.current.base);
      syncSong(clock.current.base, true);
    },
    [total, syncSong],
  );

  const pause = useCallback(() => {
    clock.current = { base: now(), at: performance.now() };
    setPlaying(false);
    score.current?.stop();
    songRef.current?.pause();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = useCallback(
    (to: number) => {
      const target = Math.min(Math.max(0, to), total - 0.01);
      clock.current = { base: target, at: performance.now() };
      setT(target);
      if (playing) {
        score.current?.start(target);
        syncSong(target, true);
      } else syncSong(target, false);
    },
    [playing, total, syncSong],
  );

  // Animation clock.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const cur = clock.current.base + (performance.now() - clock.current.at) / 1000;
      if (cur >= total) {
        clock.current = { base: total, at: performance.now() };
        setT(total);
        setPlaying(false);
        score.current?.stop();
        return;
      }
      setT(cur);
      if (useSong) syncSong(cur, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, useSong, syncSong]);

  useEffect(() => {
    score.current?.setVolume(volume, muted);
    if (songRef.current) {
      songRef.current.volume = volume;
      songRef.current.muted = muted;
    }
  }, [volume, muted]);

  // Auto-hide controls while playing.
  useEffect(() => {
    if (!playing) return setChrome(true);
    let timer = setTimeout(() => setChrome(false), 2800);
    const wake = () => {
      setChrome(true);
      clearTimeout(timer);
      timer = setTimeout(() => setChrome(false), 2800);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, [playing]);

  const fullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen({ navigationUI: "hide" });
    } catch {
      /* iOS Safari: fullscreen for non-video elements is unsupported; the layout already fills the screen */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (playing) pause();
        else play();
      } else if (e.key === "ArrowRight") seek(scenes[Math.min(idx + 1, scenes.length - 1)].start);
      else if (e.key === "ArrowLeft") seek(scenes[Math.max(idx - 1, 0)].start);
      else if (e.key === "f") void fullscreen();
      else if (e.key === "m") setMuted((m) => !m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, playing, pause, play, seek, idx, scenes, fullscreen]);

  const begin = async () => {
    setStarted(true);
    await fullscreen();
    play(0);
  };

  const ready = imageIds.slice(0, 4).every((id) => urls[id]) || imageIds.length === 0;
  const local = t - scene.start;
  const progress = Math.min(1, local / scene.duration);
  const musicLabel = useSong
    ? `${INSTRUMENTAL_LABEL}; finale: your uploaded song${audio?.rightsConfirmed ? "" : " (rights not yet confirmed)"}`
    : `${INSTRUMENTAL_LABEL}; finale: ${FINALE_LABEL}`;

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-50 overflow-hidden bg-black text-ivory select-none ${playing && !chrome ? "cursor-none" : ""}`}
      data-testid="theatre"
      data-scene={scene.type}
    >
      {useSong && <audio ref={songRef} src={`/api/media/${audio!.mediaId}/access?v=playback`} preload="auto" />}

      {/* Stage: render previous + current scene so crossfades never show black gaps. */}
      {[idx - 1, idx].map((i) => {
        if (i < 0) return null;
        const s = scenes[i];
        const isCur = i === idx;
        const opacity = isCur ? (i === 0 ? Math.min(1, local / 1.2 + 0.0001) : Math.min(1, local / FADE)) : 1;
        return (
          <SceneView
            key={`${i}-${s.type}`}
            scene={s}
            url={s.type === "photo" ? urls[s.mediaId] : s.type === "opening" || s.type === "closing" ? (s.coverMediaId ? urls[s.coverMediaId] : undefined) : undefined}
            progress={isCur ? progress : 1}
            opacity={started ? opacity : 0}
            reduced={reduced}
            z={isCur ? 2 : 1}
            childName={childName}
          />
        );
      })}

      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-midnight px-6 text-center">
          <p className="eyebrow text-gold">Birthday Theatre</p>
          <h1 className="font-display text-5xl sm:text-7xl">{title}</h1>
          <button
            className="btn btn-gold !min-h-16 !px-10 text-lg"
            onClick={begin}
            data-testid="theatre-play"
            aria-label={`Play ${childName}’s 5th Birthday`}
          >
            ▶ Play {childName}’s 5th Birthday
          </button>
          <p className="max-w-md text-xs text-slate-light">
            {plan.photoCount} photos · {Math.floor(total / 60)} min {Math.round(total % 60)} s.{" "}
            {ready ? "Ready." : "Loading the first photos…"} Tap once to start sound (browsers require it). For a big TV, the downloaded MP4
            on a USB stick is the most reliable option.
          </p>
          {plan.photoCount === 0 && (
            <p className="max-w-md rounded-lg bg-white/5 p-3 text-sm text-ivory/80">
              No dated photos are ready yet. Upload memories and confirm their dates to fill the film.
            </p>
          )}
          <Link href={backHref} className="text-sm text-slate-light underline-offset-4 hover:underline">
            Back to the archive
          </Link>
        </div>
      )}

      {started && (
        <div className={`absolute inset-x-0 bottom-0 z-30 transition-opacity duration-500 ${chrome ? "opacity-100" : "opacity-0"}`}>
          <div className="bg-gradient-to-t from-black/85 to-transparent px-4 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
            <input
              type="range"
              min={0}
              max={total}
              step={0.1}
              value={t}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Film position"
              className="w-full accent-[#DDBB78]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="btn btn-gold !min-h-11 !px-5" onClick={() => (playing ? pause() : play())} data-testid="theatre-toggle">
                {playing ? "❚❚ Pause" : t >= total ? "↺ Play again" : "▶ Play"}
              </button>
              <button className="btn btn-ghost !min-h-11 !px-4" onClick={() => seek(scenes[Math.max(idx - 1, 0)].start)} aria-label="Previous">
                ⏮
              </button>
              <button className="btn btn-ghost !min-h-11 !px-4" onClick={() => seek(scenes[Math.min(idx + 1, scenes.length - 1)].start)} aria-label="Next">
                ⏭
              </button>
              <button className="btn btn-ghost !min-h-11 !px-4" onClick={() => setMuted((m) => !m)} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? "🔇" : "🔊"}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label="Volume"
                className="w-24 accent-[#DDBB78]"
              />
              <span className="ml-auto text-xs tabular-nums text-ivory/70">
                {Math.floor(t / 60)}:{String(Math.floor(t % 60)).padStart(2, "0")} / {Math.floor(total / 60)}:{String(Math.floor(total % 60)).padStart(2, "0")}
              </span>
              <button className="btn btn-ghost !min-h-11 !px-4" onClick={() => void fullscreen()} aria-label="Toggle fullscreen">
                ⛶
              </button>
              <Link href={backHref} className="btn btn-ghost !min-h-11 !px-4" onClick={() => score.current?.stop()}>
                Exit
              </Link>
            </div>
            <p className="mt-2 text-[11px] text-ivory/50">Music: {musicLabel}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SceneView({
  scene,
  url,
  progress,
  opacity,
  reduced,
  z,
  childName,
}: {
  scene: Scene;
  url?: string;
  progress: number;
  opacity: number;
  reduced: boolean;
  z: number;
  childName: string;
}) {
  void childName;
  const style: React.CSSProperties = { opacity, zIndex: z };
  if (scene.type === "chapter") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-midnight px-8 text-center" style={style}>
        <span className="mb-5 h-px w-16 bg-gold" />
        <h2 className="font-display text-5xl sm:text-7xl">{scene.chapter.title}</h2>
        <p className="eyebrow mt-4 text-gold">{scene.chapter.subtitle}</p>
      </div>
    );
  }
  if (scene.type === "opening" || scene.type === "closing") {
    const [l1, l2, ...rest] = scene.lines;
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-midnight" style={style} data-testid={`banner-${scene.type}`}>
        {url && (
          <img
            src={url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-35 blur-[1px]"
            style={reduced ? undefined : { transform: `scale(${1.04 + progress * 0.06})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-midnight/40 via-midnight/50 to-midnight/80" />
        <div className="relative px-[6vw] text-center">
          <p className={scene.type === "opening" ? "eyebrow text-gold !text-[clamp(0.8rem,1.6vw,1.2rem)]" : "font-display text-[clamp(2.4rem,7vw,6.5rem)] leading-none text-gold"}>
            {l1}
          </p>
          <p
            className={
              scene.type === "opening"
                ? "font-display mt-4 text-[clamp(2.6rem,8vw,7rem)] leading-none"
                : "font-display mt-3 text-[clamp(1.8rem,5vw,4.5rem)] tracking-wide"
            }
          >
            {l2}
          </p>
          {rest.map((r, i) => (
            <p key={i} className={`mt-4 text-[clamp(1rem,2.2vw,1.8rem)] ${i === rest.length - 1 && scene.type === "closing" ? "font-display italic text-gold/90" : "text-ivory/85"}`}>
              {r}
            </p>
          ))}
        </div>
      </div>
    );
  }
  // Photo: blurred fill behind, the whole photo in front (never stretched or cropped through faces).
  const amount = reduced ? 0 : 0.06 * progress;
  const transform =
    scene.motion === "in"
      ? `scale(${1 + amount})`
      : scene.motion === "out"
        ? `scale(${1.06 - amount})`
        : scene.motion === "left"
          ? `scale(1.04) translateX(${reduced ? 0 : (0.5 - progress) * 1.6}%)`
          : `scale(1.04) translateX(${reduced ? 0 : (progress - 0.5) * 1.6}%)`;
  return (
    <div className="absolute inset-0 bg-black" style={style} data-testid="photo-scene">
      {url ? (
        <>
          <img src={url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
          <img src={url} alt={scene.caption ?? ""} className="absolute inset-0 h-full w-full object-contain will-change-transform" style={{ transform }} />
        </>
      ) : (
        <div className="absolute inset-0 animate-pulse bg-midnight" />
      )}
      {scene.caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-[7vw] pt-24 pb-[8vh]">
          <p className="font-display mx-auto max-w-5xl text-center text-[clamp(1.4rem,3.4vw,3rem)] leading-snug text-ivory drop-shadow">
            {scene.caption}
          </p>
        </div>
      )}
    </div>
  );
}
