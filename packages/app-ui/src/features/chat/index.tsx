/**
 * ChatPanel · 重构后的聊天主面板
 *
 * 见 docs/12-ui-design.md §4 与 §6.4。
 *
 * - 顶部 TabBar（多会话）
 * - 中部 Messages（user 气泡 + assistant 文档流 + tool 折叠卡）
 * - 底部 Composer（自适应高度 + 模型 popover + 工具行）
 * - 空会话时展示 EmptyState
 */
import { useAtom } from 'jotai';
import { useEffect, useMemo, useRef, useState } from 'react';

import { estimateTokens } from '@xiabao/core';
import type { MessageWithParts, SearchHit } from '@xiabao/server';
import { activeTabIdAtom, openTabsAtom, primaryNavAtom, settingsSectionAtom } from '@xiabao/state';
import { Button, Card } from '@xiabao/ui';

import { Composer } from '../../components/Composer';
import { EmptyState, type RecommendedPrompt } from '../../components/EmptyState';
import { MessageBubble } from '../../components/MessageBubble';
import { MessageDocAssistant } from '../../components/MessageDocAssistant';
import { type ModelOption } from '../../components/ModelSelector';
import { ToolMessage } from '../../components/ToolMessage';
import { useChatStream } from '../../hooks/useChatStream';
import { TabBar } from '../../layout/TabBar';
import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

import { KnowledgeBaseSelector } from './KnowledgeBaseSelector';
import { KnowledgeDocSelector } from './KnowledgeDocSelector';
import { KnowledgeHitsPanel } from './KnowledgeHitsPanel';
import { Launcher } from './Launcher';
import { usePaneContext } from './SplitChatView';

type ChainMessageBundle = MessageWithParts;

interface SelectedModel {
  providerId: string;
  modelId: string;
  modelName: string;
  providerName: string;
}

