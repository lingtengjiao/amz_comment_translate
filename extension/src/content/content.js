/**
 * VOC-Master Content Script (Final Fixed Version)
 * Fixes: "Identifier 'CONFIG' has already been declared" error
 * 
 * Improvements:
 * 1. Intelligent CAPTCHA detection
 * 2. Stable Review ID generation (fingerprinting)
 * 3. Human-like random delays
 * 4. IIFE wrapper to prevent duplicate injection
 */

// 立即执行函数 (IIFE) 配合全局锁，防止重复注入崩溃
(function() {
  // 1. 防重锁：如果已经初始化过，直接退出，防止 const 重复声明报错
  if (window.vocMasterInitialized) {
    console.log('[VOC-Master] Content script already loaded, skipping re-initialization.');
    return;
  }
  window.vocMasterInitialized = true;

  // ================= 核心代码开始 =================

  // Configuration
  // 生产环境配置 - 使用 HTTPS 域名
  const CONFIG = {
  API_BASE_URL: 'https://98kamz.com/api/v1',
  DASHBOARD_URL: 'https://98kamz.com',  // 生产前端地址
  DELAY_BETWEEN_PAGES: { min: 2000, max: 5000 }, // Increased for safety
  DELAY_BETWEEN_STARS: { min: 3000, max: 6000 },
  BATCH_SIZE: 20
};

// Star rating URL parameters
const STAR_FILTERS = {
  1: 'one_star',
  2: 'two_star',
  3: 'three_star',
  4: 'four_star',
  5: 'five_star'
};

// Rufus AI 预设问题配置
const RUFUS_QUESTION_TOPICS = {
  wish_it_had: {
    name: '功能改进建议',
    icon: '💡',
    questions: [
      "In the current reviews, what features do buyers most commonly mention using the 'I wish it had...' phrase? Please summarize the top 3-5 wishes.",
      "What improvements do customers suggest for this product based on their reviews?"
    ]
  },
  quality_issues: {
    name: '质量问题',
    icon: '🔧',
    questions: [
      "What are the most common quality issues or defects mentioned in the reviews?",
      "How durable is this product according to customer feedback? What breaks or wears out?"
    ]
  },
  price_value: {
    name: '性价比',
    icon: '💰',
    questions: [
      "Do customers think this product is worth the price? Summarize the value-for-money feedback.",
      "What do reviews say about the price compared to similar products?"
    ]
  },
  comparison: {
    name: '竞品对比',
    icon: '⚖️',
    questions: [
      "How do customers compare this product to competitors or alternatives they've tried?",
      "What brands or products do reviewers mention as better or worse alternatives?"
    ]
  },
  use_scenarios: {
    name: '使用场景',
    icon: '👥',
    questions: [
      "What are the most common use cases and scenarios mentioned in reviews?",
      "Who is this product best suited for according to customer reviews? Any age groups or skill levels?"
    ]
  },
  positive_highlights: {
    name: '好评亮点',
    icon: '⭐',
    questions: [
      "What features or aspects do customers praise the most in their positive reviews?",
      "What makes customers recommend this product to others?"
    ]
  }
};

/**
 * [NEW] 根据关键词动态调整问题（针对搜索页）
 * @param {string} originalQuestion - 原始问题
 * @param {string} keyword - 搜索关键词
 * @param {string} topicKey - 主题类型
 * @returns {string} - 调整后的问题
 */
function adaptQuestionForKeyword(originalQuestion, keyword, topicKey) {
  // 如果问题已经包含关键词，不需要调整
  if (originalQuestion.toLowerCase().includes(keyword.toLowerCase())) {
    return originalQuestion;
  }
  
  // 根据主题类型调整问题，将关键词融入问题中
  switch (topicKey) {
    case 'wish_it_had':
      // 功能改进：针对特定产品类
      return originalQuestion.replace(
        /this product/gi,
        `these ${keyword} products`
      ).replace(
        /the product/gi,
        `${keyword} products`
      );
      
    case 'quality_issues':
      // 质量问题：针对特定产品类
      return originalQuestion.replace(
        /this product/gi,
        `${keyword} products`
      );
      
    case 'price_value':
      // 性价比：针对特定产品类
      return originalQuestion.replace(
        /this product/gi,
        `${keyword} products`
      ).replace(
        /similar products/gi,
        `other ${keyword} options`
      );
      
    case 'comparison':
      // 竞品对比：针对特定产品类
      return originalQuestion.replace(
        /this product/gi,
        `${keyword} products`
      ).replace(
        /competitors or alternatives/gi,
        `other ${keyword} brands or alternatives`
      );
      
    case 'use_scenarios':
      // 使用场景：针对特定产品类
      return originalQuestion.replace(
        /reviews/gi,
        `reviews for ${keyword}`
      ).replace(
        /this product/gi,
        `${keyword}`
      );
      
    case 'positive_highlights':
      // 好评亮点：针对特定产品类
      return originalQuestion.replace(
        /this product/gi,
        `${keyword} products`
      );
      
    default:
      // 默认：简单添加关键词到问题开头或替换通用词
      if (originalQuestion.toLowerCase().includes('reviews')) {
        return originalQuestion.replace(
          /reviews/gi,
          `reviews for ${keyword}`
        );
      } else {
        return `For ${keyword}, ${originalQuestion.toLowerCase()}`;
      }
  }
}

// Global state
let isCollecting = false;
let shouldStop = false;
let overlay = null;
let g_displayCount = 0; // [FIXED] 全局显示计数器，只增不减，完全信任后台传来的数字

/**
 * [NEW] Generate a stable hash from a string (djb2 algorithm)
 * Used to create consistent IDs for reviews without native IDs
 */
function generateStableHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
  }
  return 'R' + (hash >>> 0).toString(16); // Convert to positive hex
}

/**
 * [NEW] Human-like random delay using Normal Distribution (Box-Muller transform)
 * Makes scraping behavior look less robotic
 * Returns a promise that resolves after the delay, and the delay value is stored in the promise
 */
function humanLikeDelay(base = 3000, variance = 1000) {
  let u = 0, v = 0;
  while(u === 0) u = Math.random();
  while(v === 0) v = Math.random();
  // Standard normal distribution number
  const num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
  
  // Apply base and variance, ensure minimum 1s delay
  const delay = Math.max(1000, Math.floor(base + (num * variance)));
  const promise = new Promise(resolve => setTimeout(resolve, delay));
  promise.delay = delay; // Attach delay value to promise for logging
  return promise;
}

/**
 * Detect ASIN from current page URL or page content
 * [UPDATED] Added check for hidden input #ASIN (Gold Standard)
 */
function detectASIN() {
  // Strategy 1: Hidden Input (Most Reliable)
  // Amazon 几乎所有的详情页都有一个 id="ASIN" 的隐藏输入框
  const asinInput = document.getElementById('ASIN') || document.querySelector('input[name="ASIN"]');
  if (asinInput && asinInput.value && asinInput.value.length === 10) {
    return asinInput.value;
  }

  // Strategy 2: URL Regex Patterns
  const urlPatterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/ASIN\/([A-Z0-9]{10})/i,
    // 处理带参数的情况，如 ?asin=B0...
    /[?&]asin=([A-Z0-9]{10})/i
  ];

  for (const pattern of urlPatterns) {
    const match = window.location.href.match(pattern);
    if (match) return match[1];
  }

  // Strategy 3: Canonical Link
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    for (const pattern of urlPatterns) {
      const match = canonical.href.match(pattern);
      if (match) return match[1];
    }
  }

  // Strategy 4: Data Attributes
  // 某些动态加载的页面会在 body 或特定 div 上挂载 data-asin
  const asinElement = document.querySelector('[data-asin]');
  if (asinElement) {
    const asin = asinElement.getAttribute('data-asin');
    if (asin && asin.length === 10) return asin;
  }
  
  // Strategy 5: Q&A Widget (Fallback)
  const qaWidget = document.querySelector('[data-asin-id]');
  if (qaWidget) {
     const asin = qaWidget.getAttribute('data-asin-id');
     if (asin && asin.length === 10) return asin;
  }

  return null;
}

/**
 * [NEW] 检测当前页面是否为搜索结果页
 * 用于在搜索结果页显示产品选择界面
 */
function isSearchResultsPage() {
  const url = window.location.href;
  
  // URL 模式检测
  const urlPatterns = [
    /\/s\?k=/i,           // /s?k=keyword
    /\/s\?keywords=/i,    // /s?keywords=keyword
    /\/s\/ref=/i,         // /s/ref=...
    /\/s\?/i,             // /s?...
    /\/s$/i               // /s (末尾)
  ];
  
  const isSearchUrl = urlPatterns.some(pattern => pattern.test(url));
  
  // DOM 元素检测（更可靠）
  const hasSearchResults = document.querySelectorAll('[data-component-type="s-search-result"]').length > 0;
  const hasSearchContainer = !!document.querySelector('.s-main-slot') || !!document.querySelector('#search');
  
  return isSearchUrl && (hasSearchResults || hasSearchContainer);
}

/**
 * [NEW] 从当前页面 URL 提取搜索关键词
 * @returns {string|null} 搜索关键词
 */
function extractSearchKeyword() {
  const url = new URL(window.location.href);
  
  // 尝试从 URL 参数获取关键词
  // 常见参数: k, keywords, field-keywords
  const keywordParams = ['k', 'keywords', 'field-keywords'];
  for (const param of keywordParams) {
    const value = url.searchParams.get(param);
    if (value) {
      return decodeURIComponent(value).trim();
    }
  }
  
  // 尝试从页面标题提取
  const title = document.title;
  // 格式: "Amazon.com : keyword" 或 "keyword : Amazon.com"
  const colonMatch = title.match(/Amazon\.[^:]+\s*:\s*(.+)/i);
  if (colonMatch) {
    return colonMatch[1].trim();
  }
  
  // 尝试从搜索框获取
  const searchInput = document.querySelector('#twotabsearchtextbox');
  if (searchInput && searchInput.value) {
    return searchInput.value.trim();
  }
  
  return null;
}

/**
 * [NEW] 转换数字字符串（处理 K, M 后缀）
 * @param {string} text - 包含数字的文本，如 "2.4K", "1.2M", "300"
 * @returns {number|null} 转换后的数字，如 2400, 1200000, 300
 */
function convertNumberWithSuffix(text) {
  if (!text) return null;
  
  // 移除逗号和其他非数字字符（保留小数点、K、M）
  const cleaned = text.replace(/,/g, '').trim();
  
  // 匹配数字和 K/M 后缀
  const match = cleaned.match(/(\d+\.?\d*)\s*([KMkm]?)/);
  if (!match) return null;
  
  const number = parseFloat(match[1]);
  const suffix = match[2].toUpperCase();
  
  if (suffix === 'K') {
    return Math.round(number * 1000);
  } else if (suffix === 'M') {
    return Math.round(number * 1000000);
  } else {
    return Math.round(number);
  }
}

/**
 * [NEW] 从搜索结果页面提取所有产品信息
 * @returns {Array} 产品信息数组
 */
function extractSearchResults() {
  const products = [];
  
  // 主选择器：搜索结果项
  const searchResults = document.querySelectorAll('[data-component-type="s-search-result"]');
  
  searchResults.forEach((item, index) => {
    try {
      // 提取 ASIN
      const asin = item.getAttribute('data-asin');
      if (!asin || asin.length !== 10) return;
      
      // 跳过广告产品
      const isSponsored = item.querySelector('[data-component-type="sp-sponsored-result"]') ||
                          item.textContent?.includes('Sponsored');
      
      // 提取标题
      const titleEl = item.querySelector('.s-title-instructions-style span, h2 a span, .a-text-normal');
      const title = titleEl?.textContent?.trim() || '';
      if (!title) return;
      
      // 提取图片
      const imageEl = item.querySelector('.s-image');
      const imageUrl = imageEl?.src || imageEl?.getAttribute('data-image-source-density-1') || '';
      
      // 提取价格
      const priceEl = item.querySelector('.a-price .a-offscreen');
      const price = priceEl?.textContent?.trim() || '';
      
      // 提取评分
      let rating = null;
      const ratingEl = item.querySelector('.a-icon-alt');
      if (ratingEl) {
        const match = ratingEl.textContent?.match(/(\d+\.?\d*)/);
        if (match) rating = parseFloat(match[1]);
      }
      
      // 提取评论数量（支持 K/M 转换）
      let reviewCount = null;
      const reviewCountEl = item.querySelector('.s-underline-text, [aria-label*="ratings"], a[href*="customerReviews"]');
      if (reviewCountEl) {
        const text = reviewCountEl.textContent?.trim() || '';
        // 尝试提取带 K/M 后缀的数字，如 "2.4K", "13.3K"
        reviewCount = convertNumberWithSuffix(text);
        
        // 如果转换失败，尝试直接匹配数字
        if (!reviewCount) {
          const match = text.replace(/,/g, '').match(/(\d+)/);
          if (match) reviewCount = parseInt(match[1]);
        }
      }
      
      // [NEW] 提取销量数据（"XK+ bought in past month"）
      let salesVolume = null;
      let salesVolumeText = null;
      
      // 在 item 内查找包含 "bought" 或 "sold" 的文本
      const allTextElements = item.querySelectorAll('span, div, a, p');
      for (const el of allTextElements) {
        const text = el.textContent?.trim() || '';
        if (!text) continue;
        
        // 跳过过长的文本（可能是无关的页面内容）
        if (text.length > 200) continue;
        
        // 匹配 "XK+ bought in past month" 或 "XK+ bought in the past month" 格式
        const salesMatch = text.match(/(\d+\.?\d*[KMkm]?\+?)\s*(?:bought|sold|purchased).*?(?:past|last)\s*(?:month|week|day)/i);
        if (salesMatch) {
          salesVolumeText = salesMatch[0].substring(0, 100);
          salesVolume = convertNumberWithSuffix(salesMatch[1]);
          break;
        }
        
        // 匹配 "XK+ bought" 格式（更简单的格式）
        const simpleMatch = text.match(/(\d+\.?\d*[KMkm]?\+?)\s*(?:bought|sold|purchased)/i);
        if (simpleMatch && !salesVolume) {
          salesVolumeText = simpleMatch[0].substring(0, 100);
          salesVolume = convertNumberWithSuffix(simpleMatch[1]);
        }
      }
      
      // 提取产品链接
      const linkEl = item.querySelector('h2 a, .s-title-instructions-style a');
      const link = linkEl?.href || `https://www.amazon.com/dp/${asin}`;
      
      products.push({
        asin,
        title: title.length > 100 ? title.substring(0, 100) + '...' : title,
        imageUrl,
        price,
        rating,
        reviewCount,
        salesVolume,        // [NEW] 销量数字
        salesVolumeText,   // [NEW] 销量原始文本
        link,
        isSponsored: !!isSponsored,
        index: index + 1
      });
    } catch (e) {
      console.error('[VOC-Master] Error extracting product:', e);
    }
  });
  
  console.log(`[VOC-Master] Extracted ${products.length} products from search results`);
  return products;
}

/**
 * Get product info from page
 */
function getProductInfo() {
  const title = document.querySelector('#productTitle')?.textContent?.trim() ||
                document.querySelector('.product-title-word-break')?.textContent?.trim() ||
                document.title.split(':')[0].trim();

  const imageElement = document.querySelector('#landingImage') ||
                       document.querySelector('#imgBlkFront') ||
                       document.querySelector('.a-dynamic-image');
  const imageUrl = imageElement?.src || null;

  // Extract real average rating
  let averageRating = null;
  const ratingSelectors = [
    '#acrPopover .a-icon-alt',
    '#acrCustomerReviewText',
    '.a-icon-alt[aria-label*="out of 5"]',
    '[data-hook="average-star-rating"] .a-icon-alt',
    '#averageCustomerReviews .a-icon-alt'
  ];
  
  for (const selector of ratingSelectors) {
    const ratingEl = document.querySelector(selector);
    if (ratingEl) {
      const ratingText = ratingEl.textContent || ratingEl.getAttribute('aria-label') || '';
      const match = ratingText.match(/(\d+\.?\d*)\s*(?:out of 5|stars?|星)/i) || 
                   ratingText.match(/(\d+\.?\d*)/);
      if (match) {
        averageRating = parseFloat(match[1]);
        if (averageRating >= 0 && averageRating <= 5) break;
      }
    }
  }

  // Extract price
  let price = null;
  const priceSelectors = [
    '#priceblock_ourprice', '#priceblock_dealprice', '#priceblock_saleprice',
    '.a-price .a-offscreen', '.a-price-whole',
    '[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price .a-offscreen'
  ];
  
  for (const selector of priceSelectors) {
    const priceEl = document.querySelector(selector);
    if (priceEl) {
      const priceText = priceEl.textContent?.trim() || priceEl.getAttribute('aria-label')?.trim();
      if (priceText) {
        price = priceText;
        break;
      }
    }
  }

  // Extract bullet points
  const bulletPoints = [];
  const bulletSelectors = [
    '#feature-bullets ul.a-unordered-list li span.a-list-item:not(.a-text-bold)',
    '#feature-bullets .a-unordered-list .a-list-item'
  ];
  
  for (const selector of bulletSelectors) {
    const bulletEls = document.querySelectorAll(selector);
    if (bulletEls.length > 0) {
      bulletEls.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 5 && !text.match(/^[0-9]+[\.,]?\s*$/) && !bulletPoints.includes(text)) {
          bulletPoints.push(text);
        }
      });
      if (bulletPoints.length > 0) break;
    }
  }

  // [NEW] Extract category breadcrumb
  const categories = [];
  const breadcrumbSelectors = [
    '#wayfinding-breadcrumbs_feature_div ul.a-unordered-list li a',  // 最常见的
    '#wayfinding-breadcrumbs_container a',
    '.a-breadcrumb a',
    '#SalesRank a',  // 备选
    '[data-feature-name="breadcrumb"] a'
  ];
  
  for (const selector of breadcrumbSelectors) {
    const categoryLinks = document.querySelectorAll(selector);
    if (categoryLinks.length > 0) {
      categoryLinks.forEach(link => {
        const name = link.textContent?.trim();
        const url = link.getAttribute('href');
        if (name && url && !name.match(/^(\s|›|>)*$/)) {
          // 过滤空白和分隔符
          categories.push({
            name: name,
            url: url.startsWith('http') ? url : `${window.location.origin}${url}`
          });
        }
      });
      if (categories.length > 0) break;
    }
  }

  return { title, imageUrl, averageRating, price, bulletPoints, categories };
}

/**
 * Build reviews page URL with star filter
 */
function buildReviewsUrl(asin, star, page = 1) {
  const baseUrl = window.location.origin;
  const starFilter = STAR_FILTERS[star];
  
  const params = new URLSearchParams({
    ie: 'UTF8',
    reviewerType: 'all_reviews',
    filterByStar: starFilter,
    pageNumber: page.toString(),
    sortBy: 'recent',
    formatType: 'all_formats'  // 确保采集所有变体的评论
  });
  
  return `${baseUrl}/product-reviews/${asin}?${params.toString()}`;
}

/**
 * Parse reviews from page DOM
 * [UPDATED] Uses stable hash generation for ID fallback
 */
