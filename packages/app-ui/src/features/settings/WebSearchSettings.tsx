/**
 * WebSearchSettings · 联网搜索设置
 *
 * - 总开关：启用/禁用联网搜索
 * - 提供商选择：百度 / Bing / DuckDuckGo / Tavily / SearXNG / Exa / Google
 * - API Key 配置：根据选中提供商显示对应输入框（部分引擎无需 API）
 * - 测试按钮：验证 API 连通性
 */
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ExternalLink,
  Globe,
  Key,
  Loader2,
  TestTube2,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { trpc } from '../../lib/trpc';
import { cn } from '@xiabao/ui';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton,
  Input,
  ScrollArea,
  Switch,
} from '@xiabao/ui';

type WebSearchProvider = 'tavily' | 'searxng' | 'exa' | 'bing' | 'baidu' | 'google' | 'duckduckgo';

interface ProviderOption {
  id: WebSearchProvider;
  name: string;
  description: string;
  needsApi: boolean;
  fields?: { key: string; placeholder: string; label: string; url: string }[];
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'baidu',
    name: '百度',
    description: '直接爬取百度搜索结果，无需 API，适合中文检索',
    needsApi: false,
  },
  {
    id: 'bing',
    name: 'Bing',
    description: '直接爬取必应搜索结果，无需 API，覆盖全球内容',
    needsApi: false,
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    description: '直接爬取 DuckDuckGo 搜索结果，隐私友好',
    needsApi: false,
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'AI 优化的搜索引擎，提供精准上下文结果',
    needsApi: true,
    fields: [
      {
        key: 'webSearch.tavilyApiKey',
        placeholder: 'tvly-xxxxxxxxxxxxxxxx',
        label: 'API Key',
        url: 'https://app.tavily.com/api-keys',
      },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Google 自定义搜索 API，支持全球网页检索',
    needsApi: true,
    fields: [
      {
        key: 'webSearch.googleApiKey',
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        label: 'API Key',
        url: 'https://developers.google.com/custom-search/v1/overview',
      },
      {
        key: 'webSearch.googleCx',
        placeholder: 'xxxxxxxxxxxxxxxxxxxxx:xxxxxxxxxxx',
        label: '搜索引擎 ID (CX)',
        url: 'https://programmablesearchengine.google.com/',
      },
    ],
  },
  {
    id: 'exa',
    name: 'Exa',
    description: '语义搜索 API，擅长按内容相关性检索',
    needsApi: true,
    fields: [
      {
        key: 'webSearch.exaApiKey',
        placeholder: 'exa_xxxxxxxxxxxxxxxx',
        label: 'API Key',
        url: 'https://exa.ai/',
      },
    ],
  },
  {
    id: 'searxng',
    name: 'SearXNG',
    description: '开源自聚合搜索引擎，可自建实例',
    needsApi: true,
    fields: [
      {
        key: 'webSearch.searxngEndpoint',
        placeholder: 'http://localhost:8080',
        label: '实例地址',
        url: 'https://docs.searxng.org/',
      },
    ],
  },
];

