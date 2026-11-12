"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Version = { id: string; version: number; status: string; sourceName: string; description: string | null };
type Skill = { id: string; title: string; description: string | null; enabled: boolean; versions: Version[] };
type Project = { id: string; title: string; status: string; phase: string | null; durationTargetSeconds: number; hasRender: boolean };

export function CinemaStudio({ skills, projects }: { skills: Skill[]; projects: Project[] }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/cinema/skills", { method: "POST", body });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.errors?.map((issue: { message: string }) => issue.message).join(" ") || data.message || "The skill was rejected.");
      return;
    }
    setMessage(data.notice || "Skill saved as a draft. Approve it before turning it on.");
    router.refresh();
  }

  async function bundle() {
    setBusy(true);
    const body = new FormData();
    body.set("bundle", "father-and-son");
    const res = await fetch("/api/cinema/skills", { method: "POST", body });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.message || "Could not install the bundled skill.");
    else {
      setMessage("Father and Son is installed as a draft. Approve it, then turn it on.");
      router.refresh();
    }
  }

  async function act(id: string, action: string) {
    setError(null);
    const res = await fetch(`/api/cinema/skills/${id}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: action === "delete" ? undefined : { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.message || "That action failed.");
    else router.refresh();
  }

  async function createProject(form: FormData) {
    setError(null);
    const res = await fetch("/api/cinema/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId: form.get("skillId"), targetSeconds: Number(form.get("minutes")) * 60 }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || "Could not plan the film.");
      return;
    }
    router.push(`/app/cinema/${data.projectId}`);
  }

  const enabledSkills = skills.filter((skill) => skill.enabled);

  return (
    <div className="space-y-10">
      {message ? <p className="card border-gold/40 bg-ivory-2 px-4 py-3 text-sm text-ink">{message}</p> : null}
      {error ? <p className="card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <section className="card space-y-4 p-4 sm:p-6">
        <h2 className="font-display text-3xl text-ink">Skills</h2>
        <p className="max-w-2xl text-sm text-slate">
          A skill is a description of the film, not a program. Uploaded files are checked and stored. They are not run. Approve a draft before it can be used.
        </p>
        <div className="flex flex-wrap gap-3">
          <label className="btn btn-dark cursor-pointer">
            Upload skill
            <input
              className="sr-only"
              type="file"
              accept=".json,.md,.zip,application/json,text/markdown,application/zip"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void bundle()}>
            Install Father and Son
          </button>
        </div>
        <ul className="space-y-3">
          {skills.map((skill) => (
            <li key={skill.id} className="rounded-2xl border border-ivory-2 bg-white/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg text-ink">{skill.title}</h3>
                  <p className="mt-1 max-w-xl text-sm text-slate">{skill.description}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-gold-deep">{skill.enabled ? "On" : "Off"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-ghost !min-h-9 text-xs" type="button" onClick={() => void act(skill.id, "approve")}>Approve</button>
                  <button className="btn btn-ghost !min-h-9 text-xs" type="button" onClick={() => void act(skill.id, skill.enabled ? "disable" : "enable")}>{skill.enabled ? "Disable" : "Enable"}</button>
                  <button className="btn btn-ghost !min-h-9 text-xs" type="button" onClick={() => void act(skill.id, "duplicate")}>Duplicate</button>
                  <button className="btn btn-ghost !min-h-9 text-xs" type="button" onClick={() => void act(skill.id, "delete")}>Delete</button>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate">
                {skill.versions.map((version) => (
                  <li key={version.id}>v{version.version} · {version.status} · {version.sourceName}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-4 p-4 sm:p-6">
        <h2 className="font-display text-3xl text-ink">New film</h2>
        <form className="grid gap-3 sm:grid-cols-3" action={(form) => void createProject(form)}>
          <label className="text-sm font-medium text-ink">
            Skill
            <select name="skillId" className="field mt-1" required disabled={!enabledSkills.length}>
              {enabledSkills.length === 0 ? <option value="">Turn on a skill first</option> : null}
              {enabledSkills.map((skill) => (
                <option key={skill.id} value={skill.id}>{skill.title}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-ink">
            Length
            <select name="minutes" className="field mt-1" defaultValue="5">
              <option value="1">1 minute</option>
              <option value="3">3 minutes</option>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
            </select>
          </label>
          <button className="btn btn-gold self-end" type="submit" disabled={!enabledSkills.length}>Plan film</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-3xl text-ink">Cinema library</h2>
        <p className="text-sm text-slate">Open a film to edit shots, watch render progress, and download the MP4 when it is ready.</p>
        <ul className="space-y-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link className="card block px-4 py-3 transition hover:border-gold" href={`/app/cinema/${project.id}`}>
                <span className="text-ink">{project.title}</span>
                <span className="mt-1 block text-sm text-slate">{project.phase || project.status} · {Math.round(project.durationTargetSeconds / 60)} min{project.hasRender ? " · MP4 ready" : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