function parseReviewsFromPage(doc = document) {
  const reviews = [];
  const reviewElements = doc.querySelectorAll('[data-hook="review"]');

  reviewElements.forEach(el => {
    try {
      // 1. Extract Body & Rating first to help with ID generation
      let body = '';
      const bodySelectors = [
        '[data-hook="review-body"] span', '[data-hook="review-body"]',
        '.review-text', '.a-expander-content'
      ];
      for (const selector of bodySelectors) {
        const bodyEl = el.querySelector(selector);
        if (bodyEl) {
          body = bodyEl.textContent?.trim() || '';
          if (body) break;
        }
      }

      let rating = 0;
      const ratingSelectors = [
        '[data-hook="review-star-rating"] .a-icon-alt',
        '[data-hook="cmps-review-star-rating"] .a-icon-alt',
        '.a-icon-alt[aria-label*="star"]'
      ];
      for (const selector of ratingSelectors) {
        const ratingEl = el.querySelector(selector);
        if (ratingEl) {
          const ratingText = ratingEl.textContent || ratingEl.getAttribute('aria-label') || '';
          const ratingMatch = ratingText.match(/(\d+)/);
          if (ratingMatch) {
            rating = parseInt(ratingMatch[1]);
            break;
          }
        }
      }

      // Author & Date
      const author = el.querySelector('.a-profile-name')?.textContent?.trim() || 'Anonymous';
      const dateText = el.querySelector('[data-hook="review-date"]')?.textContent || '';
      const dateMatch = dateText.match(/on\s+(.+)$/i);
      const reviewDate = dateMatch ? dateMatch[1].trim() : '';

      // 2. Review ID Generation (Robust Strategy)
      let reviewId = el.id;
      if (!reviewId || !reviewId.startsWith('R')) reviewId = el.getAttribute('data-review-id');
      
      // Fallback: Generate Stable Hash if no ID found
      if (!reviewId || !reviewId.startsWith('R')) {
        if (body || rating) {
          // Create a fingerprint: Author + Rating + Date + First 30 chars of body
          const signature = `${author}|${rating}|${reviewDate}|${body.substring(0, 30)}`;
          reviewId = generateStableHash(signature);
        } else {
          // Skip empty/invalid review
          return;
        }
      }

      // Title
      const title = el.querySelector('[data-hook="review-title"] span:not(.a-icon-alt)')?.textContent?.trim() || '';

      // Meta
      const verifiedPurchase = !!el.querySelector('[data-hook="avp-badge"]');
      const helpfulText = el.querySelector('[data-hook="helpful-vote-statement"]')?.textContent || '';
      const helpfulMatch = helpfulText.match(/(\d+)/);
      const helpfulVotes = helpfulMatch ? parseInt(helpfulMatch[1]) : 0;

      // Variant info (color, size, etc.)
      // 尝试多种选择器提取变体信息
      let variant = null;
      const variantSelectors = [
        '[data-hook="format-strip"]',           // 最常见的形式
        '[data-hook="format-strip-linkless"]',  // 无链接版本
        '.review-format-strip a',               // 通过类名查找
        '.review-format-strip'                  // 直接取容器文本
      ];
      for (const selector of variantSelectors) {
        const variantEl = el.querySelector(selector);
        if (variantEl) {
          const text = variantEl.textContent?.trim();
          if (text && text.length > 0 && !text.includes('Verified Purchase')) {
            variant = text;
            break;
          }
        }
      }

      if (reviewId && (body || rating > 0)) {
        reviews.push({
          review_id: reviewId,
          author,
          rating,
          title,
          body,
          review_date: reviewDate,
          verified_purchase: verifiedPurchase,
          helpful_votes: helpfulVotes,
          variant: variant
        });
      }
    } catch (e) {
      console.error('Error parsing review:', e);
    }
  });

  return reviews;
}

/**
 * Check if there's a next page
 */
function hasNextPage(doc = document) {
  const nextButton = doc.querySelector('.a-pagination .a-last:not(.a-disabled)');
  return !!nextButton;
}

/**
 * Fetch and parse reviews from a URL using hidden iframe
 * [UPDATED] Added CAPTCHA detection
 */
async function fetchReviewsPage(url) {
  return new Promise((resolve, reject) => {
    console.log('[IFrame] Loading:', url);
    
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1024px;height:768px;opacity:0;pointer-events:none;visibility:hidden;';
    iframe.name = 'voc-review-loader-' + Date.now();
    
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Iframe load timeout'));
    }, 25000); // Increased timeout
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };
    
    iframe.onload = () => {
      setTimeout(() => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          
          if (!doc || !doc.body) throw new Error('Cannot access iframe document');

          // [NEW] CAPTCHA Detection
          const title = doc.title || '';
          const isCaptcha = title.includes('Robot Check') || 
                            doc.querySelector('form[action*="/errors/validateCaptcha"]') ||
                            doc.body.textContent.includes('Enter the characters you see below');

          if (isCaptcha) {
            console.warn('[IFrame] 🚨 CAPTCHA Detected!');
            cleanup();
            reject(new Error('CAPTCHA_DETECTED'));
            return;
          }
          
          const reviews = parseReviewsFromPage(doc);
          const hasNext = hasNextPage(doc);
          
          console.log('[IFrame] Parsed reviews:', reviews.length);
          
          cleanup();
          resolve({ reviews, hasNext });
        } catch (error) {
          console.error('[IFrame] Error parsing content:', error);
          cleanup();
          reject(error);
        }
      }, 800); // Increased delay for rendering
    };
    
    iframe.onerror = (e) => {
      cleanup();
      reject(new Error('Iframe load error'));
    };
    
    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

/**
 * [OPTIMIZED] Collect reviews with Concurrency Support
 * Supports 'fast' mode (parallel requests) and 'stable' mode (serial)
 * [UPDATED] Added onBatchComplete callback to track real-time collection count
 */
async function collectReviewsByStar(asin, star, maxPages, onProgress, speedMode = 'stable', onBatchComplete = null) {
  const allReviews = [];
  const seenReviewIds = new Set();
  
  // 配置并发参数
  // fast: 一次发3个请求，间隔短
  // stable: 一次发1个请求，间隔长
  const BATCH_SIZE = speedMode === 'fast' ? 3 : 1; 
  const BATCH_DELAY = speedMode === 'fast' ? 2000 : CONFIG.DELAY_BETWEEN_PAGES.min;

  console.log(`[Star ${star}] Starting collection in ${speedMode} mode (Batch Size: ${BATCH_SIZE})...`);

  // 分批循环
  for (let startPage = 1; startPage <= maxPages; startPage += BATCH_SIZE) {
    if (shouldStop) break;

    // 1. 构建当前批次的任务
    const endPage = Math.min(startPage + BATCH_SIZE - 1, maxPages);
    const pageNumbers = [];
    for (let p = startPage; p <= endPage; p++) pageNumbers.push(p);

    onProgress({
      currentStar: star,
      currentPage: endPage, // 显示当前批次的最大页码
      maxPages,
      message: `正在并发采集 ${star} 星... 第 ${pageNumbers.join(',')} 页`
    });

    try {
      // 2. 并发执行请求 (Promise.all)
      const tasks = pageNumbers.map(page => {
        const url = buildReviewsUrl(asin, star, page);
        // 给每个请求一点微小的错峰延迟(100-300ms)，避免瞬间并发触发防火墙
        const staggerDelay = (page - startPage) * 300; 
        return new Promise(resolve => {
          setTimeout(() => {
            fetchReviewsPage(url)
              .then(data => resolve({ page, ...data, success: true }))
              .catch(err => resolve({ page, success: false, error: err }));
          }, staggerDelay);
        });
      });

      const results = await Promise.all(tasks);

      // 3. 处理批次结果
      let batchNewReviews = 0;
      let hasCaptcha = false;

      for (const res of results) {
        if (!res.success) {
          console.error(`[Star ${star}] Failed page ${res.page}:`, res.error);
          if (res.error && res.error.message === 'CAPTCHA_DETECTED') hasCaptcha = true;
          continue;
        }

        // 数据去重与合并
        for (const review of res.reviews) {
          if (!seenReviewIds.has(review.review_id)) {
            seenReviewIds.add(review.review_id);
            allReviews.push(review);
            batchNewReviews++;
          }
        }
      }

      console.log(`[Star ${star}] Batch ${startPage}-${endPage}: Got ${batchNewReviews} new reviews`);

      // [NEW] 通知外层这一批新增了多少条评论
      if (onBatchComplete && batchNewReviews > 0) {
        onBatchComplete(batchNewReviews);
      }

      // 4. 熔断机制：如果遇到验证码，立即停止
      if (hasCaptcha) {
        onProgress({ error: '检测到验证码，为了安全已暂停采集。' });
        shouldStop = true;
        break;
      }

      // 5. 空数据检测：如果这一批全是空的，可能已经到底了，提前结束
      if (batchNewReviews === 0 && allReviews.length > 0) {
        console.log(`[Star ${star}] No new reviews in batch, assuming end of list.`);
        break;
      }

      // 6. 批次间休息 (模拟真人翻页阅读时间)
      if (endPage < maxPages) {
        const delayPromise = humanLikeDelay(BATCH_DELAY, 1000);
        console.log(`[Wait] Resting for ${delayPromise.delay}ms...`);
        await delayPromise;
      }

    } catch (error) {
      console.error(`[Star ${star}] Batch error:`, error);
      await humanLikeDelay(5000, 0); // 发生大错误时多歇会儿
    }
  }

  return allReviews;
}

/**
 * Main collection function
 */
async function startCollection(config) {
  const asin = detectASIN();
  if (!asin) {
    showOverlay({ error: '无法检测到 ASIN' });
    return;
  }

  const { title, imageUrl, averageRating, price, bulletPoints, categories } = getProductInfo();
  const starsToCollect = config.stars || [1, 2, 3, 4, 5];
  const pagesPerStar = config.pagesPerStar || 5;
  const mediaType = config.mediaType || 'all_formats';
  const speedMode = config.speedMode || 'fast';

  isCollecting = true;
  shouldStop = false;
  g_displayCount = 0; // [FIXED] 重置显示计数器

  showOverlay({
    status: 'collecting',
    message: '初始化采集引擎...',
    progress: 0,
    asin,
    title
  });

  // Use background service worker for collection to maintain context
  // [NEW] 传递 workflowMode 到后台
  const workflowMode = config.workflowMode || 'one_step_insight';
  
  chrome.runtime.sendMessage({
    type: 'START_TAB_COLLECTION',
    asin,
    config: { stars: starsToCollect, pagesPerStar, mediaType, speedMode, workflowMode },
    productInfo: {
      title, imageUrl, averageRating, price, bulletPoints, categories,
      marketplace: detectMarketplace()
    }
  }, (response) => {
    if (response?.success) {
      updateOverlay({ status: 'collecting', message: '后台采集服务已启动...', progress: 2 });
    } else {
      showOverlay({ status: 'error', message: `启动失败: ${response?.error}`, error: response?.error });
      isCollecting = false;
    }
  });
}

function detectMarketplace() {
  const hostname = window.location.hostname;
  if (hostname.includes('.co.uk')) return 'UK';
  if (hostname.includes('.de')) return 'DE';
  if (hostname.includes('.fr')) return 'FR';
  if (hostname.includes('.co.jp')) return 'JP';
  if (hostname.includes('.com.au')) return 'AU';
  if (hostname.includes('.ca')) return 'CA';
  return 'US';
}

function stopCollection() {
  shouldStop = true;
  isCollecting = false;
  chrome.runtime.sendMessage({ type: 'STOP_COLLECTION' });
  updateOverlay({ 
    status: 'stopped', 
    message: '已停止采集',
    reviewCount: g_displayCount // 显示已采集的数量
  });
  // 注意：不重置 g_displayCount，保留显示已采集的数量
}

// --- UI Overlay Logic (Keep simplified for brevity, full logic assumed) ---

function showOverlay(state) {
  if (!overlay) createOverlay();
  updateOverlay(state);
  overlay.classList.add('voc-visible');
  // [NEW] 隐藏浮动按钮
  if (floatingButton) {
    floatingButton.style.display = 'none';
  }
}

function hideOverlay() {
  if (overlay) overlay.classList.remove('voc-visible');
  // [NEW] 重新显示浮动按钮
  if (floatingButton) {
    floatingButton.style.display = 'flex';
  }
}

// ============================================================================
// [NEW] 产品选择器 - 用于搜索结果页批量分析
// ============================================================================

let productSelector = null;
let selectedProducts = new Set();
let allLoadedProducts = [];  // [NEW] 存储所有已加载的产品
let currentSearchPage = 1;   // [NEW] 当前搜索页码
let isLoadingMore = false;   // [NEW] 是否正在加载更多
let hasMorePages = true;     // [NEW] 是否还有更多页

/**
 * [NEW] 显示产品选择器界面
 */
function showProductSelector() {
  if (!productSelector) createProductSelector();
  
  // 重置状态
  allLoadedProducts = [];
  currentSearchPage = 1;
  isLoadingMore = false;
  hasMorePages = true;
  selectedProducts.clear();
  
  // 提取当前页产品列表
  const products = extractSearchResults();
  allLoadedProducts = [...products];
  
  // 检测是否有下一页
  hasMorePages = detectNextPage();
  
  updateProductSelector(allLoadedProducts, false);
  updateLoadMoreButton();
  
  productSelector.classList.add('voc-visible');
  
  // [NEW] 隐藏 overlay（如果存在）和浮动按钮
  if (overlay) {
    overlay.classList.remove('voc-visible');
  }
  if (floatingButton) {
    floatingButton.style.display = 'none';
  }
}

/**
 * [NEW] 隐藏产品选择器
 * @param {boolean} showFloatingButton - 是否显示浮动按钮（默认 true）
 */
function hideProductSelector(showFloatingButton = true) {
  if (productSelector) {
    productSelector.classList.remove('voc-visible');
  }
  // [NEW] 只有在需要时才重新显示浮动按钮（如果返回到 Rufus，overlay 已经显示了）
  if (showFloatingButton && floatingButton) {
    floatingButton.style.display = 'flex';
  }
}

/**
 * [NEW] 创建产品选择器 DOM
 */
function createProductSelector() {
  // 确保 CSS 已加载
  const styleId = 'voc-master-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('src/content/overlay.css');
    (document.head || document.documentElement).appendChild(link);
  }

  productSelector = document.createElement('div');
  productSelector.id = 'voc-product-selector';
  productSelector.innerHTML = `
    <div class="voc-selector-panel">
      <div class="voc-header">
        <div class="voc-logo">
          <svg class="voc-icon-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:28px;">
            <circle cx="50" cy="50" r="35" fill="#FEF3C7"/>
            <circle cx="50" cy="50" r="25" fill="#93C5FD"/>
            <circle cx="50" cy="50" r="15" fill="#1E40AF"/>
            <circle cx="47" cy="45" r="5" fill="#FFFFFF"/>
          </svg>
          <span class="voc-title">选择产品分析</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="voc-close" id="voc-selector-back-btn" title="返回 Rufus AI 洞察" style="font-size: 14px; padding: 0 12px; min-width: auto;">🤖 Rufus</button>
          <button class="voc-close" id="voc-selector-close-btn" title="关闭">×</button>
        </div>
      </div>
      
      <div class="voc-selector-content">
        <div class="voc-selector-header">
          <div class="voc-selector-info">
            <span id="voc-selector-count">已选择 0 个产品</span>
          </div>
          <div class="voc-selector-actions-top">
            <button class="voc-btn-sm" id="voc-select-all-btn">全选</button>
            <button class="voc-btn-sm" id="voc-deselect-all-btn">清空</button>
          </div>
        </div>
        
        <div class="voc-product-list" id="voc-product-list">
          <div class="voc-loading">正在加载产品列表...</div>
        </div>
        
        <div class="voc-load-more-section" id="voc-load-more-section">
          <button class="voc-btn voc-btn-load-more" id="voc-load-more-btn">
            <span class="voc-load-more-icon">📄</span>
            <span class="voc-load-more-text">加载下一页</span>
          </button>
          <div class="voc-page-info" id="voc-page-info">已加载第 1 页</div>
        </div>
        
        <div class="voc-selector-actions">
          <div class="voc-action-row voc-save-library-row">
            <button class="voc-btn voc-btn-save-library" id="voc-save-library-btn">
              💾 保存到产品库
            </button>
            <span class="voc-action-hint">保存当前搜索结果快照</span>
          </div>
        </div>
        
        <div class="voc-selector-status" id="voc-selector-status"></div>
      </div>
    </div>
  `;

  document.body.appendChild(productSelector);

  // 绑定事件
  document.getElementById('voc-selector-close-btn').addEventListener('click', hideProductSelector);
  
  // [NEW] 绑定返回 Rufus 功能按钮
  const backBtn = document.getElementById('voc-selector-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      console.log('[VOC-Master] Returning to Rufus tab from product selector');
      // 隐藏产品选择器（不显示浮动按钮，因为 overlay 会显示）
      hideProductSelector(false);
      // 显示 overlay 并切换到 Rufus Tab
      setTimeout(() => {
        const pageInfo = collectPageInfo();
        showOverlay({ 
          status: 'ready',
          pageType: 'keyword_search',
          pageInfo: pageInfo,
          activeTab: 'rufus' // 切换到 Rufus Tab
        });
      }, 300); // 等待产品选择器隐藏动画完成
    });
  }
  
  document.getElementById('voc-select-all-btn').addEventListener('click', handleSelectAll);
  document.getElementById('voc-deselect-all-btn').addEventListener('click', handleDeselectAll);
  document.getElementById('voc-load-more-btn').addEventListener('click', handleLoadMore);
  document.getElementById('voc-save-library-btn').addEventListener('click', handleSaveToLibrary);
}

/**
 * [NEW] 更新产品选择器列表（同时支持 overlay 和独立选择器）
 * @param {Array} products - 产品列表
 * @param {boolean} append - 是否追加模式（加载更多时使用）
 */
function updateProductSelector(products, append = false) {
  // 优先使用 overlay 中的列表，如果没有则使用独立选择器
  const listEl = document.getElementById('voc-product-list-overlay') || document.getElementById('voc-product-list');
  if (!listEl) return;
  
  if (!append) {
    // 非追加模式，清空选择
    selectedProducts.clear();
  }
  
  if (products.length === 0 && !append) {
    listEl.innerHTML = '<div class="voc-empty">未在页面中检测到产品，请确保页面已完全加载</div>';
    return;
  }
  
  const productsHtml = products.map(p => `
    <div class="voc-product-item" data-asin="${p.asin}">
      <label class="voc-product-checkbox">
        <input type="checkbox" class="voc-product-check" value="${p.asin}" 
               data-title="${p.title.replace(/"/g, '&quot;')}"
               data-image="${p.imageUrl}"
               data-price="${p.price}"
               data-rating="${p.rating || ''}"
               ${p.isSponsored ? 'data-sponsored="true"' : ''}>
        <span class="voc-checkmark"></span>
      </label>
      <div class="voc-product-image">
        <img src="${p.imageUrl}" alt="" onerror="this.style.display='none'">
      </div>
      <div class="voc-product-details">
        <div class="voc-product-title-text">${p.title}</div>
        <div class="voc-product-meta">
          <span class="voc-product-asin">ASIN: ${p.asin}</span>
          ${p.price ? `<span class="voc-product-price">${p.price}</span>` : ''}
          ${p.rating ? `<span class="voc-product-rating">⭐ ${p.rating}</span>` : ''}
          ${p.reviewCount ? `<span class="voc-product-reviews">(${p.reviewCount})</span>` : ''}
          ${p.salesVolume ? `<span class="voc-product-sales">📦 ${p.salesVolume.toLocaleString()}+</span>` : ''}
          ${p.isSponsored ? '<span class="voc-sponsored-tag">广告</span>' : ''}
        </div>
      </div>
    </div>
  `).join('');
  
  if (append) {
    // 追加模式
    listEl.insertAdjacentHTML('beforeend', productsHtml);
  } else {
    // 替换模式
    listEl.innerHTML = productsHtml;
  }
  
  // 绑定新添加的复选框事件
  const checkboxes = append 
    ? Array.from(listEl.querySelectorAll('.voc-product-check')).slice(-products.length)
    : listEl.querySelectorAll('.voc-product-check');
  
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleProductCheck);
  });
  
  updateSelectionCount();
}

/**
 * [NEW] 检测是否有下一页
 */
function detectNextPage() {
  // 检测下一页按钮
  const nextPageBtn = document.querySelector('.s-pagination-next:not(.s-pagination-disabled)');
  const paginationItems = document.querySelectorAll('.s-pagination-item');
  
  return !!nextPageBtn || paginationItems.length > 0;
}

/**
 * [NEW] 获取下一页的 URL
 */
function getNextPageUrl() {
  const currentUrl = new URL(window.location.href);
  const currentPage = parseInt(currentUrl.searchParams.get('page') || '1');
  const nextPage = currentSearchPage + 1;
  
  // 构建下一页 URL
  currentUrl.searchParams.set('page', nextPage.toString());
  
  return currentUrl.toString();
}

/**
 * [NEW] 更新加载更多按钮状态
 */
