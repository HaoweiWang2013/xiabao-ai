import { and, desc, eq, isNull } from 'drizzle-orm';

import { newId } from '@xiabao/core';

import {
  voiceTranscriptions,
  type NewVoiceTranscriptionRow,
  type VoiceTranscriptionRow,
} from '../db/schema/voiceTranscriptions';
import {
  voiceSyntheses,
  type NewVoiceSynthesisRow,
  type VoiceSynthesisRow,
} from '../db/schema/voiceSyntheses';

import type { AppDb } from '../db';

export interface VoiceRepoDeps {
  db: AppDb;
  now: () => number;
}

export interface CreateTranscriptionInput {
  convId?: string;
  modelId: string;
  status?: string;
  language?: string;
  audioFormat?: string;
  audioDurationMs?: number;
}

export interface UpdateTranscriptionInput {
  status?: string;
  text?: string;
  language?: string;
  audioPath?: string;
  durationMs?: number;
  error?: string;
}

export interface CreateSynthesisInput {
  convId?: string;
  modelId: string;
  inputText: string;
  status?: string;
  voice?: string;
  speed?: number;
  audioFormat?: string;
}

export interface UpdateSynthesisInput {
  status?: string;
  audioPath?: string;
  audioDurationMs?: number;
  durationMs?: number;
  error?: string;
}

export function createVoiceRepo({ db, now }: VoiceRepoDeps) {
  return {
    async createTranscription(input: CreateTranscriptionInput): Promise<VoiceTranscriptionRow> {
      const ts = now();
      const id = newId();
      const row: NewVoiceTranscriptionRow = {
        id,
        convId: input.convId ?? null,
        modelId: input.modelId,
        status: input.status ?? 'queued',
        language: input.language ?? null,
        text: null,
        audioPath: null,
        audioFormat: input.audioFormat ?? null,
        audioDurationMs: input.audioDurationMs ?? null,
        durationMs: null,
        error: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db.insert(voiceTranscriptions).values(row);
      const r = await db
        .select()
        .from(voiceTranscriptions)
        .where(eq(voiceTranscriptions.id, id))
        .limit(1);
      return r[0]!;
    },

    async getTranscription(id: string): Promise<VoiceTranscriptionRow | undefined> {
      const r = await db
        .select()
        .from(voiceTranscriptions)
        .where(and(eq(voiceTranscriptions.id, id), isNull(voiceTranscriptions.deletedAt)))
        .limit(1);
      return r[0];
    },

    async listTranscriptions(
      opts: { limit?: number; offset?: number } = {},
    ): Promise<VoiceTranscriptionRow[]> {
      return db
        .select()
        .from(voiceTranscriptions)
        .where(isNull(voiceTranscriptions.deletedAt))
        .orderBy(desc(voiceTranscriptions.createdAt))
        .limit(opts.limit ?? 50)
        .offset(opts.offset ?? 0);
    },

    async updateTranscription(id: string, patch: UpdateTranscriptionInput): Promise<void> {
      const data: Partial<NewVoiceTranscriptionRow> = { updatedAt: now() };
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.text !== undefined) data.text = patch.text;
      if (patch.language !== undefined) data.language = patch.language;
      if (patch.audioPath !== undefined) data.audioPath = patch.audioPath;
      if (patch.durationMs !== undefined) data.durationMs = patch.durationMs;
      if (patch.error !== undefined) data.error = patch.error;
      await db.update(voiceTranscriptions).set(data).where(eq(voiceTranscriptions.id, id));
    },

    async createSynthesis(input: CreateSynthesisInput): Promise<VoiceSynthesisRow> {
      const ts = now();
      const id = newId();
      const row: NewVoiceSynthesisRow = {
        id,
        convId: input.convId ?? null,
        modelId: input.modelId,
        status: input.status ?? 'queued',
        inputText: input.inputText,
        voice: input.voice ?? null,
        speed: input.speed ?? null,
        audioPath: null,
        audioFormat: input.audioFormat ?? null,
        audioDurationMs: null,
        durationMs: null,
        error: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db.insert(voiceSyntheses).values(row);
      const r = await db.select().from(voiceSyntheses).where(eq(voiceSyntheses.id, id)).limit(1);
      return r[0]!;
    },

    async getSynthesis(id: string): Promise<VoiceSynthesisRow | undefined> {
      const r = await db
        .select()
        .from(voiceSyntheses)
        .where(and(eq(voiceSyntheses.id, id), isNull(voiceSyntheses.deletedAt)))
        .limit(1);
      return r[0];
    },

    async listSyntheses(
      opts: { limit?: number; offset?: number } = {},
    ): Promise<VoiceSynthesisRow[]> {
      return db
        .select()
        .from(voiceSyntheses)
        .where(isNull(voiceSyntheses.deletedAt))
        .orderBy(desc(voiceSyntheses.createdAt))
        .limit(opts.limit ?? 50)
        .offset(opts.offset ?? 0);
    },

    async updateSynthesis(id: string, patch: UpdateSynthesisInput): Promise<void> {
      const data: Partial<NewVoiceSynthesisRow> = { updatedAt: now() };
      if (patch.status !== undefined) data.status = patch.status;
      if (patch.audioPath !== undefined) data.audioPath = patch.audioPath;
      if (patch.audioDurationMs !== undefined) data.audioDurationMs = patch.audioDurationMs;
      if (patch.durationMs !== undefined) data.durationMs = patch.durationMs;
      if (patch.error !== undefined) data.error = patch.error;
      await db.update(voiceSyntheses).set(data).where(eq(voiceSyntheses.id, id));
    },
  };
}

export type VoiceRepo = ReturnType<typeof createVoiceRepo>;
