/**
 * MessageRepo：messages + message_parts 的聚合读写
 *
 * 一条消息对外总是以 `MessageWithParts` 出现；写入时原子性事务保证 parts 与 message 一致。
 */
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  type FinishReason,
  type Message,
  type MessagePart,
  type MessageRole,
  MessageSchema,
  type MessageStatus,
  newId,
} from '@xiabao/core';

import {
  messageParts,
  type MessagePartRow,
  type NewMessagePartRow,
} from '../db/schema/messageParts';
import { messages, type MessageRow, type NewMessageRow } from '../db/schema/messages';

import type { AppDb } from '../db';

export interface MessageWithParts {
  message: Message;
  parts: MessagePart[];
}

export interface AppendUserMessageInput {
  convId: string;
  role: Extract<MessageRole, 'user' | 'system'>;
  parentId?: string | null;
  parts: NewPart[];
  bodyPlain?: string;
}

export interface AppendAssistantDraftInput {
  convId: string;
  parentId?: string | null;
  /** 允许 null：导入会话时原模型/Provider 在新机器上可能不存在 */
  modelId: string | null;
  providerId: string | null;
}

/** 插入 parts 前的原料（id 由 repo 补全） */
export type NewPart =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'image'; mime: string; url: string; sizeBytes?: number | null }
  | { kind: 'file'; mime: string; url: string; sizeBytes?: number | null }
  | { kind: 'tool-call'; toolName: string; toolCallId: string; argsJson: string }
  | { kind: 'tool-result'; toolName: string; toolCallId: string; resultJson: string };

export interface UpdateAssistantMessageInput {
  id: string;
  status?: MessageStatus;
  finishReason?: FinishReason | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsdCents?: number | null;
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  bodyPlain?: string;
  /** 追加的新 parts（不会清空已有） */
  appendParts?: NewPart[];
}

export interface MessageRepoDeps {
  db: AppDb;
  now: () => number;
  deviceId?: string | null;
}

/**
 * 同 parent + 同 role 视为同一组兄弟分支：插入新兄弟时
 * - 旧兄弟 isChosen=false / variantCount 更新
 * - 新兄弟 variantIndex = 旧个数 / variantCount = 旧个数+1 / isChosen=true
 */
async function siblingMeta(
  db: AppDb,
  convId: string,
  parentId: string | null,
  role: MessageRole,
): Promise<{ siblingIds: string[]; nextIndex: number; nextCount: number }> {
  const conds = [eq(messages.convId, convId), isNull(messages.deletedAt), eq(messages.role, role)];
  if (parentId === null) conds.push(isNull(messages.parentId));
  else conds.push(eq(messages.parentId, parentId));
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(...conds));
  return {
    siblingIds: rows.map((r) => r.id),
    nextIndex: rows.length,
    nextCount: rows.length + 1,
  };
}

