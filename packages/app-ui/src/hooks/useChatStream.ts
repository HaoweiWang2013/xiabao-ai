/**
 * useChatStream Hook
 *
 * 统一管理 ChatPanel 中所有流式传输操作（send、regenerate、editAndResend）。
 * 封装重复的 subscription 逻辑和状态管理。
 */
import { useCallback, useState } from 'react';

import type { ChatStreamEvent } from '@xiabao/server';
import { trpc } from '../lib/trpc';

type StreamOperation =
  | {
      type: 'send';
      conversationId: string;
      modelId: string;
      text: string;
      knowledgeDocIds?: string[];
    }
  | {
      type: 'regenerate';
      conversationId: string;
      assistantMessageId: string;
      knowledgeDocIds?: string[];
    }
  | {
      type: 'edit';
      conversationId: string;
      userMessageId: string;
      text: string;
      knowledgeDocIds?: string[];
    };

interface UseChatStreamResult {
  streaming: boolean;
  pending: { id: string; text: string; reasoning: string } | null;
  error: string | null;
  activeOperation: StreamOperation | null;
  startStream: (operation: StreamOperation) => void;
  stopStream: () => void;
  clearError: () => void;
  invalidateChain: () => void;
  utils: ReturnType<typeof trpc.useUtils>;
}

export function useChatStream(convId: string): UseChatStreamResult {
  const utils = trpc.useUtils();
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState<{ id: string; text: string; reasoning: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [activeOperation, setActiveOperation] = useState<StreamOperation | null>(null);

  const invalidateChain = useCallback(() => {
    void utils.chat.listActiveChain.invalidate({ conversationId: convId });
  }, [utils, convId]);

  const handleStreamEvent = useCallback(
    (evt: ChatStreamEvent) => {
      if (evt.type === 'started') {
        setPending({ id: evt.assistantMessageId, text: '', reasoning: '' });
        setError(null);
        invalidateChain();
      } else if (evt.type === 'delta') {
        setPending((prev) => (prev ? { ...prev, text: prev.text + evt.text } : prev));
      } else if (evt.type === 'reasoning') {
        setPending((prev) => (prev ? { ...prev, reasoning: prev.reasoning + evt.text } : prev));
      } else if (evt.type === 'done' || evt.type === 'error') {
        if (evt.type === 'error') {
          setError(evt.message || evt.code || '生成失败');
        }
        setStreaming(false);
        setPending(null);
        setActiveOperation(null);
        invalidateChain();
        void utils.chat.listConversations.invalidate();
      }
    },
    [invalidateChain, utils],
  );

  const handleStreamError = useCallback((err: unknown) => {
    setStreaming(false);
    setPending(null);
    setActiveOperation(null);
    setError(err instanceof Error ? err.message : String(err));
    console.error('chat stream error', err);
  }, []);

  trpc.chat.send.useSubscription(
    activeOperation?.type === 'send'
      ? {
          conversationId: activeOperation.conversationId,
          modelId: activeOperation.modelId,
          text: activeOperation.text,
          knowledgeDocIds: activeOperation.knowledgeDocIds,
        }
      : { conversationId: '', modelId: '', text: '' },
    {
      enabled: activeOperation?.type === 'send',
      onData: handleStreamEvent,
      onError: handleStreamError,
    },
  );

  trpc.chat.regenerate.useSubscription(
    activeOperation?.type === 'regenerate'
      ? {
          assistantMessageId: activeOperation.assistantMessageId,
          knowledgeDocIds: activeOperation.knowledgeDocIds,
        }
      : { assistantMessageId: '' },
    {
      enabled: activeOperation?.type === 'regenerate',
      onData: handleStreamEvent,
      onError: handleStreamError,
    },
  );

  trpc.chat.editAndResend.useSubscription(
    activeOperation?.type === 'edit'
      ? {
          userMessageId: activeOperation.userMessageId,
          text: activeOperation.text,
          knowledgeDocIds: activeOperation.knowledgeDocIds,
        }
      : { userMessageId: '', text: ' ' },
    {
      enabled: activeOperation?.type === 'edit',
      onData: handleStreamEvent,
      onError: handleStreamError,
    },
  );

  const startStream = useCallback(
    (operation: StreamOperation) => {
      if (streaming) return;
      setStreaming(true);
      setError(null);
      setActiveOperation(operation);
    },
    [streaming],
  );

  const stopStream = useCallback(() => {
    if (!streaming) return;
    setActiveOperation(null);
    setStreaming(false);
    setPending(null);
    setError(null);
    invalidateChain();
  }, [streaming, invalidateChain]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    streaming,
    pending,
    error,
    activeOperation,
    startStream,
    stopStream,
    clearError,
    invalidateChain,
    utils,
  };
}
