import { z } from "zod";

export const STYLE_TEMPLATE_VERSION = 1;
export const EDL_VERSION = 1;

const transitionProfile = z
  .object({
    type: z.string(),
    frequency: z.string(),
  })
  .passthrough();

export const styleTemplateSchema = z
  .object({
    template_name: z.string().min(1).max(120),
    schema_version: z.literal(STYLE_TEMPLATE_VERSION),
    source: z.string().optional().default(""),
    created_at: z.string().optional().default(""),
    pacing: z
      .object({
        avg_shot_duration_sec: z.number().positive(),
        cut_style: z.string(),
        beat_synced: z.boolean(),
        cuts_per_10s: z.number().nonnegative(),
      })
      .passthrough()
      .optional(),
    transitions: z.array(transitionProfile).optional().default([]),
    text_overlays: z.record(z.unknown()).optional(),
    captions: z.record(z.unknown()).optional(),
    music_sync: z.record(z.unknown()).optional(),
    llm_style_summary: z.string().optional().default(""),
  })
  .passthrough();

export const edlSchema = z
  .object({
    name: z.string().min(1).max(200),
    edl_version: z.literal(EDL_VERSION),
    fps: z.number().positive().optional().default(30),
    items: z
      .array(
        z
          .object({
            id: z.string(),
            source_path: z.string(),
          })
          .passthrough(),
      )
      .min(1),
    text_overlays: z.array(z.record(z.unknown())).optional(),
    captions: z.array(z.record(z.unknown())).optional(),
    audio: z.array(z.record(z.unknown())).optional(),
    notes: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type StyleTemplateDoc = z.infer<typeof styleTemplateSchema>;
export type EdlDoc = z.infer<typeof edlSchema>;

export function parseStyleTemplate(raw: unknown): StyleTemplateDoc {
  return styleTemplateSchema.parse(raw);
}

export function parseEdl(raw: unknown): EdlDoc {
  return edlSchema.parse(raw);
}

export function templateDisplayName(manifest: StyleTemplateDoc): string {
  return manifest.template_name;
}

export function edlDurationSec(edl: EdlDoc): number {
  let end = 0;
  for (const item of edl.items) {
    const row = item as { timeline_start_sec?: number; duration_sec?: number };
    const start = Number(row.timeline_start_sec ?? 0);
    const dur = Number(row.duration_sec ?? 0);
    end = Math.max(end, start + dur);
  }
  return end;
}