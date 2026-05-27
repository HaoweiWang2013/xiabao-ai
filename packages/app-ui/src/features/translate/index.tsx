import { useState } from 'react';

import { ArrowRightLeft, ChevronDown, Languages, Sparkles } from 'lucide-react';

import { Button } from '@xiabao/ui';

const SUPPORTED_LANGUAGES = [
  { code: 'auto', label: '自动检测' },
  { code: 'en', label: '英文' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日语' },
  { code: 'ko', label: '韩语' },
  { code: 'fr', label: '法语' },
  { code: 'de', label: '德语' },
  { code: 'es', label: '西班牙语' },
  { code: 'ru', label: '俄语' },
  { code: 'pt', label: '葡萄牙语' },
  { code: 'ar', label: '阿拉伯语' },
  { code: 'hi', label: '印地语' },
  { code: 'th', label: '泰语' },
  { code: 'vi', label: '越南语' },
];

export function TranslatePage() {
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('en');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  function handleSwapLanguages() {
    if (sourceLang === 'auto') return;
    const temp = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(temp);
    setInputText(outputText);
    setOutputText(inputText);
  }

  async function handleTranslate() {
    if (!inputText.trim()) return;
    setIsTranslating(true);
    try {
      const response = await fetch(
        `https://api-free.deepl.com/v2/translate?auth_key=YOUR_API_KEY&text=${encodeURIComponent(inputText)}&target_lang=${targetLang.toUpperCase()}${sourceLang !== 'auto' ? `&source_lang=${sourceLang.toUpperCase()}` : ''}`,
        { method: 'GET' },
      );
      if (response.ok) {
        const data = await response.json();
        setOutputText(data.translations[0].text);
      } else {
        setOutputText('翻译失败，请检查网络连接或 API 配置');
      }
    } catch (error) {
      setOutputText('网络错误，请稍后重试');
    } finally {
      setIsTranslating(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="bg-background/50 flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Languages className="text-primary h-5 w-5" />
          <span className="text-foreground font-semibold">翻译</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector value={sourceLang} onChange={setSourceLang} />
          <Button variant="ghost" size="sm" onClick={handleSwapLanguages} className="h-8 w-8 p-0">
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
          <LanguageSelector value={targetLang} onChange={setTargetLang} />
          <Button
            variant="primary"
            size="sm"
            onClick={handleTranslate}
            disabled={isTranslating || !inputText.trim()}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            翻译
          </Button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col border-r">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="请输入要翻译的文本..."
            className="bg-background/30 text-foreground resize-none border-none p-4 outline-none"
          />
          <div className="border-border/40 text-muted-foreground border-t px-4 py-2 text-right text-xs">
            {inputText.length} 字符
          </div>
        </div>
        <div className="flex flex-1 flex-col">
          <textarea
            value={outputText}
            readOnly
            placeholder="翻译结果将显示在这里..."
            className="bg-background/20 text-foreground resize-none border-none p-4 outline-none"
          />
          <div className="border-border/40 text-muted-foreground border-t px-4 py-2 text-right text-xs">
            {outputText.length} 字符
          </div>
        </div>
      </div>
    </div>
  );
}

function LanguageSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (lang: string) => void;
}) {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === value) || SUPPORTED_LANGUAGES[0];
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1"
      >
        {lang.label}
        <ChevronDown className="h-3 w-3" />
      </Button>
      {open && (
        <div className="border-border/40 bg-background/80 absolute right-0 top-full z-10 mt-1 max-h-60 w-32 overflow-auto rounded-md border p-1 shadow-lg">
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                onChange(l.code);
                setOpen(false);
              }}
              className="hover:bg-secondary/60 text-foreground w-full rounded-sm px-2 py-1 text-left text-sm"
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
