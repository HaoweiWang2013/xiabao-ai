import { useAtom } from 'jotai';
import { useEffect } from 'react';

import {
  AppShell,
  ChatPanel,
  CommandPalette,
  ConversationList,
  HomePage,
  ImageWorkspace,
  KnowledgePanel,
  MiniAppPage,
  Onboarding,
  PromptPanel,
  SettingsPage,
  TranslatePage,
  trpc,
  useAppShortcuts,
  type ConversationListItem,
} from '@xiabao/app-ui';
import { activeTabIdAtom, openTabsAtom, primaryNavAtom, settingsSectionAtom } from '@xiabao/state';

export function App() {
  const [nav, setNav] = useAtom(primaryNavAtom);
  const [, setSettingsSection] = useAtom(settingsSectionAtom);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (nav === 'providers') {
      setSettingsSection('models');
      setNav('settings');
    } else if (nav === 'tools') {
      setSettingsSection('tools');
      setNav('settings');
    }
  }, [nav, setNav, setSettingsSection]);
  const conversationsQ = trpc.chat.listConversations.useQuery();
  const [, setActive] = useAtom(activeTabIdAtom);
  const [, setTabs] = useAtom(openTabsAtom);

  const createConv = trpc.chat.createConversation.useMutation({
    onSuccess: (conv) => {
      void utils.chat.listConversations.invalidate();
      setActive(conv.id);
      setTabs((prev) =>
        prev.some((t) => t.id === conv.id) ? prev : [...prev, { id: conv.id, title: conv.title }],
      );
    },
  });
  const deleteConv = trpc.chat.deleteConversation.useMutation({
    onSuccess: () => {
      void utils.chat.listConversations.invalidate();
    },
  });

  function openConversation(id: string, title: string) {
    setActive(id);
    setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, title }]));
  }

  useAppShortcuts({
    onNewConversation: () =>
      createConv.mutate({ title: `新对话 ${new Date().toLocaleTimeString()}` }),
  });

  const conversations: ConversationListItem[] = (conversationsQ.data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    updatedAt: c.updatedAt,
    favorite: c.favorite,
  }));

  const renameConv = trpc.chat.renameConversation.useMutation({
    onSuccess: () => {
      void utils.chat.listConversations.invalidate();
    },
  });
  const toggleFavorite = trpc.chat.toggleFavorite.useMutation({
    onSuccess: () => {
      void utils.chat.listConversations.invalidate();
    },
  });

  const Middle = (
    <ConversationList
      conversations={conversations}
      loading={conversationsQ.isLoading}
      onCreate={() => createConv.mutate({ title: `新对话 ${new Date().toLocaleTimeString()}` })}
      onDelete={(id) => {
        if (confirm('确定要删除这个会话吗？')) deleteConv.mutate({ id });
      }}
      onRename={(id, title) => renameConv.mutate({ id, title })}
      onToggleFavorite={(id) => toggleFavorite.mutate({ id })}
      onAddToKnowledge={(id) => {
        setActive(id);
        setNav('knowledge');
      }}
    />
  );

  return (
    <>
      <AppShell middle={Middle}>
        {nav === 'home' ? (
          <HomePage />
        ) : nav === 'chat' ? (
          <ChatPanel />
        ) : nav === 'knowledge' ? (
          <KnowledgePanel />
        ) : nav === 'prompt' ? (
          <PromptPanel />
        ) : nav === 'image' ? (
          <ImageWorkspace />
        ) : nav === 'translate' ? (
          <TranslatePage />
        ) : nav === 'miniapp' ? (
          <MiniAppPage />
        ) : (
          <SettingsPage />
        )}
      </AppShell>
      <CommandPalette
        conversations={conversations}
        onSelectConversation={(id) =>
          openConversation(id, conversations.find((c) => c.id === id)?.title ?? '会话')
        }
        onCreateConversation={() =>
          createConv.mutate({ title: `新对话 ${new Date().toLocaleTimeString()}` })
        }
      />
      <Onboarding />
    </>
  );
}
