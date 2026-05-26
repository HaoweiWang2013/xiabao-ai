CREATE TABLE `sync_state` (
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`last_synced` integer,
	`op` text NOT NULL,
	`payload` text,
	PRIMARY KEY (`table_name`, `row_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_sync_state_pending` ON `sync_state` (`last_synced`) WHERE `last_synced` IS NULL;
--> statement-breakpoint
ALTER TABLE `providers` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `models` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `conversations` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `message_parts` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `prompts` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `settings` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `knowledge_bases` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `knowledge_docs` ADD COLUMN `rev` integer NOT NULL DEFAULT 0;
