/**
 * VOC-Master Background Service Worker (Manifest V3)
 * 
 * Handles:
 * - Communication between popup and content scripts
 * - API calls to backend
 * - State management
 * - Review collection using real browser tabs (bypasses anti-scraping)
 */

// Backend API configuration
const API_BASE_URL = 'http://localhost:8000/api/v1';

// Star rating URL parameters
const STAR_FILTERS = {
  1: 'one_star',
  2: 'two_star',
  3: 'three_star',
  4: 'four_star',
  5: 'five_star'
};

// Extension state
let collectionState = {
  isCollecting: false,
  currentAsin: null,
  progress: 0,
  totalPages: 0,
  currentPage: 0,
  currentStar: 0,
  reviews: [],
  error: null
};

// Active collection tab
let collectorTabId = null;
let originTabId = null;

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, options, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请确保后端服务正在运行');
    }
    throw error;
  }
}

/**
 * Send reviews to backend API with retry
 */
async function uploadReviews(data, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Upload] Attempt ${attempt}/${maxRetries}...`);
      
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/reviews/ingest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data)
        },
        60000 // 60 second timeout for large uploads
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${error}`);
      }

      console.log(`[Upload] Success on attempt ${attempt}`);
      return await response.json();
    } catch (error) {
      console.error(`[Upload] Attempt ${attempt} failed:`, error.message);
      lastError = error;
      
      // Don't retry if it's a server error (4xx/5xx means the request was received)
      if (error.message.includes('Upload failed:')) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`[Upload] Waiting ${waitTime}ms before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }
  
  // All retries failed
  throw new Error(`上传失败 (已重试${maxRetries}次): ${lastError.message}`);
}

// Media type URL parameters for Amazon reviews
// 两个互斥选项：全部评论 vs 仅带媒体的评论
const MEDIA_FILTERS = {
  'all_formats': 'all_contents',           // 全部评论 (Text, image, video)
  'media_reviews_only': 'media_reviews_only'  // 仅带媒体的评论 (Image and video reviews only)
};

/**
 * Build reviews page URL with cache-busting
 */
function buildReviewsUrl(asin, star, page = 1, mediaType = 'all_formats') {
  const starFilter = STAR_FILTERS[star];
  // 获取媒体过滤器值
  const mediaFilter = MEDIA_FILTERS[mediaType] || 'all_contents';
  
  const params = new URLSearchParams({
    ie: 'UTF8',
    reviewerType: 'all_reviews',
    filterByStar: starFilter,
    pageNumber: page.toString(),
    sortBy: 'recent',
    // Amazon mediaType: 'all_contents' for all, 'media_reviews_only' for media only
    mediaType: mediaFilter,
    // Cache-busting: add unique timestamp to prevent browser cache
    _ts: Date.now().toString()
  });
  
  const url = `https://www.amazon.com/product-reviews/${asin}?${params.toString()}`;
  console.log(`[URL] Built: ${url}`);
  return url;
}

/**
 * Wait for tab to complete loading using chrome.tabs.onUpdated event
 * More reliable than polling, with longer timeout for slow networks
 */
function waitForTabLoad(tabId, timeout = 60000) {
  return new Promise((resolve, reject) => {
    console.log(`[WaitForTab] Waiting for tab ${tabId} to load (timeout: ${timeout}ms)`);
    
    const timeoutId = setTimeout(async () => {
      chrome.tabs.onUpdated.removeListener(listener);
      console.warn(`[WaitForTab] Timeout after ${timeout}ms, but continuing anyway...`);
      // Don't reject - try to continue even if page didn't fully load
      try {
        const tab = await chrome.tabs.get(tabId);
        resolve(tab);
      } catch (error) {
        console.warn(`[WaitForTab] Could not get tab ${tabId} after timeout:`, error.message);
        // Resolve with a mock tab to continue
        resolve({ id: tabId, status: 'complete', url: '' });
      }
    }, timeout);
    
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId) {
        console.log(`[WaitForTab] Tab ${tabId} status: ${changeInfo.status || 'unchanged'}`);
        
        if (changeInfo.status === 'complete') {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(listener);
          console.log(`[WaitForTab] Tab ${tabId} loaded successfully`);
          resolve(tab);
        }
      }
    };
    
    chrome.tabs.onUpdated.addListener(listener);
    
    // Also check current status immediately (in case it's already loaded)
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        clearTimeout(timeoutId);
        chrome.tabs.onUpdated.removeListener(listener);
        console.log(`[WaitForTab] Tab ${tabId} was already loaded`);
        resolve(tab);
      }
    }).catch(e => {
      // Tab might not exist yet, continue with listener
      console.log(`[WaitForTab] Tab ${tabId} not ready yet, waiting for load event`);
    });
  });
}

