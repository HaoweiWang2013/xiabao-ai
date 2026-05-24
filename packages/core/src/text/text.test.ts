import { describe, expect, it } from 'vitest';

import {
  chunkText,
  estimateTokens,
  htmlToText,
  isImageDocument,
  looksLikeBinaryDocument,
  markdownToText,
  normalizeWhitespace,
  pickTextExtractor,
} from './index';

describe('normalizeWhitespace', () => {
  it('折叠 CRLF 与多余空白', () => {
    const s = 'a\r\nb \nc  \n\n\n d';
    expect(normalizeWhitespace(s)).toBe('a\nb\nc\n\nd');
  });
});

describe('htmlToText', () => {
  it('剥离 script/style/nav 与标签，保留段落换行', () => {
    const html = `
      <html><head><style>x{color:red}</style></head>
      <body>
        <nav>menu</nav>
        <h1>Title</h1>
        <p>Hello&nbsp;world &mdash; OK</p>
        <ul><li>one</li><li>two</li></ul>
        <script>alert(1)</script>
      </body></html>
    `;
    const out = htmlToText(html);
    expect(out).toContain('Title');
    expect(out).toContain('Hello world — OK');
    expect(out).toContain('• one');
    expect(out).toContain('• two');
    expect(out).not.toContain('alert(1)');
    expect(out).not.toContain('menu');
  });

  it('decode 数字实体', () => {
    expect(htmlToText('<p>&#65;&#x42;</p>')).toBe('AB');
  });
});

describe('markdownToText', () => {
  it('去掉围栏与链接 URL', () => {
    const md = [
      '# Title',
      '',
      'Read [the docs](https://example.com).',
      '',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '- item 1',
      '- item 2',
    ].join('\n');
    const out = markdownToText(md);
    expect(out.startsWith('Title')).toBe(true);
    expect(out).toContain('Read the docs.');
    expect(out).toContain('const a = 1;');
    expect(out).toContain('• item 1');
    expect(out).not.toContain('https://example.com');
  });
});

