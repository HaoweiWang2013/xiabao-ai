CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`conv_id` text,
	`message_id` text,
	`goal` text,
	`status` text NOT NULL,
	`steps_count` integer DEFAULT 0 NOT NULL,
	`tokens_total` integer,
	`cost_usd_cents` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ended_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `agent_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`content` text,
	`tool_name` text,
	`tool_args` text,
	`tool_result` text,
	`duration_ms` integer,
	`tokens_in` integer,
	`tokens_out` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`command` text,
	`args` text,
	`url` text,
	`transport` text NOT NULL,
	`auth_ref` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`capabilities` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `mcp_tools` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`input_schema` text NOT NULL,
	`authorized` integer DEFAULT 0 NOT NULL,
	`last_used` integer
);
--> statement-breakpoint
CREATE INDEX `idx_agent_runs_created` ON `agent_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_agent_runs_conv` ON `agent_runs` (`conv_id`);--> statement-breakpoint
CREATE INDEX `idx_steps_run` ON `agent_steps` (`run_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_mcp_tools_server` ON `mcp_tools` (`server_id`);