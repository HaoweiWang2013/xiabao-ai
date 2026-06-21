/**
 * HTML 正文提取器（Readability 风格）
 *
 * 使用 cheerio + CSS 选择器替代正则，正确处理嵌套 DOM 和 HTML 实体。
 */
import * as cheerio from 'cheerio';

/** 需要完全移除的噪声元素选择器 */
const NOISE_SELECTORS = [
  'script',
  'style',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'iframe',
  'noscript',
  'svg',
  'menu',
  'dialog',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '.sidebar',
  '.nav',
  '.navbar',
  '.menu',
  '.footer',
  '.header',
  '.ad',
  '.ads',
  '.advertisement',
  '.social-share',
  '.comments',
  '#sidebar',
  '#nav',
  '#footer',
  '#header',
].join(', ');

/** 内容元素选择器（按文档顺序提取文本） */
const CONTENT_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th';

/** 主内容区候选选择器（按优先级排列） */
const MAIN_CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '[class*="article-content"]',
  '[class*="post-content"]',
  '[class*="entry-content"]',
  '[class*="main-content"]',
  '[class*="article-body"]',
  '[class*="post-body"]',
  '[class*="content"]',
  '[class*="article"]',
  '[class*="post"]',
  '[class*="entry"]',
];

export interface ExtractedContent {
  title: string;
  content: string;
}

/**
 * 从 HTML 中提取主内容（正文）
 *
 * 策略：
 * 1. cheerio 加载并自动解码 HTML 实体
 * 2. 移除噪声元素
 * 3. 按优先级定位主内容区
 * 4. 从内容子元素按文档顺序提取文本
 * 5. 降级：结构化提取太少时，直接取纯文本
 */
export function extractMainContent(html: string): ExtractedContent {
  const $ = cheerio.load(html);

  // 1. 移除噪声元素
  $(NOISE_SELECTORS).remove();

  // 2. 提取页面标题
  const title = $('title').first().text().trim() || $('h1').first().text().trim() || '';

  // 3. 定位主内容区（存储命中的选择器，最后统一做 find）
  let contentSelector = '';
  for (const selector of MAIN_CONTENT_SELECTORS) {
    if ($(selector).length > 0) {
      contentSelector = selector;
      break;
    }
  }

  // 全部候选都无命中，降级到 body；body 也无则用 root
  if (!contentSelector) {
    contentSelector = $('body').length > 0 ? 'body' : '';
  }

  // 4. 从内容子元素按文档顺序提取段落
  const paragraphs: string[] = [];
  const $scope = contentSelector ? $(contentSelector).first() : $.root();
  for (const el of $scope.find(CONTENT_SELECTORS).toArray()) {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 5) {
      paragraphs.push(text);
    }
  }

  // 5. 降级：结构化提取结果太少，直接取纯文本
  let content = paragraphs.join('\n\n');
  if (content.length < 80) {
    content = $scope.text().replace(/\s+/g, ' ').trim();
  }

  return { title, content };
}
