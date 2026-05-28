/**
 * Launcher · 应用启动器页
 *
 * 点 Tab 栏 + 后打开的「起始页」，展示项目内可用模块的图标网格。
 * 视觉风格参照图二：大圆角方块 + 实色背景 + 白色图标。
 */

import { Braces, Brush, MessageSquare, Settings, Sparkles, Wrench } from 'lucide-react';

import { useTranslation } from '../../lib/useTranslation';

interface LauncherProps {
  onCreateChat: () => void;
  onOpenKnowledge: () => void;
  onOpenProviders: () => void;
  onOpenTools: () => void;
  onOpenAppearance: () => void;
  onOpenAbout: () => void;
}

const appConfig = [
  { icon: MessageSquare, bg: 'bg-green-500', action: 'chat' as const },
  { icon: Braces, bg: 'bg-blue-500', action: 'knowledge' as const },
  { icon: Settings, bg: 'bg-purple-500', action: 'providers' as const },
  { icon: Wrench, bg: 'bg-orange-500', action: 'tools' as const },
  { icon: Brush, bg: 'bg-pink-500', action: 'appearance' as const },
  { icon: Sparkles, bg: 'bg-cyan-500', action: 'about' as const },
];

export function Launcher({
  onCreateChat,
  onOpenKnowledge,
  onOpenProviders,
  onOpenTools,
  onOpenAppearance,
  onOpenAbout,
}: LauncherProps) {
  const { t } = useTranslation();
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
        <h2 className="text-muted-foreground mb-6 text-center text-sm font-medium">
          {t('chatLaunch.app', { defaultValue: '应用' })}
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {appConfig.map((app) => {
            const Icon = app.icon;
            const labels: Record<string, string> = {
              chat: t('chatLaunch.chat', { defaultValue: '聊天' }),
              knowledge: t('chatLaunch.knowledge', { defaultValue: '知识库' }),
              providers: t('chatLaunch.providers', { defaultValue: '模型供应商' }),
              tools: t('chatLaunch.tools', { defaultValue: '工具' }),
              appearance: t('chatLaunch.appearance', { defaultValue: '外观' }),
              about: t('chatLaunch.about', { defaultValue: '关于' }),
            };
            return (
              <button
                key={app.action}
                type="button"
                onClick={() => actionMap[app.action as keyof typeof actionMap]()}
                className="hover:bg-secondary/50 group flex flex-col items-center gap-2 rounded-2xl p-3 transition-colors"
              >
                <div
                  className={`${app.bg} flex h-16 w-16 items-center justify-center rounded-2xl transition-transform group-hover:scale-105`}
                >
                  <Icon className="h-7 w-7 text-white" />
                </div>
                <span className="text-foreground text-sm font-medium">{labels[app.action]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
