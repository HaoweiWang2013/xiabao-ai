import { useAtom } from 'jotai';
import {
  Copy,
  ExternalLink,
  Globe,
  Home,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  activeMiniAppTabIdAtom,
  customMiniAppsAtom,
  miniAppTabsAtom,
  type MiniApp,
  type MiniAppTab,
} from '@xiabao/state';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  ScrollArea,
} from '@xiabao/ui';

import { useTranslation } from '../../lib/useTranslation';

import { BUILTIN_MINI_APPS } from './builtins';

function renderAppIcon(icon: string, name: string, isTab = false) {
  if (!icon) return '🌐';
  const isImg =
    icon.endsWith('.png') ||
    icon.endsWith('.svg') ||
    icon.startsWith('/') ||
    icon.startsWith('http');
  if (isImg) {
    return (
      <img
        src={icon}
        alt={name}
        className={isTab ? 'h-3.5 w-3.5 object-contain' : 'h-11 w-11 rounded-xl object-contain p-1'}
      />
    );
  }
  return icon;
}

const PRESET_EMOJIS = [
  '💬',
  '🎨',
  '🐳',
  '♊',
  '🌙',
  '🌾',
  '⚡',
  '🦉',
  '🔍',
  '🚀',
  '🧩',
  '💻',
  '🤖',
  '🧠',
  '🌐',
  '📢',
];
const PRESET_COLORS = [
  { value: 'bg-[#10A37F] text-white', label: 'GPT绿' },
  { value: 'bg-[#4D6BFE] text-white', label: '深求蓝' },
  { value: 'bg-[#D97757] text-white', label: 'Claude桃' },
  { value: 'bg-[#8B5CF6] text-white', label: '硅基紫' },
  { value: 'bg-[#E0643B] text-white', label: 'Kimi橙' },
  { value: 'bg-[#24C2A3] text-white', label: '豆包青' },
  { value: 'bg-[#09090B] text-white border border-neutral-800', label: '极客黑' },
];

