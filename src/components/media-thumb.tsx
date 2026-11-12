import Link from "next/link";

export type ThumbMedia = {
  id: string;
  kind: string;
  status: string;
  favorite: boolean;
  dateNeedsReview: boolean;
  durationMs: number | null;
  isLegacyFilm?: boolean;
};

export function mediaUrl(id: string, v: "thumb" | "display" | "poster" | "original" | "playback" = "display") {
  return `/api/media/${id}/access?v=${v}`;
}

function duration(ms: number | null) {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MediaThumb({ m, href, label }: { m: ThumbMedia; href?: string; label?: string }) {
  const body = (
    <div className="group relative aspect-square overflow-hidden rounded-xl bg-ivory-2">
      {m.status === "processing" ? (
        <div className="flex h-full items-center justify-center text-xs text-slate">Preparing…</div>
      ) : m.status === "preview_unavailable" || m.status === "failed" ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-slate">
          <span>Original saved</span>
          <span className="text-[10px]">Preview unavailable</span>
        </div>
      ) : (
        <img
          src={mediaUrl(m.id, "thumb")}
          alt={label ?? ""}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-1.5">
        <span className="flex gap-1">
          {m.favorite && <span className="rounded-full bg-midnight/70 px-1.5 text-[11px] text-gold" aria-label="Favourite">★</span>}
          {m.status === "duplicate" && <span className="rounded-full bg-amber-100/90 px-1.5 text-[10px] text-amber-900">Duplicate</span>}
        </span>
        {m.dateNeedsReview && <span className="rounded-full bg-ivory/90 px-1.5 text-[10px] text-ink" title="Date needs checking">Date?</span>}
      </div>
      {m.kind === "video" && (
        <span className="absolute right-1.5 bottom-1.5 rounded-full bg-midnight/75 px-2 py-0.5 text-[11px] text-ivory">
          ▶ {duration(m.durationMs)}
        </span>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block" aria-label={label ?? "Open memory"}>
      {body}
    </Link>
  ) : (
    body
  );
}