function updateLoadMoreButton() {
  // 同时支持 overlay 和独立选择器
  const loadMoreBtn = document.getElementById('voc-load-more-overlay-btn') || document.getElementById('voc-load-more-btn');
  const pageInfo = document.getElementById('voc-page-info-overlay') || document.getElementById('voc-page-info');
  const loadMoreSection = document.getElementById('voc-load-more-section-overlay') || document.getElementById('voc-load-more-section');
  
  if (!loadMoreBtn || !pageInfo || !loadMoreSection) return;
  
  if (!hasMorePages) {
    loadMoreSection.style.display = 'none';
    return;
  }
  
  loadMoreSection.style.display = 'block';
  
  if (isLoadingMore) {
    loadMoreBtn.disabled = true;
    const textEl = loadMoreBtn.querySelector('.voc-load-more-text');
    const iconEl = loadMoreBtn.querySelector('.voc-load-more-icon');
    if (textEl) textEl.textContent = '加载中...';
    if (iconEl) iconEl.textContent = '⏳';
  } else {
    loadMoreBtn.disabled = !hasMorePages;
    const textEl = loadMoreBtn.querySelector('.voc-load-more-text');
    const iconEl = loadMoreBtn.querySelector('.voc-load-more-icon');
    if (textEl) textEl.textContent = hasMorePages ? '加载下一页' : '已加载全部';
    if (iconEl) iconEl.textContent = hasMorePages ? '📄' : '✓';
  }
  
  pageInfo.textContent = `已加载 ${currentSearchPage} 页 · 共 ${allLoadedProducts.length} 个产品`;
}

/**
 * [NEW] 处理加载更多
 */
async function handleLoadMore() {
  if (isLoadingMore || !hasMorePages) return;
  
  isLoadingMore = true;
  updateLoadMoreButton();
  setSelectorStatus('正在加载下一页产品...', 'info');
  
  try {
    const nextPageUrl = getNextPageUrl();
    console.log('[VOC-Master] Loading next page:', nextPageUrl);
    
    // 通过 fetch 获取下一页内容
    const response = await fetch(nextPageUrl, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`加载失败: ${response.status}`);
    }
    
    const html = await response.text();
    
    // 解析 HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 从解析的文档中提取产品
    const newProducts = extractProductsFromDocument(doc);
    
    if (newProducts.length === 0) {
      hasMorePages = false;
      setSelectorStatus('已加载全部产品', 'info');
    } else {
      // 去重：过滤掉已存在的 ASIN
      const existingAsins = new Set(allLoadedProducts.map(p => p.asin));
      const uniqueNewProducts = newProducts.filter(p => !existingAsins.has(p.asin));
      
      if (uniqueNewProducts.length > 0) {
        currentSearchPage++;
        allLoadedProducts = [...allLoadedProducts, ...uniqueNewProducts];
        updateProductSelector(uniqueNewProducts, true);
        setSelectorStatus(`已加载 ${uniqueNewProducts.length} 个新产品`, 'success');
      } else {
        setSelectorStatus('没有更多新产品', 'info');
      }
      
      // 检查是否还有更多页
      const nextBtn = doc.querySelector('.s-pagination-next:not(.s-pagination-disabled)');
      hasMorePages = !!nextBtn;
    }
  } catch (error) {
    console.error('[VOC-Master] Load more error:', error);
    setSelectorStatus(`加载失败: ${error.message}`, 'error');
  } finally {
    isLoadingMore = false;
    updateLoadMoreButton();
  }
}

/**
 * [NEW] 从 HTML 文档中提取产品
 */
function extractProductsFromDocument(doc) {
  const products = [];
  const searchResults = doc.querySelectorAll('[data-component-type="s-search-result"]');
  
  searchResults.forEach((item, index) => {
    try {
      const asin = item.getAttribute('data-asin');
      if (!asin || asin.length !== 10) return;
      
      const isSponsored = item.querySelector('[data-component-type="sp-sponsored-result"]') ||
                          item.textContent?.includes('Sponsored');
      
      const titleEl = item.querySelector('.s-title-instructions-style span, h2 a span, .a-text-normal');
      const title = titleEl?.textContent?.trim() || '';
      if (!title) return;
      
      const imageEl = item.querySelector('.s-image');
      const imageUrl = imageEl?.src || imageEl?.getAttribute('data-image-source-density-1') || '';
      
      const priceEl = item.querySelector('.a-price .a-offscreen');
      const price = priceEl?.textContent?.trim() || '';
      
      let rating = null;
      const ratingEl = item.querySelector('.a-icon-alt');
      if (ratingEl) {
        const match = ratingEl.textContent?.match(/(\d+\.?\d*)/);
        if (match) rating = parseFloat(match[1]);
      }
      
      // 提取评论数量（支持 K/M 转换）
      let reviewCount = null;
      const reviewCountEl = item.querySelector('.s-underline-text, [aria-label*="ratings"], a[href*="customerReviews"]');
      if (reviewCountEl) {
        const text = reviewCountEl.textContent?.trim() || '';
        reviewCount = convertNumberWithSuffix(text);
        if (!reviewCount) {
          const match = text.replace(/,/g, '').match(/(\d+)/);
          if (match) reviewCount = parseInt(match[1]);
        }
      }
      
      // [NEW] 提取销量数据
      let salesVolume = null;
      let salesVolumeText = null;
      const allTextElements = item.querySelectorAll('span, div, a, p');
      for (const el of allTextElements) {
        const text = el.textContent?.trim() || '';
        if (!text) continue;
        
        // 匹配 "XK+ bought in past month" 或 "XK+ bought in the past month" 格式
        const salesMatch = text.match(/(\d+\.?\d*[KMkm]?\+?)\s*(?:bought|sold|purchased).*?(?:past|last)\s*(?:month|week|day)/i);
        if (salesMatch) {
          // 只保留匹配的部分，不要整个 text（可能包含大量无关内容）
          salesVolumeText = salesMatch[0].substring(0, 100);
          salesVolume = convertNumberWithSuffix(salesMatch[1]);
          break;
        }
        
        // 匹配 "XK+ bought" 格式（更简单的格式）
        const simpleMatch = text.match(/(\d+\.?\d*[KMkm]?\+?)\s*(?:bought|sold|purchased)/i);
        if (simpleMatch && !salesVolume) {
          salesVolumeText = simpleMatch[0].substring(0, 100);
          salesVolume = convertNumberWithSuffix(simpleMatch[1]);
        }
      }
      
      const linkEl = item.querySelector('h2 a, .s-title-instructions-style a');
      const link = linkEl?.href || `https://www.amazon.com/dp/${asin}`;
      
      products.push({
        asin,
        title: title.length > 100 ? title.substring(0, 100) + '...' : title,
        imageUrl,
        price,
        rating,
        reviewCount,
        salesVolume,        // [NEW] 销量数字
        salesVolumeText,   // [NEW] 销量原始文本
        link,
        isSponsored: !!isSponsored,
        index: index + 1
      });
    } catch (e) {
      console.error('[VOC-Master] Error extracting product from doc:', e);
    }
  });
  
  return products;
}

/**
 * [NEW] 处理产品选择
 */
function handleProductCheck(e) {
  const asin = e.target.value;
  if (e.target.checked) {
    selectedProducts.add(asin);
  } else {
    selectedProducts.delete(asin);
  }
  updateSelectionCount();
}

/**
 * [NEW] 全选
 */
function handleSelectAll() {
  const checkboxes = document.querySelectorAll('.voc-product-check');
  checkboxes.forEach(cb => {
    cb.checked = true;
    selectedProducts.add(cb.value);
  });
  updateSelectionCount();
}

/**
 * [NEW] 清空选择
 */
function handleDeselectAll() {
  const checkboxes = document.querySelectorAll('.voc-product-check');
  checkboxes.forEach(cb => {
    cb.checked = false;
  });
  selectedProducts.clear();
  updateSelectionCount();
}

/**
 * [NEW] 更新选择计数和按钮状态（同时支持 overlay 和独立选择器）
 */
function updateSelectionCount() {
  const count = selectedProducts.size;
  
  // 更新计数显示（同时支持 overlay 和独立选择器）
  const countEl = document.getElementById('voc-selector-count');
  const countElOverlay = document.getElementById('voc-selector-count-overlay');
  if (countEl) {
    countEl.textContent = `已选择 ${count} 个产品`;
  }
  if (countElOverlay) {
    countElOverlay.textContent = `已选择 ${count} 个产品`;
  }
  
  // 移除分析功能按钮的状态更新（这些功能已不再显示）
}

/**
 * [NEW] 设置选择器状态消息（同时支持 overlay 和独立选择器）
 */
function setSelectorStatus(message, type = 'info') {
  const statusEl = document.getElementById('voc-selector-status');
  const statusElOverlay = document.getElementById('voc-selector-status-overlay');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `voc-selector-status voc-status-${type}`;
  }
  if (statusElOverlay) {
    statusElOverlay.textContent = message;
    statusElOverlay.className = `voc-selector-status voc-status-${type}`;
  }
}

/**
 * [NEW] 获取选中的产品信息
 */
function getSelectedProductsInfo() {
  const products = [];
  document.querySelectorAll('.voc-product-check:checked').forEach(cb => {
    products.push({
      asin: cb.value,
      title: cb.dataset.title,
      imageUrl: cb.dataset.image,
      price: cb.dataset.price,
      rating: cb.dataset.rating
    });
  });
  return products;
}

/**
 * [NEW] 处理批量洞察分析
 */
async function handleBatchInsight() {
  const products = getSelectedProductsInfo();
  if (products.length === 0) {
    setSelectorStatus('请先选择产品', 'error');
    return;
  }
  
  setSelectorStatus(`正在启动批量分析 (${products.length} 个产品)...`, 'info');
  
  // 发送消息到 background
  chrome.runtime.sendMessage({
    type: 'BATCH_INSIGHT_ANALYSIS',
    products: products,
    marketplace: detectMarketplace()
  }, (response) => {
    if (response?.success) {
      setSelectorStatus('批量分析任务已启动，请在洞察中心查看进度', 'success');
      // 3秒后跳转到洞察中心
      setTimeout(() => {
        window.open(`${CONFIG.DASHBOARD_URL}/home/my-projects`, '_blank');
      }, 2000);
    } else {
      setSelectorStatus(`启动失败: ${response?.error || '未知错误'}`, 'error');
    }
  });
}

/**
 * [NEW] 处理对比分析
 */
async function handleComparison() {
  const products = getSelectedProductsInfo();
  if (products.length < 2 || products.length > 5) {
    setSelectorStatus('对比分析需要选择 2-5 个产品', 'error');
    return;
  }
  
  setSelectorStatus(`正在创建对比分析项目 (${products.length} 个产品)...`, 'info');
  
  chrome.runtime.sendMessage({
    type: 'COMPARISON_ANALYSIS',
    products: products,
    marketplace: detectMarketplace()
  }, (response) => {
    if (response?.success) {
      setSelectorStatus('对比分析项目已创建', 'success');
      if (response.redirectUrl) {
        setTimeout(() => {
          window.open(response.redirectUrl, '_blank');
        }, 1000);
      }
    } else {
      setSelectorStatus(`创建失败: ${response?.error || '未知错误'}`, 'error');
    }
  });
}

/**
 * [NEW] 处理市场细分分析
 */
async function handleMarketInsight() {
  const products = getSelectedProductsInfo();
  if (products.length < 2 || products.length > 10) {
    setSelectorStatus('市场细分需要选择 2-10 个产品', 'error');
    return;
  }
  
  setSelectorStatus(`正在创建市场洞察项目 (${products.length} 个产品)...`, 'info');
  
  chrome.runtime.sendMessage({
    type: 'MARKET_INSIGHT_ANALYSIS',
    products: products,
    marketplace: detectMarketplace()
  }, (response) => {
    if (response?.success) {
      setSelectorStatus('市场洞察项目已创建', 'success');
      if (response.redirectUrl) {
        setTimeout(() => {
          window.open(response.redirectUrl, '_blank');
        }, 1000);
      }
    } else {
      setSelectorStatus(`创建失败: ${response?.error || '未知错误'}`, 'error');
    }
  });
}

/**
 * [NEW] 处理保存到产品库
 */
async function handleSaveToLibrary() {
  // 获取所有已加载的产品（不仅仅是选中的）
  const allProducts = getAllLoadedProducts();
  const totalCards = document.querySelectorAll('[data-component-type="s-search-result"]').length;
  
  if (allProducts.length === 0) {
    setSelectorStatus(`没有可保存的产品（检测到 ${totalCards} 个产品卡片，但都缺少必要信息）`, 'error');
    return;
  }
  
  // 如果有产品被过滤掉，显示提示
  if (allProducts.length < totalCards) {
    const skipped = totalCards - allProducts.length;
    console.log(`[SaveToLibrary] 检测到 ${totalCards} 个产品，其中 ${skipped} 个因缺少必要信息被跳过`);
  }
  
  // 获取搜索关键词
  const keyword = extractSearchKeyword();
  if (!keyword) {
    setSelectorStatus('无法获取搜索关键词', 'error');
    return;
  }
  
  const marketplace = detectMarketplace();
  const btn = document.getElementById('voc-save-library-btn');
  
  // 禁用按钮防止重复点击
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '💾 保存中...';
  }
  
  setSelectorStatus(`正在保存 ${allProducts.length} 个产品到产品库...`, 'info');
  
  chrome.runtime.sendMessage({
    type: 'SAVE_TO_COLLECTION',
    keyword: keyword,
    marketplace: marketplace,
    products: allProducts
  }, (response) => {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💾 保存到产品库';
    }
    
    if (response?.success) {
      // 显示实际保存的数量（可能少于 allProducts.length，因为后端会再次验证）
      const savedCount = response.collection?.product_count || allProducts.length;
      const message = savedCount === allProducts.length 
        ? `已成功保存 ${savedCount} 个产品到产品库「${keyword}」`
        : `已成功保存 ${savedCount} 个产品到产品库「${keyword}」（共 ${allProducts.length} 个，${allProducts.length - savedCount} 个因验证失败被跳过）`;
      setSelectorStatus(message, 'success');
    } else {
      // 处理错误信息，可能是字符串、对象或数组
      let errorMsg = '未知错误';
      if (response?.error) {
        if (typeof response.error === 'string') {
          errorMsg = response.error;
        } else if (Array.isArray(response.error)) {
          // FastAPI 验证错误格式
          errorMsg = response.error.map(e => e.msg || e.message || JSON.stringify(e)).join('; ');
        } else if (typeof response.error === 'object') {
          errorMsg = response.error.message || response.error.detail || JSON.stringify(response.error);
        }
      }
      setSelectorStatus(`保存失败: ${errorMsg}`, 'error');
      console.error('[SaveToLibrary] Error response:', response);
    }
  });
}

/**
 * [NEW] 获取所有已加载的产品信息（用于保存到产品库）
 * 优先使用 allLoadedProducts 数组（包含所有已加载页面的产品）
 */
function getAllLoadedProducts() {
  // 如果 allLoadedProducts 数组有数据，直接使用（包含所有已加载页面的产品）
  if (allLoadedProducts && allLoadedProducts.length > 0) {
    console.log(`[getAllLoadedProducts] 使用已加载的产品数组: ${allLoadedProducts.length} 个产品`);
    
    // 转换为保存格式
    const products = [];
    allLoadedProducts.forEach((p, index) => {
      // 确保有必要的字段
      if (!p.asin) return;
      
      // 处理图片 URL
      let imageUrl = p.imageUrl || '';
      if (!imageUrl || !imageUrl.startsWith('http')) {
        imageUrl = `https://via.placeholder.com/300x300?text=${encodeURIComponent(p.asin)}`;
      }
      
      // 处理产品链接
      let productUrl = p.link || p.productUrl || '';
      if (!productUrl) {
        productUrl = `${window.location.origin}/dp/${p.asin}`;
      } else {
        // 清理链接，移除多余参数
        try {
          const url = new URL(productUrl);
          productUrl = `${url.origin}/dp/${p.asin}`;
        } catch {
          // 如果 URL 解析失败，使用原始链接
        }
      }
      
      // 处理价格（从字符串转换为数字）
      let price = null;
      if (p.price) {
        // 移除货币符号和逗号，提取数字
        const priceMatch = p.price.replace(/[$,]/g, '').match(/(\d+\.?\d*)/);
        if (priceMatch) {
          price = parseFloat(priceMatch[1]);
        }
      }
      
      products.push({
        asin: p.asin,
        title: p.title || null,
        image_url: imageUrl,
        product_url: productUrl,
        price: price,
        rating: p.rating || null,
        review_count: p.reviewCount || null,
        sales_volume: p.salesVolume || null,
        // 截断过长的销量文本（数据库限制 200 字符）
        sales_volume_text: p.salesVolumeText ? p.salesVolumeText.substring(0, 100) : null,
        is_sponsored: p.isSponsored || false,
        position: p.index || (index + 1)
      });
    });
    
    console.log(`[getAllLoadedProducts] 成功转换 ${products.length} 个产品`);
    return products;
  }
  
  // 如果数组为空，从 DOM 提取（兼容旧逻辑）
  console.log('[getAllLoadedProducts] allLoadedProducts 为空，从 DOM 提取产品');
  const products = [];
  const productCards = document.querySelectorAll('[data-component-type="s-search-result"]');
  const stats = {
    total: productCards.length,
    skipped_no_asin: 0,
    skipped_no_link: 0,
    with_placeholder_image: 0,
    success: 0
  };
  
  productCards.forEach((card, index) => {
    const asin = card.dataset.asin;
    if (!asin) {
      stats.skipped_no_asin++;
      return;
    }
    
    // 跳过广告产品（可选，根据需求决定是否保留）
    const isSponsored = !!card.querySelector('.s-label-popover-default, [data-component-type="sp-sponsored-result"]');
    
    // 获取产品标题
    const titleElem = card.querySelector('h2 a span, h2 span.a-text-normal, .a-size-medium.a-color-base.a-text-normal');
    const title = titleElem?.textContent?.trim() || '';
    
    // 获取产品图片（使用与产品选择器相同的逻辑）
    const imageEl = card.querySelector('.s-image');
    let imageUrl = '';
    if (imageEl) {
      // 优先使用 src 属性（已加载的图片）
      imageUrl = imageEl.src || '';
      
      // 如果没有 src，尝试 data-image-source-density-1（高分辨率图片）
      if (!imageUrl || imageUrl.includes('data:image') || imageUrl.includes('placeholder')) {
        imageUrl = imageEl.getAttribute('data-image-source-density-1') || 
                   imageEl.getAttribute('data-src') || 
                   imageEl.getAttribute('src') || '';
      }
      
      // 如果还是没有，尝试其他可能的属性
      if (!imageUrl || !imageUrl.startsWith('http')) {
        // 尝试 data-image-source-density-2, data-image-source-density-3 等
        for (let i = 1; i <= 3; i++) {
          const attr = `data-image-source-density-${i}`;
          const attrValue = imageEl.getAttribute(attr);
          if (attrValue && attrValue.startsWith('http')) {
            imageUrl = attrValue;
            break;
          }
        }
      }
    }
    
    // 如果还是没有图片，尝试查找其他图片元素
    if (!imageUrl || !imageUrl.startsWith('http')) {
      const fallbackImg = card.querySelector('img[src*="amazon"], img[data-src*="amazon"]');
      if (fallbackImg) {
        imageUrl = fallbackImg.src || fallbackImg.getAttribute('data-src') || fallbackImg.getAttribute('src') || '';
      }
    }
    
    // 如果还是没有图片，根据 ASIN 生成 Amazon 图片 URL（作为最后手段）
    if (!imageUrl || !imageUrl.startsWith('http')) {
      // Amazon 图片 URL 格式通常是：https://m.media-amazon.com/images/I/[IMAGE_ID]._AC_SL1500_.jpg
      // 但我们没有 IMAGE_ID，所以使用占位图
      imageUrl = `https://via.placeholder.com/300x300?text=${encodeURIComponent(asin)}`;
      console.warn(`[getAllLoadedProducts] 产品 ${asin} 无法提取图片，使用占位图`);
    }
    
    // 获取产品链接（尝试多种选择器）
    let productUrl = '';
    const linkSelectors = [
      'h2 a',
      'a.a-link-normal.s-no-outline',
      'a[href*="/dp/"]',
      'a[href*="/gp/product/"]',
      'a'
    ];
    for (const selector of linkSelectors) {
      const linkElem = card.querySelector(selector);
      if (linkElem?.href) {
        try {
          const url = new URL(linkElem.href);
          // 如果链接包含 /dp/ 或 /gp/product/，使用它
          if (url.pathname.includes('/dp/') || url.pathname.includes('/gp/product/')) {
            productUrl = `${url.origin}${url.pathname.split('?')[0]}`;
          } else {
            // 否则根据 ASIN 生成标准链接
            productUrl = `${url.origin}/dp/${asin}`;
          }
          break;
        } catch {
          productUrl = linkElem.href.split('?')[0];
          break;
        }
      }
    }
    
    // 如果还是没有链接，根据 ASIN 生成标准 Amazon 链接
    if (!productUrl && asin) {
      const origin = window.location.origin;
      productUrl = `${origin}/dp/${asin}`;
    }
    
    // 获取价格
    const priceWholeElem = card.querySelector('.a-price-whole');
    const priceFractionElem = card.querySelector('.a-price-fraction');
    const priceSymbolElem = card.querySelector('.a-price-symbol');
    let price = null;
    if (priceWholeElem) {
      const whole = priceWholeElem.textContent.replace(/[,\.]/g, '');
      const fraction = priceFractionElem?.textContent || '00';
      price = parseFloat(`${whole}.${fraction}`);
    }
    
    // 获取评分
    const ratingElem = card.querySelector('.a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt, span[aria-label*="out of"]');
    let rating = null;
    if (ratingElem) {
      const ratingMatch = ratingElem.textContent.match(/(\d+\.?\d*)/);
      if (ratingMatch) {
        rating = parseFloat(ratingMatch[1]);
      }
    }
    
    // 获取评论数量
    const reviewCountElem = card.querySelector('span[aria-label*="ratings"], a[href*="#customerReviews"] span');
    let reviewCount = null;
    if (reviewCountElem) {
      const countText = reviewCountElem.textContent.replace(/[,\s]/g, '');
      const countMatch = countText.match(/(\d+)/);
      if (countMatch) {
        reviewCount = parseInt(countMatch[1]);
      }
    }
    
    // 获取销量（如果有）
    let salesVolume = null;
    let salesVolumeText = null;
    const salesElem = card.querySelector('.a-row.a-size-base span.a-size-base.a-color-secondary');
    if (salesElem) {
      const salesText = salesElem.textContent.trim();
      if (salesText.includes('bought') || salesText.includes('sold') || salesText.includes('K+') || salesText.includes('M+')) {
        salesVolumeText = salesText;
        // 解析数字
        const volumeMatch = salesText.match(/(\d+\.?\d*)\s*([KkMm])?/);
        if (volumeMatch) {
          let volume = parseFloat(volumeMatch[1]);
          const suffix = volumeMatch[2]?.toUpperCase();
          if (suffix === 'K') volume *= 1000;
          else if (suffix === 'M') volume *= 1000000;
          salesVolume = Math.round(volume);
        }
      }
    }
    
    // 必须有产品链接（必需）
    if (!productUrl) {
      stats.skipped_no_link++;
      console.warn(`[getAllLoadedProducts] 跳过产品 ${asin}: 缺少产品链接`);
      return;
    }
    
    // 确保图片 URL 是完整的 HTTP/HTTPS URL
    if (imageUrl && !imageUrl.startsWith('http')) {
      // 如果是相对路径，转换为绝对路径
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        imageUrl = window.location.origin + imageUrl;
      } else {
        // 如果都不匹配，使用占位图
        imageUrl = `https://via.placeholder.com/300x300?text=${encodeURIComponent(asin)}`;
        console.warn(`[getAllLoadedProducts] 产品 ${asin} 图片URL格式异常，使用占位图: ${imageUrl}`);
      }
    }
    
    // 如果没有图片URL，使用占位图
    if (!imageUrl || !imageUrl.startsWith('http')) {
      imageUrl = `https://via.placeholder.com/300x300?text=${encodeURIComponent(asin)}`;
      stats.with_placeholder_image++;
      console.warn(`[getAllLoadedProducts] 产品 ${asin} 缺少图片URL，使用占位图`);
    }
    
    stats.success++;
    products.push({
      asin,
      title,
      image_url: imageUrl,
      product_url: productUrl,
      price,
      rating,
      review_count: reviewCount,
      sales_volume: salesVolume,
      sales_volume_text: salesVolumeText,
      is_sponsored: isSponsored,
      position: index + 1
    });
  });
  
  // 输出统计信息
  console.log('[getAllLoadedProducts] 提取统计:', {
    总计: stats.total,
    成功: stats.success,
    跳过_无ASIN: stats.skipped_no_asin,
    跳过_无链接: stats.skipped_no_link,
    使用占位图: stats.with_placeholder_image
  });
  
  return products;
}

