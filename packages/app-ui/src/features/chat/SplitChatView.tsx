import { useAtom } from 'jotai';
import { Plus, SplitSquareHorizontal, SplitSquareVertical, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import {
  activeTabIdAtom,
  focusedPaneIdAtom,
  openTabsAtom,
  splitLayoutAtom,
  type OpenTab,
} from '@xiabao/state';
import { IconButton, cn } from '@xiabao/ui';

import { ChatPanel } from './index';

interface PaneContextValue {
  paneId: string;
  activeTabId: string | null;
  setActiveTabId: (id: string | null) => void;
  tabs: OpenTab[];
  setTabs: (updater: (prev: OpenTab[]) => OpenTab[]) => void;
}

const PaneContext = createContext<PaneContextValue | null>(null);

export function usePaneContext(): PaneContextValue | null {
  return useContext(PaneContext);
}

export function SplitChatView() {
  const [layout, setLayout] = useAtom(splitLayoutAtom);
  const [, setFocusedPaneId] = useAtom(focusedPaneIdAtom);
  const [globalActive, setGlobalActive] = useAtom(activeTabIdAtom);
  const [tabs, setTabs] = useAtom(openTabsAtom);
  const [resizing, setResizing] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isSingle = layout.panes.length <= 1;

  function getPaneContext(paneId: string): PaneContextValue {
    const pane = layout.panes.find((p) => p.id === paneId);
    return {
      paneId,
      activeTabId: isSingle ? globalActive : (pane?.activeTabId ?? null),
      setActiveTabId: (id: string | null) => {
        if (isSingle) {
          setGlobalActive(id);
        }
        setLayout((prev) => ({
          ...prev,
          panes: prev.panes.map((p) => (p.id === paneId ? { ...p, activeTabId: id } : p)),
        }));
      },
      tabs,
      setTabs,
    };
  }

  function handleNewTab(paneId: string) {
    const id = `launcher:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setTabs((prev) => [...prev, { id, title: '起始页', type: 'launcher' }]);
    setLayout((prev) => ({
      ...prev,
      panes: prev.panes.map((p) => (p.id === paneId ? { ...p, activeTabId: id } : p)),
    }));
    if (isSingle) setGlobalActive(id);
  }

  function handleClosePane(paneId: string) {
    setLayout((prev) => {
      if (prev.panes.length <= 1) return prev;
      const idx = prev.panes.findIndex((p) => p.id === paneId);
      const nextPanes = prev.panes.filter((p) => p.id !== paneId);
      const removedSize = prev.sizes[idx] ?? 0;

      const nextSizes = nextPanes.map((_, i) => {
        if (i === 0) {
          return prev.sizes[0] + (idx === 0 ? removedSize : 0);
        }
        return prev.sizes[i + (i >= idx ? 1 : 0)] ?? 0;
      });

      const total = nextSizes.reduce((s, v) => s + v, 0);
      return {
        ...prev,
        panes: nextPanes,
        sizes: nextSizes.map((s) => Math.round((s / total) * 100)),
        direction: nextPanes.length <= 1 ? 'horizontal' : prev.direction,
      };
    });
  }

  function handleSplit(paneId: string, tabId: string, direction: 'horizontal' | 'vertical') {
    setLayout((prev) => {
      const idx = prev.panes.findIndex((p) => p.id === paneId);
      const newPaneId = `pane-${Date.now().toString(36)}`;

      const newPanes = [...prev.panes];
      if (!newPanes[idx].activeTabId) {
        newPanes[idx] = { ...newPanes[idx], activeTabId: globalActive };
      }
      newPanes.splice(idx + 1, 0, { id: newPaneId, activeTabId: tabId });

      const oldSize = prev.sizes[idx] ?? 50;
      const newSizes = [...prev.sizes];
      newSizes[idx] = Math.round(oldSize / 2);
      newSizes.splice(idx + 1, 0, Math.round(oldSize / 2));

      return {
        direction,
        panes: newPanes,
        sizes: newSizes,
      };
    });
  }

  function handleTabClose(tabId: string, paneId: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      setLayout((prevLayout) => {
        const pane = prevLayout.panes.find((p) => p.id === paneId);
        if (pane?.activeTabId === tabId) {
          const paneTabIds = next.map((t) => t.id);
          const newActive = paneTabIds[paneTabIds.length - 1] ?? null;
          return {
            ...prevLayout,
            panes: prevLayout.panes.map((p) =>
              p.id === paneId ? { ...p, activeTabId: newActive } : p,
            ),
          };
        }
        return prevLayout;
      });
      return next;
    });
  }

  function handleTabClick(tabId: string, paneId: string) {
    setLayout((prev) => ({
      ...prev,
      panes: prev.panes.map((p) => (p.id === paneId ? { ...p, activeTabId: tabId } : p)),
    }));
  }

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (resizing === null || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const isH = layout.direction === 'horizontal';
      const totalSize = isH ? rect.width : rect.height;
      const pos = isH ? e.clientX - rect.left : e.clientY - rect.top;
      const pct = Math.max(0, Math.min(100, (pos / totalSize) * 100));

      setLayout((prev) => {
        const leftSize = pct;
        const rightSize = 100 - pct;
        const newSizes = [...prev.sizes];
        newSizes[resizing] = leftSize;
        newSizes[resizing + 1] = rightSize;
        return { ...prev, sizes: newSizes };
      });
    },
    [resizing, layout.direction, setLayout],
  );

  const handleResizeEnd = useCallback(() => {
    setResizing(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    if (resizing !== null) {
      document.body.style.cursor = layout.direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizing, layout.direction, handleResizeMove, handleResizeEnd]);

  if (isSingle) {
    const paneId = layout.panes[0]?.id ?? 'main';
    return (
      <div className="flex h-full flex-col">
        <PaneHeader
          paneId={paneId}
          tabs={tabs}
          activeTabId={globalActive}
          onTabClick={(id) => setGlobalActive(id)}
          onTabClose={(id) => handleTabClose(id, paneId)}
          onNewTab={() => handleNewTab(paneId)}
          onClosePane={() => {}}
          onSplit={(tabId, dir) => handleSplit(paneId, tabId, dir)}
        />
        <div className="flex-1 overflow-hidden">
          <ChatPanel hideTabBar />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full"
      style={{ flexDirection: layout.direction === 'horizontal' ? 'row' : 'column' }}
    >
      {layout.panes.map((pane, idx) => (
        <div
          key={pane.id}
          className="flex flex-col overflow-hidden"
          style={{
            [layout.direction === 'horizontal' ? 'width' : 'height']: `${layout.sizes[idx] ?? 0}%`,
            flexShrink: 0,
          }}
        >
          <PaneHeader
            paneId={pane.id}
            tabs={tabs}
            activeTabId={pane.activeTabId}
            onTabClick={(id) => handleTabClick(id, pane.id)}
            onTabClose={(id) => handleTabClose(id, pane.id)}
            onNewTab={() => handleNewTab(pane.id)}
            onClosePane={() => handleClosePane(pane.id)}
            onSplit={(tabId, dir) => handleSplit(pane.id, tabId, dir)}
          />
          <div className="flex-1 overflow-hidden" onClick={() => setFocusedPaneId(pane.id)}>
            <PaneContext.Provider value={getPaneContext(pane.id)}>
              <ChatPanel />
            </PaneContext.Provider>
          </div>
        </div>
      ))}
      {layout.panes.length > 1 &&
        layout.panes.slice(0, -1).map((_, idx) => (
          <div
            key={`resize-${idx}`}
            className={cn(
              'bg-border/40 hover:bg-primary/50 z-10 shrink-0 transition-colors',
              layout.direction === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              setResizing(idx);
            }}
          >
            <div
              className={cn(
                'bg-primary/40 rounded-full opacity-0 transition-opacity hover:opacity-100',
                layout.direction === 'horizontal'
                  ? 'mx-[-8px] my-auto h-8 w-1'
                  : 'mx-auto my-[-8px] h-1 w-8',
              )}
            />
          </div>
        ))}
    </div>
  );
}

function PaneHeader({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  onClosePane,
  onSplit,
}: {
  paneId: string;
  tabs: OpenTab[];
  activeTabId: string | null;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
  onClosePane: () => void;
  onSplit: (tabId: string, direction: 'horizontal' | 'vertical') => void;
}) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  return (
    <div className="glass border-border/40 flex h-9 shrink-0 items-center gap-0 border-b">
      <div className="flex h-full flex-1 items-center overflow-x-auto">
        {tabs.length === 0 ? (
          <div className="text-muted-foreground px-3 text-xs">未打开任何会话</div>
        ) : (
          tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => onTabClick(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                }}
                className={cn(
                  'border-border/40 group relative flex h-full min-w-0 max-w-[180px] cursor-pointer items-center gap-1.5 border-r px-3 text-xs transition-colors',
                  isActive
                    ? 'bg-background/40 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40',
                )}
              >
                {isActive && (
                  <span className="bg-primary absolute bottom-0 left-2 right-2 h-[2px] rounded-t" />
                )}
                <span className="truncate" title={tab.title}>
                  {tab.title || '未命名'}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  className="text-muted-foreground hover:text-foreground ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="关闭 Tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-0.5 pr-1">
        <IconButton size="sm" variant="ghost" onClick={onNewTab} aria-label="新建会话 Tab">
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          size="sm"
          variant="ghost"
          onClick={onClosePane}
          aria-label="关闭窗格"
          className="opacity-40 hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </IconButton>
      </div>

      {contextMenu && (
        <div
          className="bg-popover border-border fixed z-50 min-w-[160px] overflow-hidden rounded-md border p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="hover:bg-secondary flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs"
            onClick={() => {
              onSplit(contextMenu.tabId, 'horizontal');
              setContextMenu(null);
            }}
          >
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
            向右拆分
          </button>
          <button
            type="button"
            className="hover:bg-secondary flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs"
            onClick={() => {
              onSplit(contextMenu.tabId, 'vertical');
              setContextMenu(null);
            }}
          >
            <SplitSquareVertical className="h-3.5 w-3.5" />
            向下拆分
          </button>
          <div className="bg-border my-1 h-px" />
          <button
            type="button"
            className="hover:bg-destructive/10 text-destructive flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs"
            onClick={() => {
              onTabClose(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <X className="h-3.5 w-3.5" />
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
