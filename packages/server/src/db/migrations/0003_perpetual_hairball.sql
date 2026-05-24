CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'custom' NOT NULL,
	`builtin` integer DEFAULT false NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`extra` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_prompts_updated` ON `prompts` (`updated_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_prompts_category` ON `prompts` (`category`,`updated_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_prompts_usage` ON `prompts` (`usage_count`,`updated_at`) WHERE deleted_at IS NULL;