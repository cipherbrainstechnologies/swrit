UPDATE "studio_exports" AS e
SET "status" = 'failed',
    "error_message" = 'This file is the opening and closing title cards only. The selected photographs were not on the timeline. Render again.'
WHERE e."status" = 'ready'
  AND e."duration_seconds" < 12
  AND EXISTS (
    SELECT 1
    FROM "studio_scene_plans" AS p
    WHERE p."project_id" = e."project_id"
      AND jsonb_array_length(p."plan"->'scenes') > 4
  );
--> statement-breakpoint
UPDATE "studio_projects" AS p
SET "stage" = 'PLANNING',
    "error_message" = 'The previous export was title cards only. The approval still stands. Render again.'
WHERE p."stage" = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1
    FROM "studio_exports" AS e
    WHERE e."project_id" = p."id"
      AND e."status" = 'ready'
  );