/**
 * Create overlay DOM
 * [UPDATED] Manually inject CSS to ensure styles are loaded
 */
function createOverlay() {
  // 1. 强制注入 CSS (修复样式丢失问题)
  // 注意：这需要 overlay.css 在 manifest.json 的 web_accessible_resources 中 (您已经配好了)
  const styleId = 'voc-master-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('src/content/overlay.css');
    (document.head || document.documentElement).appendChild(link);
  }

  // 2. 创建 Overlay 容器
  overlay = document.createElement('div');
  overlay.id = 'voc-master-overlay';
  overlay.innerHTML = `
    <div class="voc-panel">
      <div class="voc-header">
        <div class="voc-logo">
          <svg class="voc-icon-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:28px;">
            <circle cx="50" cy="50" r="35" fill="#FEF3C7"/>
            <circle cx="50" cy="50" r="25" fill="#93C5FD"/>
            <circle cx="50" cy="50" r="15" fill="#1E40AF"/>
            <circle cx="47" cy="45" r="5" fill="#FFFFFF"/>
          </svg>
          <span class="voc-title">洞察大王</span>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <button class="voc-close" id="voc-expand-btn" title="切换全屏/侧边栏" style="font-size:16px;">⛶</button>
          <button class="voc-close" id="voc-close-btn" title="关闭面板">×</button>
        </div>
      </div>
      
      <div class="voc-content">
        <div class="voc-product-info" id="voc-product-info">
          <div class="voc-asin" id="voc-asin">检测中...</div>
          <div class="voc-product-title" id="voc-product-title"></div>
        </div>
        
        <div class="voc-status" id="voc-status">
          <div class="voc-message" id="voc-message">准备就绪</div>
          <div class="voc-progress-container" id="voc-progress-container" style="display: none;">
            <div class="voc-progress-bar">
              <div class="voc-progress-fill" id="voc-progress-fill"></div>
            </div>
            <div class="voc-progress-text" id="voc-progress-text">0%</div>
          </div>
          <div class="voc-review-count" id="voc-review-count"></div>
        </div>
        
        <div class="voc-config" id="voc-config">
          <div class="voc-config-row">
            <label>采集星级:</label>
            <div class="voc-stars">
              <label><input type="checkbox" class="voc-star-check" value="1" checked> 1星</label>
              <label><input type="checkbox" class="voc-star-check" value="2" checked> 2星</label>
              <label><input type="checkbox" class="voc-star-check" value="3" checked> 3星</label>
              <label><input type="checkbox" class="voc-star-check" value="4" checked> 4星</label>
              <label><input type="checkbox" class="voc-star-check" value="5" checked> 5星</label>
            </div>
          </div>
          <div class="voc-config-row">
            <label>评论类型:</label>
            <div class="voc-media-options">
              <label><input type="radio" name="voc-media-type" value="all_formats" checked> 全部 (文字+图视)</label>
              <label><input type="radio" name="voc-media-type" value="media_reviews_only"> 仅带图/视频</label>
            </div>
          </div>
          <div class="voc-config-row">
            <label>每星级采集页数:</label>
            <select id="voc-pages-per-star">
              <option value="3">3 页</option>
              <option value="5" selected>5 页</option>
              <option value="10">10 页 (最大)</option>
            </select>
          </div>
          <div class="voc-config-row">
            <label>采集模式:</label>
            <div class="voc-mode-options">
              <label><input type="radio" name="voc-speed-mode" value="fast" checked> ⚡ 极速模式</label>
              <label><input type="radio" name="voc-speed-mode" value="stable"> 🛡️ 稳定模式</label>
            </div>
          </div>
          <div class="voc-config-row voc-workflow-section">
            <label>分析模式:</label>
            <div class="voc-workflow-options">
              <label class="voc-workflow-card voc-workflow-selected" data-mode="one_step_insight">
                <input type="radio" name="voc-workflow-mode" value="one_step_insight" checked>
                <span class="voc-workflow-icon">⚡</span>
                <span class="voc-workflow-title">一步到位</span>
                <span class="voc-workflow-desc">采集→翻译→分析→报告</span>
              </label>
              <label class="voc-workflow-card" data-mode="translate_only">
                <input type="radio" name="voc-workflow-mode" value="translate_only">
                <span class="voc-workflow-icon">📝</span>
                <span class="voc-workflow-title">只翻译</span>
                <span class="voc-workflow-desc">仅翻译，稍后手动分析</span>
              </label>
            </div>
          </div>
        </div>
        
        <div class="voc-actions" id="voc-actions">
          <button class="voc-btn voc-btn-primary" id="voc-start-btn">开始采集</button>
          <button class="voc-btn voc-btn-danger" id="voc-stop-btn" style="display: none;">停止采集</button>
          <a class="voc-btn voc-btn-success" id="voc-dashboard-btn" style="display: none;" target="_blank">
            进入洞察中心查看分析 →
          </a>
        </div>
        
        <!-- [NEW] 搜索页 Tab 切换器 -->
        <div class="voc-search-tabs" id="voc-search-tabs" style="display: none;">
          <button class="voc-tab-btn voc-tab-active" data-tab="selector" id="voc-tab-selector">
            <span>📊</span>
            选择产品分析
          </button>
          <button class="voc-tab-btn" data-tab="rufus" id="voc-tab-rufus">
            <span>🤖</span>
            Rufus AI 洞察
          </button>
        </div>
        
        <!-- [NEW] 搜索页产品选择器 - 集成到 Tab 中 -->
        <div class="voc-product-selector-entry" id="voc-product-selector-entry" style="display: none;">
          <div class="voc-section-divider"></div>
          
          <!-- 产品选择器头部 -->
          <div class="voc-selector-header" style="margin-bottom: 12px;">
            <div class="voc-selector-info">
              <span id="voc-selector-count-overlay">已选择 0 个产品</span>
            </div>
            <div class="voc-selector-actions-top">
              <button class="voc-btn-sm" id="voc-select-all-overlay-btn">全选</button>
              <button class="voc-btn-sm" id="voc-deselect-all-overlay-btn">清空</button>
            </div>
          </div>
          
          <!-- 产品列表 -->
          <div class="voc-product-list" id="voc-product-list-overlay" style="min-height: 300px; max-height: 400px; margin-bottom: 12px;">
            <div class="voc-loading">正在加载产品列表...</div>
          </div>
          
          <!-- 加载更多 -->
          <div class="voc-load-more-section" id="voc-load-more-section-overlay" style="margin-bottom: 12px;">
            <button class="voc-btn voc-btn-load-more" id="voc-load-more-overlay-btn" style="width: 100%;">
              <span class="voc-load-more-icon">📄</span>
              <span class="voc-load-more-text">加载下一页</span>
            </button>
            <div class="voc-page-info" id="voc-page-info-overlay" style="text-align: center; font-size: 12px; color: var(--voc-text-muted); margin-top: 4px;">已加载第 1 页</div>
          </div>
          
          <!-- 操作按钮 -->
          <div class="voc-selector-actions" style="margin-top: 8px;">
            <div class="voc-action-row voc-save-library-row">
              <button class="voc-btn voc-btn-save-library" id="voc-save-library-overlay-btn" style="width: 100%;">
                💾 保存到产品库
              </button>
            </div>
          </div>
          
          <!-- 状态提示 -->
          <div class="voc-selector-status" id="voc-selector-status-overlay" style="margin-top: 12px;"></div>
        </div>
        
        <div class="voc-rufus-section" id="voc-rufus-section">
          <div class="voc-section-divider"></div>
          <div class="voc-rufus-header">
            <span class="voc-rufus-icon">🤖</span>
            <span class="voc-rufus-title">Rufus AI 洞察</span>
          </div>
          <p class="voc-rufus-desc">先手动打开 Rufus，然后选择分析主题自动采集</p>
          <div class="voc-rufus-topics" id="voc-rufus-topics">
            <button class="voc-rufus-topic-btn" data-topic="wish_it_had">
              <span class="voc-topic-icon">💡</span>
              <span class="voc-topic-name">功能改进</span>
            </button>
            <button class="voc-rufus-topic-btn" data-topic="quality_issues">
              <span class="voc-topic-icon">🔧</span>
              <span class="voc-topic-name">质量问题</span>
            </button>
            <button class="voc-rufus-topic-btn" data-topic="price_value">
              <span class="voc-topic-icon">💰</span>
              <span class="voc-topic-name">性价比</span>
            </button>
            <button class="voc-rufus-topic-btn" data-topic="comparison">
              <span class="voc-topic-icon">⚖️</span>
              <span class="voc-topic-name">竞品对比</span>
            </button>
            <button class="voc-rufus-topic-btn" data-topic="use_scenarios">
              <span class="voc-topic-icon">👥</span>
              <span class="voc-topic-name">使用场景</span>
            </button>
            <button class="voc-rufus-topic-btn" data-topic="positive_highlights">
              <span class="voc-topic-icon">⭐</span>
              <span class="voc-topic-name">好评亮点</span>
            </button>
          </div>
          
          <!-- [NEW] DIY 自定义问题输入 -->
          <div class="voc-rufus-diy-section" id="voc-rufus-diy">
            <div class="voc-rufus-diy-header">
              <span class="voc-diy-icon">✏️</span>
              <span class="voc-diy-title">自定义提问</span>
            </div>
            <div class="voc-rufus-diy-input-wrapper">
              <textarea 
                id="voc-rufus-diy-input" 
                class="voc-rufus-diy-textarea"
                placeholder="输入您想问 Rufus 的问题..."
                rows="2"
              ></textarea>
              <button id="voc-rufus-diy-send" class="voc-rufus-diy-send-btn" title="发送问题">
                <span>发送</span>
              </button>
            </div>
            <div class="voc-rufus-diy-hint">
              提示：请先手动打开 Rufus 对话框，然后输入问题点击发送
            </div>
          </div>
          
          <div class="voc-rufus-progress-container" id="voc-rufus-progress" style="display: none;">
            <div class="voc-rufus-progress-bar">
              <div class="voc-rufus-progress-fill" id="voc-rufus-progress-fill"></div>
            </div>
            <div class="voc-rufus-progress-text" id="voc-rufus-progress-text">0/0</div>
          </div>
          <div class="voc-rufus-status" id="voc-rufus-status"></div>
          <div class="voc-rufus-result" id="voc-rufus-result" style="display: none;"></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 绑定事件
  document.getElementById('voc-close-btn').addEventListener('click', hideOverlay);
  document.getElementById('voc-start-btn').addEventListener('click', handleStartClick);
  document.getElementById('voc-stop-btn').addEventListener('click', handleStopClick);
  
  // 绑定全屏切换事件 (确保 toggleFullscreen 函数存在)
  const expandBtn = document.getElementById('voc-expand-btn');
  if (expandBtn && typeof toggleFullscreen === 'function') {
      expandBtn.addEventListener('click', toggleFullscreen);
  } else if (expandBtn) {
      // 简单的内联全屏逻辑作为后备
      expandBtn.addEventListener('click', () => {
          overlay.classList.toggle('voc-fullscreen');
          expandBtn.innerHTML = overlay.classList.contains('voc-fullscreen') ? '⤢' : '⛶';
      });
  }
  
  // [NEW] 绑定工作流模式选择卡片的点击事件
  const workflowCards = document.querySelectorAll('.voc-workflow-card');
  workflowCards.forEach(card => {
    card.addEventListener('click', () => {
      // 移除所有卡片的选中状态
      workflowCards.forEach(c => c.classList.remove('voc-workflow-selected'));
      // 添加当前卡片的选中状态
      card.classList.add('voc-workflow-selected');
      // 选中对应的 radio
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      // 日志
      console.log('[VOC-Master] 选择工作流模式:', card.dataset.mode);
    });
  });
  
  // [NEW] 绑定 Rufus 主题按钮点击事件
  const topicButtons = document.querySelectorAll('.voc-rufus-topic-btn');
  topicButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const topicKey = btn.getAttribute('data-topic');
      console.log('[VOC-Master] Rufus topic button clicked:', topicKey);
      
      // 禁用所有按钮防止重复点击
      topicButtons.forEach(b => b.disabled = true);
      btn.classList.add('voc-topic-active');
      
      runTopicQuestions(topicKey).finally(() => {
        // 恢复按钮状态
        topicButtons.forEach(b => b.disabled = false);
        btn.classList.remove('voc-topic-active');
      });
    });
  });
  
  // [NEW] Tab 切换函数（使用动态查询，确保总是获取最新元素）
  function switchSearchTab(activeTab) {
    // 每次都重新查询元素，避免引用问题
    const tabSelector = document.getElementById('voc-tab-selector');
    const tabRufus = document.getElementById('voc-tab-rufus');
    const productSelectorEntry = document.getElementById('voc-product-selector-entry');
    const rufusSection = document.getElementById('voc-rufus-section');
    
    console.log('[VOC-Master] Switching tab to:', activeTab);
    console.log('[VOC-Master] Elements found:', { tabSelector: !!tabSelector, tabRufus: !!tabRufus, productSelectorEntry: !!productSelectorEntry, rufusSection: !!rufusSection });
    
    if (activeTab === 'selector') {
      if (tabSelector) tabSelector.classList.add('voc-tab-active');
      if (tabRufus) tabRufus.classList.remove('voc-tab-active');
      if (productSelectorEntry) productSelectorEntry.style.display = 'block';
      if (rufusSection) rufusSection.style.display = 'none';
      console.log('[VOC-Master] Switched to selector tab');
      
      // [NEW] 切换到产品选择 Tab 时，加载产品列表
      loadProductsForSelector();
    } else if (activeTab === 'rufus') {
      if (tabSelector) tabSelector.classList.remove('voc-tab-active');
      if (tabRufus) tabRufus.classList.add('voc-tab-active');
      if (productSelectorEntry) productSelectorEntry.style.display = 'none';
      if (rufusSection) rufusSection.style.display = 'block';
      console.log('[VOC-Master] Switched to rufus tab');
    }
  }
  
  // [NEW] 加载产品列表到选择器（overlay 或独立选择器）
  function loadProductsForSelector() {
    // 如果产品列表已经加载，不需要重新加载
    const listEl = document.getElementById('voc-product-list-overlay') || document.getElementById('voc-product-list');
    if (!listEl) return;
    
    // 如果列表不为空且不是加载状态，说明已经加载过了
    if (listEl.innerHTML.trim() && !listEl.innerHTML.includes('正在加载')) {
      console.log('[VOC-Master] Product list already loaded');
      return;
    }
    
    // 重置状态
    allLoadedProducts = [];
    currentSearchPage = 1;
    isLoadingMore = false;
    hasMorePages = true;
    selectedProducts.clear();
    
    // 提取当前页产品列表
    const products = extractSearchResults();
    allLoadedProducts = [...products];
    
    // 检测是否有下一页
    hasMorePages = detectNextPage();
    
    updateProductSelector(allLoadedProducts, false);
    updateLoadMoreButton();
    
    console.log('[VOC-Master] Loaded products for selector:', allLoadedProducts.length);
  }
  
  // [NEW] 绑定产品选择器事件处理函数（先定义，后调用）
  function bindProductSelectorEvents() {
    // 使用事件委托，监听整个 overlay，避免重复绑定
    if (overlay && !overlay.dataset.selectorEventsBound) {
      overlay.addEventListener('click', function handleSelectorClick(e) {
        // 全选按钮
        if (e.target.closest('#voc-select-all-overlay-btn') || e.target.closest('#voc-select-all-btn')) {
          e.preventDefault();
          e.stopPropagation();
          handleSelectAll();
          return;
        }
        
        // 清空按钮
        if (e.target.closest('#voc-deselect-all-overlay-btn') || e.target.closest('#voc-deselect-all-btn')) {
          e.preventDefault();
          e.stopPropagation();
          handleDeselectAll();
          return;
        }
        
        // 加载更多按钮
        if (e.target.closest('#voc-load-more-overlay-btn') || e.target.closest('#voc-load-more-btn')) {
          e.preventDefault();
          e.stopPropagation();
          handleLoadMore();
          return;
        }
        
        // 保存到产品库按钮
        if (e.target.closest('#voc-save-library-overlay-btn') || e.target.closest('#voc-save-library-btn')) {
          e.preventDefault();
          e.stopPropagation();
          handleSaveToLibrary();
          return;
        }
      });
      
      overlay.dataset.selectorEventsBound = 'true';
      console.log('[VOC-Master] Product selector events bound using event delegation');
    }
  }
  
  // 将切换函数挂载到全局，供其他地方使用
  window.switchSearchTab = switchSearchTab;
  
  // [NEW] 绑定搜索页 Tab 切换事件（使用事件委托，确保绑定成功）
  const searchTabs = document.getElementById('voc-search-tabs');
  if (searchTabs) {
    // 先移除可能存在的旧监听器（通过设置唯一标识）
    if (searchTabs.dataset.hasListener === 'true') {
      // 已经绑定过，不需要重复绑定
      console.log('[VOC-Master] Tab listeners already bound');
    } else {
      // 使用事件委托，监听整个 Tab 容器
      searchTabs.addEventListener('click', function handleTabClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const clickedTab = e.target.closest('.voc-tab-btn');
        if (!clickedTab) return;
        
        // 如果点击的是已激活的 Tab，不处理
        if (clickedTab.classList.contains('voc-tab-active')) {
          return;
        }
        
        const tabType = clickedTab.getAttribute('data-tab');
        console.log('[VOC-Master] Tab clicked:', tabType);
        
        if (tabType === 'selector') {
          switchSearchTab('selector');
        } else if (tabType === 'rufus') {
          switchSearchTab('rufus');
        }
      });
      
      // 标记已绑定
      searchTabs.dataset.hasListener = 'true';
      console.log('[VOC-Master] Tab event listeners bound successfully');
    }
  } else {
    console.warn('[VOC-Master] Search tabs container not found during binding');
  }
  
  // [NEW] 绑定产品选择器功能事件（集成在 overlay 中）
  bindProductSelectorEvents();
  
  // [NEW] 绑定 DIY 发送按钮事件
  const diySendBtn = document.getElementById('voc-rufus-diy-send');
  const diyInput = document.getElementById('voc-rufus-diy-input');
  
  if (diySendBtn && diyInput) {
    diySendBtn.addEventListener('click', () => {
      const question = diyInput.value.trim();
      if (!question) {
        updateRufusStatus('❌ 请输入问题');
        return;
      }
      
      // 禁用输入和按钮
      diyInput.disabled = true;
      diySendBtn.disabled = true;
      
      runDIYQuestion(question).finally(() => {
        // 恢复状态
        diyInput.disabled = false;
        diySendBtn.disabled = false;
        diyInput.value = '';  // 清空输入
      });
    });
    
    // 支持 Enter 键发送（Shift+Enter 换行）
    diyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        diySendBtn.click();
      }
    });
  }
}

function toggleFullscreen() {
  if(!overlay) return;
  overlay.classList.toggle('voc-fullscreen');
  const btn = document.getElementById('voc-expand-btn');
  btn.innerHTML = overlay.classList.contains('voc-fullscreen') ? '⤢' : '⛶';
}

function updateOverlay(state) {
  if (!overlay) return;
  
  const els = {
    msg: document.getElementById('voc-message'),
    prog: document.getElementById('voc-progress-container'),
    fill: document.getElementById('voc-progress-fill'),
    text: document.getElementById('voc-progress-text'),
    count: document.getElementById('voc-review-count'),
    config: document.getElementById('voc-config'),
    actions: document.getElementById('voc-actions'),
    start: document.getElementById('voc-start-btn'),
    stop: document.getElementById('voc-stop-btn'),
    dash: document.getElementById('voc-dashboard-btn'),
    asin: document.getElementById('voc-asin'),
    title: document.getElementById('voc-product-title'),
    productInfo: document.getElementById('voc-product-info'),
    searchTabs: document.getElementById('voc-search-tabs'),
    productSelectorEntry: document.getElementById('voc-product-selector-entry'),
    rufusSection: document.getElementById('voc-rufus-section')
  };

  // [NEW] 根据页面类型决定显示哪些部分
  const pageType = state.pageType || detectPageType();
  const isProductPage = pageType === 'product_detail' && state.asin;
  const isSearchPage = pageType === 'keyword_search';
  const isHomepage = pageType === 'homepage';
  
  // 在首页和搜索页，隐藏产品采集相关部分
  if (!isProductPage) {
    if (els.productInfo) els.productInfo.style.display = 'none';
    if (els.config) els.config.style.display = 'none';
    if (els.actions) els.actions.style.display = 'none';
    
    // 搜索页：显示 Tab 切换器和默认 Tab
    if (isSearchPage) {
      if (els.searchTabs) els.searchTabs.style.display = 'flex';
      // 默认显示"选择产品分析"Tab（如果用户之前选择了 Rufus，保持选择）
      const defaultTab = state.activeTab || 'selector';
      
      // 使用 switchSearchTab 函数来设置 Tab 状态
      if (typeof window.switchSearchTab === 'function') {
        window.switchSearchTab(defaultTab);
      } else {
        // 如果函数还没定义，直接操作 DOM
        const tabSelectorBtn = document.getElementById('voc-tab-selector');
        const tabRufusBtn = document.getElementById('voc-tab-rufus');
        
        if (defaultTab === 'selector') {
          if (tabSelectorBtn) tabSelectorBtn.classList.add('voc-tab-active');
          if (tabRufusBtn) tabRufusBtn.classList.remove('voc-tab-active');
          if (els.productSelectorEntry) els.productSelectorEntry.style.display = 'block';
          if (els.rufusSection) els.rufusSection.style.display = 'none';
        } else {
          if (tabSelectorBtn) tabSelectorBtn.classList.remove('voc-tab-active');
          if (tabRufusBtn) tabRufusBtn.classList.add('voc-tab-active');
          if (els.productSelectorEntry) els.productSelectorEntry.style.display = 'none';
          if (els.rufusSection) els.rufusSection.style.display = 'block';
        }
      }
    } else {
      // 首页：只显示 Rufus 面板，隐藏 Tab
      if (els.searchTabs) els.searchTabs.style.display = 'none';
      if (els.productSelectorEntry) els.productSelectorEntry.style.display = 'none';
      if (els.rufusSection) els.rufusSection.style.display = 'block';
    }
    
    // 更新页面类型信息显示
    if (isHomepage) {
      if (els.msg) els.msg.textContent = '首页：可以使用 Rufus AI 对话功能';
    } else if (isSearchPage) {
      const keyword = state.pageInfo?.keyword || extractSearchKeyword();
      if (els.msg) els.msg.textContent = `搜索结果页${keyword ? `（关键词：${keyword}）` : ''}：可以使用 Rufus AI 对话功能`;
    }
  } else {
    // 产品页：显示所有内容
    if (els.productInfo) els.productInfo.style.display = 'block';
    if (els.config) els.config.style.display = 'block';
    if (els.actions) els.actions.style.display = 'block';
    if (els.rufusSection) els.rufusSection.style.display = 'block';
    
    if (state.asin) els.asin.textContent = `ASIN: ${state.asin}`;
    if (state.title) els.title.textContent = state.title;
    if (state.message) els.msg.textContent = state.message;
  }

  if (state.reviewCount) {
    els.count.textContent = `已采集: ${state.reviewCount}`;
    els.count.style.display = 'block';
  }

  // 产品页的采集相关逻辑（只在产品页显示）
  if (isProductPage) {
    if (['collecting', 'uploading'].includes(state.status)) {
      els.prog.style.display = 'block';
      els.fill.style.width = `${state.progress || 0}%`;
      els.text.textContent = `${state.progress || 0}%`;
      els.config.style.display = 'none';
      els.start.style.display = 'none';
      els.stop.style.display = 'block';
      els.dash.style.display = 'none';
    } else if (state.status === 'complete') {
      els.prog.style.display = 'none';
      els.config.style.display = 'none';
      els.start.style.display = 'none';
      els.stop.style.display = 'none';
      els.dash.style.display = 'block';
      if(state.dashboardUrl) els.dash.href = state.dashboardUrl;
    } else {
      els.prog.style.display = 'none';
      els.config.style.display = 'block';
      els.start.style.display = 'block';
      els.stop.style.display = 'none';
      els.dash.style.display = 'none';
    }
  }
}

function handleStartClick() {
  const stars = Array.from(document.querySelectorAll('.voc-star-check:checked')).map(el => parseInt(el.value));
  const pagesPerStar = parseInt(document.getElementById('voc-pages-per-star').value);
  // 获取选中的媒体类型 radio
  const mediaTypeRadio = document.querySelector('input[name="voc-media-type"]:checked');
  const mediaType = mediaTypeRadio ? mediaTypeRadio.value : 'all_formats';
  // 获取选中的速度模式 radio
  const speedModeRadio = document.querySelector('input[name="voc-speed-mode"]:checked');
  const speedMode = speedModeRadio ? speedModeRadio.value : 'fast';
  
  // [NEW] 获取工作流模式
  const workflowModeRadio = document.querySelector('input[name="voc-workflow-mode"]:checked');
  const workflowMode = workflowModeRadio ? workflowModeRadio.value : 'one_step_insight';
  console.log('[VOC-Master] 工作流模式:', workflowMode);

  if (!stars.length) {
    alert('请至少选择一个星级');
    return;
  }

  const config = { stars, pagesPerStar, mediaType, speedMode, workflowMode };
  startCollection(config);
}

function handleStopClick() {
  stopCollection();
}

// ================= Rufus AI 对话功能 =================

// Rufus 状态
let isRufusConversing = false;
let currentRufusSessionId = null;  // [NEW] 当前会话 ID

// ============== [NEW] 页面类型检测和信息收集 ==============

/**
 * [NEW] 检测当前页面类型
 * @returns {string} 页面类型: homepage, keyword_search, product_detail
 */
function detectPageType() {
  const url = window.location.href;
  const pathname = window.location.pathname;
  
  // 1. 产品详情页检测（优先）
  if (url.includes('/dp/') || url.includes('/gp/product/')) {
    return 'product_detail';
  }
  
  // 2. 搜索结果页检测（优先）
  if (url.includes('/s?') || url.includes('/s/') || url.match(/\/s\?k=/i)) {
    return 'keyword_search';
  }
  
  // 3. 亚马逊首页检测
  // 匹配: 只有域名，或者只有 / 或很少的路径
  // amazon.com/, amazon.co.uk/, amazon.de/ 等
  const isAmazonDomain = /amazon\.[a-z.]+/i.test(window.location.hostname);
  
  if (isAmazonDomain) {
    // 如果路径名是空的或只有 /，或者是 /ref= 开头，且不包含 /dp/, /gp/product/, /s? 等
    if (pathname === '/' || pathname === '' || pathname.match(/^\/ref=/)) {
      return 'homepage';
    }
    
    // 如果是 /gp/help 或其他通用页面，但不是产品/搜索页
    if (pathname.startsWith('/gp/') && !pathname.includes('/product/')) {
      return 'homepage';
    }
    
    // 如果路径很简单（如 /b/ 等），且没有产品/搜索标识，可能是首页或分类页
    // 这种情况下，我们通过检查DOM来判断
    const hasProductResults = document.querySelectorAll('[data-component-type="s-search-result"]').length > 0;
    const hasSearchContainer = !!document.querySelector('.s-main-slot') || !!document.querySelector('#search');
    
    if (!hasProductResults && !hasSearchContainer && !url.includes('/dp/') && !url.includes('/s?')) {
      // 可能是首页
      return 'homepage';
    }
  }
  
  // 默认为产品详情页（向后兼容）
  return 'product_detail';
}

/**
 * [NEW] 收集当前页面信息
 * @returns {Object} 页面信息对象
 */
function collectPageInfo() {
  const pageType = detectPageType();
  const info = {
    page_type: pageType,
    marketplace: detectMarketplace(),
  };
  
  switch (pageType) {
    case 'homepage':
      // 首页：无需额外信息
      break;
      
    case 'keyword_search':
      // 搜索页：提取关键词
      info.keyword = extractSearchKeyword();
      break;
      
    case 'product_detail':
      // 产品页：提取 ASIN、标题、五点描述、产品图片
      info.asin = detectASIN();
      info.product_title = extractProductTitle();
      info.bullet_points = extractBulletPoints();
      info.product_image = extractProductImage();
      break;
  }
  
  return info;
}

/**
 * [NEW] 提取产品标题
 * @returns {string|null}
 */
function extractProductTitle() {
  // 尝试多种选择器
  const selectors = [
    '#productTitle',
    '#title span',
    '[data-automation-id="title_feature_div"] span',
    '.product-title-word-break',
    'h1.a-size-large span',
  ];
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent) {
      return el.textContent.trim();
    }
  }
  
  return null;
}

/**
 * [NEW] 提取五点描述
 * @returns {string[]|null}
 */
function extractBulletPoints() {
  // 尝试多种选择器
  const selectors = [
    '#feature-bullets ul li span.a-list-item',
    '#feature-bullets li span',
    '[data-automation-id="feature-bullets"] li span',
    '.a-unordered-list.a-vertical.a-spacing-mini li span',
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      const bullets = [];
      elements.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 10) {  // 过滤太短的条目
          bullets.push(text);
        }
      });
      if (bullets.length > 0) {
        return bullets;
      }
    }
  }
  
  return null;
}

/**
 * [NEW] 提取产品图片URL
 * @returns {string|null}
 */
function extractProductImage() {
  // 尝试多种选择器（按优先级）
  const selectors = [
    '#landingImage',                    // 主图
    '#imgBlkFront',                     // 备用主图
    '#main-image',                      // 主图容器
    '.a-dynamic-image',                 // 动态图片
    '#imageBlock_feature_div img',      // 图片块
    '#product-image img',                // 产品图片
    '[data-a-image-name="landingImage"]', // 数据属性
  ];
  
  for (const selector of selectors) {
    const img = document.querySelector(selector);
    if (img) {
      // 优先使用 src，其次 data-src，最后 data-old-src
      let imageUrl = img.src || img.getAttribute('data-src') || img.getAttribute('data-old-src');
      
      if (imageUrl) {
        // 清理URL：移除尺寸参数，获取高质量图片
        // Amazon图片URL格式: https://m.media-amazon.com/images/I/..._AC_SL1500_.jpg
        // 可以替换 _AC_SL1500_ 为 _AC_SL2000_ 获取更大尺寸
        imageUrl = imageUrl.replace(/_AC_SL\d+_/, '_AC_SL2000_');
        
        // 确保是完整URL
        if (imageUrl.startsWith('//')) {
          imageUrl = 'https:' + imageUrl;
        } else if (imageUrl.startsWith('/')) {
          imageUrl = window.location.origin + imageUrl;
        }
        
        // 验证URL格式
        if (imageUrl.startsWith('http')) {
          return imageUrl;
        }
      }
    }
  }
  
  return null;
}

/**
 * [NEW] 检测 Amazon 市场
 * @returns {string}
 */
function detectMarketplace() {
  const hostname = window.location.hostname;
  
  const marketplaceMap = {
    'amazon.com': 'US',
    'amazon.co.uk': 'UK',
    'amazon.de': 'DE',
    'amazon.fr': 'FR',
    'amazon.it': 'IT',
    'amazon.es': 'ES',
    'amazon.ca': 'CA',
    'amazon.co.jp': 'JP',
    'amazon.com.au': 'AU',
    'amazon.in': 'IN',
    'amazon.com.mx': 'MX',
    'amazon.com.br': 'BR',
    'amazon.nl': 'NL',
    'amazon.sg': 'SG',
    'amazon.ae': 'AE',
    'amazon.sa': 'SA',
    'amazon.pl': 'PL',
    'amazon.se': 'SE',
    'amazon.com.tr': 'TR',
  };
  
  for (const [domain, code] of Object.entries(marketplaceMap)) {
    if (hostname.includes(domain)) {
      return code;
    }
  }
  
  return 'US';  // 默认
}

/**
 * [NEW] 生成会话 ID
 * @returns {string}
 */
function generateSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session-${timestamp}-${random}`;
}