export function createMessageRepo({ db, now, deviceId = null }: MessageRepoDeps) {
  async function insertParts(
    messageId: string,
    parts: NewPart[],
    startSeq: number,
  ): Promise<MessagePartRow[]> {
    if (parts.length === 0) return [];
    const ts = now();
    const rows: NewMessagePartRow[] = parts.map((p, i) => {
      const seq = startSeq + i;
      const id = newId();
      const base: NewMessagePartRow = {
        id,
        messageId,
        seq,
        kind: p.kind,
        text: null,
        mime: null,
        url: null,
        sizeBytes: null,
        toolName: null,
        toolCallId: null,
        argsJson: null,
        resultJson: null,
        extra: '{}',
        createdAt: ts,
      };
      switch (p.kind) {
        case 'text':
        case 'reasoning':
          base.text = p.text;
          break;
        case 'image':
        case 'file':
          base.mime = p.mime;
          base.url = p.url;
          base.sizeBytes = p.sizeBytes ?? null;
          break;
        case 'tool-call':
          base.toolName = p.toolName;
          base.toolCallId = p.toolCallId;
          base.argsJson = p.argsJson;
          break;
        case 'tool-result':
          base.toolName = p.toolName;
          base.toolCallId = p.toolCallId;
          base.resultJson = p.resultJson;
          break;
      }
      return base;
    });
    await db.insert(messageParts).values(rows);
    return db
      .select()
      .from(messageParts)
      .where(eq(messageParts.messageId, messageId))
      .orderBy(asc(messageParts.seq));
  }

  async function nextPartSeq(messageId: string): Promise<number> {
    const existing = await db
      .select({ seq: messageParts.seq })
      .from(messageParts)
      .where(eq(messageParts.messageId, messageId))
      .orderBy(asc(messageParts.seq));
    if (existing.length === 0) return 0;
    return (existing[existing.length - 1]?.seq ?? -1) + 1;
  }

  return {
    async listByConv(convId: string): Promise<MessageWithParts[]> {
      const msgRows = await db
        .select()
        .from(messages)
        .where(and(eq(messages.convId, convId), isNull(messages.deletedAt)))
        .orderBy(asc(messages.createdAt));

      if (msgRows.length === 0) return [];

      const partRows = await db
        .select()
        .from(messageParts)
        .where(
          inArray(
            messageParts.messageId,
            msgRows.map((m) => m.id),
          ),
        )
        .orderBy(asc(messageParts.messageId), asc(messageParts.seq));

      const partsByMsg = new Map<string, MessagePart[]>();
      for (const row of partRows) {
        const arr = partsByMsg.get(row.messageId) ?? [];
        arr.push(rowToPart(row));
        partsByMsg.set(row.messageId, arr);
      }

      return msgRows.map((row) => ({
        message: rowToMessage(row),
        parts: partsByMsg.get(row.id) ?? [],
      }));
    },

    async findById(id: string): Promise<MessageWithParts | null> {
      const msgRow = await db
        .select()
        .from(messages)
        .where(and(eq(messages.id, id), isNull(messages.deletedAt)))
        .limit(1)
        .then((r) => r[0]);
      if (!msgRow) return null;
      const partRows = await db
        .select()
        .from(messageParts)
        .where(eq(messageParts.messageId, id))
        .orderBy(asc(messageParts.seq));
      return {
        message: rowToMessage(msgRow),
        parts: partRows.map(rowToPart),
      };
    },

    async appendUser(input: AppendUserMessageInput): Promise<MessageWithParts> {
      const ts = now();
      const id = newId();
      const parentId = input.parentId ?? null;
      const role = input.role;
      const meta = await siblingMeta(db, input.convId, parentId, role);
      const row: NewMessageRow = {
        id,
        convId: input.convId,
        role,
        parentId,
        variantIndex: meta.nextIndex,
        variantCount: meta.nextCount,
        isChosen: true,
        modelId: null,
        providerId: null,
        status: 'ok',
        errorCode: null,
        errorMessage: null,
        tokensIn: null,
        tokensOut: null,
        costUsdCents: null,
        durationMs: null,
        finishReason: null,
        bodyPlain: input.bodyPlain ?? collectText(input.parts),
        extra: '{}',
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        deviceId,
      };
      await db.insert(messages).values(row);
      if (meta.siblingIds.length > 0) {
        await db
          .update(messages)
          .set({ isChosen: false, variantCount: meta.nextCount, updatedAt: ts })
          .where(inArray(messages.id, meta.siblingIds));
      }
      await insertParts(id, input.parts, 0);
      const saved = await this.findById(id);
      if (!saved) throw new Error(`MessageRepo.appendUser: missing inserted (${id})`);
      return saved;
    },

    async appendAssistantDraft(input: AppendAssistantDraftInput): Promise<MessageWithParts> {
      const ts = now();
      const id = newId();
      const parentId = input.parentId ?? null;
      const meta = await siblingMeta(db, input.convId, parentId, 'assistant');
      const row: NewMessageRow = {
        id,
        convId: input.convId,
        role: 'assistant',
        parentId,
        variantIndex: meta.nextIndex,
        variantCount: meta.nextCount,
        isChosen: true,
        modelId: input.modelId,
        providerId: input.providerId,
        status: 'streaming',
        errorCode: null,
        errorMessage: null,
        tokensIn: null,
        tokensOut: null,
        costUsdCents: null,
        durationMs: null,
        finishReason: null,
        bodyPlain: '',
        extra: '{}',
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        deviceId,
      };
      await db.insert(messages).values(row);
      if (meta.siblingIds.length > 0) {
        await db
          .update(messages)
          .set({ isChosen: false, variantCount: meta.nextCount, updatedAt: ts })
          .where(inArray(messages.id, meta.siblingIds));
      }
      const saved = await this.findById(id);
      if (!saved) throw new Error(`MessageRepo.appendAssistantDraft: missing inserted (${id})`);
      return saved;
    },

    async appendToolMessage(input: {
      convId: string;
      parentId: string;
      parts: NewPart[];
    }): Promise<MessageWithParts> {
      const ts = now();
      const id = newId();
      const row: NewMessageRow = {
        id,
        convId: input.convId,
        role: 'tool',
        parentId: input.parentId,
        variantIndex: 0,
        variantCount: 1,
        isChosen: true,
        modelId: null,
        providerId: null,
        status: 'ok',
        errorCode: null,
        errorMessage: null,
        tokensIn: null,
        tokensOut: null,
        costUsdCents: null,
        durationMs: null,
        finishReason: null,
        bodyPlain: collectText(input.parts),
        extra: '{}',
        createdAt: ts,
        updatedAt: ts,
        deletedAt: null,
        deviceId,
      };
      await db.insert(messages).values(row);
      await insertParts(id, input.parts, 0);
      const saved = await this.findById(id);
      if (!saved) throw new Error(`MessageRepo.appendToolMessage: missing inserted (${id})`);
      return saved;
    },

    /**
     * 沿 isChosen=true 链从 root 走到叶，返回当前活跃 turn 序列。
     */
    async listActiveChain(convId: string): Promise<MessageWithParts[]> {
      // 取该 conv 全部未删消息（少量），然后按 parentId+isChosen 在内存里走链。
      const all = await db
        .select()
        .from(messages)
        .where(and(eq(messages.convId, convId), isNull(messages.deletedAt)))
        .orderBy(asc(messages.createdAt));
      if (all.length === 0) return [];

      // parentId -> chosen child（同 parentId+role 应只有 1 个 isChosen）
      const byParent = new Map<string | null, MessageRow>();
      for (const r of all) {
        if (!r.isChosen) continue;
        const key = r.parentId ?? null;
        // 若同一 parent 出现多个 isChosen（脏数据），按 createdAt 取最新
        const exist = byParent.get(key);
        if (!exist || (exist.createdAt ?? 0) < (r.createdAt ?? 0)) byParent.set(key, r);
      }

      const chain: MessageRow[] = [];
      let cur = byParent.get(null) ?? null;
      while (cur) {
        chain.push(cur);
        cur = byParent.get(cur.id) ?? null;
      }
      if (chain.length === 0) return [];

      const ids = chain.map((m) => m.id);
      const partRows = await db
        .select()
        .from(messageParts)
        .where(inArray(messageParts.messageId, ids))
        .orderBy(asc(messageParts.messageId), asc(messageParts.seq));
      const partsByMsg = new Map<string, MessagePart[]>();
      for (const row of partRows) {
        const arr = partsByMsg.get(row.messageId) ?? [];
        arr.push(rowToPart(row));
        partsByMsg.set(row.messageId, arr);
      }
      return chain.map((row) => ({
        message: rowToMessage(row),
        parts: partsByMsg.get(row.id) ?? [],
      }));
    },

    /**
     * 同 parent + 同 role 的兄弟（含 self），按 variantIndex 升序。
     */
    async listSiblings(messageId: string): Promise<Message[]> {
      const self = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1)
        .then((r) => r[0]);
      if (!self) return [];
      const conds = [
        eq(messages.convId, self.convId),
        isNull(messages.deletedAt),
        eq(messages.role, self.role),
      ];
      if (self.parentId == null) conds.push(isNull(messages.parentId));
      else conds.push(eq(messages.parentId, self.parentId));
      const rows = await db
        .select()
        .from(messages)
        .where(and(...conds))
        .orderBy(asc(messages.variantIndex));
      return rows.map(rowToMessage);
    },

    /**
     * 把 messageId 设为当前活跃分支：同 parent+role 其他兄弟 isChosen=false。
     * 不递归调整子树，子树原有 isChosen 保留（用户切回旧分支可恢复其曾经选中的下一层）。
     */
    async chooseBranch(messageId: string): Promise<void> {
      const ts = now();
      const self = await db
        .select()
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1)
        .then((r) => r[0]);
      if (!self) throw new Error(`MessageRepo.chooseBranch: not found ${messageId}`);

      const conds = [
        eq(messages.convId, self.convId),
        isNull(messages.deletedAt),
        eq(messages.role, self.role),
      ];
      if (self.parentId == null) conds.push(isNull(messages.parentId));
      else conds.push(eq(messages.parentId, self.parentId));

      await db
        .update(messages)
        .set({
          isChosen: sql`CASE WHEN ${messages.id} = ${messageId} THEN 1 ELSE 0 END`,
          updatedAt: ts,
        })
        .where(and(...conds));
    },

    async updateAssistant(input: UpdateAssistantMessageInput): Promise<MessageWithParts> {
      const ts = now();
      const patch: Partial<NewMessageRow> = { updatedAt: ts };
      if (input.status !== undefined) patch.status = input.status;
      if (input.finishReason !== undefined) patch.finishReason = input.finishReason;
      if (input.tokensIn !== undefined) patch.tokensIn = input.tokensIn;
      if (input.tokensOut !== undefined) patch.tokensOut = input.tokensOut;
      if (input.costUsdCents !== undefined) patch.costUsdCents = input.costUsdCents;
      if (input.durationMs !== undefined) patch.durationMs = input.durationMs;
      if (input.errorCode !== undefined) patch.errorCode = input.errorCode;
      if (input.errorMessage !== undefined) patch.errorMessage = input.errorMessage;
      if (input.bodyPlain !== undefined) patch.bodyPlain = input.bodyPlain;

      await db.update(messages).set(patch).where(eq(messages.id, input.id));

      if (input.appendParts && input.appendParts.length > 0) {
        const startSeq = await nextPartSeq(input.id);
        await insertParts(input.id, input.appendParts, startSeq);
      }

      const reloaded = await this.findById(input.id);
      if (!reloaded) {
        throw new Error(`MessageRepo.updateAssistant: message not found (${input.id})`);
      }
      return reloaded;
    },

    async softDelete(id: string): Promise<void> {
      const ts = now();
      await db.update(messages).set({ deletedAt: ts, updatedAt: ts }).where(eq(messages.id, id));
    },

    /**
     * 把 partial 合并到 message.extra（JSON 列）。同名 key 覆盖，缺省 key 保留。
     * 主要用法：M4-D 把 `knowledgeHits` 写到 assistant draft 上，便于消息流可视化引用。
     */
    async setMessageExtra(id: string, patch: Record<string, unknown>): Promise<void> {
      const ts = now();
      const row = await db
        .select({ extra: messages.extra })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1)
        .then((r) => r[0]);
      const current = row ? safeJson<Record<string, unknown>>(row.extra, {}) : {};
      const merged = { ...current, ...patch };
      await db
        .update(messages)
        .set({ extra: JSON.stringify(merged), updatedAt: ts })
        .where(eq(messages.id, id));
    },
  };
}

