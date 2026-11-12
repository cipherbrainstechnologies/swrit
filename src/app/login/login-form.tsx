"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, rememberMe: true }),
      });
      if (r.ok) {
        window.location.assign("/app");
        return;
      }
      // Generic message: never reveal whether the email exists.
      setError(r.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : "That email and password don’t match.");
    } catch {
      setError("Couldn’t reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 space-y-4" noValidate>
      <label className="block">
        <span className="mb-1.5 block text-xs tracking-wide text-slate-light">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-ivory placeholder-slate-light outline-none focus:border-gold"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs tracking-wide text-slate-light">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-ivory outline-none focus:border-gold"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || !email || !password} className="btn btn-gold w-full">
        {busy ? "Opening…" : "Open the archive"}
      </button>
    </form>
  );
}
