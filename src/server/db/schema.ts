import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

/* ---------------------------------------------------------------------------
 * Better Auth core tables (field names follow the Better Auth schema).
 * ------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"),
  refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Persistent rate-limit buckets (Better Auth + our privileged endpoints). */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ---------------------------------------------------------------------------
 * Family archive
 * ------------------------------------------------------------------------- */

export const childProfiles = pgTable("child_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  fullName: text("full_name").notNull(),
  preferredName: text("preferred_name").notNull(),
  birthDate: date("birth_date").notNull(),
  birthDateConfirmed: boolean("birth_date_confirmed").notNull().default(false),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  coverMediaId: uuid("cover_media_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const familyAccess = pgTable(
  "family_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull(),
    state: text("state", { enum: ["active", "revoked"] }).notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("family_access_child_user_uq").on(t.childId, t.userId)],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "restrict" }),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull().unique(),
    filenameOriginal: text("filename_original").notNull(),
    mimeDeclared: text("mime_declared"),
    mimeDetected: text("mime_detected"),
    kind: text("kind", { enum: ["image", "video", "audio"] }).notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    sha256: text("sha256"),
    width: integer("width"),
    height: integer("height"),
    orientation: integer("orientation"),
    durationMs: integer("duration_ms"),
    capturedAt: ts("captured_at"),
    capturedTimezone: text("captured_timezone"),
    capturedSource: text("captured_source", {
      enum: ["exif", "filename", "user", "filesystem", "unknown"],
    })
      .notNull()
      .default("unknown"),
    capturedConfidence: text("captured_confidence", { enum: ["high", "medium", "low", "none"] })
      .notNull()
      .default("none"),
    dateNeedsReview: boolean("date_needs_review").notNull().default(true),
    caption: text("caption"),
    story: text("story"),
    /** `processing` until derivatives exist; originals are never altered. */
    status: text("status", {
      enum: ["processing", "ready", "preview_unavailable", "failed", "duplicate"],
    })
      .notNull()
      .default("processing"),
    duplicateOfId: uuid("duplicate_of_id"),
    favorite: boolean("favorite").notNull().default(false),
    /** A previously edited birthday film imported as a past edition. */
    isLegacyFilm: boolean("is_legacy_film").notNull().default(false),
    sourcePath: text("source_path"),
    importId: uuid("import_id"),
    processingError: text("processing_error"),
    deletedAt: ts("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("media_child_captured_idx").on(t.childId, t.capturedAt),
    index("media_child_favorite_idx").on(t.childId, t.favorite),
    index("media_sha256_idx").on(t.sha256),
    index("media_child_created_idx").on(t.childId, t.createdAt),
  ],
);

export const mediaRenditions = pgTable(
  "media_renditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    kind: text("kind", { enum: ["poster", "thumbnail", "optimized", "transcode"] }).notNull(),
    width: integer("width"),
    height: integer("height"),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    generatedAt: ts("generated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("media_renditions_media_kind_uq").on(t.mediaId, t.kind)],
);

export const albums = pgTable(
  "albums",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    coverMediaId: uuid("cover_media_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("albums_child_name_uq").on(t.childId, t.name)],
);

export const albumMedia = pgTable(
  "album_media",
  {
    albumId: uuid("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: ts("added_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.mediaId] })],
);

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => childProfiles.id, { onDelete: "cascade" }),
  eventDate: date("event_date"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  verifiedByParent: boolean("verified_by_parent").notNull().default(false),
  mediaIds: jsonb("media_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(),
});

export const memories = pgTable("memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => childProfiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  story: text("story"),
  eventDate: date("event_date"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
});

export const memoryMedia = pgTable(
  "memory_media",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.memoryId, t.mediaId] })],
);

export const voiceNotes = pgTable("voice_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => childProfiles.id, { onDelete: "cascade" }),
  mediaId: uuid("media_id").references(() => media.id, { onDelete: "set null" }),
  memoryId: uuid("memory_id").references(() => memories.id, { onDelete: "set null" }),
  storageKey: text("storage_key").notNull().unique(),
  transcript: text("transcript"),
  consentState: text("consent_state", { enum: ["none", "granted", "revoked"] })
    .notNull()
    .default("none"),
  createdAt: createdAt(),
});

export const timeCapsules = pgTable("time_capsules", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => childProfiles.id, { onDelete: "cascade" }),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  title: text("title").notNull(),
  privateBody: text("private_body"),
  releaseAt: ts("release_at").notNull(),
  state: text("state", { enum: ["draft", "sealed", "released"] }).notNull().default("draft"),
  createdAt: createdAt(),
});