export function ChatPanel({ hideTabBar = false }: { hideTabBar?: boolean } = {}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const conversationsQ = trpc.chat.listConversations.useQuery();
  const providersQ = trpc.provider.listWithModels.useQuery();

  const paneCtx = usePaneContext();
  const [globalActive, setGlobalActive] = useAtom(activeTabIdAtom);
  const [globalTabs, setGlobalTabs] = useAtom(openTabsAtom);

  const active = paneCtx ? paneCtx.activeTabId : globalActive;
  const tabs = paneCtx ? paneCtx.tabs : globalTabs;
  const setActive = paneCtx ? paneCtx.setActiveTabId : setGlobalActive;
  const setTabs = paneCtx ? paneCtx.setTabs : setGlobalTabs;

  const [, setNav] = useAtom(primaryNavAtom);
  const [, setSettingsSection] = useAtom(settingsSectionAtom);

  const [selected, setSelected] = useState<SelectedModel | null>(null);
  const [emptyInput, setEmptyInput] = useState('');
  const conversations = conversationsQ.data ?? [];

  const modelOptions: ModelOption[] = useMemo(
    () =>
      (providersQ.data ?? [])
        .filter((p) => p.provider.enabled)
        .flatMap((p) =>
          p.models
            .filter((m) => m.enabled)
            .map<ModelOption>((m) => ({
              providerId: p.provider.id,
              providerName: p.provider.name,
              modelId: m.id,
              modelDisplay: m.display,
              contextTokens: m.contextTokens ?? undefined,
            })),
        ),
    [providersQ.data],
  );

  // 自动选第一个可用模型
  useEffect(() => {
    if (modelOptions.length === 0) {
      if (selected) setSelected(null);
      return;
    }

    const selectedAvailable =
      selected &&
      modelOptions.some(
        (m) => m.providerId === selected.providerId && m.modelId === selected.modelId,
      );
    if (selectedAvailable) return;

    const first = modelOptions[0];
    setSelected({
      providerId: first.providerId,
      modelId: first.modelId,
      modelName: first.modelDisplay,
      providerName: first.providerName,
    });
  }, [modelOptions, selected]);

  const createConv = trpc.chat.createConversation.useMutation({
    onSuccess: (conv) => {
      void utils.chat.listConversations.invalidate();
      setActive(conv.id);
      setTabs((prev) =>
        prev.some((t) => t.id === conv.id) ? prev : [...prev, { id: conv.id, title: conv.title }],
      );
    },
  });

  /**
   * P9 · 9-8：Tab bar 的 [+] 不再直接建对话，而是 push 一个『起始页』tab（type='launcher'）。
   * 用户在起始页里点应用图标，再决定下一步动作（建对话 / 跳模块）。
   */
  function handleNewTab() {
    const { t } = useTranslation();
    const id = `launcher:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setTabs((prev) => [
      ...prev,
      { id, title: t('chatMain.newTab', { defaultValue: '起始页' }), type: 'launcher' },
    ]);
    setActive(id);
  }

  function handlePromptClick(p: RecommendedPrompt) {
    createConv.mutate(
      { title: p.title ?? '' },
      {
        onSuccess: () => {
          // 提示词由 ChatRoom 内部首次渲染读取（暂用 sessionStorage 传递）
          sessionStorage.setItem('xiabao.draft', p.prompt);
        },
      },
    );
  }

  const activeTab = active ? (tabs.find((t) => t.id === active) ?? null) : null;
  const activeIsLauncher = activeTab?.type === 'launcher';
  const activeConv =
    activeTab && !activeIsLauncher
      ? (conversations.find((c) => c.id === activeTab.id) ?? null)
      : null;
  const modelConfigUnavailable = !selected && !providersQ.isLoading;

  function openModelSettings() {
    setSettingsSection('models');
    setNav('settings');
  }

  // ── Launcher 跳转：能跳的直接跳，没占位 toast ──
  function launcherCreateChat() {
    createConv.mutate({
      title: `${t('chatMain.newConvPrefix', { defaultValue: '新对话' })} ${new Date().toLocaleTimeString()}`,
    });
  }
  function launcherOpenKnowledge() {
    setNav('knowledge');
  }
  function launcherOpenProviders() {
    setSettingsSection('models');
    setNav('settings');
  }
  function launcherOpenTools() {
    setSettingsSection('tools');
    setNav('settings');
  }
  function launcherOpenAppearance() {
    setSettingsSection('appearance');
    setNav('settings');
  }
  function launcherOpenAbout() {
    setSettingsSection('about');
    setNav('settings');
  }

  function handleEmptySend() {
    const text = emptyInput.trim();
    if (!text) return;
    setEmptyInput('');
    createConv.mutate(
      { title: text.slice(0, 30) },
      {
        onSuccess: () => {
          sessionStorage.setItem('xiabao.draft', text);
          sessionStorage.setItem('xiabao.autoSend', 'true');
        },
      },
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!paneCtx && !hideTabBar && <TabBar onNewTab={handleNewTab} />}
      {activeIsLauncher ? (
        <Launcher
          onCreateChat={launcherCreateChat}
          onOpenKnowledge={launcherOpenKnowledge}
          onOpenProviders={launcherOpenProviders}
          onOpenTools={launcherOpenTools}
          onOpenAppearance={launcherOpenAppearance}
          onOpenAbout={launcherOpenAbout}
        />
      ) : activeConv && selected ? (
        <ChatRoom
          convId={activeConv.id}
          selected={selected}
          modelOptions={modelOptions}
          onSelectModel={(m) =>
            setSelected({
              providerId: m.providerId,
              modelId: m.modelId,
              modelName: m.modelDisplay,
              providerName: m.providerName,
            })
          }
        />
      ) : modelConfigUnavailable ? (
        <NoModelState error={providersQ.error?.message} onOpenSettings={openModelSettings} />
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <EmptyState
            prompts={undefined}
            recents={conversations.map((c) => ({
              id: c.id,
              title: c.title,
              updatedAt: c.updatedAt,
            }))}
            onSelectPrompt={handlePromptClick}
            onSelectRecent={(c) => {
              setActive(c.id);
              setTabs((prev) =>
                prev.some((t) => t.id === c.id) ? prev : [...prev, { id: c.id, title: c.title }],
              );
            }}
          />
          {selected ? (
            <div className="border-border/40 bg-background/50 border-t p-3">
              <Composer
                value={emptyInput}
                onChange={setEmptyInput}
                onSend={handleEmptySend}
                models={modelOptions}
                selectedModel={{ providerId: selected.providerId, modelId: selected.modelId }}
                onSelectModel={(m) =>
                  setSelected({
                    providerId: m.providerId,
                    modelId: m.modelId,
                    modelName: m.modelDisplay,
                    providerName: m.providerName,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NoModelState({ error, onOpenSettings }: { error?: string; onOpenSettings: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center px-6">
      <Card className="max-w-md p-6 text-center">
        <div className="bg-primary/10 text-primary mx-auto flex h-12 w-12 items-center justify-center rounded-2xl">
          <span className="text-lg">🤖</span>
        </div>
        <h2 className="mt-4 text-lg font-semibold">
          {t('chatMain.noModelTitle', { defaultValue: '还没有可用模型' })}
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {error
            ? `${t('chatMain.noModelError', { defaultValue: '模型配置加载失败：' })}${error}`
            : t('chatMain.noModelHint', {
                defaultValue:
                  '已配置 Provider 但模型列表为空？请到设置 → Providers，点击 Provider 卡片上的 🔄 按钮从远端拉取模型列表。',
              })}
        </p>
        <p className="text-muted-foreground/80 mt-1 text-xs">
          {t('chatMain.localEmbedderNote', {
            defaultValue: '注意：local-embedder 类型仅用于知识库向量化，不会出现在对话模型选择器。',
          })}
        </p>
        <Button className="mt-5" onClick={onOpenSettings}>
          {t('chatMain.openModelSettings', { defaultValue: '打开模型设置' })}
        </Button>
      </Card>
    </div>
  );
}

function ChatRoom({
  convId,
  selected,
  modelOptions,
  onSelectModel,
}: {
  convId: string;
  selected: SelectedModel;
  modelOptions: ModelOption[];
  onSelectModel: (m: ModelOption) => void;
}) {
  const { t } = useTranslation();
  const {
    streaming,
    pending,
    error: streamError,
    startStream,
    stopStream,
    clearError,
    invalidateChain,
    utils,
  } = useChatStream(convId, () => {
    if (conversationQ.data && !conversationQ.data.autoRenamed) {
      autoRenameMut.mutate({ id: convId });
    }
  });

  const chainQ = trpc.chat.listActiveChain.useQuery({ conversationId: convId });
  const messages = useMemo(() => chainQ.data ?? [], [chainQ.data]);

  // M4-E：拉当前 conversation 拿 knowledgeBases，用于 KB 选择器
  const conversationQ = trpc.chat.getConversation.useQuery({ id: convId });
  const selectedKbIds = useMemo(
    () => conversationQ.data?.knowledgeBases ?? [],
    [conversationQ.data?.knowledgeBases],
  );
  const updateConv = trpc.chat.updateConversation.useMutation({
    onSuccess: () => {
      void utils.chat.getConversation.invalidate({ id: convId });
      void utils.chat.listConversations.invalidate();
    },
  });

  const autoRenameMut = trpc.chat.autoRenameConversation.useMutation({
    onSuccess: () => {
      void utils.chat.getConversation.invalidate({ id: convId });
      void utils.chat.listConversations.invalidate();
    },
  });
  // M4 长尾 · `#` 文档级引用：仅 send-time 状态；不持久化
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  function handleKbChange(nextKbIds: string[]) {
    // KB 列表变化 → 清空已选文档（避免引用一个已被取消的 KB 内文档）
    if (selectedDocIds.length > 0) setSelectedDocIds([]);
    updateConv.mutate({ id: convId, knowledgeBases: nextKbIds });
  }
  function handleDocChange(nextDocIds: string[]) {
    setSelectedDocIds(nextDocIds);
  }
  /** Composer 内联 `#` mention 选中文档时合入 selectedDocIds（去重） */
  function handlePickMentionedDoc(docId: string) {
    setSelectedDocIds((prev) => (prev.includes(docId) ? prev : [...prev, docId]));
  }

  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const scrollerRef = useRef<HTMLDivElement>(null);

  // 来自 EmptyState 的 prompt draft
  useEffect(() => {
    // 切换会话时清理上一会话的流式状态和编辑状态
    setEditingId(null);
    setEditingText('');
    // M4 长尾 · `#` 文档级引用 state 不跨会话保留
    setSelectedDocIds([]);

    const draft = sessionStorage.getItem('xiabao.draft');
    const autoSend = sessionStorage.getItem('xiabao.autoSend');
    if (draft) {
      sessionStorage.removeItem('xiabao.draft');
      if (autoSend === 'true') {
        sessionStorage.removeItem('xiabao.autoSend');
        send(draft);
      } else {
        setInput(draft);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  function retryLastAssistant() {
    const lastAssistant = [...messages].reverse().find((m) => m.message.role === 'assistant');
    if (lastAssistant) {
      handleRegenerate(lastAssistant.message.id);
    }
  }

  // 自动滚到底
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages, pending?.text]);

  function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || streaming) return;
    if (textOverride === undefined) {
      setInput('');
    }
    startStream({
      type: 'send',
      conversationId: convId,
      modelId: selected.modelId,
      text,
      knowledgeDocIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
    });
  }

  function handleRegenerate(assistantMessageId: string) {
    if (streaming) return;
    startStream({
      type: 'regenerate',
      conversationId: convId,
      assistantMessageId,
      knowledgeDocIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
    });
  }

  function handleStartEdit(userMessageId: string, currentText: string) {
    setEditingId(userMessageId);
    setEditingText(currentText);
  }

  function handleConfirmEdit() {
    if (!editingId) return;
    const text = editingText.trim();
    if (!text) return;
    const id = editingId;
    setEditingId(null);
    setEditingText('');
    startStream({
      type: 'edit',
      conversationId: convId,
      userMessageId: id,
      text,
      knowledgeDocIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
    });
  }

  function gotoSibling(messageId: string, siblings: { id: string }[], delta: number) {
    if (siblings.length < 2) return;
    const idx = siblings.findIndex((s) => s.id === messageId);
    if (idx < 0) return;
    const next = siblings[(idx + delta + siblings.length) % siblings.length];
    if (next) chooseBranchM.mutate({ messageId: next.id });
  }

  const chooseBranchM = trpc.chat.chooseBranch.useMutation({ onSuccess: () => invalidateChain() });

  // 计算上下文使用情况
  const contextUsage = useMemo(() => {
    // 获取当前模型的上下文窗口
    const modelContextTokens = modelOptions.find(
      (m) => m.providerId === selected.providerId && m.modelId === selected.modelId,
    )?.contextTokens;

    // 如果没有 contextTokens，使用默认值（32k）
    const effectiveContextTokens = modelContextTokens ?? 32768;

    // 计算已有消息的 tokens
    const messageTokens = messages.reduce((sum, m) => {
      const text = collectText(m);
      const reasoning = collectReasoning(m);
      return sum + estimateTokens(text) + estimateTokens(reasoning);
    }, 0);

    // 加上当前输入的 tokens
    const inputTokens = estimateTokens(input);
    const totalUsed = messageTokens + inputTokens;
    const remaining = Math.max(0, effectiveContextTokens - totalUsed);
    const percentage = Math.max(
      0,
      Math.min(100, Math.round((remaining / effectiveContextTokens) * 100)),
    );

    return {
      total: effectiveContextTokens,
      used: totalUsed,
      remaining,
      percentage,
    };
  }, [messages, input, modelOptions, selected]);

  const composerSelectedModel = { providerId: selected.providerId, modelId: selected.modelId };

  return (
    <>
      <div ref={scrollerRef} className="scroll-thin flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {messages.map((m) => {
            const isPending = pending?.id === m.message.id;
            const text = isPending && pending ? pending.text : collectText(m);
            const reasoning =
              isPending && pending ? (pending.reasoning ?? '') : collectReasoning(m);
            if (m.message.role === 'tool') {
              const results = m.parts
                .filter((p) => p.kind === 'tool-result')
                .map((p) => ({
                  toolName: p.kind === 'tool-result' ? p.toolName : undefined,
                  resultJson: p.kind === 'tool-result' ? p.resultJson : undefined,
                }));
              return <ToolMessage key={m.message.id} results={results} />;
            }
            const toolCalls = m.parts.filter(
              (p): p is Extract<typeof p, { kind: 'tool-call' }> => p.kind === 'tool-call',
            );
            if (m.message.role === 'user') {
              return (
                <UserBubbleWithSiblings
                  key={m.message.id}
                  message={m}
                  text={text}
                  editing={editingId === m.message.id}
                  editingText={editingText}
                  onEditingTextChange={setEditingText}
                  onStartEdit={() => handleStartEdit(m.message.id, collectText(m))}
                  onCancelEdit={() => {
                    setEditingId(null);
                    setEditingText('');
                  }}
                  onConfirmEdit={handleConfirmEdit}
                  gotoSibling={(delta, siblings) => gotoSibling(m.message.id, siblings, delta)}
                  disabled={streaming}
                />
              );
            }
            return (
              <AssistantWithSiblings
                key={m.message.id}
                message={m}
                text={text}
                reasoning={reasoning}
                streaming={isPending}
                modelLabel={selected.modelName}
                toolCalls={toolCalls}
                onRegenerate={() => handleRegenerate(m.message.id)}
                gotoSibling={(delta, siblings) => gotoSibling(m.message.id, siblings, delta)}
                disabled={streaming}
              />
            );
          })}
          {pending && !messages.some((m) => m.message.id === pending.id) && (
            <MessageDocAssistant
              key={pending.id}
              text={pending.text}
              reasoning={pending.reasoning}
              streaming
              modelLabel={selected.modelName}
            />
          )}
          {messages.length === 0 && !pending ? (
            <div className="text-muted-foreground py-10 text-center text-xs">
              {t('chatMain.firstMsgHint', { defaultValue: '发出第一条消息开始对话' })}
            </div>
          ) : null}
        </div>
      </div>
      {streamError ? (
        <div className="mx-auto w-full max-w-3xl px-4">
          <div className="border-destructive/40 bg-destructive/5 text-destructive flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs">
            <span className="truncate">
              {t('chatMain.streamError', { defaultValue: '生成失败：' })}
              {streamError}
            </span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="hover:bg-destructive/10 rounded px-2 py-0.5"
                onClick={retryLastAssistant}
              >
                {t('chatMain.retry', { defaultValue: '重试' })}
              </button>
              <button
                type="button"
                className="hover:bg-destructive/10 rounded px-2 py-0.5"
                onClick={clearError}
              >
                {t('chatMain.close', { defaultValue: '关闭' })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Composer
        value={input}
        onChange={setInput}
        onSend={send}
        onStop={stopStream}
        busy={streaming}
        models={modelOptions}
        selectedModel={composerSelectedModel}
        onSelectModel={onSelectModel}
        extraTools={
          <>
            <KnowledgeBaseSelector
              selectedKbIds={selectedKbIds}
              onChange={handleKbChange}
              disabled={streaming}
            />
            <KnowledgeDocSelector
              selectedKbIds={selectedKbIds}
              selectedDocIds={selectedDocIds}
              onChange={handleDocChange}
              disabled={streaming}
            />
          </>
        }
        mentionConfig={{
          kbIds: selectedKbIds,
          selectedDocIds,
          onPickDoc: handlePickMentionedDoc,
        }}
        contextUsage={contextUsage}
        voiceConfig={{ convId }}
      />
    </>
  );
}

function UserBubbleWithSiblings({
  message,
  text,
  editing,
  editingText,
  onEditingTextChange,
  onStartEdit,
  onCancelEdit,
  onConfirmEdit,
  gotoSibling,
  disabled,
}: {
  message: ChainMessageBundle;
  text: string;
  editing: boolean;
  editingText: string;
  onEditingTextChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onConfirmEdit: () => void;
  gotoSibling: (delta: number, siblings: { id: string }[]) => void;
  disabled: boolean;
}) {
  const showBranch = message.message.variantCount > 1;
  const siblingsQ = trpc.chat.listSiblings.useQuery(
    { messageId: message.message.id },
    { enabled: showBranch },
  );
  const siblings = siblingsQ.data ?? [];
  return (
    <MessageBubble
      text={text}
      editing={editing}
      editingText={editingText}
      onEditingTextChange={onEditingTextChange}
      onStartEdit={onStartEdit}
      onCancelEdit={onCancelEdit}
      onConfirmEdit={onConfirmEdit}
      variantIndex={message.message.variantIndex}
      variantCount={message.message.variantCount}
      onPrev={() => gotoSibling(-1, siblings)}
      onNext={() => gotoSibling(1, siblings)}
      disabled={disabled}
    />
  );
}

function AssistantWithSiblings({
  message,
  text,
  reasoning,
  streaming,
  modelLabel,
  toolCalls,
  onRegenerate,
  gotoSibling,
  disabled,
}: {
  message: ChainMessageBundle;
  text: string;
  reasoning: string;
  streaming: boolean;
  modelLabel?: string;
  toolCalls: { toolName: string; toolCallId: string; argsJson: string }[];
  onRegenerate: () => void;
  gotoSibling: (delta: number, siblings: { id: string }[]) => void;
  disabled: boolean;
}) {
  const showBranch = message.message.variantCount > 1;
  const siblingsQ = trpc.chat.listSiblings.useQuery(
    { messageId: message.message.id },
    { enabled: showBranch },
  );
  const siblings = siblingsQ.data ?? [];
  // M4-E：从 message.extra.knowledgeHits 取 RAG 命中源块
  const extraHits = (message.message.extra as { knowledgeHits?: SearchHit[] } | undefined)
    ?.knowledgeHits;
  const hits = Array.isArray(extraHits) ? extraHits : [];
  return (
    <MessageDocAssistant
      text={text}
      reasoning={reasoning}
      streaming={streaming}
      modelLabel={modelLabel}
      toolCalls={toolCalls}
      onRegenerate={onRegenerate}
      variantIndex={message.message.variantIndex}
      variantCount={message.message.variantCount}
      onPrev={() => gotoSibling(-1, siblings)}
      onNext={() => gotoSibling(1, siblings)}
      disabled={disabled}
      footer={hits.length > 0 ? <KnowledgeHitsPanel hits={hits} /> : undefined}
    />
  );
}

function collectText(m: { parts: { kind: string; text?: string }[] }): string {
  return m.parts
    .filter((p) => p.kind === 'text')
    .map((p) => p.text ?? '')
    .join('');
}

function collectReasoning(m: { parts: { kind: string; text?: string }[] }): string {
  return m.parts
    .filter((p) => p.kind === 'reasoning')
    .map((p) => p.text ?? '')
    .join('');
}
