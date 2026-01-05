/**
 * VOC-Master Content Script (Optimized Version)
 * * Improvements:
 * 1. Intelligent CAPTCHA detection
 * 2. Stable Review ID generation (fingerprinting)
 * 3. Human-like random delays
 */

// Configuration
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000/api/v1',
  DASHBOARD_URL: 'http://localhost:3000',
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

  return { title, imageUrl, averageRating, price, bulletPoints };
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
 * Collect reviews for a specific star rating
 * [UPDATED] Uses humanLikeDelay for smarter waiting
 */
async function collectReviewsByStar(asin, star, maxPages, onProgress) {
  const allReviews = [];
  const seenReviewIds = new Set();
  let consecutiveDuplicatePages = 0;
  let consecutiveErrors = 0;

  console.log(`[Star ${star}] Starting collection...`);

  for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
    if (shouldStop) break;

    const url = buildReviewsUrl(asin, star, currentPage);
    
    onProgress({
      currentStar: star,
      currentPage,
      maxPages,
      message: `正在采集 ${star} 星评论... 第 ${currentPage}/${maxPages} 页`
    });

    try {
      const { reviews } = await fetchReviewsPage(url);
      
      let newReviewsCount = 0;
      for (const review of reviews) {
        if (!seenReviewIds.has(review.review_id)) {
          seenReviewIds.add(review.review_id);
          allReviews.push(review);
          newReviewsCount++;
        }
      }
      
      console.log(`[Star ${star}] Page ${currentPage}: ${newReviewsCount} new reviews`);

      // Empty/Duplicate detection
      if (reviews.length === 0 || newReviewsCount === 0) {
        consecutiveDuplicatePages++;
        if (consecutiveDuplicatePages >= 2) break; // Stop after 2 empty pages
      } else {
        consecutiveDuplicatePages = 0;
      }
      
      consecutiveErrors = 0;

      // [NEW] Human-like delay between pages
      if (currentPage < maxPages) {
        const delayPromise = humanLikeDelay(CONFIG.DELAY_BETWEEN_PAGES.min, 1500);
        console.log(`[Star ${star}] Resting for ${delayPromise.delay}ms...`);
        await delayPromise;
      }

    } catch (error) {
      console.error(`[Star ${star}] Error on page ${currentPage}:`, error);
      
      if (error.message === 'CAPTCHA_DETECTED') {
        onProgress({ error: '检测到验证码，采集暂停。请手动在页面输入验证码后重试。' });
        shouldStop = true;
        break;
      }

      consecutiveErrors++;
      if (consecutiveErrors >= 3) break;
      await humanLikeDelay(4000, 2000); // Longer wait on error
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

  const { title, imageUrl, averageRating, price, bulletPoints } = getProductInfo();
  const starsToCollect = config.stars || [1, 2, 3, 4, 5];
  const pagesPerStar = config.pagesPerStar || 5;
  const mediaType = config.mediaType || 'all_formats';
  const speedMode = config.speedMode || 'fast';

  isCollecting = true;
  shouldStop = false;

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
      title, imageUrl, averageRating, price, bulletPoints,
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
  updateOverlay({ status: 'stopped', message: '已停止采集' });
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

function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'voc-master-overlay';
  // Use existing HTML structure from previous version...
  overlay.innerHTML = `
    <div class="voc-panel">
      <div class="voc-header">
        <div class="voc-logo"><span class="voc-icon">📊</span><span class="voc-title">VOC-Master</span></div>
        <div style="display:flex;gap:10px">
           <button class="voc-close" id="voc-expand-btn" title="全屏切换">⛶</button>
           <button class="voc-close" id="voc-close-btn">×</button>
        </div>
      </div>
      <div class="voc-content">
        <div class="voc-product-info"><div id="voc-asin"></div><div id="voc-product-title"></div></div>
        <div class="voc-status">
          <div id="voc-message">准备就绪</div>
          <div id="voc-progress-container" style="display:none">
            <div class="voc-progress-bar"><div id="voc-progress-fill"></div></div>
            <div id="voc-progress-text">0%</div>
          </div>
          <div id="voc-review-count"></div>
        </div>
        <div class="voc-config" id="voc-config">
          <div class="voc-config-row">
            <label>采集星级:</label>
            <div class="voc-stars">
              ${[1,2,3,4,5].map(s => `<label><input type="checkbox" class="voc-star-check" value="${s}" checked> ${s}星</label>`).join('')}
            </div>
          </div>
          <div class="voc-config-row">
             <label>页数上限:</label>
             <select id="voc-pages-per-star">
               <option value="3">3页</option>
               <option value="5" selected>5页</option>
               <option value="10">10页</option>
             </select>
          </div>
        </div>
        <div class="voc-actions">
          <button class="voc-btn voc-btn-primary" id="voc-start-btn">开始采集</button>
          <button class="voc-btn voc-btn-danger" id="voc-stop-btn" style="display:none">停止</button>
          <a class="voc-btn voc-btn-success" id="voc-dashboard-btn" style="display:none" target="_blank">查看分析</a>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Bind Events
  document.getElementById('voc-close-btn').onclick = hideOverlay;
  document.getElementById('voc-expand-btn').onclick = toggleFullscreen;
  document.getElementById('voc-start-btn').onclick = handleStartClick;
  document.getElementById('voc-stop-btn').onclick = handleStopClick;
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
  const pages = parseInt(document.getElementById('voc-pages-per-star').value);
  if (!stars.length) return alert('请选择星级');
  
  const config = { stars, pagesPerStar: pages };
  startCollection(config);
}

function handleStopClick() {
  stopCollection();
}

// Chrome Message Listener
chrome.runtime.onMessage.addListener((msg, sender, sendRes) => {
  if (msg.type === 'OPEN_OVERLAY') {
    const asin = detectASIN();
    showOverlay({ status: 'ready', asin, title: getProductInfo().title });
    sendRes({ success: true });
  } else if (msg.type === 'COLLECTION_PROGRESS') {
    updateOverlay({
      status: 'collecting',
      message: msg.message,
      progress: Math.min(Math.round((msg.page/msg.pagesPerStar)*20 + (msg.star-1)*20), 95),
      reviewCount: msg.totalReviews
    });
  } else if (msg.type === 'COLLECTION_COMPLETE') {
    const asin = detectASIN();
    showOverlay({
      status: msg.success ? 'complete' : 'error',
      message: msg.success ? `采集完成! 共${msg.reviewCount}条` : `失败: ${msg.error}`,
      dashboardUrl: `${CONFIG.DASHBOARD_URL}/products/${asin}`
    });
  }
});
