"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function ProfileForm({
  child,
}: {
  child: { fullName: string; preferredName: string; birthDate: string; birthDateConfirmed: boolean };
}) {
  const router = useRouter();
  const [f, setF] = useState(child);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="card grid gap-4 p-6 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          await apiFetch("/api/settings", { method: "PATCH", body: f });
          setMsg("Saved.");
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    >
      <h2 className="font-display text-2xl sm:col-span-2">His profile</h2>
      <label className="block text-sm">
        Full name
        <input className="field mt-1" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} maxLength={120} />
      </label>
      <label className="block text-sm">
        Called
        <input className="field mt-1" value={f.preferredName} onChange={(e) => setF({ ...f, preferredName: e.target.value })} maxLength={60} />
      </label>
      <label className="block text-sm">
        Date of birth
        <input type="date" className="field mt-1" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value, birthDateConfirmed: false })} />
      </label>
      <label className="flex items-center gap-3 self-end pb-2 text-sm">
        <input
          type="checkbox"
          className="h-5 w-5 accent-[#B8954F]"
          checked={f.birthDateConfirmed}
          onChange={(e) => setF({ ...f, birthDateConfirmed: e.target.checked })}
        />
        This birth date is correct
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn btn-dark">Save profile</button>
        {msg && <span role="status" className="text-sm text-slate">{msg}</span>}
      </div>
    </form>
  );
}

async function authPost(path: string, body: unknown) {
  const r = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = (await r.json().catch(() => ({}))) as { message?: string };
  if (!r.ok) throw new Error(d.message ?? `Request failed (${r.status})`);
  return d;
}

export function SecurityPanel({ email, sessions }: { email: string; sessions: { id: string; createdAt: string; device: string }[] }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="card space-y-6 p-6">
      <h2 className="font-display text-2xl">Security</h2>
      <p className="text-sm text-slate">Signed in as {email}.</p>
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await authPost("/change-password", { currentPassword: current, newPassword: next, revokeOtherSessions: true });
            setCurrent("");
            setNext("");
            setMsg("Password changed. Other devices were signed out.");
          } catch (err) {
            setMsg((err as Error).message);
          }
        }}
      >
        <input type="password" autoComplete="current-password" className="field" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Current password" />
        <input type="password" autoComplete="new-password" minLength={12} className="field" placeholder="New password (12+ characters)" value={next} onChange={(e) => setNext(e.target.value)} aria-label="New password" />
        <button className="btn btn-dark" disabled={!current || next.length < 12}>Change password</button>
      </form>
      <div>
        <h3 className="text-sm font-semibold">Signed-in devices</h3>
        <ul className="mt-2 divide-y divide-ivory-2 text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="py-2 text-slate">
              {s.device} · since {s.createdAt}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn btn-ghost"
            onClick={async () => {
              if (!confirm("Sign out of every device, including this one?")) return;
              try {
                await authPost("/revoke-sessions", {});
              } finally {
                window.location.assign("/login");
              }
            }}
          >
            Sign out everywhere (lost phone)
          </button>
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await authPost("/sign-out", {}).catch(() => {});
              window.location.assign("/login");
            }}
            data-testid="sign-out"
          >
            Sign out
          </button>
        </div>
      </div>
      {msg && <p role="status" className="text-sm text-slate">{msg}</p>}
    </section>
  );
}
