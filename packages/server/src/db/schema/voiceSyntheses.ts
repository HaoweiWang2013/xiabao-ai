import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const voiceSyntheses = sqliteTable('voice_syntheses', {
  id: text('id').primaryKey(),
  convId: text('conv_id'),
  modelId: text('model_id').notNull(),
  status: text('status').notNull(),
  inputText: text('input_text').notNull(),
  voice: text('voice'),
  speed: real('speed'),
  audioPath: text('audio_path'),
  audioFormat: text('audio_format'),
  audioDurationMs: integer('audio_duration_ms'),
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export type VoiceSynthesisRow = typeof voiceSyntheses.$inferSelect;
export type NewVoiceSynthesisRow = typeof voiceSyntheses.$inferInsert;
