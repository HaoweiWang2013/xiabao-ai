import type { MiniApp } from '@xiabao/state';

export const BUILTIN_MINI_APPS: MiniApp[] = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com', icon: 'miniapps/chatgpt.svg' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', icon: 'miniapps/claude.svg' },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com',
    icon: 'miniapps/deepseek.svg',
  },
  { id: 'qwen', name: 'Qwen Studio', url: 'https://chat.qwen.ai', icon: 'miniapps/qwen.svg' },

  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', icon: 'miniapps/gemini.svg' },
  { id: 'kimi', name: 'Kimi Chat', url: 'https://kimi.moonshot.cn', icon: 'miniapps/kimi.svg' },
  { id: 'doubao', name: '豆包', url: 'https://www.doubao.com', icon: 'miniapps/doubao.svg' },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    url: 'https://cloud.siliconflow.cn',
    icon: 'miniapps/siliconflow.svg',
  },
  { id: 'poe', name: 'Poe', url: 'https://poe.com', icon: 'miniapps/poe.svg' },
  {
    id: 'perplexity',
    name: 'Perplexity',
    url: 'https://perplexity.ai',
    icon: 'miniapps/perplexity.svg',
  },
  { id: 'groq', name: 'Groq', url: 'https://groq.com', icon: 'miniapps/groq.svg' },
  { id: 'coze', name: '扣子 (Coze)', url: 'https://www.coze.cn', icon: 'miniapps/coze.svg' },
  { id: 'dify', name: 'Dify', url: 'https://dify.ai', icon: 'miniapps/dify.svg' },
  { id: 'v0', name: 'v0.dev', url: 'https://v0.dev', icon: 'miniapps/v0.svg' },
  { id: 'bolt', name: 'Bolt.new', url: 'https://bolt.new', icon: 'miniapps/bolt.svg' },
  {
    id: 'huggingchat',
    name: 'HuggingChat',
    url: 'https://huggingface.co/chat',
    icon: 'miniapps/huggingchat.svg',
  },
  //以下已转移 { id: 'qwen', name: 'Qwen Studio', url: 'https://chat.qwen.ai', icon: 'miniapps/qwen.svg' },
];
