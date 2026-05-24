CREATE TABLE `knowledge_bases` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`embedding_model` text NOT NULL,
	`vector_dim` integer NOT NULL,
	`chunk_strategy` text DEFAULT '{}' NOT NULL,
	`doc_count` integer DEFAULT 0 NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `knowledge_docs` (
	`id` text PRIMARY KEY NOT NULL,
	`kb_id` text NOT NULL,
	`name` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_path` text NOT NULL,
	`mime` text,
	`size_bytes` integer,
	`hash_sha256` text,
	`status` text NOT NULL,
	`error` text,
	`extra` text DEFAULT '{}' NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`indexed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`kb_id`) REFERENCES `knowledge_bases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_id` text NOT NULL,
	`kb_id` text NOT NULL,
	`seq` integer NOT NULL,
	`text` text NOT NULL,
	`tokens` integer,
	`metadata` text DEFAULT '{}' NOT NULL,
	`embedding` blob,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `knowledge_docs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kb_id`) REFERENCES `knowledge_bases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_kb_updated` ON `knowledge_bases` (`updated_at`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_docs_kb` ON `knowledge_docs` (`kb_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_docs_status` ON `knowledge_docs` (`status`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `idx_chunks_doc` ON `knowledge_chunks` (`doc_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_chunks_kb` ON `knowledge_chunks` (`kb_id`) WHERE embedding IS NOT NULL;