/**
 * [NEW] 获取或创建当前会话 ID
 * @returns {string}
 */
function getOrCreateSessionId() {
  if (!currentRufusSessionId) {
    currentRufusSessionId = generateSessionId();
    console.log('[Rufus] Created new session:', currentRufusSessionId);
  }
  return currentRufusSessionId;
}

/**
 * [NEW] 重置会话（开始新会话）
 */
function resetRufusSession() {
  currentRufusSessionId = null;
  console.log('[Rufus] Session reset');
}

// ============== Rufus 对话功能 ==============

/**
 * 检测页面上是否存在 Rufus 聊天界面
 */
function detectRufusChat() {
  // 尝试多种可能的选择器 - 基于实际 Amazon Rufus 界面
  const selectors = [
    // Rufus 对话框容器
    '[data-testid*="rufus"]',
    '[aria-label*="Rufus"]',
    '[class*="rufus"]',
    '[id*="rufus"]',
    // Amazon 侧边栏聊天界面
    '#sw-chat-window',
    '[class*="chat-window"]',
    '[class*="ChatWindow"]',
    '[data-testid="chat-window"]',
    // 通用对话界面
    '[role="dialog"][class*="chat"]',
    '[class*="assistant-container"]',
    '[class*="ai-assistant"]',
    // 特定的 Amazon AI 助手容器
    '.a-popover-wrapper [class*="chat"]',
    'div[class*="ConversationalShopping"]',
    'div[class*="conversational"]'
  ];
  
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        console.log('[Rufus] Found chat interface with selector:', selector);
        return element;
      }
    } catch (e) {
      // 选择器可能无效，跳过
    }
  }
  
  // 备选：查找包含 "Rufus" 或 "Ask" 文本的元素，且包含输入框
  const allElements = document.querySelectorAll('div, section, aside, form');
  for (const el of allElements) {
    const text = el.textContent || '';
    const hasInput = el.querySelector('input[type="text"], textarea, input[placeholder*="Ask"], input[placeholder*="ask"]');
    
    if (hasInput && (
      text.includes('Ask Rufus') || 
      text.includes('Ask a question') ||
      text.includes('Rufus') ||
      el.querySelector('[aria-label*="Rufus"]') ||
      el.querySelector('[aria-label*="Ask"]')
    )) {
      console.log('[Rufus] Found chat by text content and input field');
      return el;
    }
  }
  
  // 最后尝试：查找任何包含输入框的对话框或侧边栏
  const dialogs = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="sidebar"], [class*="panel"]');
  for (const dialog of dialogs) {
    const input = dialog.querySelector('input[type="text"], textarea');
    if (input && dialog.offsetParent !== null) { // 确保对话框可见
      console.log('[Rufus] Found potential chat dialog with input');
      return dialog;
    }
  }
  
  return null;
}

/**
 * 尝试打开 Rufus 聊天界面
 */
