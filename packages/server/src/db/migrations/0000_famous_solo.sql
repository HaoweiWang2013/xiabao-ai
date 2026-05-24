CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`base_url` text,
	`api_key_ref` text,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_index` integer DEFAULT 0 NOT NULL,
	`extra` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`device_id` text
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`display` text NOT NULL,
	`family` text,
	`context_tokens` integer,
	`max_output` integer,
	`capability` text DEFAULT '{}' NOT NULL,
	`pricing` text,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_index` integer DEFAULT 0 NOT NULL,
	`deprecated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`device_id` text,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`device_id` text
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`model_id` text,
	`system_prompt` text,
	`temperature` real,
	`top_p` real,
	`max_output_tokens` integer,
	`folder` text,
	`pinned` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`color` text,
	`icon` text,
	`kind` text DEFAULT 'chat' NOT NULL,
	`extra` text DEFAULT '{}' NOT NULL,
	`last_message_at` integer,
	`token_total` integer DEFAULT 0 NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`device_id` text
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conv_id` text NOT NULL,
	`role` text NOT NULL,
	`parent_id` text,
	`variant_index` integer DEFAULT 0 NOT NULL,
	`variant_count` integer DEFAULT 1 NOT NULL,
	`is_chosen` integer DEFAULT true NOT NULL,
	`model_id` text,
	`provider_id` text,
	`status` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`cost_usd_cents` integer,
	`duration_ms` integer,
	`finish_reason` text,
	`body_plain` text,
	`extra` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`device_id` text,
	FOREIGN KEY (`conv_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `message_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text,
	`mime` text,
	`url` text,
	`size_bytes` integer,
	`tool_name` text,
	`tool_call_id` text,
	`args_json` text,
	`result_json` text,
	`extra` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_providers_enabled` ON `providers` (`enabled`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_models_provider` ON `models` (`provider_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_conv_updated` ON `conversations` (`updated_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_conv_pinned` ON `conversations` (`pinned`,`last_message_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_conv_kind` ON `conversations` (`kind`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_msg_conv_created` ON `messages` (`conv_id`,`created_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_msg_parent` ON `messages` (`parent_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_msg_status` ON `messages` (`status`);--> statement-breakpoint
CREATE INDEX `idx_parts_msg` ON `message_parts` (`message_id`,`seq`);