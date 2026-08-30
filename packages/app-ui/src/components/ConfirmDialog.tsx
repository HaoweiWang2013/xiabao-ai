/**
 * ConfirmDialog · 应用内确认对话框（替代 window.confirm）
 *
 * 为什么存在：Trae 内置浏览器等 WebView 会拦截原生 window.confirm()，
 * 且其接管实现可能触发 React 渲染循环（error #185）。自绘确认框不依赖
 * 浏览器原生 API，任何环境（webview / 移动端 / 桌面）都能正常弹出。
 *
 * 用法：
 *   const confirm = useConfirm();
 *   if (await confirm({ title, message, danger: true })) { ... }
 *
 * 需在 React 树根部包一层 <ConfirmProvider>。
 */
import { createContext, useCallback, useContext, useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@xiabao/ui';

import { useTranslation } from '../lib/useTranslation';

import type { ReactNode } from 'react';

export interface ConfirmOptions {
  /** 标题（必填） */
  title: string;
  /** 说明文案（可选） */
  message?: string;
  /** 确认按钮文案，默认「确定」 */
  confirmLabel?: string;
  /** 取消按钮文案，默认「取消」 */
  cancelLabel?: string;
  /** 危险操作（如删除）用红色按钮 */
  danger?: boolean;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setState({ options, resolve })),
    [],
  );

  function close(ok: boolean) {
    setState((cur) => {
      cur?.resolve(ok);
      return null;
    });
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={state != null}
        onOpenChange={(open) => {
          // 点遮罩 / Esc / X 关闭 → 视为取消
          if (!open) close(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state?.options.title}</DialogTitle>
            {state?.options.message ? (
              <DialogDescription>{state?.options.message}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {state?.options.cancelLabel ?? t('common.cancel', { defaultValue: '取消' })}
            </Button>
            <Button
              variant={state?.options.danger ? 'destructive' : 'primary'}
              onClick={() => close(true)}
            >
              {state?.options.confirmLabel ?? t('common.confirm', { defaultValue: '确定' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    throw new Error('useConfirm must be used within <ConfirmProvider>');
  }
  return fn;
}