async function openRufusChat() {
  // 首先检查是否已经打开
  let chatInterface = detectRufusChat();
  if (chatInterface) {
    console.log('[Rufus] Chat already open');
    return chatInterface;
  }
  
  // 尝试找到并点击 Rufus 图标
  const iconSelectors = [
    // 首页特定的 Rufus 按钮
    'a[href*="rufus"]',
    'a[href*="/s?k="] + a[href*="rufus"]', // 搜索栏旁边的 Rufus 链接
    '#nav-search-bar a[href*="rufus"]',
    '.nav-search-bar a[href*="rufus"]',
    'nav a[href*="rufus"]',
    // 通用 Rufus 按钮
    '[data-testid*="rufus-button"]',
    '[data-testid*="rufus"]',
    '[aria-label*="Rufus"]',
    '[aria-label*="AI assistant"]',
    '[aria-label*="Ask a question"]',
    '[aria-label*="Ask Rufus"]',
    '.rufus-trigger',
    '#rufus-trigger',
    // 通用的聊天图标
    'button[aria-label*="chat"]',
    '[data-testid="chat-trigger"]',
    // Amazon 搜索栏附近的 AI 图标
    '.nav-search-scope button[aria-label*="AI"]',
    '#nav-search-bar button[aria-label*="assistant"]',
    // 导航栏中的 Rufus 链接
    '#nav-main a:has-text("Rufus")',
    'nav a:contains("Rufus")',
    // 尝试通过文本内容查找
    'a:has-text("Rufus")',
    'button:has-text("Rufus")'
  ];
  
  for (const selector of iconSelectors) {
    try {
      // 对于包含文本的选择器，使用不同的查找方式
      let icon = null;
      if (selector.includes(':has-text') || selector.includes(':contains')) {
        // 使用文本内容查找
        const allLinks = document.querySelectorAll('a, button');
        for (const el of allLinks) {
          const text = el.textContent?.toLowerCase() || '';
          const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
          if (text.includes('rufus') || ariaLabel.includes('rufus')) {
            icon = el;
            break;
          }
        }
      } else {
        icon = document.querySelector(selector);
      }
      
      if (icon) {
        console.log('[Rufus] Found and clicking trigger:', selector, icon);
        
        // 如果是链接，检查是否会导航
        if (icon.tagName === 'A') {
          const href = icon.getAttribute('href');
          const isExternalNav = href && !href.startsWith('#') && !href.startsWith('javascript:');
          
          if (isExternalNav) {
            // 如果是外部导航，可能需要等待页面加载
            console.log('[Rufus] Link will navigate, clicking and waiting...');
            icon.click();
            // 等待页面可能的变化（可能是新页面或侧边栏打开）
            await new Promise(r => setTimeout(r, 3000));
          } else {
            // 锚点或 JS 链接，直接点击
            icon.click();
            await new Promise(r => setTimeout(r, 2000));
          }
        } else {
          // 按钮，直接点击
          icon.click();
          await new Promise(r => setTimeout(r, 2000));
        }
        
        chatInterface = detectRufusChat();
        if (chatInterface) {
          console.log('[Rufus] Chat interface opened successfully');
          return chatInterface;
        }
        
        // 如果还没找到，再等待一下（可能还在加载）
        await new Promise(r => setTimeout(r, 2000));
        chatInterface = detectRufusChat();
        if (chatInterface) {
          return chatInterface;
        }
      }
    } catch (e) {
      console.warn('[Rufus] Error with selector:', selector, e);
      // 继续尝试下一个选择器
    }
  }
  
  // 最后尝试：查找所有包含 "Rufus" 文本的链接和按钮
  console.log('[Rufus] Trying fallback: searching all elements for "Rufus" text');
  const allElements = document.querySelectorAll('a, button, [role="button"]');
  for (const el of allElements) {
    const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
    if (text.includes('rufus') && el.offsetParent !== null) { // 确保元素可见
      console.log('[Rufus] Found Rufus element by text:', el);
      try {
        el.click();
        await new Promise(r => setTimeout(r, 2000));
        chatInterface = detectRufusChat();
        if (chatInterface) {
          return chatInterface;
        }
      } catch (e) {
        console.warn('[Rufus] Error clicking element:', e);
      }
    }
  }
  
  console.log('[Rufus] Could not find or open Rufus chat');
  return null;
}

/**
 * 向 Rufus 发送问题
 */
async function sendRufusQuestion(question) {
  // 找到输入框
  const inputSelectors = [
    '[data-testid*="rufus-input"]',
    '[aria-label*="Ask Rufus"]',
    '[placeholder*="Ask"]',
    'input[type="text"][aria-label*="question"]',
    'textarea[aria-label*="question"]',
    '.rufus-input',
    '#rufus-input',
    '[data-testid="chat-input"]',
    'input[placeholder*="Ask a question"]',
    'textarea[placeholder*="Ask"]'
  ];
  
  let input = null;
  for (const selector of inputSelectors) {
    input = document.querySelector(selector);
    if (input) {
      console.log('[Rufus] Found input with selector:', selector);
      break;
    }
  }
  
  if (!input) {
    throw new Error('无法找到 Rufus 输入框');
  }
  
  // 设置问题文本
  input.focus();
  input.value = question;
  
  // 触发 input 事件
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  await new Promise(r => setTimeout(r, 300));
  
  // 找到并点击发送按钮
  const sendSelectors = [
    '[data-testid*="rufus-send"]',
    '[aria-label*="Send"]',
    '[aria-label*="Submit"]',
    'button[type="submit"]',
    '.rufus-send',
    '#rufus-send',
    '[data-testid="send-button"]',
    'button[aria-label*="send"]'
  ];
  
  let sendBtn = null;
  for (const selector of sendSelectors) {
    sendBtn = document.querySelector(selector);
    if (sendBtn) {
      console.log('[Rufus] Found send button with selector:', selector);
      break;
    }
  }
  
  // 如果找不到按钮，尝试按 Enter 键
  if (!sendBtn) {
    console.log('[Rufus] No send button found, pressing Enter');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
  } else {
    sendBtn.click();
  }
  
  console.log('[Rufus] Question sent:', question);
  return true;
}

/**
 * 等待 Rufus 回答完成（改进版：确保获取完整回答）
 */
async function waitForRufusAnswer(timeout = 120000) { // 增加到 120 秒
  console.log('[Rufus] Waiting for answer, timeout:', timeout);
  const startTime = Date.now();
  let lastAnswerLength = 0;
  let lastAnswerContent = '';
  let stableCount = 0;
  let attempts = 0;
  let consecutiveNoChangeCount = 0;
  
  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, 1500)); // 每 1.5 秒检查一次
    attempts++;
    
    const answer = extractRufusResponse();
    const answerLength = answer?.length || 0;
    const answerContent = answer?.substring(0, 500) || ''; // 取前 500 字符比较内容
    
    console.log(`[Rufus] Attempt ${attempts}: answer length = ${answerLength}, stable count = ${stableCount}`);
    
    if (answer && answerLength > 100) {
      // 检查回答长度是否变化
      if (answerLength === lastAnswerLength) {
        consecutiveNoChangeCount++;
        
        // 不仅检查长度，还要检查内容是否变化
        if (answerContent === lastAnswerContent) {
          stableCount++;
          console.log(`[Rufus] Content stable, stable count: ${stableCount}`);
          
          // 增加到 5 秒稳定性（3-4 次检查）才返回
          if (stableCount >= 4) {
            // 最后再检查一次是否有加载指示器
            const loading = document.querySelector(
              '[data-testid*="loading"], ' +
              '[class*="loading"], ' +
              '[class*="typing"], ' +
              '[aria-busy="true"], ' +
              '.spinner, ' +
              '[class*="Spinner"], ' +
              '[class*="streaming"], ' +
              '[aria-live="polite"][aria-busy="true"]'
            );
            
            if (!loading) {
              console.log('[Rufus] Answer stable and no loading indicator, returning complete answer');
              return answer;
            } else {
              console.log('[Rufus] Still loading, resetting stable count');
              stableCount = 0; // 重置稳定性计数
            }
          }
        } else {
          // 内容还在变化，重置稳定性计数
          stableCount = 0;
          lastAnswerContent = answerContent;
        }
      } else {
        // 长度变化，重置所有计数
        stableCount = 0;
        consecutiveNoChangeCount = 0;
        lastAnswerLength = answerLength;
        lastAnswerContent = answerContent;
        console.log(`[Rufus] Answer growing: ${lastAnswerLength} -> ${answerLength}`);
      }
    }
    
    // 如果已经等了超过 15 秒且有内容，检查是否完成（作为备选方案）
    if (Date.now() - startTime > 15000 && lastAnswerLength > 200 && consecutiveNoChangeCount >= 3) {
      // 检查是否有加载指示器
      const loading = document.querySelector(
        '[data-testid*="loading"], ' +
        '[class*="loading"], ' +
        '[class*="typing"], ' +
        '[aria-busy="true"], ' +
        '.spinner, ' +
        '[class*="Spinner"], ' +
        '[class*="streaming"]'
      );
      
      if (!loading) {
        console.log('[Rufus] No loading indicator found after 15s, checking if answer is complete');
        const finalAnswer = extractRufusResponse();
        if (finalAnswer && finalAnswer.length > 200) {
          // 再等待 3 秒确保没有新内容
          await new Promise(r => setTimeout(r, 3000));
          const recheckAnswer = extractRufusResponse();
          if (recheckAnswer && recheckAnswer.length === finalAnswer.length) {
            console.log('[Rufus] Answer confirmed complete after recheck');
            return recheckAnswer;
          }
        }
      }
    }
  }
  
  // 超时但仍尝试返回已有内容
  const finalAnswer = extractRufusResponse();
  console.log('[Rufus] Timeout reached, final answer length:', finalAnswer?.length || 0);
  
  if (finalAnswer && finalAnswer.length > 50) {
    console.log('[Rufus] Returning partial answer after timeout');
    return finalAnswer;
  }
  
  throw new Error('等待 Rufus 回答超时');
}

/**
 * 获取 Rufus 对话中的所有消息元素
 */
function getRufusMessages() {
  const container = findRufusChatContainer();
  if (!container) return [];
  
  // 尝试多种选择器找到消息元素
  const messageSelectors = [
    '[data-testid*="message"]',
    '[class*="chat-message"]',
    '[class*="ChatMessage"]',
    '[class*="message-content"]',
    '[class*="MessageContent"]',
    // 通用的消息容器模式
    'div[class*="response"]',
    'div[class*="answer"]'
  ];
  
  for (const selector of messageSelectors) {
    try {
      const messages = container.querySelectorAll(selector);
      if (messages.length > 0) {
        console.log(`[Rufus] Found ${messages.length} messages with selector: ${selector}`);
        return Array.from(messages);
      }
    } catch (e) {
      // 选择器无效
    }
  }
  
  // 备选：查找所有段落或较长的文本块
  const textBlocks = container.querySelectorAll('p, div > span, li');
  const validBlocks = Array.from(textBlocks).filter(el => {
    const text = el.textContent?.trim() || '';
    return text.length > 50 && !text.includes('function(') && !text.includes('typeof ');
  });
  
  console.log(`[Rufus] Found ${validBlocks.length} text blocks as messages`);
  return validBlocks;
}

/**
 * 获取当前消息数量
 */
function getRufusMessageCount() {
  return getRufusMessages().length;
}

/**
 * ========================================
 * Rufus 对话采集核心功能（基于真实 DOM 结构）
 * 
 * DOM 结构：
 * - 用户问题: generic > (generic:"Customer question" + generic:问题文本)
 * - Rufus回答: region[role="region"] > generic > (paragraph, list>listitem, strong...)
 * - 状态指示: 包含 "Rufus is currently generating" 或 "Rufus has completed"
 * ========================================
 */

/**
 * 捕获当前对话的快照
 */
function captureConversationSnapshot() {
  const container = findRufusChatContainer();
  if (!container) {
    return {
      regionCount: 0,
      timestamp: Date.now()
    };
  }
  
  // 记录当前 region 元素的数量（每个 region 是一个 Rufus 回答）
  const regions = container.querySelectorAll('[role="region"]');
  
  console.log(`[Rufus Snapshot] 当前有 ${regions.length} 个回答区域`);
  
  return {
    regionCount: regions.length,
    timestamp: Date.now()
  };
}

/**
 * 等待 Rufus 回答完成并提取（基于状态指示器）
 */
async function waitAndExtractNewAnswer(sentQuestion, beforeSnapshot, timeout = 60000) {
  console.log(`[Rufus] === 开始等待回答 ===`);
  console.log(`[Rufus] 问题: "${sentQuestion.substring(0, 60)}..."`);
  console.log(`[Rufus] 快照: ${beforeSnapshot.regionCount} 个回答区域`);
  
  const startTime = Date.now();
  
  // === 阶段1: 等待新的 region 出现（Rufus 开始回答）===
  console.log('[Rufus] 阶段1: 等待新回答区域出现...');
  let newRegion = null;
  
  for (let i = 0; i < 30; i++) { // 最多等待 30 秒
    await new Promise(r => setTimeout(r, 1000));
    
    const container = findRufusChatContainer();
    if (!container) continue;
    
    const regions = container.querySelectorAll('[role="region"]');
    
    if (regions.length > beforeSnapshot.regionCount) {
      newRegion = regions[regions.length - 1]; // 获取最新的 region
      console.log(`[Rufus] ✓ 新回答区域出现 (第 ${regions.length} 个)`);
      break;
    }
    
    if (i === 29) {
      throw new Error('Rufus 没有开始回答，请确保对话框已打开');
    }
  }
  
  // === 阶段2: 等待 "Rufus has completed" 状态 ===
  console.log('[Rufus] 阶段2: 等待回答完成...');
  
  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, 1500));
    
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    // 检查状态指示器
    if (isRufusCompleted()) {
      console.log(`[Rufus] ✓ 回答完成 (${elapsedSeconds}s)`);
      break;
    }
    
    console.log(`[Rufus] ${elapsedSeconds}s: 等待完成...`);
  }
  
  // === 阶段3: 从最新的 region 提取格式化内容 ===
  console.log('[Rufus] 阶段3: 提取格式化内容...');
  
  const container = findRufusChatContainer();
  if (!container) {
    throw new Error('找不到 Rufus 对话容器');
  }
  
  // 重新获取最新的 region
  const regions = container.querySelectorAll('[role="region"]');
  if (regions.length === 0) {
    throw new Error('没有找到回答区域');
  }
  
  const latestRegion = regions[regions.length - 1];
  const answer = extractFormattedAnswerFromRegion(latestRegion);
  
  if (!answer || answer.length < 50) {
    throw new Error('提取回答失败');
  }
  
  console.log(`[Rufus] ✓ 提取完成: ${answer.length} chars`);
  return answer;
}

/**
 * 检查 Rufus 是否已完成回答
 */
function isRufusCompleted() {
  // 查找状态指示器
  const statusTexts = [
    'Rufus has completed generating a response',
    'Rufus has completed'
  ];
  
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    const text = el.textContent || '';
    for (const status of statusTexts) {
      if (text.includes(status)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 从 region 元素中提取格式化的回答
 */
function extractFormattedAnswerFromRegion(region) {
  if (!region) return null;
  
  const result = [];
  let currentListItems = [];
  let inList = false;
  
  // 遍历 region 内的所有格式化元素
  const elements = region.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6');
  
  for (const el of elements) {
    const text = el.innerText?.trim() || '';
    if (text.length < 5) continue;
    
    // 跳过 UI 元素
    if (isUIElement(text)) continue;
    
    const tagName = el.tagName?.toLowerCase() || '';
    
    // 处理列表项
    if (tagName === 'li') {
      if (!inList) {
        inList = true;
        currentListItems = [];
      }
      const listContent = formatListItemContent(el);
      if (listContent) {
        currentListItems.push(listContent);
      }
    } else {
      // 非列表项：先保存之前的列表
      if (inList && currentListItems.length > 0) {
        result.push(currentListItems.join('\n'));
        currentListItems = [];
        inList = false;
      }
      
      // 格式化当前元素
      const formatted = formatElementContent(el);
      if (formatted) {
        result.push(formatted);
      }
    }
  }
  
  // 保存最后的列表
  if (inList && currentListItems.length > 0) {
    result.push(currentListItems.join('\n'));
  }
  
  // 去重（处理嵌套元素导致的重复）
  const deduplicated = deduplicateContent(result);
  
  return deduplicated.join('\n\n');
}

/**
 * 格式化单个元素的内容
 */
function formatElementContent(element) {
  const tagName = element.tagName?.toLowerCase() || '';
  let content = '';
  
  // 处理段落
  if (tagName === 'p') {
    content = formatParagraphContent(element);
  }
  // 处理列表项
  else if (tagName === 'li') {
    content = formatListItemContent(element);
  }
  // 处理标题
  else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
    const text = element.innerText?.trim() || '';
    content = `━━━ ${text} ━━━`;
  }
  else {
    content = element.innerText?.trim() || '';
  }
  
  return content;
}

/**
 * 格式化段落内容（保留结构）
 */
function formatParagraphContent(paragraph) {
  let result = '';
  let hasStrong = false;
  
  for (const node of paragraph.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName?.toLowerCase();
      const text = node.innerText?.trim() || '';
      
      if (tagName === 'strong' || tagName === 'b') {
        hasStrong = true;
        // 如果是段落开头的 strong，作为小标题处理
        if (result.trim() === '' || result.trim().endsWith(':')) {
          result += `【${text}】`;
        } else {
          result += text;
        }
      } else if (tagName === 'emphasis' || tagName === 'em' || tagName === 'i') {
        result += text;
      } else if (tagName === 'a') {
        // 链接：保留文本
        result += text;
      } else {
        result += text;
      }
    }
  }
  
  return result.trim();
}

/**
 * 格式化列表项内容
 */
function formatListItemContent(listItem) {
  // 检查是否有 strong 开头（标题）
  const strong = listItem.querySelector('strong, b');
  
  if (strong) {
    const strongText = strong.innerText?.trim() || '';
    // 获取 strong 之后的文本
    let restText = '';
    let foundStrong = false;
    for (const node of listItem.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && (node.tagName?.toLowerCase() === 'strong' || node.tagName?.toLowerCase() === 'b')) {
        foundStrong = true;
        continue;
      }
      if (foundStrong) {
        restText += node.textContent || '';
      }
    }
    restText = restText.trim();
    
    // 格式：【标题】内容
    if (restText) {
      return `  • 【${strongText}】${restText}`;
    } else {
      return `  • 【${strongText}】`;
    }
  } else {
    return `  • ${listItem.innerText?.trim() || ''}`;
  }
}

/**
 * 去重内容（处理嵌套导致的重复）
 */
