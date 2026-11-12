"use client";

import { useState, type FormEvent } from "react";

export function SkillForm() {
  const [notice, setNotice] = useState("");
  const [body, setBody] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/studio/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceName: "upload", markdown: body.trim().startsWith("#") || body.includes("```"), body }),
    });
    const payload = await response.json().catch(() => ({}));
    setNotice(response.ok ? payload.notice : payload.message || "The skill was rejected.");
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <textarea className="field min-h-48" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Paste a .skill.json object or a SKILL.md file" />
      <button className="btn btn-gold" type="submit">Check and save draft</button>
      {notice ? <p className="text-sm text-slate">{notice}</p> : null}
    </form>
  );
}
