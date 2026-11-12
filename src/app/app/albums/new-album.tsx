"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function NewAlbum() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          await apiFetch("/api/albums", { body: { name } });
          setName("");
          router.refresh();
        } catch (e) {
          setErr((e as Error).message);
        }
      }}
    >
      <input className="field !w-48" placeholder="New album name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="New album name" />
      <button className="btn btn-dark" disabled={!name.trim()}>Create</button>
      {err && <span role="alert" className="self-center text-sm text-red-700">{err}</span>}
    </form>
  );
}