function deduplicateContent(items) {
  const result = [];
  const seen = new Set();
  
  for (const item of items) {
    // 标准化用于比较
    const normalized = item.toLowerCase().replace(/[\*\_\•]/g, '').replace(/\s+/g, ' ').trim();
    
    // 检查是否是之前项的子集
    let isDuplicate = false;
    for (const existing of seen) {
      if (existing.includes(normalized) || normalized.includes(existing)) {
        // 保留较长的
        if (normalized.length > existing.length) {
          seen.delete(existing);
          seen.add(normalized);
          // 替换 result 中对应的项
          const idx = result.findIndex(r => 
            r.toLowerCase().replace(/[\*\_\•]/g, '').replace(/\s+/g, ' ').trim() === existing
          );
          if (idx >= 0) {
            result[idx] = item;
          }
        }
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate && normalized.length > 0) {
      seen.add(normalized);
      result.push(item);
    }
  }
  
  return result;
}

/**
 * 检查是否是 UI 元素文本
 */
function isUIElement(text) {
  const uiPatterns = [
    /^ask rufus/i,
    /^type a question/i,
    /^ask something else/i,
    /^show more/i,
    /^show less/i,
    /^rufus$/i,
    /^beta$/i,
    /^compare with/i,
    /^show similar/i,
    /^best for/i,
    /^alternatives for/i,
    /^thumbs (up|down)/i,
    /^scroll to/i
  ];
  
  for (const pattern of uiPatterns) {
    if (pattern.test(text.trim())) {
      return true;
    }
  }
  
  return false;
}

/**
 * 备用：基于快照提取新回答
 */
function extractNewAnswerAfterSnapshot(sentQuestion, beforeSnapshot) {
  const container = findRufusChatContainer();
  if (!container) return null;
  
  const regions = container.querySelectorAll('[role="region"]');
  if (regions.length > beforeSnapshot.regionCount) {
    return extractFormattedAnswerFromRegion(regions[regions.length - 1]);
  }
  
  // 回退：提取最后一个 region
  if (regions.length > 0) {
    return extractFormattedAnswerFromRegion(regions[regions.length - 1]);
  }
  
  return null;
}

/**
 * 提取最后一条消息的内容
 */
function extractLastMessage() {
  const messages = getRufusMessages();
  if (messages.length === 0) return null;
  
  const lastMessage = messages[messages.length - 1];
  const text = lastMessage.textContent?.trim() || '';
  
  // 清理文本
  return cleanRufusText(text);
}

/**
 * 简化版：提取 Rufus 的回答（使用快照方法）
 */
function extractRufusAnswerOnly(sentQuestion) {
  const container = findRufusChatContainer();
  if (!container) return null;
  
  // 获取最后一个 region（最新的回答）
  const regions = container.querySelectorAll('[role="region"]');
  if (regions.length > 0) {
    return extractFormattedAnswerFromRegion(regions[regions.length - 1]);
  }
  
  return null;
}

/**
 * [NEW] 检查内容是否与发送的问题相同
 */
function isContentSameAsQuestion(content, question) {
  if (!content || !question) return false;
  
  // 标准化文本（去除空白、转小写）
  const normalizeText = (text) => {
    return text.toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  };
  
  const normalizedContent = normalizeText(content);
  const normalizedQuestion = normalizeText(question);
  
  // 完全匹配
  if (normalizedContent === normalizedQuestion) return true;
  
  // 内容包含问题的大部分（80%以上）
  if (normalizedQuestion.length > 20) {
    const questionWords = normalizedQuestion.split(' ');
    const contentWords = normalizedContent.split(' ');
    let matchCount = 0;
    for (const word of questionWords) {
      if (contentWords.includes(word)) matchCount++;
    }
    const matchRatio = matchCount / questionWords.length;
    if (matchRatio > 0.8) {
      console.log(`[Rufus] Content matches question by ${(matchRatio * 100).toFixed(0)}%`);
      return true;
    }
  }
  
  return false;
}

/**
 * [NEW] 检测 Rufus 输入框是否可用（对话完成的信号）
 */
function isRufusInputReady() {
  // 查找 Rufus 输入框
  const inputSelectors = [
    'input[placeholder*="Ask Rufus"]',
    'textarea[placeholder*="Ask Rufus"]',
    'input[placeholder*="question"]',
    'textarea[placeholder*="question"]',
    '[data-testid*="rufus-input"]',
    '[aria-label*="Ask Rufus"]'
  ];
  
  for (const selector of inputSelectors) {
    try {
      const input = document.querySelector(selector);
      if (input && !input.disabled && input.offsetParent !== null) {
        // 检查输入框是否为空或者只有占位符
        const value = input.value || input.textContent || '';
        if (value.trim() === '' || value.includes('Ask Rufus')) {
          console.log('[Rufus] Input is ready (empty and enabled)');
          return true;
        }
      }
    } catch (e) {
      // 选择器无效
    }
  }
  
  return false;
}

/**
 * [NEW] 检测 Rufus 是否正在生成回答（流式输出中）
 */
function isRufusGenerating() {
  // 检测各种加载/流式输出指示器
  const loadingSelectors = [
    '[class*="loading"]',
    '[class*="typing"]',
    '[class*="streaming"]',
    '[class*="generating"]',
    '[aria-busy="true"]',
    '.spinner',
    '[class*="Spinner"]',
    '[class*="pulse"]',
    '[class*="animate"]',
    // Amazon 特定的加载样式
    '.a-spinner',
    '[class*="thinking"]'
  ];
  
  for (const selector of loadingSelectors) {
    try {
      const loading = document.querySelector(selector);
      if (loading && loading.offsetParent !== null) {
        // 确保这个元素在 Rufus 容器内
        const container = findRufusChatContainer();
        if (container && container.contains(loading)) {
          console.log('[Rufus] Found loading indicator:', selector);
          return true;
        }
      }
    } catch (e) {
      // 选择器无效
    }
  }
  
  return false;
}

/**
 * 等待新消息出现并提取（改进版：确保获取的是 Rufus 回答而不是问题）
 * @param {number} previousCount - 发送问题前的消息数量
 * @param {number} timeout - 超时时间（毫秒）
 * @param {string} sentQuestion - 发送的问题（用于排除）
 */
async function waitAndExtractNewMessage(previousCount, timeout = 120000, sentQuestion = '') {
  console.log(`[Rufus] Waiting for new message, previous count: ${previousCount}, question: "${sentQuestion.substring(0, 50)}..."`);
  const startTime = Date.now();
  let lastContent = '';
  let lastContentLength = 0;
  let stableCount = 0;
  let rufusStartedAnswering = false;
  
  // 最少等待 3 秒，让 Rufus 开始回答
  const MIN_WAIT_TIME = 3000;
  
  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, 1500)); // 每 1.5 秒检查一次
    
    const elapsedMs = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    
    // 提取 Rufus 的回答（不是用户问题）
    const currentContent = extractRufusAnswerOnly(sentQuestion);
    const currentContentLength = currentContent?.length || 0;
    
    console.log(`[Rufus] Check at ${elapsedSeconds}s: answer length = ${currentContentLength}, stable = ${stableCount}, rufusStarted = ${rufusStartedAnswering}`);
    
    // 检测 Rufus 是否开始回答（回答内容与问题不同，且有实质内容）
    if (currentContent && currentContentLength > 100) {
      // 确保这不是发送的问题本身
      if (!isContentSameAsQuestion(currentContent, sentQuestion)) {
        rufusStartedAnswering = true;
        console.log('[Rufus] Rufus started answering, content differs from question');
        
        // 检查内容是否稳定
        if (currentContent === lastContent && currentContentLength === lastContentLength) {
          stableCount++;
          console.log(`[Rufus] Answer stable, stable count: ${stableCount}`);
          
          // 必须满足最小等待时间
          if (elapsedMs < MIN_WAIT_TIME) {
            console.log(`[Rufus] Still within min wait time (${elapsedMs}ms < ${MIN_WAIT_TIME}ms)`);
            continue;
          }
          
          // 方法1：内容稳定 3 次（4.5秒），且 Rufus 输入框可用 → 认为完成
          if (stableCount >= 3 && isRufusInputReady()) {
            console.log('[Rufus] Answer stable and input is ready, returning');
            return currentContent;
          }
          
          // 方法2：内容稳定 4 次（6秒），且没有加载指示器 → 认为完成
          if (stableCount >= 4 && !isRufusGenerating()) {
            console.log('[Rufus] Answer stable and no generating indicator, returning');
            return currentContent;
          }
          
          // 方法3：内容稳定 6 次（9秒）→ 强制认为完成
          if (stableCount >= 6) {
            console.log('[Rufus] Answer stable for 6 checks, forcing return');
            return currentContent;
          }
        } else {
          // 内容还在变化（Rufus 还在回答），重置稳定性计数
          stableCount = 0;
          lastContent = currentContent;
          lastContentLength = currentContentLength;
          console.log(`[Rufus] Answer still growing: ${lastContentLength} chars`);
        }
      } else {
        console.log('[Rufus] Content is same as question, waiting for actual answer...');
      }
    }
    
    // 如果已经等了超过 30 秒，且有有效回答 → 降低检测阈值
    if (elapsedSeconds > 30 && rufusStartedAnswering && lastContent && lastContent.length > 200 && stableCount >= 2) {
      if (!isRufusGenerating()) {
        // 再等待 3 秒确认内容不变
        await new Promise(r => setTimeout(r, 3000));
        const recheckContent = extractRufusAnswerOnly(sentQuestion);
        if (recheckContent && recheckContent.length === lastContentLength) {
          console.log('[Rufus] Answer confirmed stable after 30s, returning');
          return recheckContent;
        }
      }
    }
  }
  
  // 超时处理：优先使用已收集到的正确回答
  console.log('[Rufus] Timeout reached, attempting final extraction...');
  
  // 1. 如果之前已经检测到有效回答，返回它
  if (lastContent && lastContent.length > 100 && rufusStartedAnswering) {
    console.log('[Rufus] Timeout but returning last known answer, length:', lastContent.length);
    return lastContent;
  }
  
  // 2. 最后一次尝试正确提取（排除问题）
  const finalAnswer = extractRufusAnswerOnly(sentQuestion);
  if (finalAnswer && finalAnswer.length > 100) {
    console.log('[Rufus] Timeout but got final answer, length:', finalAnswer.length);
    return finalAnswer;
  }
  
  // 3. 备选方法
  const anyContent = extractRufusResponse();
  if (anyContent && anyContent.length > 50) {
    console.log('[Rufus] Timeout, using fallback extraction, length:', anyContent.length);
    return anyContent;
  }
  
  throw new Error('等待 Rufus 回答超时，且未检测到有效内容');
}

/**
 * 从 DOM 中提取 Rufus 的回答
 */
function extractRufusResponse() {
  console.log('[Rufus] Attempting to extract response...');

  // 首先尝试找到 Rufus 聊天容器
  const rufusContainer = findRufusChatContainer();

  if (rufusContainer) {
    console.log('[Rufus] Found Rufus container');
    return extractFromRufusContainer(rufusContainer);
  }

  // 如果没找到容器，尝试通过关键词在小范围内查找
  return extractByKeywordSearch();
}

/**
 * 查找 Rufus 聊天容器
 */
function findRufusChatContainer() {
  // Rufus 特定的容器选择器
  const containerSelectors = [
    // 侧边栏对话框
    '[class*="sw-chat"]',
    '[id*="sw-chat"]',
    '[class*="rufus-chat"]',
    '[class*="RufusChat"]',
    // 对话窗口
    '[class*="ConversationalShopping"]',
    '[class*="conversational-shopping"]',
    // 通用 AI 助手容器
    '[role="dialog"][aria-label*="Rufus"]',
    '[role="dialog"][aria-label*="assistant"]',
    // Amazon 弹出层
    '.a-popover-content [class*="chat"]'
  ];
  
  for (const selector of containerSelectors) {
    try {
      const container = document.querySelector(selector);
      if (container && container.textContent && container.textContent.length > 100) {
        return container;
      }
    } catch (e) {
      // 选择器无效，跳过
    }
  }
  
  // 备选：查找包含 "Rufus" 或 "Ask Rufus" 的容器
  const allContainers = document.querySelectorAll('div[class], aside, section');
  for (const container of allContainers) {
    const firstText = container.textContent?.substring(0, 200) || '';
    if ((firstText.includes('Rufus') || firstText.includes('Ask Rufus')) &&
        container.querySelector('input, textarea')) {
      // 确保这是一个合理大小的容器（不是整个页面）
      const rect = container.getBoundingClientRect();
      if (rect.width > 200 && rect.width < 800 && rect.height > 200) {
        return container;
      }
    }
  }
  
  return null;
}

/**
 * 从 Rufus 容器中提取回答
 */
function extractFromRufusContainer(container) {
  // 查找回答区域 - 通常是用户问题之后的内容
  const allTextElements = container.querySelectorAll('p, div, span, li');
  let answerParts = [];
  let foundAnswerStart = false;
  
  for (const element of allTextElements) {
    const text = element.textContent?.trim() || '';
    
    // 跳过太短的文本
    if (text.length < 10) continue;
    
    // 跳过输入框和按钮文本
    if (element.closest('input, button, textarea')) continue;
    
    // 检测回答开始的标志
    if (text.includes('Based on') || 
        text.includes('Top 5') || 
        text.includes('Top five') ||
        text.includes('customers mention') ||
        text.includes('reviewers mention') ||
        text.includes('wish it had')) {
      foundAnswerStart = true;
    }
    
    // 收集回答内容
    if (foundAnswerStart) {
      // 检查是否是有效的回答内容（不是 JavaScript 或元数据）
      if (!text.includes('function(') && 
          !text.includes('typeof ') && 
          !text.includes('window.') &&
          !text.includes('document.') &&
          text.length < 2000) {
        answerParts.push(text);
      }
    }
    
    // 检测回答结束
    if (foundAnswerStart && answerParts.length > 5 && 
        (text.includes('Ask Rufus') || text.includes('Type a question'))) {
      break;
    }
  }
  
  if (answerParts.length > 0) {
    // 合并回答，去重
    const uniqueParts = [...new Set(answerParts)];
    const answer = uniqueParts.join('\n\n');
    
    // 限制长度（最多 10000 字符）
    const finalAnswer = answer.length > 10000 ? answer.substring(0, 10000) + '...' : answer;
    console.log('[Rufus] Extracted answer from container, length:', finalAnswer.length);
    return finalAnswer;
  }
  
  // 备选：直接取容器内的文本，但要过滤
  const containerText = container.innerText || container.textContent || '';
  const cleanedText = cleanRufusText(containerText);
  
  if (cleanedText.length > 100 && cleanedText.length < 15000) {
    console.log('[Rufus] Using cleaned container text, length:', cleanedText.length);
    return cleanedText;
  }
  
  return null;
}

/**
 * 通过关键词搜索提取回答
 */
function extractByKeywordSearch() {
  // 查找包含 Rufus 回答特征的元素
  const allElements = document.querySelectorAll('div, p, section');
  
  for (const element of allElements) {
    // 获取元素的直接文本（不包含子元素的重复文本）
    const text = element.innerText?.trim() || '';
    
    // 检查长度合理性（100-10000字符）
    if (text.length < 100 || text.length > 10000) continue;
    
    // 检查是否包含 Rufus 回答的特征
    const hasAnswerMarkers = (
      (text.includes('Based on') && text.includes('review')) ||
      (text.includes('Top') && (text.includes('wish') || text.includes('feature'))) ||
      (text.includes('1.') && text.includes('2.') && text.includes('3.'))
    );
    
    // 确保不是 JavaScript 代码
    const isNotCode = (
      !text.includes('function(') &&
      !text.includes('typeof ') &&
      !text.includes('window.') &&
      !text.includes('AUI_') &&
      !text.includes('csa(')
    );
    
    if (hasAnswerMarkers && isNotCode) {
      // 验证这个元素的尺寸合理（是可见的 UI 元素）
      const rect = element.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 50) {
        console.log('[Rufus] Found answer by keyword search, length:', text.length);
        return cleanRufusText(text);
      }
    }
  }
  
  console.log('[Rufus] No response found');
  return null;
}

/**
 * 清理 Rufus 回答文本
 */
function cleanRufusText(text) {
  if (!text) return '';
  
  // 移除 JavaScript 代码片段
  let cleaned = text
    .replace(/\{[\s\S]*?typeof[\s\S]*?\}/g, '')
    .replace(/function\s*\([^)]*\)\s*\{[^}]*\}/g, '')
    .replace(/csa\([^)]*\);?/g, '')
    .replace(/AUI_\w+/g, '')
    .replace(/uex\([^)]*\)/g, '')
    .replace(/window\.\w+\s*=/g, '')
    .trim();
  
  // 移除多余的空白行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // 限制长度
  if (cleaned.length > 10000) {
    cleaned = cleaned.substring(0, 10000) + '...';
  }
  
  return cleaned;
}

/**
 * 上传单条对话数据
 */
function uploadRufusConversation(data) {
  return new Promise((resolve, reject) => {
    // 设置超时时间为 30 秒
    const timeout = setTimeout(() => {
      reject(new Error('上传超时：30秒内未收到响应'));
    }, 30000);
    
    chrome.runtime.sendMessage({
      type: 'UPLOAD_RUFUS_CONVERSATION',
      data: data
    }, (response) => {
      clearTimeout(timeout);
      
      // 检查 chrome.runtime.lastError（扩展上下文可能已失效）
      if (chrome.runtime.lastError) {
        reject(new Error(`上传失败: ${chrome.runtime.lastError.message || '扩展上下文已失效'}`));
        return;
      }
      
      if (response?.success) {
        resolve(response);
      } else {
        reject(new Error(response?.error || '上传失败'));
      }
    });
  });
}

/**
 * 批量问答流程 - 按主题执行多个问题
 */