export type FilmCaption = { text: string; position?: "bottom" | "top" };

export const birthdayFilms = pgTable(
  "birthday_films",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "cascade" }),
    birthdayAge: integer("birthday_age"),
    birthdayYear: integer("birthday_year"),
    title: text("title").notNull(),
    /** `slideshow` films are composed from scenes; `imported` films play an uploaded MP4. */
    source: text("source", { enum: ["slideshow", "imported"] }).notNull().default("slideshow"),
    sourceMediaId: uuid("source_media_id").references(() => media.id, { onDelete: "set null" }),
    status: text("status", { enum: ["draft", "approved", "rendering", "ready", "failed"] })
      .notNull()
      .default("draft"),
    aspectRatio: text("aspect_ratio").notNull().default("16:9"),
    durationTargetSeconds: integer("duration_target_seconds").notNull().default(180),
    coverMediaId: uuid("cover_media_id"),
    openingTitle: jsonb("opening_title").$type<string[]>(),
    closingTitle: jsonb("closing_title").$type<string[]>(),
    renderedStorageKey: text("rendered_storage_key"),
    renderedMeta: jsonb("rendered_meta").$type<Record<string, unknown>>(),
    audioMediaId: uuid("audio_media_id").references(() => media.id, { onDelete: "set null" }),
    /** Parent confirmation that the uploaded song is theirs to use / properly licensed. */
    audioRightsConfirmed: boolean("audio_rights_confirmed").notNull().default(false),
    /** Approved cinema skill version used to plan this film. Null for the built-in birthday draft. */
    skillVersionId: uuid("skill_version_id"),
    /** Cinema job phase: QUEUED, PLANNING, PREPARING, RENDERING, UPLOADING, COMPLETED, FAILED, CANCELLED. */
    cinemaPhase: text("cinema_phase"),
    verifiedAt: ts("verified_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("birthday_films_child_idx").on(t.childId, t.birthdayYear)],
);