/**
 * Extract reviews from the current page using executeScript
 */
async function extractReviewsFromTab(tabId) {
  try {
    console.log('[Extract] Executing script in tab', tabId);
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Debug: log current URL
        console.log('[Page] Current URL:', window.location.href);
        console.log('[Page] Document ready state:', document.readyState);
        
        const reviews = [];
        
        // Try multiple selectors for reviews (Amazon may have different page structures)
        let reviewElements = document.querySelectorAll('[data-hook="review"]');
        
        // Fallback selectors if primary one fails
        if (reviewElements.length === 0) {
          console.log('[Page] Primary selector failed, trying alternatives...');
          reviewElements = document.querySelectorAll('.review, .a-section.review, #cm_cr-review_list .a-section');
        }
        
        console.log('[Page] Found', reviewElements.length, 'review elements');
        
        // Debug: log page content hints
        const pageContent = document.body?.innerText?.substring(0, 500) || '';
        console.log('[Page] Page content preview:', pageContent.substring(0, 200));
        
        // Debug: Check page number from URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlPageNum = urlParams.get('pageNumber');
        console.log('[Page] URL pageNumber:', urlPageNum);
        
        reviewElements.forEach((el, index) => {
          try {
            // Review ID
            let reviewId = el.id;
            if (!reviewId || !reviewId.startsWith('R')) {
              reviewId = el.getAttribute('data-review-id');
            }
            if (!reviewId || !reviewId.startsWith('R')) {
              const reviewLink = el.querySelector('a[href*="/gp/customer-reviews/"]');
              if (reviewLink) {
                const match = reviewLink.href.match(/\/gp\/customer-reviews\/([A-Z0-9]+)/);
                if (match) reviewId = match[1];
              }
            }
            if (!reviewId || !reviewId.startsWith('R')) {
              reviewId = `R${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            }

            // Rating
            let rating = 0;
            const ratingEl = el.querySelector('[data-hook="review-star-rating"] .a-icon-alt, [data-hook="cmps-review-star-rating"] .a-icon-alt');
            if (ratingEl) {
              const match = ratingEl.textContent.match(/(\d+)/);
              if (match) rating = parseInt(match[1]);
            }

            // Title - get the review title text, not rating icons
            let title = '';
            const titleLink = el.querySelector('[data-hook="review-title"]');
            if (titleLink) {
              // Get spans that are not icon-alt (rating text)
              const titleSpans = titleLink.querySelectorAll('span:not(.a-icon-alt)');
              for (const span of titleSpans) {
                const text = span.textContent?.trim();
                if (text && !text.match(/^\d+(\.\d+)?\s*out of\s*\d+/)) {
                  title = text;
                  break;
                }
              }
            }

            // Body - need to carefully extract only the review text, not video player configs
            let body = '';
            const bodyContainer = el.querySelector('[data-hook="review-body"]');
            if (bodyContainer) {
              // Clone container to avoid modifying the original
              const clone = bodyContainer.cloneNode(true);
              
              // Remove all script tags (they contain JSON configs)
              clone.querySelectorAll('script').forEach(script => script.remove());
              
              // Remove video player containers
              clone.querySelectorAll('[class*="vse-"], [id*="player"], [data-video]').forEach(el => el.remove());
              
              // Try to get the main review text span first
              const reviewTextSpan = clone.querySelector(':scope > div > span > span, :scope > span > span, :scope > div > span');
              
              if (reviewTextSpan) {
                body = reviewTextSpan.textContent?.trim() || '';
              } else {
                // Fallback: get all text from clone (scripts already removed)
                body = clone.textContent?.trim() || '';
              }
              
              // Filter out video player JSON configs and metadata (more aggressive)
              if (body) {
                // Check if body contains JSON config (video player configs)
                if (body.includes('metricsConfig') || body.includes('clickstreamNexusMetricsConfig') || body.includes('videoUrl')) {
                  // Find the last closing brace (end of JSON object)
                  // JSON objects are usually at the beginning, followed by actual review text
                  const lastBraceIndex = body.lastIndexOf('}');
                  if (lastBraceIndex >= 0 && lastBraceIndex < body.length - 1) {
                    // Extract text after the last closing brace
                    body = body.substring(lastBraceIndex + 1).trim();
                    
                    // If body still starts with JSON-like content, try to find actual text
                    // Look for the first sentence starting with capital letter after JSON
                    const match = body.match(/\s*([A-Z][^.!?]*(?:[.!?]|$))/);
                    if (match) {
                      body = body.substring(body.indexOf(match[1])).trim();
                    }
                  } else {
                    // If no closing brace or JSON is at the end, likely all JSON
                    body = '';
                  }
                }
                
                // Additional cleanup for any remaining JSON artifacts
                // Remove JSON objects at the start of string
                body = body.replace(/^\s*\{[^}]*"metricsConfig"[^}]*\}/, '').trim();
                body = body.replace(/^\s*\{[^}]*"clickstreamNexusMetricsConfig"[^}]*\}/, '').trim();
                
                // Clean up common video player text artifacts
                body = body.replace(/Video Player is loading\..*?Fullscreen/gs, '').trim();
                body = body.replace(/Click to play video.*?LIVERemaining Time/gs, '').trim();
                body = body.replace(/PlayMuteCurrent Time.*?Fullscreen/gs, '').trim();
                body = body.replace(/This is a modal window\./g, '').trim();
                body = body.replace(/The video showcases.*?unpacked\./g, '').trim();
                
                // Clean up multiple spaces
                body = body.replace(/\s+/g, ' ').trim();
                
                // If body is too short after cleaning, it might not be a real review
                if (body.length < 5) {
                  body = '';
                }
              }
            }

            // Author
            const authorEl = el.querySelector('.a-profile-name');
            const author = authorEl?.textContent?.trim() || 'Anonymous';

            // Date
            const dateEl = el.querySelector('[data-hook="review-date"]');
            const dateText = dateEl?.textContent || '';
            const dateMatch = dateText.match(/on\s+(.+)$/i);
            const reviewDate = dateMatch ? dateMatch[1].trim() : '';

            // Verified purchase
            const verifiedEl = el.querySelector('[data-hook="avp-badge"]');
            const verifiedPurchase = !!verifiedEl;

            // Helpful votes
            const helpfulEl = el.querySelector('[data-hook="helpful-vote-statement"]');
            const helpfulMatch = helpfulEl?.textContent?.match(/(\d+)/);
            const helpfulVotes = helpfulMatch ? parseInt(helpfulMatch[1]) : 0;

            // ========== 图片检测和提取 ==========
            let hasImages = false;
            const imageUrls = [];
            
            // 查找评论图片区域
            const imageContainers = el.querySelectorAll(
              '[data-hook="review-image-tile"], ' +
              '.review-image-tile-section img, ' +
              '.cr-lightbox-image-thumbnail img, ' +
              '[data-a-image-source]'
            );
            
            imageContainers.forEach(imgEl => {
              // 尝试获取高分辨率图片
              let imgSrc = imgEl.getAttribute('data-a-hires') || 
                           imgEl.getAttribute('data-a-image-source') ||
                           imgEl.getAttribute('src');
              
              if (imgSrc && !imgSrc.includes('transparent-pixel') && !imgSrc.includes('grey-pixel')) {
                // 转换为高分辨率版本
                if (imgSrc.includes('._')) {
                  imgSrc = imgSrc.replace(/\._[A-Z0-9,_]+_\./, '.');
                }
                if (!imageUrls.includes(imgSrc)) {
                  imageUrls.push(imgSrc);
                  hasImages = true;
                }
              }
            });

            // ========== 视频检测和提取 ==========
            let hasVideo = false;
            let videoUrl = null;
            
            // 方法1: 查找视频容器
            const videoContainer = el.querySelector(
              '[data-hook="review-video"], ' +
              '.vse-video-container, ' +
              '.review-video-container, ' +
              '[data-video-url]'
            );
            
            if (videoContainer) {
              hasVideo = true;
              videoUrl = videoContainer.getAttribute('data-video-url');
            }
            
            // 方法2: 从视频配置 JSON 中提取
            if (!videoUrl && bodyContainer) {
              const scripts = bodyContainer.querySelectorAll('script[type="application/json"], script');
              scripts.forEach(script => {
                try {
                  const content = script.textContent;
                  if (content && content.includes('videoUrl')) {
                    const match = content.match(/"videoUrl"\s*:\s*"([^"]+)"/);
                    if (match) {
                      videoUrl = match[1];
                      hasVideo = true;
                    }
                  }
                } catch (e) {}
              });
              
              // 方法3: 从 body 文本中提取（视频配置 JSON）
              if (!videoUrl) {
                const bodyText = bodyContainer.innerHTML;
                if (bodyText.includes('videoUrl') || bodyText.includes('m3u8')) {
                  const match = bodyText.match(/"videoUrl"\s*:\s*"([^"]+)"/);
                  if (match) {
                    videoUrl = match[1];
                    hasVideo = true;
                  }
                }
              }
            }
            
            // 如果检测到视频播放器文本但没有提取到 URL，也标记为有视频
            if (!hasVideo && body && (
              body.includes('Video Player') || 
              body.includes('Play video') ||
              body.includes('metricsConfig')
            )) {
              hasVideo = true;
            }

            // 确保 body 不为空（API 要求至少 1 个字符）
            // 如果 body 为空但有标题，用标题作为 body
            // 如果都为空但有评分，用占位符
            let finalBody = body;
            if (!finalBody || finalBody.trim().length === 0) {
              if (title && title.trim().length > 0) {
                finalBody = title;
              } else if (rating > 0) {
                finalBody = `${rating} star rating`;
              }
            }

            if (reviewId && finalBody && finalBody.trim().length > 0) {
              reviews.push({
                review_id: reviewId,
                author,
                rating,
                title,
                body: finalBody.trim(),
                review_date: reviewDate,
                verified_purchase: verifiedPurchase,
                helpful_votes: helpfulVotes,
                // 新增媒体字段
                has_images: hasImages,
                has_video: hasVideo,
                image_urls: imageUrls.length > 0 ? imageUrls : null,
                video_url: videoUrl
              });
              
              // Log first 3 reviews for debugging
              if (index < 3) {
                console.log(`[Page] Review ${index}: ID=${reviewId}, rating=${rating}`);
              }
            }
          } catch (e) {
            console.error('Error parsing review:', e);
          }
        });

        // Also get current page number for debugging
        const currentPageEl = document.querySelector('.a-pagination .a-selected');
        const pageNum = currentPageEl ? currentPageEl.textContent.trim() : null;
        
        console.log('[Page] Pagination shows page:', pageNum);
        console.log('[Page] Returning', reviews.length, 'reviews');

        return { reviews, pageNum, urlPageNum };
      }
    });

    const result = results[0]?.result || { reviews: [], pageNum: null, urlPageNum: null };
    console.log(`[Extract] Result: ${result.reviews.length} reviews, DOM page: ${result.pageNum}, URL page: ${result.urlPageNum}`);
    
    return result;
  } catch (error) {
    console.error('[Extract] Error:', error);
    return { reviews: [], pageNum: null, urlPageNum: null };
  }
}

/**
 * Check if there's a next page button and click it
 * Returns true if clicked successfully, false otherwise
 * 
 * 修复：等待 DOM 内容真正更新，而不仅仅是页面加载状态
 * @param {number} tabId - 标签页 ID
 * @param {object} timing - 速度配置（可选）
 */
async function clickNextPage(tabId, timing = {}) {
  // 使用传入的配置或默认值
  const pollInterval = timing.domPollInterval || 150;
  const extraWait = timing.domUpdateExtraWait || 200;
  const maxWaitTime = 8000; // 最多等待 8 秒（从 10 秒减少）
  
  try {
    console.log('[ClickNext] Attempting to click next page button...');
    
    // Step 1: 获取当前第一条评论的 ID（用于检测 DOM 变化）
    const beforeResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const firstReview = document.querySelector('[data-hook="review"]');
        return firstReview ? firstReview.id : null;
      }
    });
    const firstReviewIdBefore = beforeResults[0]?.result;
    console.log('[ClickNext] First review ID before click:', firstReviewIdBefore);
    
    // Step 2: 点击 Next 按钮
    const clickResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const nextLink = document.querySelector('.a-pagination .a-last:not(.a-disabled) a');
        
        if (nextLink) {
          console.log('[Page] Found next page link, clicking...');
          // 使用 instant 而不是 smooth 来加快速度
          nextLink.scrollIntoView({ behavior: 'instant', block: 'center' });
          nextLink.click();
          return { success: true, href: nextLink.href };
        } else {
          console.log('[Page] No next page link found');
          return { success: false, reason: 'No next page button' };
        }
      }
    });
    
    const clickResult = clickResults[0]?.result;
    console.log('[ClickNext] Click result:', clickResult);
    
    if (!clickResult?.success) {
      return false;
    }
    
    // Step 3: 等待 DOM 内容变化（轮询检测第一条评论 ID 是否改变）
    console.log(`[ClickNext] Waiting for DOM update (poll: ${pollInterval}ms)...`);
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(r => setTimeout(r, pollInterval));
      
      try {
        const afterResults = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const firstReview = document.querySelector('[data-hook="review"]');
            return firstReview ? firstReview.id : null;
          }
        });
        const firstReviewIdAfter = afterResults[0]?.result;
        
        // 如果第一条评论 ID 变化了，说明内容已更新
        if (firstReviewIdAfter && firstReviewIdAfter !== firstReviewIdBefore) {
          const elapsed = Date.now() - startTime;
          console.log(`[ClickNext] DOM updated in ${elapsed}ms! New ID: ${firstReviewIdAfter}`);
          // 额外等待确保所有评论加载完成
          await new Promise(r => setTimeout(r, extraWait));
          return true;
        }
      } catch (e) {
        // 页面可能正在加载，继续等待
      }
    }
    
    // 超时了，但点击确实成功了，可能页面内容本来就相同
    console.log('[ClickNext] Timeout waiting for DOM change, proceeding anyway...');
    return true;
    
  } catch (error) {
    console.error('[ClickNext] Error:', error);
    return false;
  }
}

/**
 * Check if there's a next page and get its URL (legacy function)
 */
async function getNextPageUrl(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const nextLink = document.querySelector('.a-pagination .a-last:not(.a-disabled) a');
        return nextLink ? nextLink.href : null;
      }
    });
    return results[0]?.result || null;
  } catch (error) {
    console.error('Error getting next page URL:', error);
    return null;
  }
}

/**
 * Collect reviews using real browser tab navigation
 */
async function collectReviewsWithTab(asin, stars, pagesPerStar, mediaType, speedMode, sendProgress) {
  const allReviews = [];
  const seenReviewIds = new Set();
  let originalTabId = null;
  
  // 根据速度模式设置等待时间
  // ⚡ 极速模式：激进但不踩红线，依赖 DOM 变化检测而非固定等待
  // 🛡️ 稳定模式：保守策略，适合长时间大量采集
  const SPEED_CONFIG = {
    fast: {
      firstPageWait: 1500,      // 首页加载后等待（减少500ms）
      scrollWait: 400,          // 滚动后等待（减少400ms，DOM检测会补充）
      nextPageWait: 300,        // 后续页面等待（大幅减少，依赖DOM变化检测）
      pageBetweenMin: 400,      // 页面间最小延迟（减少400ms）
      pageBetweenRandom: 400,   // 页面间随机延迟（0-400ms随机）
      starBetweenMin: 600,      // 星级间最小延迟（减少400ms）
      starBetweenRandom: 600,   // 星级间随机延迟
      domPollInterval: 150,     // DOM轮询间隔（更快检测）
      domUpdateExtraWait: 200   // DOM更新后额外等待（减少300ms）
    },
    stable: {
      firstPageWait: 4000,      // 首页加载后等待
      scrollWait: 1500,         // 滚动后等待
      nextPageWait: 2500,       // 后续页面等待
      pageBetweenMin: 2000,     // 页面间最小延迟
      pageBetweenRandom: 1500,  // 页面间随机延迟
      starBetweenMin: 2500,     // 星级间最小延迟
      starBetweenRandom: 1500,  // 星级间随机延迟
      domPollInterval: 300,     // DOM轮询间隔
      domUpdateExtraWait: 500   // DOM更新后额外等待
    }
  };
  
  const timing = SPEED_CONFIG[speedMode] || SPEED_CONFIG.fast;
  
  console.log('[Collector] ========================================');
  console.log('[Collector] Starting collection for ASIN:', asin);
  console.log('[Collector] Stars:', stars);
  console.log('[Collector] Pages per star:', pagesPerStar);
  console.log('[Collector] Media type:', mediaType);
  console.log('[Collector] Speed mode:', speedMode, speedMode === 'fast' ? '⚡ 极速' : '🛡️ 稳定');
  console.log('[Collector] ========================================');
  
  try {
    // Remember the current active tab to switch back later
    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTab) {
        originalTabId = currentTab.id;
        console.log('[Collector] Original tab:', originalTabId);
      }
    } catch (e) {
      console.log('[Collector] Could not get original tab');
    }
    
    // Create a new tab for collection
    console.log('[Collector] Creating new tab...');
    // IMPORTANT: Create tab as ACTIVE to bypass Amazon's anti-automation detection
    const tab = await chrome.tabs.create({ 
      url: 'about:blank',
      active: true  // Must be active to bypass anti-bot detection
    });
    collectorTabId = tab.id;
    console.log('[Collector] ✅ Created tab:', collectorTabId);
    
    // Switch back to original tab immediately so user can continue browsing
    if (originalTabId) {
      await new Promise(r => setTimeout(r, 500)); // Brief delay
      try {
        await chrome.tabs.update(originalTabId, { active: true });
        console.log('[Collector] Switched back to original tab');
      } catch (e) {
        console.log('[Collector] Could not switch back to original tab');
      }
    }

    for (const star of stars) {
      console.log(`[Collector] ----------------------------------------`);
      console.log(`[Collector] Starting star ${star} collection`);
      let consecutiveNoNew = 0;
      let lastPage = 0; // 跟踪实际扫描的页数
      
      // [NEW] 星级开始时发送初始进度更新
      const starIndex = stars.indexOf(star);
      const initialProgress = Math.min(Math.round((starIndex / stars.length) * 100), 99);
      sendProgress({
        star,
        page: 0,
        pagesPerStar,
        totalReviews: allReviews.length, // 显示当前已采集的总数
        progress: initialProgress,
        message: `开始采集 ${star} 星评论...`
      });
      
      for (let page = 1; page <= pagesPerStar; page++) {
        lastPage = page; // 更新最后扫描的页数
        if (!collectorTabId) {
          throw new Error('Collection cancelled');
        }

        let reviews = [];
        let pageNum = null;
        
        try {
          // For page 1: Navigate via URL
          // For subsequent pages: Click the "Next" button (more human-like)
          if (page === 1) {
            const url = buildReviewsUrl(asin, star, 1, mediaType);
            console.log(`[Collector] Page 1 - Navigating via URL:`, url);
            
            await chrome.tabs.update(collectorTabId, { url });
            await waitForTabLoad(collectorTabId, 45000);
            
            // Longer wait for first page load
            console.log(`[Collector] Page 1 - Waiting ${timing.firstPageWait}ms for dynamic content...`);
            await new Promise(r => setTimeout(r, timing.firstPageWait));
            
            // Scroll down to trigger lazy loading of reviews
            console.log(`[Collector] Page 1 - Scrolling to load reviews...`);
            try {
              await chrome.scripting.executeScript({
                target: { tabId: collectorTabId },
                func: () => {
                  // Quick scroll to trigger lazy loading
                  window.scrollTo({ top: 800, behavior: 'instant' });
                }
              });
              await new Promise(r => setTimeout(r, timing.scrollWait)); // Wait for lazy loading
            } catch (scrollErr) {
              console.warn(`[Collector] Scroll failed:`, scrollErr.message);
            }
          } else {
            // Click "Next" button to go to next page (bypass Amazon's anti-bot detection)
            console.log(`[Collector] Page ${page} - Clicking "Next" button...`);
            
            const clicked = await clickNextPage(collectorTabId, timing);
            
            if (!clicked) {
              console.log(`[Collector] Page ${page} - No "Next" button found, star ${star} complete`);
              break; // No more pages for this star
            }
            
            // Wait for dynamic content after clicking
            console.log(`[Collector] Page ${page} - Waiting ${timing.nextPageWait}ms for dynamic content...`);
            await new Promise(r => setTimeout(r, timing.nextPageWait));
          }
          
          // Verify current URL
          try {
            const currentTab = await chrome.tabs.get(collectorTabId);
            console.log(`[Collector] Page ${page} - Current URL: ${currentTab.url}`);
          } catch (error) {
            console.warn(`[Collector] Page ${page} - Could not get tab URL:`, error.message);
          }

          // Extract reviews
          console.log(`[Collector] Page ${page} - Extracting reviews...`);
          const result = await extractReviewsFromTab(collectorTabId);
          reviews = result.reviews;
          pageNum = result.pageNum;
          
          console.log(`[Collector] Page ${page} - Extracted ${reviews.length} reviews, DOM pageNum: ${pageNum}`);
          
        } catch (err) {
          console.error(`[Collector] Page ${page} - Error:`, err.message);
          // Continue to next page on error
        }
        
        console.log(`[Collector] Page ${page} (DOM shows: ${pageNum}): Found ${reviews.length} reviews`);
        
        // Log ALL review IDs for debugging
        if (reviews.length > 0) {
          console.log(`[Collector] Page ${page} - Review IDs:`);
          reviews.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.review_id}`);
          });
        }

        // De-duplicate
        let newCount = 0;
        for (const review of reviews) {
          if (!seenReviewIds.has(review.review_id)) {
            seenReviewIds.add(review.review_id);
            review.rating = star; // Ensure rating matches the star filter
            allReviews.push(review);
            newCount++;
          }
        }

        console.log(`[Collector] Page ${page}: ${newCount} new, ${reviews.length - newCount} duplicates, total: ${allReviews.length}`);

        // [FIXED] 在评论添加到 allReviews 后立即发送进度更新，确保 totalReviews 准确
        // 计算总体进度百分比
        const starIndex = stars.indexOf(star);
        const starProgress = page / pagesPerStar;
        const totalProgress = Math.min(Math.round(((starIndex + starProgress) / stars.length) * 100), 99);
        
        sendProgress({
          star,
          page,
          pagesPerStar,
          totalReviews: allReviews.length, // 🔥 使用最新的总数（已包含当前页面的评论）
          progress: totalProgress, // 计算好的百分比
          message: `正在采集 ${star} 星评论... 第 ${page}/${pagesPerStar} 页`
        });

        // Check if we got new reviews
        if (newCount === 0 && reviews.length > 0) {
          consecutiveNoNew++;
          console.log(`[Collector] Page ${page}: All duplicates (${consecutiveNoNew} consecutive)`);
          // 放宽早停条件：连续3页无新评论才停止（之前是2页）
          if (consecutiveNoNew >= 3) {
            console.log(`[Collector] Star ${star}: No new reviews for 3 pages, moving to next star`);
            break;
          }
        } else if (newCount > 0) {
          consecutiveNoNew = 0; // 只有真正有新评论时才重置计数器
        }
        // 如果 reviews.length === 0（页面没有评论），不计入早停计数

        // Random delay between pages
        if (page < pagesPerStar) {
          const delay = timing.pageBetweenMin + Math.random() * timing.pageBetweenRandom;
          console.log(`[Collector] Page ${page} - Waiting ${Math.round(delay)}ms before next page...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }

      // 统计当前星级采集的数量
      const starReviewCount = allReviews.filter(r => r.rating === star).length;
      console.log(`[Collector] ========================================`);
      console.log(`[Collector] Star ${star} complete:`);
      console.log(`[Collector]   - This star: ${starReviewCount} reviews`);
      console.log(`[Collector]   - Total so far: ${allReviews.length} reviews`);
      console.log(`[Collector]   - Pages scanned: ${lastPage}`);
      console.log(`[Collector] ========================================`);

      // [FIXED] 星级完成时发送一次进度更新，确保总数准确
      // starIndex 已在循环开始处声明，直接复用
      const finalProgress = Math.min(Math.round(((starIndex + 1) / stars.length) * 100), 99);
      
      sendProgress({
        star,
        page: pagesPerStar,
        pagesPerStar,
        totalReviews: allReviews.length, // 🔥 发送最新的总数
        progress: finalProgress,
        message: `${star} 星采集完成，共 ${allReviews.length} 条评论`
      });

      // Delay between star ratings
      if (stars.indexOf(star) < stars.length - 1) {
        const delay = timing.starBetweenMin + Math.random() * timing.starBetweenRandom;
        console.log(`[Collector] Waiting ${Math.round(delay)}ms before next star...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // Close collector tab
    console.log('[Collector] Closing collector tab...');
    if (collectorTabId) {
      try {
        await chrome.tabs.remove(collectorTabId);
        console.log('[Collector] Tab closed');
      } catch (e) {
        console.log('[Collector] Tab already closed');
      }
      collectorTabId = null;
    }
    
    // Switch back to original tab
    if (originalTabId) {
      try {
        await chrome.tabs.update(originalTabId, { active: true });
        console.log('[Collector] Switched back to original tab');
      } catch (e) {
        console.log('[Collector] Could not switch back to original tab');
      }
    }

    console.log('[Collector] ========================================');
    console.log(`[Collector] ✅ Collection complete: ${allReviews.length} reviews`);
    console.log('[Collector] ========================================');
    return allReviews;

  } catch (error) {
    console.error('[Collector] ❌ Error:', error);
    // Clean up tab
    if (collectorTabId) {
      try {
        await chrome.tabs.remove(collectorTabId);
      } catch (e) {}
      collectorTabId = null;
    }
    throw error;
  }
}

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'GET_STATE':
      sendResponse(collectionState);
      break;

    case 'START_COLLECTION':
      collectionState = {
        isCollecting: true,
        currentAsin: message.asin,
        progress: 0,
        totalPages: message.config.pagesPerStar * message.config.stars.length,
        currentPage: 0,
        currentStar: 1,
        reviews: [],
        error: null,
        config: message.config
      };
      sendResponse({ success: true });
      break;

    case 'START_TAB_COLLECTION':
      // New: Start collection using real tab navigation
      originTabId = sender.tab?.id;
      const { asin, config, productInfo } = message;
      
      console.log('[Background] Starting tab-based collection for:', asin);
      console.log('[Background] Speed mode:', config.speedMode || 'fast');
      
      // Run collection asynchronously
      collectReviewsWithTab(
        asin,
        config.stars,
        config.pagesPerStar,
        config.mediaType || 'all_formats',
        config.speedMode || 'fast',
        (progress) => {
          // Send progress updates to content script
          if (originTabId) {
            chrome.tabs.sendMessage(originTabId, {
              type: 'COLLECTION_PROGRESS',
              ...progress
            }).catch(() => {});
          }
        }
      ).then(async (reviews) => {
        console.log('[Background] Collection completed:', reviews.length, 'reviews');
        
        // Upload to backend
        const uploadData = {
          asin,
          title: productInfo.title,
          image_url: productInfo.imageUrl,
          marketplace: productInfo.marketplace || 'US',
          average_rating: productInfo.averageRating,
          price: productInfo.price,
          bullet_points: productInfo.bulletPoints,
          reviews
        };

        try {
          const result = await uploadReviews(uploadData);
          
          // Notify content script of success
          if (originTabId) {
            chrome.tabs.sendMessage(originTabId, {
              type: 'COLLECTION_COMPLETE',
              success: true,
              reviewCount: reviews.length,
              result
            }).catch((error) => {
              // Ignore connection errors (tab might be closed or extension reloaded)
              if (!error.message.includes('Receiving end') && !error.message.includes('Could not establish')) {
                console.warn('[Background] Error sending completion:', error.message);
              }
            });
          }
        } catch (error) {
          console.error('[Background] Upload error:', error);
          if (originTabId) {
            chrome.tabs.sendMessage(originTabId, {
              type: 'COLLECTION_ERROR',
              error: error.message
            }).catch((error) => {
              // Ignore connection errors
              if (!error.message.includes('Receiving end') && !error.message.includes('Could not establish')) {
                console.warn('[Background] Error sending error:', error.message);
              }
            });
          }
        }
      }).catch((error) => {
        console.error('[Background] Collection error:', error);
        if (originTabId) {
          chrome.tabs.sendMessage(originTabId, {
            type: 'COLLECTION_ERROR',
            error: error.message
          }).catch((sendError) => {
            // Ignore connection errors
            if (!sendError.message.includes('Receiving end') && !sendError.message.includes('Could not establish')) {
              console.warn('[Background] Error sending error:', sendError.message);
            }
          });
        }
      });

      sendResponse({ success: true, message: 'Collection started' });
      return true;

    case 'STOP_COLLECTION':
      // Stop ongoing collection
      if (collectorTabId) {
        chrome.tabs.remove(collectorTabId).catch(() => {});
        collectorTabId = null;
      }
      collectionState.isCollecting = false;
      sendResponse({ success: true });
      break;

    case 'UPDATE_PROGRESS':
      collectionState.currentPage = message.currentPage;
      collectionState.currentStar = message.currentStar;
      if (collectionState.config) {
        collectionState.progress = Math.round(
          ((message.currentStar - 1) * collectionState.config.pagesPerStar + message.currentPage) /
          (5 * collectionState.config.pagesPerStar) * 100
        );
      }
      collectionState.reviews = [...collectionState.reviews, ...message.reviews];
      sendResponse({ success: true });
      break;

    case 'COLLECTION_COMPLETE':
      collectionState.isCollecting = false;
      collectionState.progress = 100;
      sendResponse({ success: true });
      break;

    case 'COLLECTION_ERROR':
      collectionState.isCollecting = false;
      collectionState.error = message.error;
      sendResponse({ success: true });
      break;

    case 'UPLOAD_REVIEWS':
      uploadReviews(message.data)
        .then(result => {
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep message channel open for async response

    case 'RESET_STATE':
      collectionState = {
        isCollecting: false,
        currentAsin: null,
        progress: 0,
        totalPages: 0,
        currentPage: 0,
        currentStar: 0,
        reviews: [],
        error: null
      };
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep message channel open
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === collectorTabId) {
    collectorTabId = null;
  }
});

// Log when service worker starts
console.log('VOC-Master background service worker started');
