import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const voiceTranscriptions = sqliteTable('voice_transcriptions', {
  id: text('id').primaryKey(),
  convId: text('conv_id'),
  modelId: text('model_id').notNull(),
  status: text('status').notNull(),
  language: text('language'),
  text: text('text'),
  audioPath: text('audio_path'),
  audioFormat: text('audio_format'),
  audioDurationMs: integer('audio_duration_ms'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export type VoiceTranscriptionRow = typeof voiceTranscriptions.$inferSelect;
export type NewVoiceTranscriptionRow = typeof voiceTranscriptions.$inferInsert;
