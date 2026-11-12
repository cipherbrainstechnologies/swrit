"use client";

import { defaultScore, instrumentalBed, type Note } from "@/film/melody";

/**
 * Web Audio playback of the generated score. Re-created on every play/seek so that
 * scheduling always matches the visual clock.
 */
export class ScorePlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.8;
  private muted = false;

  constructor(
    private totalSeconds: number,
    private finaleStart: number,
    /** When an uploaded song plays the finale, only the bed is synthesised. */
    private bedOnly: boolean,
  ) {}

  private notes(): Note[] {
    if (this.bedOnly) return instrumentalBed(this.finaleStart).filter((n) => n.time < this.finaleStart);
    return defaultScore(this.totalSeconds, this.finaleStart).notes;
  }

  start(offset: number) {
    this.stop();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    this.master = master;
    const t0 = ctx.currentTime + 0.05;
    for (const n of this.notes()) {
      const end = n.time + n.duration + 0.6;
      if (end < offset) continue;
      const at = Math.max(0, n.time - offset);
      const dur = n.duration - Math.max(0, offset - n.time);
      if (dur <= 0) continue;
      const osc = ctx.createOscillator();
      osc.type = n.voice === "bass" ? "sine" : n.voice === "pad" ? "triangle" : "sine";
      osc.frequency.value = n.freq;
      const g = ctx.createGain();
      const start = t0 + at;
      const attack = n.voice === "pad" ? 0.25 : 0.01;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(n.gain, start + attack);
      if (n.voice === "lead") g.gain.exponentialRampToValueAtTime(Math.max(0.0001, n.gain * 0.25), start + Math.max(attack + 0.05, dur));
      g.gain.linearRampToValueAtTime(0, start + dur + (n.voice === "pad" ? 0.6 : 0.25));
      osc.connect(g).connect(master);
      osc.start(start);
      osc.stop(start + dur + 0.7);
    }
    // Fade the bed out when a recorded song takes over.
    if (this.bedOnly && offset < this.finaleStart) {
      const fadeAt = t0 + (this.finaleStart - offset);
      master.gain.setValueAtTime(this.muted ? 0 : this.volume, Math.max(t0, fadeAt - 1.5));
      master.gain.linearRampToValueAtTime(0, fadeAt);
    }
  }

  stop() {
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.master = null;
    }
  }

  setVolume(v: number, muted: boolean) {
    this.volume = v;
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
}
