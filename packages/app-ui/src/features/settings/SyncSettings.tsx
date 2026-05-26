import { useAtom } from 'jotai';
import { useState } from 'react';
import { Cloud, CloudOff, Link, RefreshCw, Shield } from 'lucide-react';

import { syncConfiguredAtom, syncEnabledAtom } from '@xiabao/state';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@xiabao/ui';

import { trpc } from '../../lib/trpc';

export function SyncSettings() {
  const [enabled, setEnabled] = useAtom(syncEnabledAtom);
  const [configured] = useAtom(syncConfiguredAtom);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteToken, setRemoteToken] = useState('');
  const [syncKeyInput, setSyncKeyInput] = useState('');

  const statusQ = trpc.sync.status.useQuery(undefined, { enabled });
  const configureMut = trpc.sync.configure.useMutation({
    onSuccess: () => {
      setEnabled(true);
    },
  });
  const pushMut = trpc.sync.push.useMutation();
  const pullMut = trpc.sync.pull.useMutation();
  const disableMut = trpc.sync.disable.useMutation({
    onSuccess: () => setEnabled(false),
  });

  function handleConfigure() {
    if (!remoteUrl || !remoteToken || !syncKeyInput) return;
    configureMut.mutate({
      syncKeyBase64: syncKeyInput,
      remoteUrl,
      remoteToken,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {enabled ? (
            <Cloud className="text-primary h-4 w-4" />
          ) : (
            <CloudOff className="text-muted-foreground h-4 w-4" />
          )}
          端到端加密同步
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!configured ? (
          <>
            <p className="text-muted-foreground text-xs">
              配置 libsql
              远程数据库与同步密钥，实现跨设备端到端加密数据同步。同步密钥（AES-256-GCM）由您掌控，服务端仅存储密文。
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">libsql 远程 URL</label>
              <Input
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="libsql://your-db.turso.io"
                className="text-xs"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">认证 Token</label>
              <Input
                type="password"
                value={remoteToken}
                onChange={(e) => setRemoteToken(e.target.value)}
                placeholder="Turso auth token"
                className="text-xs"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">同步密钥（Base64）</label>
              <Input
                type="password"
                value={syncKeyInput}
                onChange={(e) => setSyncKeyInput(e.target.value)}
                placeholder="由 deriveSyncKey() 派生，或从助记词恢复"
                className="text-xs"
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfigure}
              disabled={!remoteUrl || !remoteToken || !syncKeyInput || configureMut.isLoading}
            >
              <Shield className="mr-1 h-3.5 w-3.5" />
              {configureMut.isLoading ? '配置中…' : '启用同步'}
            </Button>
          </>
        ) : (
          <>
            <div className="bg-secondary/40 flex items-center gap-3 rounded-md px-3 py-2">
              <Link className="text-primary h-4 w-4" />
              <span className="text-xs font-medium">已连接</span>
              <span className="text-muted-foreground ml-auto text-[10px]">
                {statusQ.data ? '在线' : '未知'}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => pullMut.mutate()}
                disabled={pullMut.isLoading}
              >
                <RefreshCw
                  className={`mr-1 h-3.5 w-3.5 ${pullMut.isLoading ? 'animate-spin' : ''}`}
                />
                拉取
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pushMut.mutate()}
                disabled={pushMut.isLoading}
              >
                <RefreshCw
                  className={`mr-1 h-3.5 w-3.5 ${pushMut.isLoading ? 'animate-spin' : ''}`}
                />
                推送
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => disableMut.mutate()}
                className="ml-auto text-red-500"
              >
                断开
              </Button>
            </div>
            {pushMut.data && (
              <p className="text-muted-foreground text-[10px]">
                已推送 {pushMut.data.pushed} 条{' '}
                {pushMut.data.errors.length > 0 ? `(错误 ${pushMut.data.errors.length})` : ''}
              </p>
            )}
            {pullMut.data && (
              <p className="text-muted-foreground text-[10px]">已拉取 {pullMut.data.pulled} 条</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
