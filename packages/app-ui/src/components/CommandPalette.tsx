/**
 * CommandPalette · Cmd+K 命令面板
 *
 * 见 docs/12-ui-design.md §6.3。
 */
import { Command as CommandPrimitive } from 'cmdk';
import { useAtom } from 'jotai';
import {
  MessageSquare,
  Search,
  Settings as SettingsIcon,
  Sliders,
  Sparkles,
  Wrench,
} from 'lucide-react';

import { commandPaletteOpenAtom, primaryNavAtom, settingsSectionAtom } from '@xiabao/state';
import { Dialog, DialogContent, DialogPortal, cn } from '@xiabao/ui';

import type { ReactNode } from 'react';

export interface CommandConversationItem {
  id: string;
  title: string;
}

interface Props {
  conversations?: CommandConversationItem[];
  onSelectConversation?: (id: string) => void;
  onCreateConversation?: () => void;
}

export function CommandPalette({
  conversations = [],
  onSelectConversation,
  onCreateConversation,
}: Props) {
  const [open, setOpen] = useAtom(commandPaletteOpenAtom);
  const [, setNav] = useAtom(primaryNavAtom);
  const [, setSettingsSection] = useAtom(settingsSectionAtom);

  function close() {
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogContent
          className={cn(
            'glass-strong shadow-glass-lg z-palette top-[20%] max-w-xl translate-y-0 overflow-hidden p-0',
          )}
        >
          <CommandPrimitive
            className="overflow-hidden"
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
          >
            <div className="border-border/40 flex items-center gap-2 border-b px-3">
              <Search className="text-muted-foreground h-3.5 w-3.5" />
              <CommandPrimitive.Input
                autoFocus
                placeholder="Search commands, conversations..."
                className="placeholder:text-muted-foreground h-11 w-full bg-transparent py-3 text-sm outline-none"
              />
            </div>
            <CommandPrimitive.List className="scroll-thin max-h-[40vh] overflow-auto px-2 py-2">
              <CommandPrimitive.Empty className="text-muted-foreground px-2 py-4 text-center text-xs">
                没有匹配项
              </CommandPrimitive.Empty>

              <CmdGroup heading="命令">
                <CmdItem
                  onSelect={() => {
                    onCreateConversation?.();
                    close();
                  }}
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  shortcut="Ctrl+N"
                >
                  新建对话
                </CmdItem>
                <CmdItem
                  onSelect={() => {
                    setNav('settings');
                    close();
                  }}
                  icon={<SettingsIcon className="h-3.5 w-3.5" />}
                  shortcut="Ctrl+,"
                >
                  打开设置
                </CmdItem>
                <CmdItem
                  onSelect={() => {
                    setSettingsSection('models');
                    setNav('settings');
                    close();
                  }}
                  icon={<Sliders className="h-3.5 w-3.5" />}
                >
                  模型供应商
                </CmdItem>
                <CmdItem
                  onSelect={() => {
                    setSettingsSection('tools');
                    setNav('settings');
                    close();
                  }}
                  icon={<Wrench className="h-3.5 w-3.5" />}
                >
                  查看工具
                </CmdItem>
              </CmdGroup>

              {conversations.length > 0 && (
                <CmdGroup heading="会话">
                  {conversations.slice(0, 50).map((c) => (
                    <CmdItem
                      key={c.id}
                      onSelect={() => {
                        onSelectConversation?.(c.id);
                        close();
                      }}
                      icon={<MessageSquare className="h-3.5 w-3.5" />}
                    >
                      <span className="truncate">{c.title || '未命名'}</span>
                    </CmdItem>
                  ))}
                </CmdGroup>
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

function CmdGroup({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <CommandPrimitive.Group
      heading={heading}
      className="text-muted-foreground [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
    >
      {children}
    </CommandPrimitive.Group>
  );
}

function CmdItem({
  children,
  onSelect,
  icon,
  shortcut,
}: {
  children: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  shortcut?: string;
}) {
  return (
    <CommandPrimitive.Item
      onSelect={onSelect}
      className="data-[selected=true]:bg-secondary/60 text-foreground flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && (
        <span className="text-muted-foreground text-[10px] tracking-widest">{shortcut}</span>
      )}
    </CommandPrimitive.Item>
  );
}
