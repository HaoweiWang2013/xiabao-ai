/**
 * ImageRepo：image_generations 表 CRUD
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { newId } from '@xiabao/core';

import {
  imageGenerations,
  type ImageGenerationRow,
  type NewImageGenerationRow,
} from '../db/schema/imageGenerations';

import type { AppDb } from '../db';

export interface ImageRepoDeps {
  db: AppDb;
  now: () => number;
}

export interface CreateImageInput {
  id?: string;
  convId?: string;
  prompt: string;
  modelId: string;
  status?: string;
  negative?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  guidance?: number;
  paramsExtra?: string;
}

export interface UpdateImageStatusInput {
  status: string;
  error?: string;
  resultPath?: string | null;
  resultUrl?: string;
  thumbnail?: string;
  costUsdCents?: number;
  durationMs?: number;
}

export function createImageRepo({ db, now }: ImageRepoDeps) {
  return {
    async create(input: CreateImageInput): Promise<ImageGenerationRow> {
      const ts = now();
      const id = input.id ?? newId();
      const row: NewImageGenerationRow = {
        id,
        convId: input.convId ?? null,
        prompt: input.prompt,
        negative: input.negative ?? null,
        modelId: input.modelId,
        width: input.width ?? null,
        height: input.height ?? null,
        steps: input.steps ?? null,
        seed: input.seed ?? null,
        guidance: input.guidance ?? null,
        paramsExtra: input.paramsExtra ?? '{}',
        status: input.status ?? 'queued',
        error: null,
        resultPath: null,
        resultUrl: null,
        thumbnail: null,
        costUsdCents: null,
        durationMs: null,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
      };
      await db.insert(imageGenerations).values(row);
      const inserted = await this.getById(id);
      if (!inserted) throw new Error(`ImageRepo.create: inserted row missing (${id})`);
      return inserted;
    },

    async getById(id: string): Promise<ImageGenerationRow | undefined> {
      const row = await db
        .select()
        .from(imageGenerations)
        .where(and(eq(imageGenerations.id, id), isNull(imageGenerations.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ?? undefined;
    },

    async list(
      opts: { limit?: number; offset?: number; convId?: string } = {},
    ): Promise<ImageGenerationRow[]> {
      const limit = opts.limit ?? 50;
      const offset = opts.offset ?? 0;
      const conditions = [isNull(imageGenerations.deletedAt)];
      if (opts.convId) {
        conditions.push(eq(imageGenerations.convId, opts.convId));
      }

      return db
        .select()
        .from(imageGenerations)
        .where(and(...conditions))
        .orderBy(desc(imageGenerations.createdAt))
        .limit(limit)
        .offset(offset);
    },

    async updateStatus(id: string, input: UpdateImageStatusInput): Promise<void> {
      const ts = now();
      const patch: Partial<NewImageGenerationRow> = {
        status: input.status,
        updatedAt: ts,
      };
      if (input.error !== undefined) patch.error = input.error;
      if (input.resultPath !== undefined) patch.resultPath = input.resultPath;
      if (input.resultUrl !== undefined) patch.resultUrl = input.resultUrl;
      if (input.thumbnail !== undefined) patch.thumbnail = input.thumbnail;
      if (input.costUsdCents !== undefined) patch.costUsdCents = input.costUsdCents;
      if (input.durationMs !== undefined) patch.durationMs = input.durationMs;

      await db.update(imageGenerations).set(patch).where(eq(imageGenerations.id, id));
    },

    async count(): Promise<number> {
      const row = await db
        .select({ c: sql<number>`count(*)` })
        .from(imageGenerations)
        .where(isNull(imageGenerations.deletedAt))
        .then((r) => r[0]);
      return Number(row?.c ?? 0);
    },
  };
}

export type ImageRepo = ReturnType<typeof createImageRepo>;
