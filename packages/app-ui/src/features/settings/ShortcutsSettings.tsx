/**
 * ShortcutsSettings · 快捷键编辑器 + Cheat Sheet
 *
 * 见 docs/12-ui-design.md §9.1。
 *
 * 上半区：4 个全局动作可编辑，按下"录入"打开弹窗，按一组键即写入
 * 下半区：会话内固定快捷键（只读速查）
 */
import { useAtom } from 'jotai';
import { Keyboard, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_SHORTCUTS,
  shortcutBindingsAtom,
  type ShortcutBindings,
  type ShortcutId,
} from '@xiabao/state';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from '@xiabao/ui';

import { useTranslation } from '../../lib/useTranslation';

const ACTIONS: { id: ShortcutId; labelKey: string; defaultLabel: string }[] = [
  { id: 'commandPalette', labelKey: 'settings.shortcuts.commandPalette', defaultLabel: '命令面板' },
  {
    id: 'newConversation',
    labelKey: 'settings.shortcuts.newConversation',
    defaultLabel: '新建对话',
  },
  { id: 'openSettings', labelKey: 'settings.shortcuts.openSettings', defaultLabel: '打开设置' },
  {
    id: 'toggleSidebar',
    labelKey: 'settings.shortcuts.toggleSidebar',
    defaultLabel: '折叠 / 展开侧栏',
  },
];

const READONLY_TIPS: { keys: string; descKey: string; defaultDesc: string }[] = [
  { keys: 'Enter', descKey: 'settings.shortcuts.tip.send', defaultDesc: '发送消息' },
  { keys: 'Shift + Enter', descKey: 'settings.shortcuts.tip.newline', defaultDesc: '换行' },
  { keys: 'Esc', descKey: 'settings.shortcuts.tip.cancel', defaultDesc: '取消编辑 / 关闭弹层' },
];

