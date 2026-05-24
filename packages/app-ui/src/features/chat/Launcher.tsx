/**
 * Launcher · 应用启动器页
 *
 * 点 Tab 栏 + 后打开的「起始页」，展示项目内可用模块的图标网格。
 * 视觉风格参照图二：大圆角方块 + 实色背景 + 白色图标。
 */

import { Braces, Brush, MessageSquare, Settings, Sparkles, Wrench } from 'lucide-react';

interface LauncherProps {
  onCreateChat: () => void;
  onOpenKnowledge: () => void;
  onOpenProviders: () => void;
  onOpenTools: () => void;
  onOpenAppearance: () => void;
  onOpenAbout: () => void;
}

const apps = [
  { icon: MessageSquare, label: '聊天', bg: 'bg-green-500', action: 'chat' as const },
  { icon: Braces, label: '知识库', bg: 'bg-blue-500', action: 'knowledge' as const },
  { icon: Settings, label: '模型供应商', bg: 'bg-purple-500', action: 'providers' as const },
  { icon: Wrench, label: '工具', bg: 'bg-orange-500', action: 'tools' as const },
  { icon: Brush, label: '外观', bg: 'bg-pink-500', action: 'appearance' as const },
  { icon: Sparkles, label: '关于', bg: 'bg-cyan-500', action: 'about' as const },
];

export function Launcher({
  onCreateChat,
  onOpenKnowledge,
  onOpenProviders,
  onOpenTools,
  onOpenAppearance,
  onOpenAbout,
}: LauncherProps) {
  const actionMap = {
    chat: onCreateChat,
    knowledge: onOpenKnowledge,
    providers: onOpenProviders,
    tools: onOpenTools,
    appearance: onOpenAppearance,
    about: onOpenAbout,
  };

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <h2 className="text-muted-foreground mb-6 text-center text-sm font-medium">应用</h2>
        <div className="grid grid-cols-3 gap-4">
          {apps.map((app) => {
            const Icon = app.icon;
            return (
              <button
                key={app.label}
                type="button"
                onClick={() => actionMap[app.action as keyof typeof actionMap]()}
                className="hover:bg-secondary/50 group flex flex-col items-center gap-2 rounded-2xl p-3 transition-colors"
              >
                <div
                  className={`${app.bg} flex h-16 w-16 items-center justify-center rounded-2xl transition-transform group-hover:scale-105`}
                >
                  <Icon className="h-7 w-7 text-white" />
                </div>
                <span className="text-foreground text-sm font-medium">{app.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
