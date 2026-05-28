/**
 * ConversationRepo：conversations CRUD + list
 */
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  type Conversation,
  type ConversationCreateInput,
  ConversationSchema,
  type ConversationUpdateInput,
  newId,
} from '@xiabao/core';

import {
  conversations,
  type ConversationRow,
  type NewConversationRow,
} from '../db/schema/conversations';

import type { AppDb } from '../db';

export interface ConversationRepoDeps {
  db: AppDb;
  now: () => number;
  deviceId?: string | null;
}

export function createConversationRepo({ db, now, deviceId = null }: ConversationRepoDeps) {
  return {
    async list(): Promise<Conversation[]> {
      const rows = await db
        .select()
        .from(conversations)
        .where(isNull(conversations.deletedAt))
        .orderBy(
          desc(conversations.pinned),
          desc(conversations.lastMessageAt),
          asc(conversations.createdAt),
        );
      return rows.map(rowToConversation);
    },

    async findById(id: string): Promise<Conversation | null> {
      const row = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), isNull(conversations.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      return row ? rowToConversation(row) : null;
    },

    async create(input: ConversationCreateInput): Promise<Conversation> {
      const ts = now();
      const id = newId();
      const row: NewConversationRow = {
        id,
        title: input.title,
        modelId: input.modelId ?? null,
        systemPrompt: input.systemPrompt ?? null,
        temperature: input.temperature ?? null,
        topP: input.topP ?? null,
        maxOutputTokens: input.maxOutputTokens ?? null,
        folder: input.folder ?? null,
        pinned: false,
        archived: false,
        favorite: false,
        autoRenamed: false,
        color: input.color ?? null,
        icon: input.icon ?? null,
        kind: input.kind ?? 'chat',
        extra: JSON.stringify(input.extra ?? {}),
        knowledgeBases: JSON.stringify(input.knowledgeBases ?? []),
        lastMessageAt: null,
        tokenTotal: 0,
        messageCount: 0,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        deviceId,
      };
      await db.insert(conversations).values(row);
      const inserted = await this.findById(id);
      if (!inserted) throw new Error(`ConversationRepo.create: inserted row missing (${id})`);
      return inserted;
    },

    async update(input: ConversationUpdateInput): Promise<Conversation> {
      const ts = now();
      const patch: Partial<NewConversationRow> = { updatedAt: ts };
      if (input.title !== undefined) patch.title = input.title;
      if (input.modelId !== undefined) patch.modelId = input.modelId ?? null;
      if (input.systemPrompt !== undefined) patch.systemPrompt = input.systemPrompt ?? null;
      if (input.temperature !== undefined) patch.temperature = input.temperature ?? null;
      if (input.topP !== undefined) patch.topP = input.topP ?? null;
      if (input.maxOutputTokens !== undefined)
        patch.maxOutputTokens = input.maxOutputTokens ?? null;
      if (input.folder !== undefined) patch.folder = input.folder ?? null;
      if (input.pinned !== undefined) patch.pinned = input.pinned;
      if (input.archived !== undefined) patch.archived = input.archived;
      if (input.favorite !== undefined) patch.favorite = input.favorite;
      if (input.autoRenamed !== undefined) patch.autoRenamed = input.autoRenamed;
      if (input.color !== undefined) patch.color = input.color ?? null;
      if (input.icon !== undefined) patch.icon = input.icon ?? null;
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.extra !== undefined) patch.extra = JSON.stringify(input.extra);
      if (input.knowledgeBases !== undefined)
        patch.knowledgeBases = JSON.stringify(input.knowledgeBases);

      await db.update(conversations).set(patch).where(eq(conversations.id, input.id));
      const row = await this.findById(input.id);
      if (!row) throw new Error(`ConversationRepo.update: conversation not found (${input.id})`);
      return row;
    },

    async touchOnMessage(id: string, tokensDelta = 0): Promise<void> {
      const ts = now();
      await db
        .update(conversations)
        .set({
          lastMessageAt: ts,
          updatedAt: ts,
          messageCount: sql`${conversations.messageCount} + 1`,
          tokenTotal: sql`${conversations.tokenTotal} + ${tokensDelta}`,
        })
        .where(eq(conversations.id, id));
    },

    async softDelete(id: string): Promise<void> {
      const ts = now();
      await db
        .update(conversations)
        .set({ deletedAt: ts, updatedAt: ts })
        .where(eq(conversations.id, id));
    },

    async rename(id: string, title: string): Promise<Conversation> {
      const ts = now();
      await db.update(conversations).set({ title, updatedAt: ts }).where(eq(conversations.id, id));
      const row = await this.findById(id);
      if (!row) throw new Error(`ConversationRepo.rename: conversation not found (${id})`);
      return row;
    },

    async toggleFavorite(id: string): Promise<Conversation> {
      const row = await this.findById(id);
      if (!row) throw new Error(`ConversationRepo.toggleFavorite: conversation not found (${id})`);
      const ts = now();
      await db
        .update(conversations)
        .set({ favorite: !row.favorite, updatedAt: ts })
        .where(eq(conversations.id, id));
      const updated = await this.findById(id);
      if (!updated)
        throw new Error(`ConversationRepo.toggleFavorite: conversation not found (${id})`);
      return updated;
    },

    async markAutoRenamed(id: string): Promise<Conversation> {
      const ts = now();
      await db
        .update(conversations)
        .set({ autoRenamed: true, updatedAt: ts })
        .where(eq(conversations.id, id));
      const row = await this.findById(id);
      if (!row) throw new Error(`ConversationRepo.markAutoRenamed: conversation not found (${id})`);
      return row;
    },
  };
}

export type ConversationRepo = ReturnType<typeof createConversationRepo>;

function rowToConversation(row: ConversationRow): Conversation {
  return ConversationSchema.parse({
    id: row.id,
    title: row.title,
    modelId: row.modelId,
    systemPrompt: row.systemPrompt,
    temperature: row.temperature,
    topP: row.topP,
    maxOutputTokens: row.maxOutputTokens,
    folder: row.folder,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    favorite: Boolean(row.favorite),
    autoRenamed: Boolean(row.autoRenamed),
    color: row.color,
    icon: row.icon,
    kind: row.kind,
    extra: safeJson(row.extra, {}),
    knowledgeBases: safeJson<string[]>(row.knowledgeBases, []),
    lastMessageAt: row.lastMessageAt,
    tokenTotal: row.tokenTotal,
    messageCount: row.messageCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deviceId: row.deviceId,
  });
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