export function ShortcutsSettings() {
  const { t } = useTranslation();
  const [bindings, setBindings] = useAtom(shortcutBindingsAtom);
  const [editingId, setEditingId] = useState<ShortcutId | null>(null);

  // 冲突检测：同一组合不能绑两个动作
  const conflictMap = useMemo(() => {
    const map = new Map<string, ShortcutId[]>();
    (Object.keys(bindings) as ShortcutId[]).forEach((id) => {
      const key = bindings[id]?.toLowerCase().replaceAll(' ', '');
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(id);
    });
    return map;
  }, [bindings]);

  function applyBinding(id: ShortcutId, hotkey: string) {
    setBindings((prev: ShortcutBindings) => ({ ...prev, [id]: hotkey }));
  }

  function resetOne(id: ShortcutId) {
    setBindings((prev: ShortcutBindings) => ({ ...prev, [id]: DEFAULT_SHORTCUTS[id] }));
  }

  function resetAll() {
    setBindings({ ...DEFAULT_SHORTCUTS });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
        <h2 className="text-sm font-semibold">
          {t('settings.sections.shortcuts', { defaultValue: '快捷键' })}
        </h2>
        <Button variant="ghost" size="sm" onClick={resetAll}>
          <RotateCcw className="h-3.5 w-3.5" />
          {t('settings.shortcuts.resetAll', { defaultValue: '全部恢复默认' })}
        </Button>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-4 w-4" />
                {t('settings.shortcuts.editableTitle', { defaultValue: '全局动作' })}
              </CardTitle>
              <CardDescription>
                {t('settings.shortcuts.editableDesc', {
                  defaultValue: '点「录入」后按下你想要的组合键',
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col">
                {ACTIONS.map(({ id, labelKey, defaultLabel }) => {
                  const current = bindings[id] ?? DEFAULT_SHORTCUTS[id];
                  const isCustom = current !== DEFAULT_SHORTCUTS[id];
                  const conflictIds = (
                    conflictMap.get(current.toLowerCase().replaceAll(' ', '')) ?? []
                  ).filter((other) => other !== id);
                  const hasConflict = conflictIds.length > 0;
                  return (
                    <li
                      key={id}
                      className="border-border/40 flex items-center justify-between gap-3 border-t py-2 first:border-t-0"
                    >
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="text-foreground">
                          {t(labelKey, { defaultValue: defaultLabel })}
                        </span>
                        {hasConflict ? (
                          <span className="text-destructive">
                            {t('settings.shortcuts.conflict', {
                              defaultValue: '与其他动作冲突',
                            })}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <kbd className="border-border/60 bg-secondary/40 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                          {displayHotkey(current)}
                        </kbd>
                        <Button variant="outline" size="sm" onClick={() => setEditingId(id)}>
                          {t('settings.shortcuts.record', { defaultValue: '录入' })}
                        </Button>
                        {isCustom ? (
                          <Button variant="ghost" size="sm" onClick={() => resetOne(id)}>
                            {t('settings.shortcuts.resetOne', { defaultValue: '恢复默认' })}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t('settings.shortcuts.cheatTitle', { defaultValue: '会话内' })}
              </CardTitle>
              <CardDescription>
                {t('settings.shortcuts.cheatDesc', { defaultValue: '只读：会话窗口内的固定按键' })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col">
                {READONLY_TIPS.map((s) => (
                  <li
                    key={s.keys}
                    className="border-border/40 flex items-center justify-between gap-3 border-t py-2 text-xs first:border-t-0"
                  >
                    <span className="text-muted-foreground">
                      {t(s.descKey, { defaultValue: s.defaultDesc })}
                    </span>
                    <kbd className="border-border/60 bg-secondary/40 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      <RecordDialog
        open={editingId != null}
        actionId={editingId}
        currentBindings={bindings}
        onClose={() => setEditingId(null)}
        onConfirm={(hotkey) => {
          if (editingId) applyBinding(editingId, hotkey);
          setEditingId(null);
        }}
      />
    </div>
  );
}

/**
 * 把 KeyboardEvent 转成 react-hotkeys-hook 兼容的 'mod+shift+k' 格式
 *
 * - ctrl/meta 一律归一为 'mod'（让 macOS / Windows 自动适配）
 * - 主键用 e.key.toLowerCase()，部分键用别名（' ' -> 'space' 等）
 */
function normalizeHotkey(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');

  const k = e.key;
  // 纯 modifier 不算
  if (k === 'Control' || k === 'Meta' || k === 'Alt' || k === 'Shift') return null;

  let main = k.toLowerCase();
  if (main === ' ') main = 'space';
  else if (main === 'arrowup') main = 'up';
  else if (main === 'arrowdown') main = 'down';
  else if (main === 'arrowleft') main = 'left';
  else if (main === 'arrowright') main = 'right';
  else if (main === 'escape') main = 'esc';

  parts.push(main);
  return parts.join('+');
}

/** 把 'mod+shift+k' 显示成 '⌘/Ctrl + Shift + K' */
function displayHotkey(hotkey: string): string {
  return hotkey
    .split('+')
    .map((seg) => {
      const s = seg.toLowerCase();
      if (s === 'mod') return navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
      if (s === 'shift') return 'Shift';
      if (s === 'alt') return navigator.platform.toLowerCase().includes('mac') ? '⌥' : 'Alt';
      if (s === 'ctrl') return 'Ctrl';
      if (s === 'meta') return '⌘';
      if (s === 'space') return 'Space';
      if (s === 'esc') return 'Esc';
      if (s.length === 1) return s.toUpperCase();
      return s.charAt(0).toUpperCase() + s.slice(1);
    })
    .join(' + ');
}

interface RecordDialogProps {
  open: boolean;
  actionId: ShortcutId | null;
  currentBindings: ShortcutBindings;
  onClose: () => void;
  onConfirm: (hotkey: string) => void;
}

function RecordDialog({ open, actionId, currentBindings, onClose, onConfirm }: RecordDialogProps) {
  const { t } = useTranslation();
  const [captured, setCaptured] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);

  // 打开时清空旧录入并把焦点拿到捕获区
  useEffect(() => {
    if (open) {
      setCaptured(null);
      // 等下一帧 Dialog 渲染完毕再聚焦
      const t1 = setTimeout(() => captureRef.current?.focus(), 50);
      return () => clearTimeout(t1);
    }
    return undefined;
  }, [open]);

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const hk = normalizeHotkey(e.nativeEvent);
    if (hk) setCaptured(hk);
  }

  const conflictWith =
    captured && actionId
      ? (Object.keys(currentBindings) as ShortcutId[]).find(
          (other) =>
            other !== actionId &&
            currentBindings[other]?.toLowerCase().replaceAll(' ', '') ===
              captured.toLowerCase().replaceAll(' ', ''),
        )
      : undefined;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('settings.shortcuts.recordTitle', { defaultValue: '录入快捷键' })}
          </DialogTitle>
          <DialogDescription>
            {t('settings.shortcuts.recordHint', {
              defaultValue: '聚焦到下方框中按下你想要的组合键',
            })}
          </DialogDescription>
        </DialogHeader>
        <div
          ref={captureRef}
          tabIndex={0}
          role="textbox"
          aria-label="capture-hotkey"
          onKeyDown={handleKey}
          className="border-border/60 bg-secondary/30 focus-visible:ring-primary/40 flex h-20 cursor-text items-center justify-center rounded-md border outline-none focus-visible:ring-2"
        >
          <kbd className="font-mono text-sm">
            {captured
              ? displayHotkey(captured)
              : t('settings.shortcuts.waiting', { defaultValue: '等待按键…' })}
          </kbd>
        </div>
        {conflictWith ? (
          <p className="text-destructive mt-2 text-xs">
            {t('settings.shortcuts.conflictWith', {
              defaultValue: '与其它动作冲突，请换一个组合',
            })}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel', { defaultValue: '取消' })}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!captured || !!conflictWith}
            onClick={() => captured && onConfirm(captured)}
          >
            {t('common.save', { defaultValue: '保存' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