export type MessageRepo = ReturnType<typeof createMessageRepo>;

// ─────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────

function collectText(parts: NewPart[]): string {
  return parts
    .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
    .map((p) => p.text)
    .join('');
}

function rowToMessage(row: MessageRow): Message {
  return MessageSchema.parse({
    id: row.id,
    convId: row.convId,
    role: row.role,
    parentId: row.parentId,
    variantIndex: row.variantIndex,
    variantCount: row.variantCount,
    isChosen: Boolean(row.isChosen),
    modelId: row.modelId,
    providerId: row.providerId,
    status: row.status,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsdCents: row.costUsdCents,
    durationMs: row.durationMs,
    finishReason: row.finishReason,
    extra: safeJson(row.extra, {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deviceId: row.deviceId,
  });
}

function rowToPart(row: MessagePartRow): MessagePart {
  const base = {
    id: row.id,
    messageId: row.messageId,
    seq: row.seq,
    extra: safeJson(row.extra, {}),
    createdAt: row.createdAt,
  };
  switch (row.kind) {
    case 'text':
      return { ...base, kind: 'text', text: row.text ?? '' };
    case 'reasoning':
      return { ...base, kind: 'reasoning', text: row.text ?? '' };
    case 'image':
      return {
        ...base,
        kind: 'image',
        mime: row.mime ?? 'application/octet-stream',
        url: row.url ?? '',
        sizeBytes: row.sizeBytes,
      };
    case 'file':
      return {
        ...base,
        kind: 'file',
        mime: row.mime ?? 'application/octet-stream',
        url: row.url ?? '',
        sizeBytes: row.sizeBytes,
      };
    case 'tool-call':
      return {
        ...base,
        kind: 'tool-call',
        toolName: row.toolName ?? '',
        toolCallId: row.toolCallId ?? '',
        argsJson: row.argsJson ?? '{}',
      };
    case 'tool-result':
      return {
        ...base,
        kind: 'tool-result',
        toolName: row.toolName ?? '',
        toolCallId: row.toolCallId ?? '',
        resultJson: row.resultJson ?? '{}',
      };
    default: {
      const _exhaustive: never = row.kind;
      throw new Error(`Unknown message part kind: ${String(_exhaustive)}`);
    }
  }
}

function safeJson<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
