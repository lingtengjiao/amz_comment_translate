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
  // 本地开发环境配置
  const CONFIG = {
  API_BASE_URL: 'http://localhost:8000/api/v1',
  DASHBOARD_URL: 'http://localhost:3000',  // 本地前端地址
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
    sortBy: 'recent'
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

      if (reviewId && (body || rating > 0)) {
        reviews.push({
          review_id: reviewId,
          author,
          rating,
          title,
          body,
          review_date: reviewDate,
          verified_purchase: verifiedPurchase,
          helpful_votes: helpfulVotes
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
  chrome.runtime.sendMessage({
    type: 'START_TAB_COLLECTION',
    asin,
    config: { stars: starsToCollect, pagesPerStar, mediaType, speedMode },
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
}

function hideOverlay() {
  if (overlay) overlay.classList.remove('voc-visible');
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
        </div>
        
        <div class="voc-actions" id="voc-actions">
          <button class="voc-btn voc-btn-primary" id="voc-start-btn">开始采集</button>
          <button class="voc-btn voc-btn-danger" id="voc-stop-btn" style="display: none;">停止采集</button>
          <a class="voc-btn voc-btn-success" id="voc-dashboard-btn" style="display: none;" target="_blank">
            进入洞察中心查看分析 →
          </a>
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

  if (!stars.length) {
    alert('请至少选择一个星级');
    return;
  }

  const config = { stars, pagesPerStar, mediaType, speedMode };
  startCollection(config);
}

function handleStopClick() {
  stopCollection();
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
      dashboardUrl: `${CONFIG.DASHBOARD_URL}/products/${asin}`
    });
    
    // 注意：不立即重置 g_displayCount，保留显示直到用户关闭面板或开始新的采集
  }
});

})(); // IIFE 结束