export function MiniAppPage() {
  const { t } = useTranslation();
  const [customApps, setCustomApps] = useAtom(customMiniAppsAtom);
  const [tabs, setTabs] = useAtom(miniAppTabsAtom);
  const [activeTabId, setActiveTabId] = useAtom(activeMiniAppTabIdAtom);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // 新建小程序的表单状态
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newIcon, setNewIcon] = useState('🤖');
  const [newColor, setNewColor] = useState('bg-[#4D6BFE] text-white');
  const [newDesc, setNewDesc] = useState('');
  const [formError, setFormError] = useState('');

  // 刷新 key，用于刷新 iframe
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});

  // 合并内置和自定义小程序
  const allApps = useMemo(() => {
    return [...BUILTIN_MINI_APPS, ...customApps];
  }, [customApps]);

  // 过滤后的小程序列表
  const filteredApps = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allApps;
    return allApps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.desc?.toLowerCase().includes(q) ||
        app.url.toLowerCase().includes(q),
    );
  }, [allApps, searchQuery]);

  // 关闭指定标签
  function handleCloseTab(tabId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (tabs.length <= 1) return; // 至少保留一个

    const closedIndex = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      // 激活前一个标签，如果没有前一个则激活新列表的最后一个
      const nextActiveIndex = closedIndex > 0 ? closedIndex - 1 : 0;
      setActiveTabId(newTabs[nextActiveIndex]?.id ?? 'market');
    }
  }

  // 新开或聚焦一个 MiniApp 网页
  function handleOpenApp(app: MiniApp) {
    const existingTab = tabs.find((t) => t.type === 'app' && t.appId === app.id);
    if (existingTab) {
      setActiveTabId(existingTab.id);
    } else {
      const newTabId = `app-${app.id}`;
      const newTab: MiniAppTab = {
        id: newTabId,
        type: 'app',
        appId: app.id,
        title: app.name,
        url: app.url,
      };
      setTabs([...tabs, newTab]);
      setActiveTabId(newTabId);
    }
  }

  // 新开一个新的 Market 搜索标签（类似浏览器新开一个 Tab）
  function handleNewMarketTab() {
    const newId = `market-${Date.now()}`;
    const newTab: MiniAppTab = {
      id: newId,
      type: 'market',
      title: t('miniapp.tabMarket'),
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
  }

  // 刷新当前 Iframe
  function handleRefresh(tabId: string) {
    setReloadKeys((prev) => ({
      ...prev,
      [tabId]: (prev[tabId] || 0) + 1,
    }));
  }

  // 删除自定义小程序
  function handleDeleteCustomApp(appId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(t('miniapp.deleteConfirm'))) {
      setCustomApps((prev) => prev.filter((a) => a.id !== appId));
      // 同时关闭关联的 tab
      setTabs((prev) => prev.filter((t) => !(t.type === 'app' && t.appId === appId)));
      if (activeTabId === `app-${appId}`) {
        setActiveTabId('market');
      }
    }
  }

  // 创建自定义小程序
  function handleCreateApp() {
    setFormError('');
    if (!newName.trim()) {
      setFormError(t('miniapp.errorNameEmpty'));
      return;
    }
    if (!newUrl.trim()) {
      setFormError(t('miniapp.errorUrlEmpty'));
      return;
    }
    if (!/^https?:\/\//i.test(newUrl.trim())) {
      setFormError(t('miniapp.errorUrlInvalid'));
      return;
    }

    const newApp: MiniApp = {
      id: `custom-${Date.now()}`,
      name: newName.trim(),
      url: newUrl.trim(),
      icon: newIcon,
      color: newColor,
      desc: newDesc.trim() || t('miniapp.customDescDefault'),
    };

    setCustomApps((prev) => [...prev, newApp]);
    setIsAddOpen(false);

    // 重置表单
    setNewName('');
    setNewUrl('');
    setNewIcon('🤖');
    setNewColor('bg-[#4D6BFE] text-white');
    setNewDesc('');

    // 自动打开新创建的小程序
    handleOpenApp(newApp);
  }

  // 复制链接
  function handleCopyLink(url: string) {
    navigator.clipboard.writeText(url);
    alert(t('miniapp.copiedSuccess'));
  }

  return (
    <div className="bg-background flex h-full w-full flex-col overflow-hidden">
      {/* ── 顶部多标签栏 (IDE Tab Bar) ── */}
      <div className="app-page-header border-border/40 bg-background/50 flex h-10 shrink-0 items-center justify-between border-b px-2 backdrop-blur-sm">
        <div className="no-scrollbar flex h-full flex-1 select-none items-center overflow-x-auto">
          {tabs.map((tab, idx) => {
            const isActive = activeTabId === tab.id;
            // 寻找关联的 app 获取 icon
            const appInfo = tab.type === 'app' ? allApps.find((a) => a.id === tab.appId) : null;

            return (
              <div
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                className={`border-border/30 group relative flex h-full min-w-[70px] max-w-[160px] cursor-pointer items-center gap-1.5 border-r px-2 text-xs font-medium transition-all sm:min-w-[100px] sm:gap-2 sm:px-3.5 ${
                  isActive
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                }`}
              >
                {/* Active 底部线条 */}
                {isActive && (
                  <span className="bg-primary absolute bottom-0 left-2 right-2 h-[2px] rounded-t" />
                )}

                {/* 标签图标 */}
                {tab.type === 'market' ? (
                  <Puzzle className="text-primary/80 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] font-bold">
                    {renderAppIcon(appInfo?.icon || '', tab.title, true)}
                  </span>
                )}

                {/* 标签标题 */}
                <span className="truncate pr-2" title={tab.title}>
                  {tab.title}
                </span>

                {/* 关闭按钮：首个 market 不可关闭，其余均可关闭 */}
                {!(idx === 0 && tab.type === 'market') && (
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    className="text-muted-foreground hover:bg-secondary hover:text-foreground ml-auto flex h-4 w-4 items-center justify-center rounded-full opacity-100 transition-all group-hover:opacity-100 sm:opacity-0"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* 新开标签页按钮 */}
          <IconButton
            size="sm"
            variant="ghost"
            onClick={handleNewMarketTab}
            className="hover:bg-secondary ml-1 h-7 w-7 rounded-md"
            aria-label={t('miniapp.tabNew')}
          >
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* ── 标签页内容渲染 ── */}
      <div className="relative flex-1 overflow-hidden">
        {tabs.map((tab) => {
          const isTabActive = activeTabId === tab.id;
          if (!isTabActive) return null;

          // ── 渲染：小程序应用市场（Grid 列表） ──
          if (tab.type === 'market') {
            return (
              <div
                key={tab.id}
                className="animate-fade-in flex h-full flex-col overflow-hidden p-6"
              >
                {/* 市场头部搜索与标题 - 简化后的极简版 */}
                <div className="border-border/10 mb-6 flex shrink-0 flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-left">
                    <h1 className="text-foreground text-lg font-bold tracking-tight">
                      {t('miniapp.title')}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-xs">{t('miniapp.subtitle')}</p>
                  </div>

                  {/* 搜索框 */}
                  <div className="relative w-full sm:w-72">
                    <Search className="text-muted-foreground/60 absolute left-3 top-2.5 h-3.5 w-3.5" />
                    <Input
                      type="text"
                      placeholder={t('miniapp.searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-secondary/40 border-border/40 placeholder:text-muted-foreground/50 focus-visible:bg-secondary/60 h-9 w-full rounded-xl pl-9 pr-8 text-xs transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-muted-foreground hover:text-foreground absolute right-3 top-2.5 text-[10px]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 市场应用网格 */}
                <ScrollArea className="mx-auto w-full max-w-6xl flex-1">
                  <div className="grid grid-cols-1 gap-3 pb-8 sm:grid-cols-2 sm:gap-4 sm:pb-12 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {filteredApps.map((app) => {
                      const isCustom = app.id.startsWith('custom-');
                      return (
                        <Card
                          key={app.id}
                          onClick={() => handleOpenApp(app)}
                          className="hover:bg-secondary/20 hover:border-primary/30 border-border/40 group relative flex cursor-pointer flex-row items-center gap-4 p-3 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-md sm:flex-col sm:items-center sm:justify-center sm:gap-0 sm:p-5 sm:text-center"
                        >
                          {/* 自定义小程序的删除角标 */}
                          {isCustom && (
                            <button
                              onClick={(e) => handleDeleteCustomApp(app.id, e)}
                              className="bg-secondary/80 text-muted-foreground hover:bg-destructive/15 hover:text-destructive border-border/20 absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md border opacity-100 transition-all group-hover:opacity-100 sm:opacity-0"
                              title="删除自定义小程序"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* 图标容器 */}
                          <div
                            className={`mb-0 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold shadow-sm transition-transform duration-300 group-hover:scale-105 sm:mb-4 ${
                              app.icon &&
                              (app.icon.endsWith('.svg') ||
                                app.icon.endsWith('.png') ||
                                app.icon.startsWith('/') ||
                                app.icon.startsWith('http'))
                                ? 'border-border/10 border bg-white p-1.5'
                                : app.color || 'bg-secondary text-foreground'
                            }`}
                          >
                            {renderAppIcon(app.icon || '', app.name)}
                          </div>

                          <div className="min-w-0 flex-1">
                            {/* 标题 */}
                            <h3 className="text-foreground w-full truncate px-1 text-sm font-semibold tracking-tight sm:text-center">
                              {app.name}
                            </h3>

                            {/* 描述 */}
                            <p className="text-muted-foreground/80 mt-1 line-clamp-2 min-h-0 px-1 text-[11px] leading-relaxed sm:mt-1.5 sm:min-h-[32px] sm:text-center">
                              {app.desc || '打开官方网站进行深度对话'}
                            </p>
                          </div>
                        </Card>
                      );
                    })}

                    {/* 添加自定义卡片 */}
                    <Card
                      onClick={() => setIsAddOpen(true)}
                      className="border-border/70 hover:border-primary hover:bg-primary/5 hover:text-primary flex cursor-pointer flex-row items-center gap-4 border-dashed p-3 text-left transition-all duration-200 hover:-translate-y-1 sm:min-h-[160px] sm:flex-col sm:items-center sm:justify-center sm:gap-0 sm:p-5 sm:text-center"
                    >
                      <div className="border-border/80 bg-background text-muted-foreground group-hover:text-primary mb-0 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dashed transition-colors sm:mb-4">
                        <Plus className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold tracking-tight sm:text-center">
                          {t('miniapp.addCustom')}
                        </h3>
                        <p className="text-muted-foreground/70 mt-1 text-[11px] sm:text-center">
                          {t('miniapp.addCustomDesc')}
                        </p>
                      </div>
                    </Card>
                  </div>
                </ScrollArea>
              </div>
            );
          }

          // ── 渲染：小程序嵌套浏览器（Iframe 渲染） ──
          if (tab.type === 'app') {
            const reloadKey = reloadKeys[tab.id] || 0;
            return (
              <div key={tab.id} className="animate-fade-in flex h-full flex-col overflow-hidden">
                {/* 嵌套浏览器控制栏 */}
                <div className="border-border/30 bg-background/50 flex h-9 shrink-0 items-center justify-between border-b px-3">
                  <div className="flex items-center gap-1.5">
                    <IconButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRefresh(tab.id)}
                      title={t('miniapp.btnRefresh')}
                      className="h-6 w-6"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleOpenApp(
                          allApps.find((a) => a.id === tab.appId) ?? {
                            id: '',
                            name: '',
                            url: tab.url ?? '',
                          },
                        )
                      }
                      title={t('miniapp.btnHome')}
                      className="h-6 w-6"
                    >
                      <Home className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>

                  {/* URL 地址展示栏 */}
                  <div className="bg-secondary/30 border-border/20 text-muted-foreground mx-4 hidden h-6 max-w-xl flex-1 items-center justify-between rounded-md border px-2.5 text-[11px] sm:flex">
                    <div className="flex items-center gap-1.5 truncate">
                      <Globe className="text-muted-foreground/60 h-3 w-3 shrink-0" />
                      <span className="select-all truncate">{tab.url}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyLink(tab.url ?? '')}
                        className="hover:text-foreground rounded p-0.5 transition-colors"
                        title={t('miniapp.btnCopyUrl')}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* 外部操作 */}
                  <div className="flex items-center gap-1">
                    <IconButton
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(tab.url, '_blank')}
                      title={t('miniapp.btnOpenInBrowser')}
                      className="hover:text-primary h-6 w-6"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </IconButton>
                  </div>
                </div>

                {/* 网页渲染 Iframe */}
                <div className="relative flex-1 bg-white">
                  <iframe
                    key={`${tab.id}-${reloadKey}`}
                    src={tab.url}
                    className="h-full w-full border-none bg-white"
                    allow="clipboard-read; clipboard-write; camera; microphone; geolocation"
                  />
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* ── 添加自定义小程序的 Dialog 弹窗 ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('miniapp.formTitle')}</DialogTitle>
            <DialogDescription>{t('miniapp.formDesc')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* 名称 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
                {t('miniapp.formName')} *
              </label>
              <Input
                type="text"
                placeholder={t('miniapp.formNamePlaceholder')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* 网址 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
                {t('miniapp.formUrl')} *
              </label>
              <Input
                type="text"
                placeholder={t('miniapp.formUrlPlaceholder')}
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* 图标 (Emoji) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-foreground flex items-center justify-between text-xs font-semibold">
                <span>{t('miniapp.formIcon')} *</span>
                <span className="text-muted-foreground text-[10px]">
                  {t('miniapp.formIconTip')}
                </span>
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="text"
                  maxLength={2}
                  value={newIcon}
                  onChange={(e) => setNewIcon(e.target.value)}
                  className="bg-secondary/20 h-10 w-14 text-center text-lg font-semibold"
                />
                <div className="bg-secondary/20 border-border/30 flex flex-1 flex-wrap items-center gap-2 rounded-xl border p-2">
                  {PRESET_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewIcon(emoji)}
                      className={`flex h-7 w-7 items-center justify-center rounded-md text-base transition-all hover:scale-125 active:scale-95 ${
                        newIcon === emoji
                          ? 'bg-primary/20 ring-primary/30 scale-110 ring-1'
                          : 'hover:bg-secondary'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 背景色 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
                {t('miniapp.formColor')}
              </label>
              <div className="flex flex-wrap items-center gap-3 py-1">
                {PRESET_COLORS.map((color) => {
                  const isSelected = newColor === color.value;
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setNewColor(color.value)}
                      title={color.label}
                      className={`border-border/10 h-7 w-7 rounded-full border transition-all ${color.value} ${
                        isSelected
                          ? 'ring-primary ring-offset-background scale-110 ring-2 ring-offset-2'
                          : 'opacity-85 hover:scale-105 hover:opacity-100'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* 简短描述 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
                {t('miniapp.formDescLabel')}
              </label>
              <Input
                type="text"
                placeholder={t('miniapp.formDescPlaceholder')}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* 表单错误提示 */}
            {formError && (
              <div className="text-destructive bg-destructive/10 border-destructive/20 rounded border p-2 text-xs font-medium">
                {formError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAddOpen(false)}>
              {t('miniapp.btnCancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateApp}>
              {t('miniapp.btnCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
