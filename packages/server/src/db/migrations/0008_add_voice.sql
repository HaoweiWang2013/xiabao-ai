CREATE TABLE `voice_transcriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`conv_id` text,
	`model_id` text NOT NULL,
	`status` text NOT NULL,
	`language` text,
	`text` text,
	`audio_path` text,
	`audio_format` text,
	`audio_duration_ms` integer,
	`duration_ms` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `voice_syntheses` (
	`id` text PRIMARY KEY NOT NULL,
	`conv_id` text,
	`model_id` text NOT NULL,
	`status` text NOT NULL,
	`input_text` text NOT NULL,
	`voice` text,
	`speed` real,
	`audio_path` text,
	`audio_format` text,
	`audio_duration_ms` integer,
	`duration_ms` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
