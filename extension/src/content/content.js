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
  
  // [NEW] 隐藏浮动按钮
  if (floatingButton) {
    floatingButton.style.display = 'none';
  }
}

/**
 * [NEW] 隐藏产品选择器
 */
function hideProductSelector() {
  if (productSelector) {
    productSelector.classList.remove('voc-visible');
  }
  // [NEW] 重新显示浮动按钮
  if (floatingButton) {
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
        <button class="voc-close" id="voc-selector-close-btn" title="关闭">×</button>
      </div>
      
      <div class="voc-selector-content">
        <div class="voc-selector-header">
          <div class="voc-selector-info">
            <span id="voc-selector-count">已选择 0 个产品</span>
            <span class="voc-selector-hint">（对比分析最多5个，市场细分最多10个）</span>
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
          <div class="voc-action-divider"></div>
          <div class="voc-action-row">
            <button class="voc-btn voc-btn-primary" id="voc-batch-insight-btn" disabled>
              📊 批量洞察分析
            </button>
            <span class="voc-action-hint">对每个产品单独分析</span>
          </div>
          <div class="voc-action-row">
            <button class="voc-btn voc-btn-secondary" id="voc-comparison-btn" disabled>
              ⚖️ 对比分析 (2-5个)
            </button>
            <span class="voc-action-hint">对选中产品进行对比</span>
          </div>
          <div class="voc-action-row">
            <button class="voc-btn voc-btn-secondary" id="voc-market-insight-btn" disabled>
              🎯 市场细分 (2-10个)
            </button>
            <span class="voc-action-hint">多产品市场洞察分析</span>
          </div>
        </div>
        
        <div class="voc-selector-status" id="voc-selector-status"></div>
      </div>
    </div>
  `;

  document.body.appendChild(productSelector);

  // 绑定事件
  document.getElementById('voc-selector-close-btn').addEventListener('click', hideProductSelector);
  document.getElementById('voc-select-all-btn').addEventListener('click', handleSelectAll);
  document.getElementById('voc-deselect-all-btn').addEventListener('click', handleDeselectAll);
  document.getElementById('voc-batch-insight-btn').addEventListener('click', handleBatchInsight);
  document.getElementById('voc-comparison-btn').addEventListener('click', handleComparison);
  document.getElementById('voc-market-insight-btn').addEventListener('click', handleMarketInsight);
  document.getElementById('voc-load-more-btn').addEventListener('click', handleLoadMore);
  document.getElementById('voc-save-library-btn').addEventListener('click', handleSaveToLibrary);
}

/**
 * [NEW] 更新产品选择器列表
 * @param {Array} products - 产品列表
 * @param {boolean} append - 是否追加模式（加载更多时使用）
 */
function updateProductSelector(products, append = false) {
  const listEl = document.getElementById('voc-product-list');
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
  const loadMoreBtn = document.getElementById('voc-load-more-btn');
  const pageInfo = document.getElementById('voc-page-info');
  const loadMoreSection = document.getElementById('voc-load-more-section');
  
  if (!loadMoreBtn || !pageInfo || !loadMoreSection) return;
  
  if (!hasMorePages) {
    loadMoreSection.style.display = 'none';
    return;
  }
  
  loadMoreSection.style.display = 'block';
  
  if (isLoadingMore) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.querySelector('.voc-load-more-text').textContent = '加载中...';
    loadMoreBtn.querySelector('.voc-load-more-icon').textContent = '⏳';
  } else {
    loadMoreBtn.disabled = false;
    loadMoreBtn.querySelector('.voc-load-more-text').textContent = '加载下一页';
    loadMoreBtn.querySelector('.voc-load-more-icon').textContent = '📄';
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
 * [NEW] 更新选择计数和按钮状态
 */
function updateSelectionCount() {
  const count = selectedProducts.size;
  const countEl = document.getElementById('voc-selector-count');
  if (countEl) {
    countEl.textContent = `已选择 ${count} 个产品`;
  }
  
  // 更新按钮状态
  const batchBtn = document.getElementById('voc-batch-insight-btn');
  const comparisonBtn = document.getElementById('voc-comparison-btn');
  const marketBtn = document.getElementById('voc-market-insight-btn');
  
  if (batchBtn) {
    batchBtn.disabled = count === 0;
  }
  if (comparisonBtn) {
    comparisonBtn.disabled = count < 2 || count > 5;
    comparisonBtn.textContent = `⚖️ 对比分析 (${count}/2-5)`;
  }
  if (marketBtn) {
    marketBtn.disabled = count < 2 || count > 10;
    marketBtn.textContent = `🎯 市场细分 (${count}/2-10)`;
  }
}

/**
 * [NEW] 设置选择器状态消息
 */
function setSelectorStatus(message, type = 'info') {
  const statusEl = document.getElementById('voc-selector-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `voc-selector-status voc-status-${type}`;
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
    start: document.getElementById('voc-start-btn'),
    stop: document.getElementById('voc-stop-btn'),
    dash: document.getElementById('voc-dashboard-btn'),
    asin: document.getElementById('voc-asin'),
    title: document.getElementById('voc-product-title')
  };

  if (state.asin) els.asin.textContent = `ASIN: ${state.asin}`;
  if (state.title) els.title.textContent = state.title;
  if (state.message) els.msg.textContent = state.message;
  if (state.reviewCount) {
    els.count.textContent = `已采集: ${state.reviewCount}`;
    els.count.style.display = 'block';
  }

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
  
  // 备选：查找包含 "Rufus" 文本的元素
  const allElements = document.querySelectorAll('div, section, aside');
  for (const el of allElements) {
    if (el.textContent && el.textContent.includes('Ask Rufus') && el.querySelector('input, textarea')) {
      console.log('[Rufus] Found chat by text content');
      return el;
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
    '[data-testid*="rufus-button"]',
    '[aria-label*="Rufus"]',
    '[aria-label*="AI assistant"]',
    '[aria-label*="Ask a question"]',
    '.rufus-trigger',
    '#rufus-trigger',
    // 通用的聊天图标
    'button[aria-label*="chat"]',
    '[data-testid="chat-trigger"]',
    // Amazon 搜索栏附近的 AI 图标
    '.nav-search-scope button[aria-label*="AI"]',
    '#nav-search-bar button[aria-label*="assistant"]'
  ];
  
  for (const selector of iconSelectors) {
    const icon = document.querySelector(selector);
    if (icon) {
      console.log('[Rufus] Found and clicking trigger:', selector);
      icon.click();
      
      // 等待聊天界面打开
      await new Promise(r => setTimeout(r, 1500));
      
      chatInterface = detectRufusChat();
      if (chatInterface) {
        return chatInterface;
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
 * 等待 Rufus 回答完成
 */
async function waitForRufusAnswer(timeout = 60000) {
  console.log('[Rufus] Waiting for answer, timeout:', timeout);
  const startTime = Date.now();
  let lastAnswerLength = 0;
  let stableCount = 0;
  let attempts = 0;
  
  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, 1000)); // 每秒检查一次
    attempts++;
    
    const answer = extractRufusResponse();
    console.log(`[Rufus] Attempt ${attempts}: answer length = ${answer?.length || 0}`);
    
    if (answer && answer.length > 100) {
      // 检查回答是否稳定（停止变化）
      if (answer.length === lastAnswerLength) {
        stableCount++;
        console.log(`[Rufus] Stable count: ${stableCount}`);
        if (stableCount >= 2) {
          console.log('[Rufus] Answer stable, returning');
          return answer;
        }
      } else {
        stableCount = 0;
        lastAnswerLength = answer.length;
      }
    }
    
    // 如果已经等了超过 10 秒且有内容，检查是否完成
    if (Date.now() - startTime > 10000 && lastAnswerLength > 200) {
      // 检查是否有加载指示器
      const loading = document.querySelector(
        '[data-testid*="loading"], ' +
        '[class*="loading"], ' +
        '[class*="typing"], ' +
        '[aria-busy="true"], ' +
        '.spinner, ' +
        '[class*="Spinner"]'
      );
      
      if (!loading) {
        console.log('[Rufus] No loading indicator found, answer appears complete');
        const finalAnswer = extractRufusResponse();
        if (finalAnswer && finalAnswer.length > 100) {
          return finalAnswer;
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
 * 等待新消息出现并提取
 */
async function waitAndExtractNewMessage(previousCount, timeout = 60000) {
  console.log(`[Rufus] Waiting for new message, previous count: ${previousCount}`);
  const startTime = Date.now();
  let lastContent = '';
  let stableCount = 0;
  
  while (Date.now() - startTime < timeout) {
    await new Promise(r => setTimeout(r, 1000));
    
    const currentCount = getRufusMessageCount();
    console.log(`[Rufus] Current message count: ${currentCount}`);
    
    // 检查是否有新消息
    if (currentCount > previousCount) {
      const currentContent = extractLastMessage();
      
      if (currentContent && currentContent.length > 50) {
        // 检查内容是否稳定
        if (currentContent === lastContent) {
          stableCount++;
          if (stableCount >= 2) {
            console.log('[Rufus] Content stable, returning');
            return currentContent;
          }
        } else {
          stableCount = 0;
          lastContent = currentContent;
        }
      }
    }
    
    // 备选：检查加载状态
    const loading = document.querySelector('[class*="loading"], [class*="typing"], [aria-busy="true"]');
    if (!loading && lastContent.length > 100 && stableCount >= 1) {
      return lastContent;
    }
  }
  
  // 超时但有内容则返回
  if (lastContent.length > 50) {
    console.log('[Rufus] Timeout but returning partial content');
    return lastContent;
  }
  
  throw new Error('等待 Rufus 回答超时');
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
    chrome.runtime.sendMessage({
      type: 'UPLOAD_RUFUS_CONVERSATION',
      data: data
    }, (response) => {
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
  const asin = detectASIN();
  const marketplace = detectMarketplace();
  const results = [];
  
  try {
    updateRufusStatus(`开始 ${topic.name} 分析...`);
    updateRufusProgress(0, topic.questions.length);
    
    // 确保 Rufus 已打开
    const chatInterface = await openRufusChat();
    if (!chatInterface) {
      throw new Error('请先手动打开 Rufus 对话框，然后再点击按钮');
    }
    
    await new Promise(r => setTimeout(r, 1000));
    
    // 逐个问题执行
    for (let i = 0; i < topic.questions.length; i++) {
      const question = topic.questions[i];
      const questionNum = i + 1;
      
      updateRufusStatus(`正在提问 ${questionNum}/${topic.questions.length}...`);
      updateRufusProgress(i, topic.questions.length);
      
      try {
        // 1. 记录当前消息数量
        const beforeCount = getRufusMessageCount();
        console.log(`[Rufus] Question ${questionNum}: beforeCount = ${beforeCount}`);
        
        // 2. 发送问题
        await sendRufusQuestion(question);
        
        // 3. 等待并提取新回答
        updateRufusStatus(`等待回答 ${questionNum}/${topic.questions.length}...`);
        const answer = await waitAndExtractNewMessage(beforeCount, 60000);
        
        if (!answer || answer.length < 50) {
          console.warn(`[Rufus] Question ${questionNum} got empty answer`);
          results.push({ question, answer: null, success: false, error: '未获取到回答' });
          continue;
        }
        
        console.log(`[Rufus] Question ${questionNum} answer length: ${answer.length}`);
        
        // 4. 立即上传
        updateRufusStatus(`保存回答 ${questionNum}/${topic.questions.length}...`);
        
        const conversationData = {
          asin: asin,
          marketplace: marketplace,
          question: question,
          answer: answer,
          question_type: topicKey,
          question_index: i,
          conversation_id: `rufus-${topicKey}-${i}-${Date.now()}`
        };
        
        await uploadRufusConversation(conversationData);
        results.push({ question, answer, success: true });
        
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

  // 2. 处理打开采集面板的请求
  else if (msg.type === 'OPEN_OVERLAY') {
    const asin = detectASIN();
    const info = getProductInfo();
    showOverlay({ 
      status: 'ready', 
      asin: asin, 
      title: info.title 
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
  const isSearch = isSearchResultsPage();
  const isProduct = !!detectASIN();
  
  if (!isSearch && !isProduct) return; // 不是目标页面，不显示
  
  floatingButton = document.createElement('div');
  floatingButton.id = 'voc-floating-button';
  floatingButton.className = 'voc-floating-btn';
  floatingButton.setAttribute('data-page-type', isSearch ? 'search' : 'product');
  
  // 图标 SVG（与插件 logo 一致）
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
      ${isSearch ? '选择产品分析' : '打开采集面板'}
    </div>
  `;
  
  // 绑定点击事件
  floatingButton.addEventListener('click', (e) => {
    e.stopPropagation();
    handleFloatingButtonClick();
  });
  
  // 添加到页面
  document.body.appendChild(floatingButton);
  
  // 添加样式（如果还没有）
  injectFloatingButtonStyles();
  
  console.log('[VOC-Master] Floating button created for', isSearch ? 'search page' : 'product page');
}

/**
 * [NEW] 处理浮动按钮点击
 */
function handleFloatingButtonClick() {
  const pageType = floatingButton?.getAttribute('data-page-type');
  
  if (pageType === 'search') {
    // 搜索结果页：打开产品选择器
    showProductSelector();
  } else if (pageType === 'product') {
    // 产品详情页：打开采集面板
    const asin = detectASIN();
    const info = getProductInfo();
    showOverlay({ 
      status: 'ready', 
      asin: asin, 
      title: info.title 
    });
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
    // 检查是否在目标页面
    const isSearch = isSearchResultsPage();
    const isProduct = !!detectASIN();
    
    if (isSearch || isProduct) {
      if (!floatingButton) {
        createFloatingButton();
      }
    } else {
      // 不在目标页面，移除按钮
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
