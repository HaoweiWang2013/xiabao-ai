import { useAtom } from 'jotai';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  Unplug,
} from 'lucide-react';
import { useState } from 'react';

import {
  mcpServersAtom,
  mcpToolsAtom,
  type McpServerState,
  type McpToolState,
} from '@xiabao/state';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Input,
  ScrollArea,
  Skeleton,
} from '@xiabao/ui';

import { trpc } from '../../lib/trpc';
import { useTranslation } from '../../lib/useTranslation';

export function McpSettings({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const [servers, setServers] = useAtom(mcpServersAtom);
  const [tools, setTools] = useAtom(mcpToolsAtom);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const utils = trpc.useUtils();

  const listQ = trpc.mcp.listServers.useQuery(undefined, {
    onSuccess: (data) => setServers(data as unknown as McpServerState[]),
  });

  const connectMut = trpc.mcp.connect.useMutation({
    onSuccess: async (data, vars) => {
      if (data.ok) {
        const toolsList = await utils.mcp.listTools.fetch({ serverId: vars.id });
        setTools((prev) => [
          ...prev.filter((t) => t.serverId !== vars.id),
          ...(toolsList as unknown as McpToolState[]),
        ]);
        setExpandedServer(vars.id);
      }
      await listQ.refetch();
    },
  });

  const disconnectMut = trpc.mcp.disconnect.useMutation({
    onSuccess: () => listQ.refetch(),
  });

  const removeMut = trpc.mcp.removeServer.useMutation({
    onSuccess: () => {
      listQ.refetch();
      setTools([]);
    },
  });

  const toggleMut = trpc.mcp.updateServer.useMutation({
    onSuccess: () => listQ.refetch(),
  });

  const authorizeMut = trpc.mcp.authorizeTool.useMutation({
    onSuccess: async (_, vars) => {
      const tool = tools.find((t) => t.id === vars.toolId);
      if (tool) {
        const toolsList = await utils.mcp.listTools.fetch({ serverId: tool.serverId });
        setTools((prev) => [
          ...prev.filter((t) => t.serverId !== tool.serverId),
          ...(toolsList as unknown as McpToolState[]),
        ]);
      }
    },
  });

  const serverTools = (serverId: string) => tools.filter((t) => t.serverId === serverId);

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          {onBack && (
            <IconButton
              size="sm"
              variant="ghost"
              onClick={onBack}
              className="-ml-2 mr-1 h-7 w-7"
              aria-label="返回分类"
            >
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
          )}
          <div>
            <h2 className="text-sm font-semibold">
              {t('mcp.title', { defaultValue: 'MCP 服务器' })}
            </h2>
            <p className="text-muted-foreground text-[11px]">
              {t('mcp.subtitle', {
                defaultValue: '管理 Model Context Protocol 服务器连接和工具授权',
              })}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('mcp.addBtn', { defaultValue: '添加服务器' })}
        </Button>
      </header>

      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          {showAddForm && (
            <AddServerForm
              onClose={() => setShowAddForm(false)}
              onAdded={() => {
                setShowAddForm(false);
                listQ.refetch();
              }}
            />
          )}

          {listQ.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : servers.length === 0 ? (
            <div className="border-border/40 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
              <Plug className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                {t('mcp.emptyTitle', { defaultValue: '暂无 MCP 服务器' })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('mcp.emptyDesc', { defaultValue: '添加 MCP 服务器以扩展 AI 的工具能力' })}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {servers.map((server) => {
                const isExpanded = expandedServer === server.id;
                const sTools = serverTools(server.id);
                const isConnecting = connectMut.isLoading && connectMut.variables?.id === server.id;

                return (
                  <li key={server.id}>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <span className="text-primary bg-primary/10 inline-flex h-6 w-6 items-center justify-center rounded-md">
                            <PlugZap className="h-3.5 w-3.5" />
                          </span>
                          <span>{server.name}</span>
                          <Badge
                            variant={server.enabled ? 'success' : 'default'}
                            className="text-[10px]"
                          >
                            {server.enabled
                              ? t('mcp.enabled', { defaultValue: '已启用' })
                              : t('mcp.disabled', { defaultValue: '已禁用' })}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {server.transport}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          {server.command && (
                            <code className="text-[11px]">
                              {server.command} {server.args}
                            </code>
                          )}
                          {server.url && <span className="text-[11px]">{server.url}</span>}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isConnecting}
                            onClick={() => connectMut.mutate({ id: server.id })}
                          >
                            {isConnecting ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3.5 w-3.5" />
                            )}
                            {t('mcp.connect', { defaultValue: '连接' })}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => disconnectMut.mutate({ id: server.id })}
                          >
                            <Unplug className="mr-1 h-3.5 w-3.5" />
                            {t('mcp.disconnect', { defaultValue: '断开' })}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              toggleMut.mutate({
                                id: server.id,
                                enabled: !server.enabled,
                              })
                            }
                          >
                            {server.enabled
                              ? t('mcp.disable', { defaultValue: '禁用' })
                              : t('mcp.enable', { defaultValue: '启用' })}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeMut.mutate({ id: server.id })}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            {t('mcp.delete', { defaultValue: '删除' })}
                          </Button>
                          {sTools.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="mr-1 h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="mr-1 h-3.5 w-3.5" />
                              )}
                              {t('mcp.toolsBadge', {
                                defaultValue: '工具 ({sTools.length})',
                              }).replace('{sTools.length}', String(sTools.length))}
                            </Button>
                          )}
                        </div>

                        {isExpanded && sTools.length > 0 && (
                          <div className="border-border/40 mt-3 border-t pt-3">
                            <ul className="flex flex-col gap-2">
                              {sTools.map((tool) => (
                                <li
                                  key={tool.id}
                                  className="border-border/30 flex items-center justify-between rounded-md border px-3 py-2"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs">{tool.name}</span>
                                      {tool.authorized ? (
                                        <Badge variant="success" className="text-[10px]">
                                          <ShieldCheck className="mr-0.5 h-3 w-3" />
                                          {t('mcp.authorized', { defaultValue: '已授权' })}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px]">
                                          <Shield className="mr-0.5 h-3 w-3" />
                                          {t('mcp.notAuthorized', { defaultValue: '未授权' })}
                                        </Badge>
                                      )}
                                    </div>
                                    {tool.description && (
                                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                                        {tool.description}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant={tool.authorized ? 'outline' : 'primary'}
                                    onClick={() =>
                                      authorizeMut.mutate({
                                        toolId: tool.id,
                                        authorized: !tool.authorized,
                                      })
                                    }
                                  >
                                    {tool.authorized ? (
                                      <>
                                        <Check className="mr-1 h-3 w-3" />
                                        {t('mcp.revoke', { defaultValue: '撤销' })}
                                      </>
                                    ) : (
                                      t('mcp.grant', { defaultValue: '授权' })
                                    )}
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function AddServerForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');

  const addMut = trpc.mcp.addServer.useMutation({
    onSuccess: () => onAdded(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMut.mutate({
      name,
      transport,
      command: transport === 'stdio' ? command : undefined,
      args: transport === 'stdio' && args ? args : undefined,
      url: transport !== 'stdio' ? url : undefined,
    });
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-sm">
          {t('mcp.dialogTitle', { defaultValue: '添加 MCP 服务器' })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                {t('mcp.nameLabel', { defaultValue: '名称' })}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-mcp-server"
                required
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                {t('mcp.transportLabel', { defaultValue: '传输方式' })}
              </label>
              <select
                value={transport}
                onChange={(e) => setTransport(e.target.value as 'stdio' | 'http' | 'sse')}
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <option value="stdio">
                  {t('mcp.transportStdio', { defaultValue: 'stdio（命令行）' })}
                </option>
                <option value="http">HTTP</option>
                <option value="sse">{t('mcp.transportSse', { defaultValue: 'SSE' })}</option>
              </select>
            </div>
          </div>

          {transport === 'stdio' ? (
            <>
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">
                  {t('mcp.commandLabel', { defaultValue: '命令' })}
                </label>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  required
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">
                  {t('mcp.argsLabel', { defaultValue: '参数 (JSON)' })}
                </label>
                <Input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder='["@modelcontextprotocol/server-filesystem", "/path"]'
                />
              </div>
            </>
          ) : (
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                {t('mcp.urlLabel', { defaultValue: 'URL' })}
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3000/mcp"
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              {t('mcp.cancel', { defaultValue: '取消' })}
            </Button>
            <Button type="submit" size="sm" disabled={addMut.isLoading || !name}>
              {addMut.isLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {t('mcp.createBtn', { defaultValue: '添加' })}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
