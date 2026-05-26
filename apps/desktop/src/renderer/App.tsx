import { useAtom } from 'jotai';
import { useEffect } from 'react';

import {
  AgentWorkspace,
  AppShell,
  ChatPanel,
  CommandPalette,
  ConversationList,
  ImageWorkspace,
  KnowledgePanel,
  Onboarding,
  PromptPanel,
  SettingsPage,
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
  }));

  const Middle = (
    <ConversationList
      conversations={conversations}
      loading={conversationsQ.isLoading}
      onCreate={() => createConv.mutate({ title: `新对话 ${new Date().toLocaleTimeString()}` })}
      onDelete={(id) => {
        if (confirm('确定要删除这个会话吗？')) deleteConv.mutate({ id });
      }}
    />
  );

  return (
    <>
      <AppShell middle={Middle}>
        {nav === 'chat' ? (
          <ChatPanel />
        ) : nav === 'knowledge' ? (
          <KnowledgePanel />
        ) : nav === 'prompt' ? (
          <PromptPanel />
        ) : nav === 'image' ? (
          <ImageWorkspace />
        ) : nav === 'agent' ? (
          <AgentWorkspace />
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
