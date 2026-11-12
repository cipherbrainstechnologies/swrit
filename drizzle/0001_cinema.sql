CREATE TABLE "cinema_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"active_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cinema_skill_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"manifest" jsonb NOT NULL,
	"source_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cinema_audio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "birthday_films" ADD COLUMN "skill_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "birthday_films" ADD COLUMN "cinema_phase" text;
--> statement-breakpoint
ALTER TABLE "cinema_skills" ADD CONSTRAINT "cinema_skills_child_id_child_profiles_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cinema_skill_versions" ADD CONSTRAINT "cinema_skill_versions_skill_id_cinema_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."cinema_skills"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cinema_skills" ADD CONSTRAINT "cinema_skills_active_version_id_cinema_skill_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."cinema_skill_versions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cinema_audio_assets" ADD CONSTRAINT "cinema_audio_assets_child_id_child_profiles_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."child_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cinema_audio_assets" ADD CONSTRAINT "cinema_audio_assets_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "birthday_films" ADD CONSTRAINT "birthday_films_skill_version_id_cinema_skill_versions_id_fk" FOREIGN KEY ("skill_version_id") REFERENCES "public"."cinema_skill_versions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "cinema_skills_child_slug" ON "cinema_skills" USING btree ("child_id","slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "cinema_skill_versions_skill_version" ON "cinema_skill_versions" USING btree ("skill_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "cinema_audio_child_role" ON "cinema_audio_assets" USING btree ("child_id","role");
