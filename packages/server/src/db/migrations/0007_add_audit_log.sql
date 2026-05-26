CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`step_id` text,
	`tool_name` text NOT NULL,
	`tool_args` text,
	`tool_result` text,
	`source` text NOT NULL,
	`server_id` text,
	`duration_ms` integer,
	`success` integer DEFAULT 1 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `agent_steps` ADD `source` text;--> statement-breakpoint
ALTER TABLE `agent_steps` ADD `server_id` text;--> statement-breakpoint
CREATE INDEX `idx_audit_log_run` ON `audit_log` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_tool` ON `audit_log` (`tool_name`);--> statement-breakpoint
CREATE INDEX `idx_audit_log_created` ON `audit_log` (`created_at`);