describe('chunkText', () => {
  it('按 size + overlap 切分，不丢字', () => {
    const text = 'abcdefghij'.repeat(5); // 50
    const chunks = chunkText(text, { size: 16, overlap: 4 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text.length).toBe(16);
    expect(chunks[0].seq).toBe(0);
    // overlap 验证：第二个 chunk 起点 = 16 - 4 = 12
    expect(chunks[1].offset).toBe(12);
    // 末段允许小于 size
    const last = chunks[chunks.length - 1];
    expect(last.text.length).toBeLessThanOrEqual(16);
    // 重新拼接覆盖原文
    let combined = '';
    let cursor = 0;
    for (const c of chunks) {
      const slice = c.text.slice(cursor - c.offset);
      combined += slice;
      cursor = c.offset + c.text.length;
    }
    expect(combined).toBe(text);
  });

  it('空串返回空数组', () => {
    expect(chunkText('  \n\n  ')).toEqual([]);
  });

  it('overlap >= size 时被自动夹紧', () => {
    const out = chunkText('hello world', { size: 5, overlap: 99 });
    expect(out.length).toBeGreaterThan(0);
    // 至少 step=1，最终能消化完文本
    expect(out[out.length - 1].offset + out[out.length - 1].text.length).toBe('hello world'.length);
  });
});

describe('pickTextExtractor', () => {
  it('html mime 走 htmlToText', () => {
    const fn = pickTextExtractor('text/html; charset=utf-8');
    expect(fn('<p>hi</p>')).toBe('hi');
  });
  it('markdown mime 走 markdownToText', () => {
    const fn = pickTextExtractor('text/markdown');
    expect(fn('# Title\nhi')).toContain('Title');
  });
  it('plain mime 仅做 normalize', () => {
    const fn = pickTextExtractor('text/plain');
    expect(fn(' a   b ')).toBe('a b');
  });
});

describe('estimateTokens', () => {
  it('null / 空串 → 0', () => {
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens('')).toBe(0);
  });

  it('纯英文按 4 chars/token，长 12 → 3', () => {
    // 'hello world!' 共 12 字符，向上取整 ceil(12/4)=3
    expect(estimateTokens('hello world!')).toBe(3);
  });

  it('纯中文按 1.5 chars/token', () => {
    // '你好世界' 共 4 字符，ceil(4/1.5)=3
    expect(estimateTokens('你好世界')).toBe(3);
  });

  it('中英混合 → 中文与拉丁分别折算后相加', () => {
    // '你好 hello' = 2 CJK + 6 latin (空格算 latin) → ceil(2/1.5 + 6/4) = ceil(1.33+1.5)=ceil(2.83)=3
    expect(estimateTokens('你好 hello')).toBe(3);
  });

  it('日语假名 / 片假名 / 韩语谚文 / 全角符号都算 CJK', () => {
    expect(estimateTokens('こんにちは')).toBe(4); // ceil(5/1.5)=4
    expect(estimateTokens('カタカナ')).toBe(3); // ceil(4/1.5)=3
    expect(estimateTokens('한국어')).toBe(2); // ceil(3/1.5)=2
  });

  it('支持自定义比率', () => {
    // CJK 1 char/token → 4 个汉字 = 4 token
    expect(estimateTokens('你好世界', { cjkCharsPerToken: 1 })).toBe(4);
    // latin 2 char/token → 'abcd' = ceil(4/2)=2
    expect(estimateTokens('abcd', { latinCharsPerToken: 2 })).toBe(2);
  });

  it('比率 <= 0 抛错', () => {
    expect(() => estimateTokens('abc', { cjkCharsPerToken: 0 })).toThrow();
    expect(() => estimateTokens('abc', { latinCharsPerToken: -1 })).toThrow();
  });

  it('emoji surrogate pair 按 latin 算且只数 1 个 codepoint', () => {
    // '🚀' = 1 codepoint，按 latin → ceil(1/4)=1
    expect(estimateTokens('🚀')).toBe(1);
  });

  it('启发式与真实 BPE 偏差合理（< 30% for typical inputs）', () => {
    const samples = [
      // 真实 OpenAI tiktoken（cl100k_base）参考值范围
      { text: 'The quick brown fox jumps over the lazy dog', minToken: 7, maxToken: 13 },
      { text: '人工智能正在改变世界', minToken: 6, maxToken: 14 },
    ];
    for (const s of samples) {
      const est = estimateTokens(s.text);
      expect(est).toBeGreaterThanOrEqual(s.minToken);
      expect(est).toBeLessThanOrEqual(s.maxToken);
    }
  });
});

describe('looksLikeBinaryDocument', () => {
  it('识别 PDF / DOCX / PPTX / XLSX 的 mime 与扩展名', () => {
    expect(looksLikeBinaryDocument({ mime: 'application/pdf' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'a.pdf' })).toBe(true);
    expect(
      looksLikeBinaryDocument({
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toBe(true);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'B.DOCX' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'deck.pptx' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'sales.xlsx' })).toBe(true);
  });

  it('M4 长尾 Phase 8 · 识别图像 mime / 扩展名', () => {
    expect(looksLikeBinaryDocument({ mime: 'image/png' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: 'image/jpeg' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: 'image/webp' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: 'image/tiff' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'photo.PNG' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'a.jpg' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'a.jpeg' })).toBe(true);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'b.tif' })).toBe(true);
  });

  it('排除 svg / 纯文本 / 未知 mime', () => {
    expect(looksLikeBinaryDocument({ mime: 'image/svg+xml' })).toBe(false);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'a.svg' })).toBe(false);
    expect(looksLikeBinaryDocument({ mime: 'text/plain' })).toBe(false);
    expect(looksLikeBinaryDocument({ mime: null, filename: 'README.md' })).toBe(false);
    expect(looksLikeBinaryDocument({ mime: null })).toBe(false);
  });
});

describe('isImageDocument', () => {
  it('只对图像 mime / 扩展名返回 true', () => {
    expect(isImageDocument({ mime: 'image/png' })).toBe(true);
    expect(isImageDocument({ mime: null, filename: 'a.jpeg' })).toBe(true);
    expect(isImageDocument({ mime: 'application/pdf' })).toBe(false);
    expect(isImageDocument({ mime: null, filename: 'a.pdf' })).toBe(false);
    expect(isImageDocument({ mime: 'image/svg+xml' })).toBe(false);
    expect(isImageDocument({ mime: null })).toBe(false);
  });
});
