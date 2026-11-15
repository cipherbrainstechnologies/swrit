CREATE TABLE IF NOT EXISTS "editdna_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL,
  "name" text NOT NULL,
  "source_label" text,
  "reference_media_id" uuid,
  "manifest" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "editdna_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL,
  "template_id" uuid,
  "title" text NOT NULL,
  "edl" jsonb NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "editdna_templates" ADD CONSTRAINT "editdna_templates_child_id_fk"
  FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "editdna_templates" ADD CONSTRAINT "editdna_templates_reference_media_fk"
  FOREIGN KEY ("reference_media_id") REFERENCES "media"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "editdna_plans" ADD CONSTRAINT "editdna_plans_child_id_fk"
  FOREIGN KEY ("child_id") REFERENCES "child_profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "editdna_plans" ADD CONSTRAINT "editdna_plans_template_id_fk"
  FOREIGN KEY ("template_id") REFERENCES "editdna_templates"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "editdna_templates_child_idx" ON "editdna_templates" ("child_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "editdna_plans_child_idx" ON "editdna_plans" ("child_id", "created_at" DESC);