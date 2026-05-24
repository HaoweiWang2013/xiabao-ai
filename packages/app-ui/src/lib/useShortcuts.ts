/**
 * useAppShortcuts · 注册全局快捷键
 *
 * 绑定来源于 `shortcutBindingsAtom`，用户可在「设置 / 快捷键」里改键。
 * 见 docs/12-ui-design.md §9.1。
 */
import { useAtom, useAtomValue } from 'jotai';
import { useHotkeys } from 'react-hotkeys-hook';

import {
  DEFAULT_SHORTCUTS,
  commandPaletteOpenAtom,
  primaryNavAtom,
  shortcutBindingsAtom,
  sidebarCollapsedAtom,
} from '@xiabao/state';

interface Options {
  onNewConversation?: () => void;
}

const HOTKEY_OPTIONS = {
  preventDefault: true,
  enableOnFormTags: ['INPUT', 'TEXTAREA', 'SELECT'] as ('INPUT' | 'TEXTAREA' | 'SELECT')[],
};

export function useAppShortcuts(opts: Options = {}) {
  const [, setOpenPalette] = useAtom(commandPaletteOpenAtom);
  const [, setNav] = useAtom(primaryNavAtom);
  const [, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const bindings = useAtomValue(shortcutBindingsAtom);

  useHotkeys(
    bindings.commandPalette || DEFAULT_SHORTCUTS.commandPalette,
    (e) => {
      e.preventDefault();
      setOpenPalette((v) => !v);
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    bindings.newConversation || DEFAULT_SHORTCUTS.newConversation,
    (e) => {
      if (opts.onNewConversation) {
        e.preventDefault();
        opts.onNewConversation();
      }
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    bindings.openSettings || DEFAULT_SHORTCUTS.openSettings,
    (e) => {
      e.preventDefault();
      setNav('settings');
    },
    HOTKEY_OPTIONS,
  );

  useHotkeys(
    bindings.toggleSidebar || DEFAULT_SHORTCUTS.toggleSidebar,
    (e) => {
      e.preventDefault();
      setSidebarCollapsed((v) => !v);
    },
    HOTKEY_OPTIONS,
  );
}