export function WebSearchSettings({ onBack }: { onBack?: () => void } = {}) {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');

  const [enabled, setEnabled] = useState(true);
  const [provider, setProvider] = useState<WebSearchProvider>('baidu');
  const [apiValues, setApiValues] = useState<Record<string, string>>({});
  const [maxContentLength, setMaxContentLength] = useState(3000);

  const query = trpc.settings.getMany.useQuery(
    {
      keys: [
        'webSearch.enabled',
        'webSearch.provider',
        'webSearch.tavilyApiKey',
        'webSearch.searxngEndpoint',
        'webSearch.exaApiKey',
        'webSearch.googleApiKey',
        'webSearch.googleCx',
        'webSearch.maxContentLength',
      ],
    },
    {
      onSuccess: (data) => {
        setEnabled(data['webSearch.enabled'] as boolean);
        setProvider(data['webSearch.provider'] as WebSearchProvider);
        setMaxContentLength((data['webSearch.maxContentLength'] as number) ?? 3000);
        setApiValues({
          tavilyApiKey: (data['webSearch.tavilyApiKey'] as string) ?? '',
          searxngEndpoint: (data['webSearch.searxngEndpoint'] as string) ?? '',
          exaApiKey: (data['webSearch.exaApiKey'] as string) ?? '',
          googleApiKey: (data['webSearch.googleApiKey'] as string) ?? '',
          googleCx: (data['webSearch.googleCx'] as string) ?? '',
        });
      },
      retry: false,
    },
  );

  const { isLoading, isError, error } = query;

  const saveMutation = trpc.settings.setMany.useMutation();

  type SettingsKey =
    | 'webSearch.enabled'
    | 'webSearch.provider'
    | 'webSearch.tavilyApiKey'
    | 'webSearch.searxngEndpoint'
    | 'webSearch.exaApiKey'
    | 'webSearch.googleApiKey'
    | 'webSearch.googleCx'
    | 'webSearch.maxContentLength';

  const handleSave = useCallback(
    (updates: { key: SettingsKey; value: unknown }[]) => {
      saveMutation.mutate({ items: updates });
    },
    [saveMutation],
  );

  const toggleEnabled = useCallback(
    (val: boolean) => {
      setEnabled(val);
      handleSave([{ key: 'webSearch.enabled', value: val }]);
    },
    [handleSave],
  );

  const changeProvider = useCallback(
    (id: WebSearchProvider) => {
      setProvider(id);
      setApiValues({});
      handleSave([{ key: 'webSearch.provider', value: id }]);
    },
    [handleSave],
  );

  const currentProvider = PROVIDERS.find((p) => p.id === provider)!;

  const saveApiKeys = useCallback(() => {
    if (!currentProvider.fields) return;
    const updates: { key: SettingsKey; value: string | null }[] = currentProvider.fields.map(
      (field) => ({
        key: field.key as SettingsKey,
        value: apiValues[field.key.split('.').pop()!] || null,
      }),
    );
    handleSave(updates);
  }, [apiValues, currentProvider, handleSave]);

  const testConnection = useCallback(async () => {
    if (!currentProvider.needsApi) {
      setTestStatus('success');
      setTestMsg('该引擎无需 API Key，可直接使用');
      return;
    }
    const firstKey = currentProvider.fields?.[0];
    if (!firstKey) return;
    const apiKey = apiValues[firstKey.key.split('.').pop()!];
    if (!apiKey) {
      setTestStatus('error');
      setTestMsg('请先配置 API Key');
      return;
    }
    setTestStatus('loading');
    setTestMsg('正在测试连接…');
    try {
      let res;
      if (provider === 'tavily') {
        res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ query: 'test', max_results: 1 }),
        });
      } else if (provider === 'google') {
        const cx = apiValues['googleCx'] || '';
        res = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=test&num=1`,
          { method: 'GET' },
        );
      } else if (provider === 'exa') {
        res = await fetch('https://api.exa.ai/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ query: 'test', numResults: 1 }),
        });
      } else {
        setTestStatus('error');
        setTestMsg('该引擎暂不支持在线测试');
        return;
      }

      if (res && res.ok) {
        setTestStatus('success');
        setTestMsg('连接成功！API Key 有效');
      } else if (res) {
        const errText = await res.text().catch(() => '');
        setTestStatus('error');
        setTestMsg(`连接失败 (${res.status})：${errText}`);
      }
    } catch (e) {
      setTestStatus('error');
      setTestMsg(e instanceof Error ? e.message : '网络错误');
    }
  }, [apiValues, provider, currentProvider]);

  const toggleShowKey = (fieldKey: string) => {
    setShowKeys((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError) {
    console.error('WebSearch settings load error:', error);
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-500">加载失败</span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {error?.message || '无法读取联网搜索设置，请重试'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="app-page-header border-border/40 flex h-12 shrink-0 items-center border-b px-6">
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
        <h2 className="text-sm font-semibold">联网搜索</h2>
      </header>
      <ScrollArea className="scroll-thin flex-1">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-6 py-6">
          {/* 总开关 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    启用联网搜索
                  </CardTitle>
                  <CardDescription>允许 AI 模型在对话中调用搜索引擎获取实时信息</CardDescription>
                </div>
                <Switch checked={enabled} onCheckedChange={toggleEnabled} />
              </div>
            </CardHeader>
          </Card>

          {/* 提供商选择 */}
          <Card>
            <CardHeader>
              <CardTitle>搜索引擎</CardTitle>
              <CardDescription>选择用于获取实时信息的搜索服务</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => changeProvider(p.id)}
                    className={cn(
                      'flex flex-col gap-1 rounded-lg border p-3 text-left transition-all',
                      provider === p.id
                        ? 'border-primary bg-primary/5 ring-primary/20 ring-2'
                        : 'border-border/40 hover:border-foreground/30',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.name}</span>
                      {provider === p.id && <Check className="text-primary h-4 w-4" />}
                    </div>
                    <span className="text-muted-foreground text-[11px] leading-tight">
                      {p.description}
                    </span>
                    {!p.needsApi && (
                      <span className="text-[10px] font-medium text-green-600">免费免 API</span>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* API Key 配置（仅需要 API 的引擎显示） */}
          {currentProvider.needsApi && currentProvider.fields && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  API 密钥配置
                </CardTitle>
                <CardDescription className="flex items-center gap-1">
                  配置 {currentProvider.name} 的访问密钥
                  {currentProvider.fields.map((f, i) => (
                    <a
                      key={i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-0.5 text-[11px] hover:underline"
                    >
                      {i === 0 ? '获取密钥' : `获取 ${f.label}`}{' '}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {currentProvider.fields.map((field) => (
                    <div key={field.key} className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showKeys[field.key] ? 'text' : 'password'}
                          value={apiValues[field.key.split('.').pop()!] || ''}
                          onChange={(e) =>
                            setApiValues((prev) => ({
                              ...prev,
                              [field.key.split('.').pop()!]: e.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          className="pr-16"
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowKey(field.key)}
                          className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2 text-xs"
                          tabIndex={-1}
                        >
                          {showKeys[field.key] ? '隐藏' : '显示'}
                        </button>
                      </div>
                    </div>
                  ))}
                  <Button size="sm" onClick={saveApiKeys} className="self-start">
                    保存
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 测试连接（仅需要 API 的引擎显示） */}
          {currentProvider.needsApi &&
            currentProvider.fields &&
            currentProvider.fields.some((f) => apiValues[f.key.split('.').pop()!]) && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={testConnection}
                      disabled={testStatus === 'loading'}
                    >
                      {testStatus === 'loading' ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          测试中…
                        </>
                      ) : (
                        <>
                          <TestTube2 className="mr-1 h-3.5 w-3.5" />
                          测试连接
                        </>
                      )}
                    </Button>

                    {testStatus !== 'idle' && testStatus !== 'loading' && (
                      <div
                        className={cn(
                          'text-xs',
                          testStatus === 'success' ? 'text-green-600' : 'text-red-500',
                        )}
                      >
                        {testStatus === 'success' ? (
                          <Check className="mr-1 inline h-3.5 w-3.5" />
                        ) : (
                          <X className="mr-1 inline h-3.5 w-3.5" />
                        )}
                        {testMsg}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* 内容长度设置 */}
          <Card>
            <CardHeader>
              <CardTitle>页面内容长度限制</CardTitle>
              <CardDescription>
                调用 fetch_page_with_content 时，每个页面返回的最大字符数
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  min={500}
                  max={10000}
                  step={500}
                  value={maxContentLength}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setMaxContentLength(Math.min(10000, Math.max(500, val)));
                    }
                  }}
                  onBlur={() => {
                    handleSave([{ key: 'webSearch.maxContentLength', value: maxContentLength }]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSave([{ key: 'webSearch.maxContentLength', value: maxContentLength }]);
                    }
                  }}
                  className="w-32"
                />
                <span className="text-muted-foreground text-sm">字符</span>
              </div>
              <p className="text-muted-foreground mt-2 text-[11px]">
                范围：500 - 10,000 字符，当前设置：{maxContentLength.toLocaleString()} 字符 （10
                个页面 ≈ {(maxContentLength * 10).toLocaleString()} 字符，约{' '}
                {Math.round((maxContentLength * 10) / 2)} tokens）
              </p>
            </CardContent>
          </Card>

          {/* 提示信息 */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-500">温馨提示</span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              启用联网搜索后，AI 模型可在对话中自动调用搜索工具获取最新信息。 百度、Bing、DuckDuckGo
              无需 API Key，直接爬取搜索结果。
              每次搜索会消耗一次工具调用，请确保模型支持工具调用功能。
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