async function runTopicQuestions(topicKey) {
  if (isRufusConversing) {
    console.log('[Rufus] Already conversing, skipping');
    return;
  }
  
  const topic = RUFUS_QUESTION_TOPICS[topicKey];
  if (!topic) {
    console.error('[Rufus] Unknown topic:', topicKey);
    updateRufusStatus('❌ 未知的主题类型');
    return;
  }
  
  isRufusConversing = true;
  
  // [NEW] 收集页面信息
  const pageInfo = collectPageInfo();
  const asin = pageInfo.asin || detectASIN();
  const marketplace = pageInfo.marketplace || detectMarketplace();
  const sessionId = getOrCreateSessionId();
  
  // [NEW] 获取关键词（用于搜索页动态生成问题）
  const keyword = pageInfo.keyword || extractSearchKeyword();
  
  const results = [];
  
  try {
    updateRufusStatus(`开始 ${topic.name} 分析...`);
    updateRufusProgress(0, topic.questions.length);
    
    // 确保 Rufus 已打开
    updateRufusStatus('🔍 正在查找并打开 Rufus...');
    const chatInterface = await openRufusChat();
    if (!chatInterface) {
      // 在首页上，提供更友好的提示
      const pageInfo = collectPageInfo();
      if (pageInfo.page_type === 'homepage') {
        throw new Error('无法自动打开 Rufus。请手动点击页面顶部导航栏中的 "Rufus" 链接，然后再点击此按钮。');
      } else {
        throw new Error('请先手动打开 Rufus 对话框，然后再点击按钮');
      }
    }
    updateRufusStatus('✅ Rufus 已打开');
    
    await new Promise(r => setTimeout(r, 1000));
    
    // 逐个问题执行
    for (let i = 0; i < topic.questions.length; i++) {
      let question = topic.questions[i];
      
      // [NEW] 在搜索页，根据关键词动态调整问题
      if (pageInfo.page_type === 'keyword_search' && keyword) {
        question = adaptQuestionForKeyword(question, keyword, topicKey);
        console.log(`[Rufus] Adapted question for keyword "${keyword}":`, question);
      }
      const questionNum = i + 1;
      
      updateRufusStatus(`正在提问 ${questionNum}/${topic.questions.length}...`);
      updateRufusProgress(i, topic.questions.length);
      
      try {
        // 1. 记录发送前的对话快照
        const beforeSnapshot = captureConversationSnapshot();
        console.log(`[Rufus] Question ${questionNum}: snapshot length = ${beforeSnapshot.textLength}`);
        
        // 2. 发送问题
        await sendRufusQuestion(question);
        
        // 3. 等待并提取新回答（传入问题和快照）
        updateRufusStatus(`等待回答 ${questionNum}/${topic.questions.length}...`);
        let answer;
        try {
          answer = await waitAndExtractNewAnswer(question, beforeSnapshot, 60000);
        } catch (waitErr) {
          console.warn(`[Rufus] Question ${questionNum} wait error:`, waitErr.message);
          // 即使超时，也尝试提取新增内容
          answer = extractNewAnswerAfterSnapshot(question, beforeSnapshot);
          if (!answer || answer.length < 50) {
            answer = null;
          }
        }
        
        if (!answer || answer.length < 50) {
          console.warn(`[Rufus] Question ${questionNum} got empty answer`);
          results.push({ question, answer: null, success: false, error: '未获取到回答' });
          continue;
        }
        
        console.log(`[Rufus] Question ${questionNum} answer length: ${answer.length}`);
        
        // 4. 立即上传（添加错误处理和重试机制）
        updateRufusStatus(`保存回答 ${questionNum}/${topic.questions.length}...`);
        
        // [UPDATED] 包含新字段
        const conversationData = {
          asin: asin,
          marketplace: marketplace,
          question: question,
          answer: answer,
          question_type: topicKey,
          question_index: i,
          conversation_id: `rufus-${topicKey}-${i}-${Date.now()}`,
          // [NEW] 新字段
          page_type: pageInfo.page_type,
          keyword: pageInfo.keyword || null,
          product_title: pageInfo.product_title || null,
          bullet_points: pageInfo.bullet_points || null,
          product_image: pageInfo.product_image || null,
          session_id: sessionId,
        };
        
        // 尝试上传，最多重试 3 次
        let uploadSuccess = false;
        let uploadError = null;
        for (let retry = 0; retry < 3; retry++) {
          try {
            await uploadRufusConversation(conversationData);
            uploadSuccess = true;
            console.log(`[Rufus] Question ${questionNum} uploaded successfully (attempt ${retry + 1})`);
            break;
          } catch (uploadErr) {
            uploadError = uploadErr;
            console.warn(`[Rufus] Question ${questionNum} upload failed (attempt ${retry + 1}):`, uploadErr.message);
            if (retry < 2) {
              // 等待 2 秒后重试
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }
        
        if (uploadSuccess) {
          results.push({ question, answer, success: true });
        } else {
          console.error(`[Rufus] Question ${questionNum} upload failed after 3 attempts:`, uploadError);
          results.push({ question, answer, success: false, error: `保存失败: ${uploadError?.message || '未知错误'}` });
          updateRufusStatus(`⚠️ 问题 ${questionNum} 保存失败，但回答已获取`);
        }
        
        // 5. 等待间隔
        if (i < topic.questions.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
        
      } catch (questionError) {
        console.error(`[Rufus] Question ${questionNum} failed:`, questionError);
        results.push({ question, answer: null, success: false, error: questionError.message });
      }
    }
    
    // 完成
    updateRufusProgress(topic.questions.length, topic.questions.length);
    const successCount = results.filter(r => r.success).length;
    updateRufusStatus(`✅ 完成! ${successCount}/${topic.questions.length} 条数据已保存`);
    
    // 显示结果摘要
    showRufusResults(results);
    
  } catch (error) {
    console.error('[Rufus] Topic questions failed:', error);
    updateRufusStatus('❌ ' + error.message);
  } finally {
    isRufusConversing = false;
  }
  
  return results;
}

/**
 * 更新进度条
 */
function updateRufusProgress(current, total) {
  const progressEl = document.getElementById('voc-rufus-progress');
  const progressFillEl = document.getElementById('voc-rufus-progress-fill');
  const progressTextEl = document.getElementById('voc-rufus-progress-text');
  
  if (progressEl) {
    progressEl.style.display = total > 0 ? 'block' : 'none';
  }
  if (progressFillEl) {
    const percent = total > 0 ? (current / total) * 100 : 0;
    progressFillEl.style.width = `${percent}%`;
  }
  if (progressTextEl) {
    progressTextEl.textContent = `${current}/${total}`;
  }
}

/**
 * [NEW] 运行 DIY 自定义问题
 * @param {string} question 用户输入的问题
 */
async function runDIYQuestion(question) {
  if (isRufusConversing) {
    console.log('[Rufus] Already conversing, skipping');
    updateRufusStatus('⏳ 请等待当前对话完成');
    return;
  }
  
  isRufusConversing = true;
  
  // 收集页面信息
  const pageInfo = collectPageInfo();
  const asin = pageInfo.asin || detectASIN();
  const marketplace = pageInfo.marketplace || detectMarketplace();
  const sessionId = getOrCreateSessionId();
  
  try {
    updateRufusStatus('🔄 发送问题中...');
    
    // 确保 Rufus 已打开
    updateRufusStatus('🔍 正在查找并打开 Rufus...');
    const chatInterface = await openRufusChat();
    if (!chatInterface) {
      // 在首页上，提供更友好的提示
      const pageInfo = collectPageInfo();
      if (pageInfo.page_type === 'homepage') {
        throw new Error('无法自动打开 Rufus。请手动点击页面顶部导航栏中的 "Rufus" 链接，然后再发送问题。');
      } else {
        throw new Error('请先手动打开 Rufus 对话框，然后再发送问题');
      }
    }
    updateRufusStatus('✅ Rufus 已打开');
    
    await new Promise(r => setTimeout(r, 500));
    
    // 记录发送前的对话快照
    const beforeSnapshot = captureConversationSnapshot();
    console.log(`[Rufus DIY] Snapshot length: ${beforeSnapshot.textLength}`);
    
    // 发送问题
    await sendRufusQuestion(question);
    
    // 等待并提取新回答（基于快照比较）
    updateRufusStatus('⏳ 等待 Rufus 回答...');
    let answer;
    try {
      answer = await waitAndExtractNewAnswer(question, beforeSnapshot, 60000);
    } catch (waitError) {
      console.warn('[Rufus DIY] Wait error, trying to extract new answer:', waitError);
      // 即使出错，也尝试提取快照之后的新内容
      answer = extractNewAnswerAfterSnapshot(question, beforeSnapshot);
      if (!answer || answer.length < 10) {
        throw new Error(`等待失败: ${waitError.message || '未检测到回答'}`);
      }
      console.log(`[Rufus DIY] Extracted new answer after error, length: ${answer.length}`);
    }
    
    // 验证回答有效性
    if (!answer || answer.length < 10) {
      throw new Error('未获取到 Rufus 的回答，请确保 Rufus 已回答问题');
    }
    
    console.log(`[Rufus DIY] Answer extracted successfully, length: ${answer.length}`);
    
    // 上传对话（添加错误处理和重试机制）
    updateRufusStatus('💾 保存回答...');
    
    const conversationData = {
      asin: asin,
      marketplace: marketplace,
      question: question,
      answer: answer,
      question_type: 'diy',  // 标记为 DIY 问题
      question_index: 0,
      conversation_id: `rufus-diy-${Date.now()}`,
      // 新字段
      page_type: pageInfo.page_type,
      keyword: pageInfo.keyword || null,
      product_title: pageInfo.product_title || null,
      bullet_points: pageInfo.bullet_points || null,
      product_image: pageInfo.product_image || null,
      session_id: sessionId,
    };
    
    // 尝试上传，最多重试 3 次
    let uploadSuccess = false;
    let uploadError = null;
    for (let retry = 0; retry < 3; retry++) {
      try {
        await uploadRufusConversation(conversationData);
        uploadSuccess = true;
        console.log(`[Rufus DIY] Uploaded successfully (attempt ${retry + 1})`);
        break;
      } catch (uploadErr) {
        uploadError = uploadErr;
        console.warn(`[Rufus DIY] Upload failed (attempt ${retry + 1}):`, uploadErr.message);
        if (retry < 2) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
    
    if (!uploadSuccess) {
      throw new Error(`保存失败: ${uploadError?.message || '未知错误'}`);
    }
    
    // 显示成功
    updateRufusStatus('✅ 回答已保存');
    showRufusResult(answer);
    
    console.log('[Rufus DIY] Question completed successfully');
    
  } catch (error) {
    console.error('[Rufus DIY] Error:', error);
    updateRufusStatus('❌ ' + error.message);
  } finally {
    isRufusConversing = false;
  }
}

/**
 * 显示批量结果
 */
function showRufusResults(results) {
  const resultEl = document.getElementById('voc-rufus-result');
  if (!resultEl) return;
  
  const successResults = results.filter(r => r.success);
  if (successResults.length === 0) {
    resultEl.innerHTML = '<div style="color: #ef4444;">未获取到有效回答</div>';
    resultEl.style.display = 'block';
    return;
  }
  
  // 显示成功的回答摘要
  const summaryHtml = successResults.map((r, i) => {
    const preview = r.answer.substring(0, 150) + (r.answer.length > 150 ? '...' : '');
    return `<div style="margin-bottom: 8px; padding: 6px; background: #f0fdf4; border-radius: 4px; font-size: 11px;">
      <strong>Q${i + 1}:</strong> ${preview}
    </div>`;
  }).join('');
  
  resultEl.innerHTML = summaryHtml;
  resultEl.style.display = 'block';
}

/**
 * 更新 Rufus 状态显示
 */
function updateRufusStatus(message) {
  const statusEl = document.getElementById('voc-rufus-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
  console.log('[Rufus Status]', message);
}

/**
 * 显示 Rufus 单条结果
 */
function showRufusResult(answer) {
  const resultEl = document.getElementById('voc-rufus-result');
  if (resultEl) {
    const preview = answer.length > 300 ? answer.substring(0, 300) + '...' : answer;
    resultEl.textContent = preview;
    resultEl.style.display = 'block';
  }
}

/**
 * Chrome Message Listener
 * [UPDATED] Added handler for 'GET_PAGE_INFO' to support Popup
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 1. 处理 Popup 获取页面信息的请求 (修复 ASIN 不显示的问题)
  if (msg.type === 'GET_PAGE_INFO') {
    const asin = detectASIN(); // 使用增强版的 detectASIN
    const info = getProductInfo(); // 获取标题等信息
    
    sendResponse({
      asin: asin,
      title: info.title,
      success: !!asin
    });
    return true; // 保持消息通道开启 (虽然这里是同步的，但好习惯)
  }

  // 2. 处理打开采集面板的请求（支持所有页面类型）
  else if (msg.type === 'OPEN_OVERLAY') {
    const pageType = detectPageType();
    const pageInfo = collectPageInfo();
    const asin = detectASIN();
    const info = getProductInfo();
    
    showOverlay({ 
      status: 'ready', 
      asin: asin, 
      title: info.title,
      pageType: pageType,
      pageInfo: pageInfo
    });
    sendResponse({ success: true });
    return true;
  }
  
  // 2.5 [NEW] 处理打开产品选择器的请求（搜索结果页）
  else if (msg.type === 'OPEN_PRODUCT_SELECTOR') {
    if (isSearchResultsPage()) {
      showProductSelector();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: '当前页面不是搜索结果页' });
    }
    return true;
  }
  
  // 2.6 [NEW] 获取页面类型信息
  else if (msg.type === 'GET_PAGE_TYPE') {
    const isSearch = isSearchResultsPage();
    const asin = detectASIN();
    sendResponse({
      isSearchResultsPage: isSearch,
      isProductPage: !!asin,
      asin: asin,
      productCount: isSearch ? document.querySelectorAll('[data-component-type="s-search-result"]').length : 0
    });
    return true;
  }

  // 3. 处理后台传来的采集进度
  else if (msg.type === 'COLLECTION_PROGRESS') {
    // [FIXED] 如果后台传来了具体的 totalReviews，就用后台的
    // 如果没传，就保持当前的 g_displayCount 不变（避免数字消失）
    if (typeof msg.totalReviews === 'number') {
      // 只增不减，确保数字不会倒退
      if (msg.totalReviews > g_displayCount) {
        g_displayCount = msg.totalReviews;
      }
    }
    
    // 使用后台计算好的百分比（如果提供了），否则自己计算
    const progress = msg.progress !== undefined ? msg.progress : 
      Math.min(Math.round((msg.page / msg.pagesPerStar) * 20 + (msg.star - 1) * 20), 99);
    
    updateOverlay({
      status: 'collecting',
      message: msg.message || `正在采集 ${msg.star} 星评论...`,
      progress: progress,
      reviewCount: g_displayCount // 🔥 始终使用最新的已知总数
    });
  } 

  // 4. 处理采集完成
  else if (msg.type === 'COLLECTION_COMPLETE') {
    const asin = detectASIN();
    
    // 🔥 强制更新为最终结果
    if (msg.reviewCount && typeof msg.reviewCount === 'number') {
      g_displayCount = msg.reviewCount;
    }

    showOverlay({
      status: msg.success ? 'complete' : 'error',
      message: msg.success ? `采集完成! 共 ${g_displayCount} 条` : `失败: ${msg.error}`,
      reviewCount: g_displayCount, // 确保完成态也传这个数
      // [FIXED] 跳转到"我的洞察"页面，而不是产品详情页
      dashboardUrl: `${CONFIG.DASHBOARD_URL}/home/my-projects`
    });
    
    // 注意：不立即重置 g_displayCount，保留显示直到用户关闭面板或开始新的采集
  }
});

// ============================================================================
// [NEW] 浮动图标按钮 - 自动显示在搜索结果页和产品详情页
// ============================================================================

let floatingButton = null;

/**
 * [NEW] 创建浮动图标按钮
 */
function createFloatingButton() {
  if (floatingButton) return; // 已存在则不重复创建
  
  // 检查页面类型
  const pageType = detectPageType();
  const isSearch = isSearchResultsPage();
  const isProduct = !!detectASIN();
  const isHomepage = pageType === 'homepage';
  
  // 在所有 Amazon 页面都显示（首页、搜索页、产品页）
  if (!isSearch && !isProduct && !isHomepage) return;
  
  floatingButton = document.createElement('div');
  floatingButton.id = 'voc-floating-button';
  floatingButton.className = 'voc-floating-btn';
  
  // 设置页面类型
  if (isHomepage) {
    floatingButton.setAttribute('data-page-type', 'homepage');
  } else if (isSearch) {
    floatingButton.setAttribute('data-page-type', 'search');
  } else {
    floatingButton.setAttribute('data-page-type', 'product');
  }
  
  // 图标 SVG（与插件 logo 一致）
  let tooltipText = '打开采集面板';
  if (isHomepage) {
    tooltipText = '打开 Rufus 对话';
  } else if (isSearch) {
    tooltipText = '打开 Rufus 对话（左键）或选择产品（右键）';
  }
  
  floatingButton.innerHTML = `
    <div class="voc-floating-icon">
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="35" fill="#FEF3C7"/>
        <circle cx="50" cy="50" r="25" fill="#93C5FD"/>
        <circle cx="50" cy="50" r="15" fill="#1E40AF"/>
        <circle cx="47" cy="45" r="5" fill="#FFFFFF"/>
      </svg>
    </div>
    <div class="voc-floating-tooltip">
      ${tooltipText}
    </div>
  `;
  
  // 绑定点击事件
  floatingButton.addEventListener('click', (e) => {
    e.stopPropagation();
    handleFloatingButtonClick(e);
  });
  
  // 绑定右键事件（搜索页：打开产品选择器；首页：打开 Rufus 面板）
  floatingButton.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSearch) {
      // 搜索页右键：打开产品选择器
      console.log('[VOC-Master] Right-click on search page - opening product selector');
      showProductSelector();
    } else if (isHomepage) {
      // 首页右键：打开 Rufus 面板
      console.log('[VOC-Master] Right-click on homepage - opening Rufus panel');
      const pageInfo = collectPageInfo();
      showOverlay({ 
        status: 'ready',
        pageType: 'homepage',
        pageInfo: pageInfo
      });
    }
    return false;
  });
  
  // 添加到页面
  document.body.appendChild(floatingButton);
  
  // 添加样式（如果还没有）
  injectFloatingButtonStyles();
  
  console.log('[VOC-Master] Floating button created for', isHomepage ? 'homepage' : (isSearch ? 'search page' : 'product page'));
}

/**
 * [NEW] 处理浮动按钮点击
 */
function handleFloatingButtonClick(e) {
  const pageType = floatingButton?.getAttribute('data-page-type');
  
  if (pageType === 'homepage') {
    // 首页：打开 Rufus 面板
    console.log('[VOC-Master] Opening Rufus panel from homepage');
    const pageInfo = collectPageInfo();
    showOverlay({ 
      status: 'ready',
      pageType: 'homepage',
      pageInfo: pageInfo
    });
  } else if (pageType === 'search') {
    // 搜索结果页：打开 overlay 并显示默认 Tab（选择产品分析）
    console.log('[VOC-Master] Opening overlay from search page');
    const pageInfo = collectPageInfo();
    showOverlay({ 
      status: 'ready',
      pageType: 'keyword_search',
      pageInfo: pageInfo,
      activeTab: 'selector' // 默认显示"选择产品分析"Tab
    });
  } else if (pageType === 'product') {
    // 产品详情页：打开采集面板（包含 Rufus）
    console.log('[VOC-Master] Opening collection panel from product page');
    const asin = detectASIN();
    const info = getProductInfo();
    const pageInfo = collectPageInfo();
    showOverlay({ 
      status: 'ready', 
      asin: asin, 
      title: info.title,
      pageType: 'product_detail',
      pageInfo: pageInfo
    });
  }
  
  // 阻止默认右键菜单（仅在右键时）
  if (e.button === 2) {
    e.preventDefault();
  }
}

/**
 * [NEW] 注入浮动按钮样式
 */
function injectFloatingButtonStyles() {
  const styleId = 'voc-floating-button-styles';
  if (document.getElementById(styleId)) return; // 已存在
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #voc-floating-button {
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #f43f5e, #ec4899);
      border-radius: 50%;
      box-shadow: 0 4px 16px rgba(244, 63, 94, 0.4);
      cursor: pointer;
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: voc-float-in 0.5s ease-out;
    }
    
    #voc-floating-button:hover {
      transform: scale(1.1) translateY(-4px);
      box-shadow: 0 8px 24px rgba(244, 63, 94, 0.5);
    }
    
    #voc-floating-button:active {
      transform: scale(0.95);
    }
    
    @keyframes voc-float-in {
      from {
        opacity: 0;
        transform: scale(0.5) translateY(20px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    
    .voc-floating-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .voc-floating-icon svg {
      width: 100%;
      height: 100%;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    }
    
    .voc-floating-tooltip {
      position: absolute;
      right: 70px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(15, 23, 42, 0.95);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }
    
    .voc-floating-tooltip::after {
      content: '';
      position: absolute;
      right: -6px;
      top: 50%;
      transform: translateY(-50%);
      border: 6px solid transparent;
      border-left-color: rgba(15, 23, 42, 0.95);
    }
    
    #voc-floating-button:hover .voc-floating-tooltip {
      opacity: 1;
    }
    
    /* 响应式：小屏幕时调整位置 */
    @media (max-width: 768px) {
      #voc-floating-button {
        bottom: 20px;
        right: 20px;
        width: 48px;
        height: 48px;
      }
      
      .voc-floating-icon {
        width: 28px;
        height: 28px;
      }
      
      .voc-floating-tooltip {
        right: 60px;
        font-size: 12px;
        padding: 6px 10px;
      }
    }
  `;
  
  document.head.appendChild(style);
}

/**
 * [NEW] 移除浮动按钮
 */
function removeFloatingButton() {
  if (floatingButton) {
    floatingButton.remove();
    floatingButton = null;
  }
}

/**
 * [NEW] 初始化浮动按钮（页面加载完成后）
 */
function initFloatingButton() {
  // 创建按钮的函数
  const tryCreateButton = () => {
    // 检查是否在目标页面（包括首页）
    const pageType = detectPageType();
    const isSearch = isSearchResultsPage();
    const isProduct = !!detectASIN();
    const isHomepage = pageType === 'homepage';
    
    console.log('[VOC-Master] Checking page type:', { pageType, isSearch, isProduct, isHomepage });
    
    // 在所有 Amazon 页面都显示按钮
    if (isSearch || isProduct || isHomepage) {
      if (!floatingButton) {
        console.log('[VOC-Master] Creating floating button...');
        createFloatingButton();
      } else {
        // 如果按钮已存在但页面类型变了，重新创建
        const currentType = floatingButton.getAttribute('data-page-type');
        const expectedType = isHomepage ? 'homepage' : (isSearch ? 'search' : 'product');
        if (currentType !== expectedType) {
          console.log('[VOC-Master] Page type changed, recreating button:', { currentType, expectedType });
          removeFloatingButton();
          createFloatingButton();
        }
      }
    } else {
      // 不在目标页面，移除按钮
      console.log('[VOC-Master] Not on target page, removing button');
      removeFloatingButton();
    }
  };
  
  // 等待页面完全加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tryCreateButton, 800); // 延迟确保页面渲染完成
    });
  } else {
    setTimeout(tryCreateButton, 800);
  }
  
  // 监听页面变化（SPA 路由变化和动态内容加载）
  let lastUrl = location.href;
  let checkTimer = null;
  
  const checkAndUpdate = () => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // URL 变化，重新检查并创建/移除按钮
      removeFloatingButton();
      setTimeout(tryCreateButton, 1000);
    } else {
      // URL 没变，但内容可能动态加载了，检查是否需要创建按钮
      if (!floatingButton) {
        tryCreateButton();
      }
    }
  };
  
  // 使用防抖，避免频繁检查
  const debouncedCheck = () => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(checkAndUpdate, 300);
  };
  
  // 监听 DOM 变化
  new MutationObserver(debouncedCheck).observe(document.body, { 
    subtree: true, 
    childList: true,
    attributes: false
  });
  
  // 监听 URL 变化（pushState/replaceState）
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    setTimeout(checkAndUpdate, 300);
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    setTimeout(checkAndUpdate, 300);
  };
  
  window.addEventListener('popstate', () => {
    setTimeout(checkAndUpdate, 300);
  });
}

// 初始化浮动按钮
initFloatingButton();

})(); // IIFE 结束
