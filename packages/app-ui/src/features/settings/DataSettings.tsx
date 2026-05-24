/**
 * DataSettings · 数据管理
 *
 * 当前实现：导出 / 导入 JSON、清空会话、重置全部设置。
 * 导入采用后端 chat.importConversation 接口，线性主链还原。
 */
import { useAtom } from 'jotai';
import { AlertTriangle, Download, RotateCcw, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { SETTINGS_STORAGE_KEYS, activeTabIdAtom, openTabsAtom } from '@xiabao/state';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';

export function DataSettings() {
  const utils = trpc.useUtils();
  const conversationsQ = trpc.chat.listConversations.useQuery();
  const deleteConversation = trpc.chat.deleteConversation.useMutation();
  const [, setTabs] = useAtom(openTabsAtom);
  const [, setActive] = useAtom(activeTabIdAtom);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importMutation = trpc.chat.importConversation.useMutation();

  const conversations = conversationsQ.data ?? [];

  async function exportData() {
    if (conversationsQ.isLoading || exporting) return;

    setExporting(true);
    setExportError(null);
    try {
      const entries = await Promise.all(
        conversations.map(async (conversation) => ({
          conversation,
          messages: await utils.chat.listMessages.fetch({ conversationId: conversation.id }),
        })),
      );
      const payload = {
        app: 'XiabaoAI',
        version: 1,
        exportedAt: new Date().toISOString(),
        conversations: entries,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `xiabao-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  function pickImportFile() {
    if (importing) return;
    fileInputRef.current?.click();
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportError(null);
    setImportMessage(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      if (
        !json ||
        typeof json !== 'object' ||
        !Array.isArray((json as { conversations?: unknown }).conversations)
      ) {
        throw new Error('文件格式不正确：缺少 conversations 字段');
      }
      const items = (json as { conversations: unknown[] }).conversations;
      let ok = 0;
      let totalMessages = 0;
      const failures: string[] = [];
      for (const item of items) {
        if (
          !item ||
          typeof item !== 'object' ||
          !(item as { conversation?: unknown }).conversation
        ) {
          failures.push('条目缺少 conversation');
          continue;
        }
        const entry = item as {
          conversation: { title?: string };
          messages?: unknown[];
        };
        try {
          const result = await importMutation.mutateAsync({
            conversation: entry.conversation as never,
            messages: (entry.messages ?? []) as never,
          });
          ok += 1;
          totalMessages += result.messageCount;
        } catch (err) {
          const title = entry.conversation?.title ?? '未命名';
          failures.push(`${title}：${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await utils.chat.listConversations.invalidate();
      const summary = `已导入 ${ok} / ${items.length} 个会话，共 ${totalMessages} 条消息`;
      setImportMessage(failures.length > 0 ? `${summary}，${failures.length} 个失败` : summary);
      if (failures.length > 0) {
        setImportError(failures.slice(0, 3).join('、'));
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function resetAllSettings() {
    if (resetting) return;
    if (
      !confirm(
        '将清除主题、强调色、密度、字号、引导状态等本地偏好，不会删除会话与 API Key。确定重置吗？',
      )
    )
      return;
    setResetting(true);
    try {
      for (const key of SETTINGS_STORAGE_KEYS) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore individual key removal errors
        }
      }
    } finally {
      setResetting(false);
    }
    if (confirm('设置已重置，需重载页面才能生效。现在重载？')) {
      window.location.reload();
    }
  }

  async function clearAllConversations() {
    if (conversations.length === 0 || deleteConversation.isLoading) return;
    if (!confirm(`确定要清空 ${conversations.length} 个会话吗？此操作不可撤销。`)) return;

    for (const conversation of conversations) {
      await deleteConversation.mutateAsync({ id: conversation.id });
    }

    setTabs([]);
    setActive(null);
    await utils.chat.listConversations.invalidate();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center border-b px-6">
        <h2 className="text-sm font-semibold">数据</h2>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle>导出 / 导入</CardTitle>
              <CardDescription>把所有会话与消息导出为本地 JSON 文件</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={conversationsQ.isLoading || exporting}
                    onClick={() => void exportData()}
                  >
                    <Download className="h-3.5 w-3.5" /> {exporting ? '导出中…' : '导出 JSON'}
                  </Button>
                  <Button variant="outline" size="sm" disabled={importing} onClick={pickImportFile}>
                    <Upload className="h-3.5 w-3.5" /> {importing ? '导入中…' : '导入 JSON'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImportFile(file);
                    }}
                  />
                </div>
                {exportError ? (
                  <p className="text-destructive text-xs">{exportError}</p>
                ) : importError ? (
                  <p className="text-destructive text-xs">导入异常：{importError}</p>
                ) : importMessage ? (
                  <p className="text-success text-xs">{importMessage}</p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    导入仅会还原主链消息（不含分叉树）；assistant 消息不会丢失，但不再绑定原 model。
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">危险操作</CardTitle>
              <CardDescription>清除会话或重置全部数据，操作不可撤销</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <div className="border-destructive/40 bg-destructive/5 flex items-center gap-2 rounded-md border p-3">
                  <AlertTriangle className="text-destructive h-4 w-4" />
                  <span className="text-xs">
                    清空会话与消息会让历史记录无法恢复，请先导出备份。
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  当前共有 {conversationsQ.isLoading ? '…' : conversations.length} 个会话。
                </p>
                {deleteConversation.error ? (
                  <p className="text-destructive text-xs">{deleteConversation.error.message}</p>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={
                      conversationsQ.isLoading ||
                      conversations.length === 0 ||
                      deleteConversation.isLoading
                    }
                    onClick={() => void clearAllConversations()}
                  >
                    {deleteConversation.isLoading ? '清空中…' : '清空所有会话'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resetting}
                    onClick={resetAllSettings}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {resetting ? '重置中…' : '重置全部设置'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
