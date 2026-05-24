import { describe, expect, it } from 'vitest';

import {
  MAX_MENTION_QUERY_LENGTH,
  detectMentionAtCursor,
  fuzzyMatch,
  replaceMentionRange,
} from './mention';

describe('detectMentionAtCursor', () => {
  it('detects # at start of empty text', () => {
    const m = detectMentionAtCursor('#', 1);
    expect(m).toEqual({ startIndex: 0, endIndex: 1, query: '' });
  });

  it('detects # at start with query', () => {
    const m = detectMentionAtCursor('#foo', 4);
    expect(m).toEqual({ startIndex: 0, endIndex: 4, query: 'foo' });
  });

  it('detects # after a space', () => {
    const text = 'tell me #read';
    const m = detectMentionAtCursor(text, text.length);
    expect(m).toEqual({ startIndex: 8, endIndex: 13, query: 'read' });
  });

  it('detects # after a newline', () => {
    const text = 'first line\n#bar';
    const m = detectMentionAtCursor(text, text.length);
    expect(m).toEqual({ startIndex: 11, endIndex: 15, query: 'bar' });
  });

  it('detects # after a tab', () => {
    const text = 'a\t#x';
    const m = detectMentionAtCursor(text, text.length);
    expect(m?.query).toBe('x');
    expect(m?.startIndex).toBe(2);
  });

  it('returns null when # is preceded by a non-space character (URL fragment guard)', () => {
    expect(detectMentionAtCursor('https://x.com/p#abc', 19)).toBeNull();
  });

  it('returns null when there is a space between # and caret', () => {
    expect(detectMentionAtCursor('#hello world', 12)).toBeNull();
  });

  it('returns null when caret is before the #', () => {
    // 光标在 '#' 之前（caret=0）→ 无 mention
    expect(detectMentionAtCursor('#foo', 0)).toBeNull();
  });

  it('returns null when caret is invalid', () => {
    expect(detectMentionAtCursor('hello', -1)).toBeNull();
    expect(detectMentionAtCursor('hello', 99)).toBeNull();
  });

  it('returns null when query exceeds MAX_MENTION_QUERY_LENGTH', () => {
    const longQuery = 'a'.repeat(MAX_MENTION_QUERY_LENGTH + 1);
    const text = `#${longQuery}`;
    expect(detectMentionAtCursor(text, text.length)).toBeNull();
  });

  it('handles query at exactly MAX_MENTION_QUERY_LENGTH', () => {
    const longQuery = 'a'.repeat(MAX_MENTION_QUERY_LENGTH);
    const text = `#${longQuery}`;
    const m = detectMentionAtCursor(text, text.length);
    expect(m?.query.length).toBe(MAX_MENTION_QUERY_LENGTH);
  });

  it('captures the *last* # before caret (multiple # treated as separate mentions)', () => {
    // 用户输入了 '#one #tw' —— 当前正在敲第二个 mention
    const text = '#one #tw';
    const m = detectMentionAtCursor(text, text.length);
    expect(m).toEqual({ startIndex: 5, endIndex: 8, query: 'tw' });
  });

  it('does not include a second # inside query', () => {
    // 一行内 '##' 没有空格分隔，第二个 # 前不是边界 → 不算 mention
    const text = '##';
    expect(detectMentionAtCursor(text, 2)).toBeNull();
  });

  it('supports CJK chars in query', () => {
    const text = '请引用 #知识';
    const m = detectMentionAtCursor(text, text.length);
    expect(m?.query).toBe('知识');
  });

  it('detects # when caret is in the middle of token (cursor moved back)', () => {
    // 用户敲了 '#foobar' 然后把光标移到 '#foo' 之后（caret=4）
    const text = '#foobar';
    const m = detectMentionAtCursor(text, 4);
    expect(m).toEqual({ startIndex: 0, endIndex: 4, query: 'foo' });
  });
});

describe('replaceMentionRange', () => {
  it('replaces #token with empty string and returns caret at start', () => {
    const text = 'tell me about #foo and more';
    const range = { startIndex: 14, endIndex: 18 }; // '#foo'
    const r = replaceMentionRange(text, range, '');
    expect(r.nextValue).toBe('tell me about  and more');
    expect(r.nextCaret).toBe(14);
  });

  it('replaces #token with non-empty replacement', () => {
    const text = '#foo bar';
    const range = { startIndex: 0, endIndex: 4 };
    const r = replaceMentionRange(text, range, '#document-a ');
    expect(r.nextValue).toBe('#document-a  bar');
    expect(r.nextCaret).toBe('#document-a '.length);
  });

  it('handles range at start of text', () => {
    const r = replaceMentionRange('#x', { startIndex: 0, endIndex: 2 }, '');
    expect(r.nextValue).toBe('');
    expect(r.nextCaret).toBe(0);
  });

  it('handles range at end of text', () => {
    const r = replaceMentionRange('abc #x', { startIndex: 4, endIndex: 6 }, '');
    expect(r.nextValue).toBe('abc ');
    expect(r.nextCaret).toBe(4);
  });

  it('returns input unchanged for invalid range', () => {
    const r = replaceMentionRange('hello', { startIndex: -1, endIndex: 2 }, '!!');
    expect(r.nextValue).toBe('hello');
  });
});

describe('fuzzyMatch', () => {
  it('empty query matches anything', () => {
    expect(fuzzyMatch('', 'anything')).toBe(true);
    expect(fuzzyMatch('', '')).toBe(true);
  });

  it('exact prefix matches', () => {
    expect(fuzzyMatch('doc', 'document-a')).toBe(true);
  });

  it('subsequence matches in order', () => {
    expect(fuzzyMatch('dca', 'document-a')).toBe(true);
  });

  it('out-of-order subsequence does not match', () => {
    expect(fuzzyMatch('adc', 'document-a')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('DOC', 'document-a')).toBe(true);
    expect(fuzzyMatch('Doc', 'document-A')).toBe(true);
  });

  it('handles CJK', () => {
    expect(fuzzyMatch('知识', '我的知识库')).toBe(true);
    expect(fuzzyMatch('识知', '我的知识库')).toBe(false);
  });
});
