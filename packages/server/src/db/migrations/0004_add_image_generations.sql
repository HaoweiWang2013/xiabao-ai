CREATE TABLE `image_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`conv_id` text,
	`prompt` text NOT NULL,
	`negative` text,
	`model_id` text NOT NULL,
	`width` integer,
	`height` integer,
	`steps` integer,
	`seed` integer,
	`guidance` real,
	`params_extra` text DEFAULT '{}' NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`result_path` text,
	`result_url` text,
	`thumbnail` text,
	`cost_usd_cents` integer,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_img_created` ON `image_generations` (created_at DESC) WHERE deleted_at IS NULL;