export const cinemaSkills = pgTable(
  "cinema_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(false),
    activeVersionId: uuid("active_version_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("cinema_skills_child_slug").on(t.childId, t.slug)],
);

export const cinemaSkillVersions = pgTable(
  "cinema_skill_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => cinemaSkills.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status", { enum: ["draft", "approved", "retired"] }).notNull().default("draft"),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    sourceName: text("source_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("cinema_skill_versions_skill_version").on(t.skillId, t.version)],
);

/** Private soundtrack roles. The bytes live in `media`; this row only names the role. */
export const cinemaAudioAssets = pgTable(
  "cinema_audio_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("cinema_audio_child_role").on(t.childId, t.role)],
);

export const filmScenes = pgTable(
  "film_scenes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    filmId: uuid("film_id")
      .notNull()
      .references(() => birthdayFilms.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    mediaId: uuid("media_id").references(() => media.id, { onDelete: "cascade" }),
    chapter: text("chapter"),
    durationSeconds: real("duration_seconds").notNull().default(4),
    transition: text("transition").notNull().default("crossfade"),
    captions: jsonb("captions").$type<FilmCaption[]>().notNull().default(sql`'[]'::jsonb`),
    cropPosition: jsonb("crop_position").$type<{ x: number; y: number }>(),
    pinned: boolean("pinned").notNull().default(false),
    omitted: boolean("omitted").notNull().default(false),
    titleType: text("title_type"),
  },
  (t) => [index("film_scenes_film_order_idx").on(t.filmId, t.order)],
);

/**
 * Durable PostgreSQL job queue (media processing, ZIP imports and film renders).
 * Claimed with FOR UPDATE SKIP LOCKED and a lease (`locked_until`).
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: text("job_type", { enum: ["media.process", "import.zip", "film.render", "studio.render"] }).notNull(),
    filmId: uuid("film_id").references(() => birthdayFilms.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    idempotencyKey: text("idempotency_key").unique(),
    status: text("status", {
      enum: ["queued", "processing", "ready", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    progress: real("progress").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    lockedUntil: ts("locked_until"),
    runAfter: ts("run_after").notNull().defaultNow(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    outputStorageKey: text("output_storage_key"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => [
    index("jobs_status_created_idx").on(t.status, t.createdAt),
    index("jobs_film_idx").on(t.filmId),
  ],
);

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["media", "import", "audio", "legacy_film"] })
      .notNull()
      .default("media"),
    objectKey: text("object_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeDeclared: text("mime_declared").notNull(),
    checksum: text("checksum"),
    expectedBytes: bigint("expected_bytes", { mode: "number" }).notNull(),
    multipartUploadId: text("multipart_upload_id"),
    partSize: integer("part_size"),
    capturedAtHint: ts("captured_at_hint"),
    uploadState: text("upload_state", {
      enum: ["pending", "completed", "aborted", "expired"],
    })
      .notNull()
      .default("pending"),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("upload_sessions_state_idx").on(t.uploadState, t.expiresAt)],
);

export type ImportError = { entry: string; reason: string };

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  childId: uuid("child_id")
    .notNull()
    .references(() => childProfiles.id, { onDelete: "cascade" }),
  sourceArchiveStorageKey: text("source_archive_storage_key"),
  sourceLabel: text("source_label"),
  status: text("status", { enum: ["queued", "processing", "ready", "failed"] })
    .notNull()
    .default("queued"),
  entriesTotal: integer("entries_total").notNull().default(0),
  accepted: integer("accepted").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  errors: jsonb("errors").$type<ImportError[]>().notNull().default(sql`'[]'::jsonb`),
  progress: real("progress").notNull().default(0),
  createdAt: createdAt(),
  finishedAt: ts("finished_at"),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    timestamp: ts("timestamp").notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (t) => [index("audit_events_time_idx").on(t.timestamp)],
);

/**
 * OpenMontage Studio. Projects point at private media; deleting a project or
 * export never deletes those media rows.
 */
export const studioProjects = pgTable(
  "studio_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    pipeline: text("pipeline").notNull(),
    profile: text("profile").notNull(),
    stage: text("stage").notNull().default("AWAITING_APPROVAL"),
    renderRuntime: text("render_runtime").notNull(),
    rendererFamily: text("renderer_family").notNull(),
    externalProcessing: boolean("external_processing").notNull().default(false),
    referenceUrl: text("reference_url"),
    musicMediaId: uuid("music_media_id"),
    errorMessage: text("error_message"),
    approvedAt: ts("approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("studio_projects_child_idx").on(t.childId, t.createdAt)],
);

export const studioProjectAssets = pgTable(
  "studio_project_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => studioProjects.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    omitted: boolean("omitted").notNull().default(false),
    caption: text("caption"),
    durationSeconds: real("duration_seconds").notNull().default(4),
    hero: boolean("hero").notNull().default(false),
  },
  (t) => [index("studio_project_assets_order_idx").on(t.projectId, t.position)],
);

export const studioProductionBriefs = pgTable("studio_production_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  proposal: jsonb("proposal").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

export const studioScenePlans = pgTable("studio_scene_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

export const studioApprovalGates = pgTable("studio_approval_gates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  decision: text("decision").notNull(),
  createdAt: createdAt(),
});

export const studioExports = pgTable("studio_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  profile: text("profile").notNull(),
  status: text("status").notNull().default("queued"),
  storageKey: text("storage_key"),
  durationSeconds: real("duration_seconds"),
  width: integer("width"),
  height: integer("height"),
  probe: jsonb("probe").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
});

export const studioSkills = pgTable(
  "studio_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => childProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    activeVersionId: uuid("active_version_id"),
    createdAt: createdAt(),
  },
  (t) => [index("studio_skills_child_idx").on(t.childId)],
);

export const studioSkillVersions = pgTable("studio_skill_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  skillId: uuid("skill_id")
    .notNull()
    .references(() => studioSkills.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
  sourceName: text("source_name").notNull(),
  createdAt: createdAt(),
});

export const studioAudioAssets = pgTable("studio_audio_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  mediaId: uuid("media_id")
    .notNull()
    .references(() => media.id, { onDelete: "restrict" }),
  role: text("role").notNull(),
  createdAt: createdAt(),
});

export const studioProviderSettings = pgTable("studio_provider_settings", {
  childId: uuid("child_id")
    .primaryKey()
    .references(() => childProfiles.id, { onDelete: "cascade" }),
  externalProcessing: boolean("external_processing").notNull().default(false),
  spendCapUsd: real("spend_cap_usd").notNull().default(0),
  updatedAt: updatedAt(),
});

export const studioCostRecords = pgTable("studio_cost_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  amountUsd: real("amount_usd").notNull().default(0),
  note: text("note").notNull(),
  createdAt: createdAt(),
});

export const studioDecisionLogs = pgTable("studio_decision_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  summary: text("summary").notNull(),
  createdAt: createdAt(),
});

export const studioPipelineRuns = pgTable("studio_pipeline_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => studioProjects.id, { onDelete: "cascade" }),
  exportId: uuid("export_id").references(() => studioExports.id, { onDelete: "set null" }),
  jobId: uuid("job_id"),
  stage: text("stage").notNull(),
  checkpoint: jsonb("checkpoint").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
