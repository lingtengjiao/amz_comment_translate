/**
 * VOC-Master Background Service Worker (Manifest V3)
 * 
 * Handles:
 * - Communication between popup and content scripts
 * - API calls to backend
 * - State management
 * - Review collection using real browser tabs (bypasses anti-scraping)
 * - User authentication (JWT token)
 */

// Backend API configuration
// 生产环境配置 - 使用 IP 地址（域名审核中）
const API_BASE_URL = 'http://115.191.30.209/api/v1';
const DASHBOARD_URL = 'http://115.191.30.209';  // 前端 Dashboard URL

// ==========================================
// 用户认证状态管理
// ==========================================
let authState = {
  isLoggedIn: false,
  token: null,
  user: null,
  tokenExpireAt: null,  // [NEW] Token 过期时间
  tokenIssuedAt: null   // [NEW] Token 签发时间
};

// [FIXED] 认证状态加载标志（防止竞态条件）
let authStateReady = false;
let authStateLoadPromise = null;

// [NEW] Token 过期检查定时器
let tokenExpiryCheckInterval = null;

// 从 chrome.storage 恢复认证状态
async function loadAuthState() {
  // 如果已经在加载中，返回同一个 Promise（防止重复加载）
  if (authStateLoadPromise) {
    return authStateLoadPromise;
  }
  
  authStateLoadPromise = (async () => {
    try {
      console.log('[Auth] Loading auth state from storage...');
      const result = await chrome.storage.local.get(['auth_token', 'auth_user', 'token_expire_at', 'token_issued_at']);
      if (result.auth_token) {
        authState.token = result.auth_token;
        authState.user = result.auth_user;
        authState.tokenExpireAt = result.token_expire_at;
        authState.tokenIssuedAt = result.token_issued_at;
        
        // [NEW] 检查 token 是否已过期
        if (authState.tokenExpireAt && Date.now() > authState.tokenExpireAt) {
          console.log('[Auth] ⚠️ Token expired, clearing auth state');
          await clearAuthState();
        } else {
          authState.isLoggedIn = true;
          console.log('[Auth] ✅ Restored auth state for:', authState.user?.email);
          
          // [NEW] 启动过期检查定时器
          startTokenExpiryCheck();
        }
      } else {
        console.log('[Auth] No saved auth state found');
      }
    } catch (e) {
      console.error('[Auth] ❌ Failed to load auth state:', e);
    } finally {
      authStateReady = true;
      console.log('[Auth] Auth state ready');
    }
  })();
  
  return authStateLoadPromise;
}

// 保存认证状态到 chrome.storage
async function saveAuthState() {
  try {
    await chrome.storage.local.set({
      auth_token: authState.token,
      auth_user: authState.user,
      token_expire_at: authState.tokenExpireAt,
      token_issued_at: authState.tokenIssuedAt
    });
  } catch (e) {
    console.error('[Auth] Failed to save auth state:', e);
  }
}

// 清除认证状态
async function clearAuthState() {
  authState = { 
    isLoggedIn: false, 
    token: null, 
    user: null,
    tokenExpireAt: null,
    tokenIssuedAt: null
  };
  
  // [NEW] 停止过期检查定时器
  stopTokenExpiryCheck();
  
  try {
    await chrome.storage.local.remove(['auth_token', 'auth_user', 'token_expire_at', 'token_issued_at']);
  } catch (e) {
    console.error('[Auth] Failed to clear auth state:', e);
  }
}

// 获取带认证头的 headers
function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (authState.token) {
    headers['Authorization'] = `Bearer ${authState.token}`;
  }
  return headers;
}

// [NEW] 解码 JWT Token 获取过期时间
function decodeJWTToken(token) {
  try {
    // JWT 格式: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('[Auth] Invalid JWT format');
      return null;
    }
    
    // Base64 解码 payload
    const payload = JSON.parse(atob(parts[1]));
    return payload;
  } catch (e) {
    console.error('[Auth] Failed to decode JWT:', e);
    return null;
  }
}

// [NEW] 启动 Token 过期检查定时器
function startTokenExpiryCheck() {
  // 清除旧的定时器
  stopTokenExpiryCheck();
  
  if (!authState.tokenExpireAt) {
    return;
  }
  
  // 每分钟检查一次
  tokenExpiryCheckInterval = setInterval(() => {
    const now = Date.now();
    const expireAt = authState.tokenExpireAt;
    const timeLeft = expireAt - now;
    
    // Token 已过期
    if (timeLeft <= 0) {
      console.log('[Auth] 🚨 Token expired');
      clearAuthState();
      notifyTokenExpired();
      stopTokenExpiryCheck();
      return;
    }
    
    // Token 即将过期（还剩 1 天）
    const oneDayMs = 24 * 60 * 60 * 1000;
    if (timeLeft < oneDayMs && !authState.expiryWarningShown) {
      const daysLeft = Math.ceil(timeLeft / oneDayMs);
      console.log(`[Auth] ⚠️ Token expires in ${daysLeft} day(s)`);
      notifyTokenExpiringSoon(daysLeft);
      authState.expiryWarningShown = true;
    }
  }, 60000); // 每分钟检查一次
  
  console.log('[Auth] Token expiry check started');
}

// [NEW] 停止 Token 过期检查定时器
function stopTokenExpiryCheck() {
  if (tokenExpiryCheckInterval) {
    clearInterval(tokenExpiryCheckInterval);
    tokenExpiryCheckInterval = null;
    console.log('[Auth] Token expiry check stopped');
  }
}

// [NEW] 通知 Token 已过期
function notifyTokenExpired() {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'VOC-Master',
    message: '登录已过期，请重新登录',
    priority: 2
  });
}

// [NEW] 通知 Token 即将过期
function notifyTokenExpiringSoon(daysLeft) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'VOC-Master',
    message: `您的登录将在 ${daysLeft} 天后过期，请注意续期`,
    priority: 1
  });
}

// 用户登录
async function login(email, password) {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || '登录失败');
    }
    
    const data = await response.json();
    
    // [NEW] 解码 Token 获取过期时间
    const tokenPayload = decodeJWTToken(data.access_token);
    if (tokenPayload) {
      // exp 是 Unix 时间戳（秒），转换为毫秒
      authState.tokenExpireAt = tokenPayload.exp * 1000;
      authState.tokenIssuedAt = tokenPayload.iat * 1000;
      
      const expireDate = new Date(authState.tokenExpireAt);
      console.log('[Auth] Token will expire at:', expireDate.toLocaleString());
    }
    
    authState.isLoggedIn = true;
    authState.token = data.access_token;
    authState.user = data.user;
    authState.expiryWarningShown = false;
    
    await saveAuthState();
    
    // [NEW] 启动过期检查
    startTokenExpiryCheck();
    
    console.log('[Auth] Login success:', authState.user.email);
    return { success: true, user: data.user };
  } catch (error) {
    console.error('[Auth] Login failed:', error.message);
    return { success: false, error: error.message };
  }
}

// 用户登出
async function logout() {
  await clearAuthState();
  console.log('[Auth] Logged out');
  return { success: true };
}

// 验证 Token
async function verifyToken() {
  if (!authState.token) return { valid: false, reason: 'no_token' };
  
  // [NEW] 先检查本地过期时间（避免不必要的 API 调用）
  if (authState.tokenExpireAt && Date.now() > authState.tokenExpireAt) {
    console.log('[Auth] Token expired locally');
    await clearAuthState();
    return { valid: false, reason: 'expired' };
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (!data.valid) {
      console.log('[Auth] Token invalid on server');
      await clearAuthState();
    }
    
    return data;
  } catch (e) {
    console.error('[Auth] Verify failed:', e);
    return { valid: false, reason: 'network_error' };
  }
}

// [FIXED] 启动时恢复认证状态（使用 await 等待完成）
(async () => {
  console.log('[Service Worker] Starting...');
  await loadAuthState();  // 等待认证状态加载完成
  console.log('[Service Worker] ✅ Ready');
})();

// [NEW] 监听 storage 变化，实现跨标签页状态同步
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.auth_token || changes.auth_user) {
      console.log('[Auth] Storage changed, reloading auth state...');
      authStateReady = false;
      authStateLoadPromise = null;
      loadAuthState();
    }
  }
});

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
 * 
 * [UPDATED] 使用新的高并发接口 /reviews/ingest/queue
 * - 极快响应（<50ms）
 * - 异步入库
 * - 携带用户认证信息
 */
async function uploadReviews(data, maxRetries = 3) {
  let lastError;
  
  // 选择 API 端点：优先使用高并发队列接口
  const useQueueAPI = true;  // 可配置切换
  const endpoint = useQueueAPI 
    ? `${API_BASE_URL}/reviews/ingest/queue`
    : `${API_BASE_URL}/reviews/ingest`;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Upload] Attempt ${attempt}/${maxRetries} to ${useQueueAPI ? 'queue' : 'direct'}...`);
      
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: getAuthHeaders(),  // [NEW] 添加认证头
          body: JSON.stringify(data)
        },
        useQueueAPI ? 15000 : 60000  // 队列模式超时更短
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${error}`);
      }

      const result = await response.json();
      console.log(`[Upload] Success on attempt ${attempt}`, useQueueAPI ? `(queued: ${result.batch_id})` : '');
      return result;
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

/**
 * Upload Rufus conversation data to backend
 */
async function uploadRufusConversation(data) {
  const endpoint = `${API_BASE_URL}/rufus/conversation`;
  
  try {
    console.log('[Rufus] Uploading conversation data:', data.asin);
    
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      },
      30000
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${error}`);
    }

    const result = await response.json();
    console.log('[Rufus] Upload successful:', result);
    return result;
  } catch (error) {
    console.error('[Rufus] Upload error:', error.message);
    throw error;
  }
}

// Media type URL parameters for Amazon reviews
// 两个互斥选项：全部评论 vs 仅带媒体的评论
const MEDIA_FILTERS = {
  'all_formats': 'all_contents',           // 全部评论 (Text, image, video)
  'media_reviews_only': 'media_reviews_only'  // 仅带媒体的评论 (Image and video reviews only)
};

/**
 * Get Amazon domain from marketplace code
 */
function getAmazonDomain(marketplace) {
  const domainMap = {
    'US': 'amazon.com',
    'UK': 'amazon.co.uk',
    'DE': 'amazon.de',
    'FR': 'amazon.fr',
    'JP': 'amazon.co.jp',
    'AU': 'amazon.com.au',
    'CA': 'amazon.ca'
  };
  return domainMap[marketplace] || 'amazon.com';
}

/**
 * Extract marketplace from URL
 */
function extractMarketplaceFromUrl(url) {
  if (!url) return 'US';
  if (url.includes('.co.uk')) return 'UK';
  if (url.includes('.de')) return 'DE';
  if (url.includes('.fr')) return 'FR';
  if (url.includes('.co.jp')) return 'JP';
  if (url.includes('.com.au')) return 'AU';
  if (url.includes('.ca')) return 'CA';
  return 'US';
}

/**
 * Build reviews page URL with cache-busting
 * @param {string} asin - Product ASIN
 * @param {number} star - Star rating (1-5)
 * @param {number} page - Page number
 * @param {string} mediaType - Media type filter
 * @param {string} marketplace - Marketplace code (US, UK, DE, FR, JP, AU)
 */
function buildReviewsUrl(asin, star, page = 1, mediaType = 'all_formats', marketplace = 'US') {
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
  
  const domain = getAmazonDomain(marketplace);
  const url = `https://www.${domain}/product-reviews/${asin}?${params.toString()}`;
  console.log(`[URL] Built: ${url} (marketplace: ${marketplace})`);
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
            // Review ID and Review URL
            let reviewId = el.id;
            let reviewUrl = null;
            
            if (!reviewId || !reviewId.startsWith('R')) {
              reviewId = el.getAttribute('data-review-id');
            }
            if (!reviewId || !reviewId.startsWith('R')) {
              const reviewLink = el.querySelector('a[href*="/gp/customer-reviews/"]');
              if (reviewLink) {
                const match = reviewLink.href.match(/\/gp\/customer-reviews\/([A-Z0-9]+)/);
                if (match) {
                  reviewId = match[1];
                  // 同时获取完整的评论链接
                  reviewUrl = reviewLink.href;
                }
              }
            }
            if (!reviewId || !reviewId.startsWith('R')) {
              reviewId = `R${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            }
            
            // 如果没有抓取到评论链接，尝试其他方式或生成默认链接
            if (!reviewUrl) {
              // 尝试从评论标题链接获取
              const titleLink = el.querySelector('[data-hook="review-title"]');
              if (titleLink && titleLink.href && titleLink.href.includes('/gp/customer-reviews/')) {
                reviewUrl = titleLink.href;
              } else if (reviewId && reviewId.startsWith('R')) {
                // 根据 reviewId 生成默认链接（使用当前页面的域名）
                const origin = window.location.origin;
                reviewUrl = `${origin}/gp/customer-reviews/${reviewId}`;
              }
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

            // ========== 变体信息提取 ==========
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
            // 调试日志
            if (index < 3) {
              console.log(`[Page] Review ${index} variant:`, variant);
            }

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
                // 变体信息
                variant: variant,
                // 新增媒体字段
                has_images: hasImages,
                has_video: hasVideo,
                image_urls: imageUrls.length > 0 ? imageUrls : null,
                video_url: videoUrl,
                // 评论原文链接
                review_url: reviewUrl
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
    
    // 🔍 调试：打印前3条评论的 variant 值
    if (result.reviews.length > 0) {
      console.log('[Extract] === VARIANT DEBUG ===');
      result.reviews.slice(0, 3).forEach((r, i) => {
        console.log(`[Extract] Review ${i}: id=${r.review_id}, variant=${r.variant}`);
      });
      console.log('[Extract] === END VARIANT DEBUG ===');
    }
    
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
 * 
 * [UPDATED] 流式上传模式 (Stream Upload Mode)
 * - 每采集一页，立即上传到后端
 * - 后端接收后立即触发翻译
 * - 用户可以"边采边看"翻译结果
 */
async function collectReviewsWithTab(asin, stars, pagesPerStar, mediaType, speedMode, sendProgress, initialProductInfo = null, workflowMode = 'one_step_insight') {
  const allReviews = [];
  const seenReviewIds = new Set();
  let originalTabId = null;
  let totalUploaded = 0;  // [NEW] 累计上传计数
  // [UPDATED] 优先使用传入的 productInfo（已包含 categories），否则后面自动爬取
  let scrapedProductInfo = initialProductInfo;
  
  // [NEW] 记录工作流模式
  console.log(`[Collector] Workflow mode: ${workflowMode}`);
  
  // [NEW] 确定 marketplace（先尝试从 productInfo，否则从 originalTabId 获取）
  let marketplace = 'US';
  if (scrapedProductInfo?.marketplace) {
    marketplace = scrapedProductInfo.marketplace;
    console.log(`[Collector] Marketplace from productInfo: ${marketplace}`);
  }
  
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
        
        // [NEW] 如果还没有 marketplace，从原始标签页 URL 获取
        if (!scrapedProductInfo?.marketplace && currentTab.url) {
          marketplace = extractMarketplaceFromUrl(currentTab.url);
          console.log(`[Collector] Marketplace from original tab: ${marketplace}`);
        }
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
    
    // [UPDATED] 🔥 如果已有产品信息（从 content.js 传入），跳过爬取；否则爬取
    if (scrapedProductInfo && scrapedProductInfo.title) {
      console.log('[Collector] ✅ Using pre-scraped product info:', scrapedProductInfo.title?.substring(0, 50));
      console.log('[Collector] Categories count:', scrapedProductInfo.categories?.length || 0);
    } else {
      console.log('[Collector] Fetching product info for stream mode...');
      try {
        const domain = getAmazonDomain(marketplace);
        const productPageUrl = `https://www.${domain}/dp/${asin}`;
        await chrome.tabs.update(collectorTabId, { url: productPageUrl });
        await waitForTabLoad(collectorTabId, 30000);
        await new Promise(r => setTimeout(r, timing.firstPageWait));
        
        const infoResults = await chrome.scripting.executeScript({
          target: { tabId: collectorTabId },
          func: () => {
            const title = document.querySelector('#productTitle')?.textContent?.trim() ||
                          document.querySelector('.product-title-word-break')?.textContent?.trim() ||
                          document.title.split(':')[0].trim();
            const imageElement = document.querySelector('#landingImage') ||
                                 document.querySelector('#imgBlkFront');
            const imageUrl = imageElement?.src || null;
            let averageRating = null;
            const ratingEl = document.querySelector('#acrPopover .a-icon-alt');
            if (ratingEl) {
              const match = ratingEl.textContent?.match(/(\d+\.?\d*)/);
              if (match) averageRating = parseFloat(match[1]);
            }
            let price = null;
            const priceEl = document.querySelector('.a-price .a-offscreen');
            if (priceEl) price = priceEl.textContent?.trim();
            const bulletPoints = [];
            document.querySelectorAll('#feature-bullets .a-list-item').forEach(el => {
              const text = el.textContent?.trim();
              if (text && text.length > 5 && !bulletPoints.includes(text)) bulletPoints.push(text);
            });
            
            // [NEW] 获取产品类目面包屑
            const categories = [];
            const breadcrumbSelectors = [
              '#wayfinding-breadcrumbs_feature_div ul.a-unordered-list li a',
              '#wayfinding-breadcrumbs_container a',
              '.a-breadcrumb a'
            ];
            for (const selector of breadcrumbSelectors) {
              const categoryLinks = document.querySelectorAll(selector);
              if (categoryLinks.length > 0) {
                categoryLinks.forEach(link => {
                  const name = link.textContent?.trim();
                  const url = link.getAttribute('href');
                  if (name && url && !name.match(/^(\s|›|>)*$/)) {
                    categories.push({
                      name: name,
                      url: url.startsWith('http') ? url : `${window.location.origin}${url}`
                    });
                  }
                });
                if (categories.length > 0) break;
              }
            }
            
            const url = window.location.href;
            let detectedMarketplace = 'US';
            if (url.includes('.co.uk')) detectedMarketplace = 'UK';
            else if (url.includes('.de')) detectedMarketplace = 'DE';
            else if (url.includes('.fr')) detectedMarketplace = 'FR';
            else if (url.includes('.co.jp')) detectedMarketplace = 'JP';
            else if (url.includes('.com.au')) detectedMarketplace = 'AU';
            else if (url.includes('.ca')) detectedMarketplace = 'CA';
            return { title, imageUrl, averageRating, price, bulletPoints, categories, marketplace: detectedMarketplace };
          }
        });
        
        if (infoResults[0]?.result) {
          scrapedProductInfo = infoResults[0].result;
          marketplace = scrapedProductInfo.marketplace || marketplace; // 更新 marketplace
          console.log('[Collector] ✅ Product info scraped:', scrapedProductInfo.title?.substring(0, 50));
          console.log('[Collector] Marketplace detected:', marketplace);
        }
      } catch (e) {
        console.warn('[Collector] Failed to scrape product info:', e.message);
        // 使用默认信息，不阻塞采集
        scrapedProductInfo = { title: `Product ${asin}`, marketplace: 'US' };
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
            const url = buildReviewsUrl(asin, star, 1, mediaType, marketplace);
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

        // De-duplicate and collect new reviews for this page
        let newCount = 0;
        const pageNewReviews = [];  // [NEW] 当前页的新评论（用于流式上传）
        
        for (const review of reviews) {
          if (!seenReviewIds.has(review.review_id)) {
            seenReviewIds.add(review.review_id);
            review.rating = star; // Ensure rating matches the star filter
            allReviews.push(review);
            pageNewReviews.push(review);  // [NEW] 记录新评论
            newCount++;
          }
        }

        console.log(`[Collector] Page ${page}: ${newCount} new, ${reviews.length - newCount} duplicates, total: ${allReviews.length}`);
        
        // [NEW] 🔥 流式上传：每页采集后立即上传新评论
        if (pageNewReviews.length > 0) {
          // 🔍 调试：检查上传前的 variant 数据
          console.log(`[Stream] === UPLOAD DEBUG (page ${page}) ===`);
          pageNewReviews.slice(0, 2).forEach((r, i) => {
            console.log(`[Stream] Review ${i}: id=${r.review_id}, variant=${r.variant}`);
          });
          
          try {
            const streamBatchData = {
              asin: asin,
              title: scrapedProductInfo?.title || "Unknown",
              image_url: scrapedProductInfo?.imageUrl,
              marketplace: scrapedProductInfo?.marketplace || 'US',
              average_rating: scrapedProductInfo?.averageRating,
              price: scrapedProductInfo?.price,
              bullet_points: scrapedProductInfo?.bulletPoints,
              categories: scrapedProductInfo?.categories,  // [NEW] 产品类目
              reviews: pageNewReviews,  // ⚠️ 仅传输当前页的新评论
              is_stream: true           // 标记为流式传输
            };
            
            await uploadReviews(streamBatchData, 2);  // 重试次数降低，快速失败
            totalUploaded += pageNewReviews.length;
            console.log(`[Stream] ✅ 已上传第 ${page} 页，${pageNewReviews.length} 条新评论 (累计: ${totalUploaded})`);
            
          } catch (uploadErr) {
            console.error(`[Stream] ❌ 上传失败 (page ${page}):`, uploadErr.message);
            // 失败不阻塞采集，继续下一页
          }
        }

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
    
    // [FIXED] 🚀 采集完成后触发全自动分析（带重试机制，优化响应处理）
    // [FIXED] 不再使用 sendProgress，而是直接发送 COLLECTION_COMPLETE 消息
    // 避免与 .then() 中的 COLLECTION_COMPLETE 冲突
    if (allReviews.length >= 10) {
      // 等待队列消费完成后再触发（最多等待30秒，每3秒重试一次，更快响应）
      const triggerAutoAnalysis = async (maxRetries = 10, delay = 3000) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[Collector] 🚀 Triggering auto analysis (attempt ${attempt}/${maxRetries}), mode: ${workflowMode}...`);
            const response = await fetch(`${API_BASE_URL}/products/${asin}/collection-complete?workflow_mode=${workflowMode}`, {
              method: 'POST',
              headers: getAuthHeaders()
            });
            
            if (response.ok) {
              const result = await response.json();
              console.log('[Collector] ✅ Auto analysis response:', result.status);
              
              // 处理不同的响应状态
              let message = `采集完成！共 ${allReviews.length} 条评论`;
              if (result.status === 'started') {
                message = `采集完成！已触发自动分析，共 ${allReviews.length} 条评论`;
              } else if (result.status === 'already_running') {
                message = `采集完成！分析任务进行中，共 ${allReviews.length} 条评论`;
              }
              
              // [FIXED] 不需要额外发送消息，让 .then() 中的 COLLECTION_COMPLETE 处理
              console.log(`[Collector] ✅ Analysis triggered: ${message}`);
              return true;
            } else if (response.status === 404) {
              // 产品尚未入库，等待后重试
              console.log(`[Collector] ⏳ Product not ready yet, waiting ${delay/1000}s before retry...`);
              if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, delay));
              }
            } else if (response.status === 400) {
              // 评论数不足等业务错误，直接返回成功（采集本身完成了）
              const error = await response.json().catch(() => ({}));
              console.log('[Collector] ⚠️ Analysis skipped:', error.detail || 'Business error');
              return true;
            } else {
              console.warn('[Collector] ⚠️ Auto analysis trigger failed:', response.status);
              // 不阻塞，采集已完成
              return true;
            }
          } catch (err) {
            console.error(`[Collector] ❌ Auto analysis trigger error (attempt ${attempt}):`, err.message);
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, delay));
            }
          }
        }
        // 重试失败，但采集已完成
        console.error('[Collector] ❌ Auto analysis trigger failed after all retries, but collection is done');
        return false;
      };
      
      // [FIXED] 等待 triggerAutoAnalysis 完成，确保 .then() 中的 COLLECTION_COMPLETE 是最后发送的
      await triggerAutoAnalysis();
    } else {
      console.log(`[Collector] ⚠️ Only ${allReviews.length} reviews, skipping auto analysis (need >= 10)`);
    }
    
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
      
      // [NEW] 读取工作流模式
      const workflowMode = config.workflowMode || 'one_step_insight';
      
      console.log('[Background] Starting tab-based collection for:', asin);
      console.log('[Background] Speed mode:', config.speedMode || 'fast');
      console.log('[Background] Workflow mode:', workflowMode);
      console.log('[Background] ProductInfo categories:', productInfo?.categories?.length || 0);
      
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
        },
        productInfo,  // [NEW] 传入 productInfo（包含 categories）
        workflowMode  // [NEW] 传入工作流模式
      ).then(async (reviews) => {
        console.log('[Background] Collection completed:', reviews.length, 'reviews');
        
        // [UPDATED] 🔥 流式模式：数据已在采集过程中逐页上传
        // 这里只需要发送完成通知，不需要再次上传全部数据
        console.log('[Background] Stream mode: data already uploaded during collection');
        
        // 直接发送完成通知（数据已经流式上传完毕）
        if (originTabId) {
          chrome.tabs.sendMessage(originTabId, {
            type: 'COLLECTION_COMPLETE',
            success: true,
            reviewCount: reviews.length,
            result: { 
              success: true, 
              message: `流式采集完成: ${reviews.length} 条评论`,
              reviews_received: reviews.length
            }
          }).catch((error) => {
            if (!error.message.includes('Receiving end') && !error.message.includes('Could not establish')) {
              console.warn('[Background] Error sending completion:', error.message);
            }
          });
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
    
    // ==========================================
    // 认证相关消息处理
    // ==========================================
    case 'AUTH_LOGIN':
      login(message.email, message.password)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;  // 保持异步通道
    
    case 'AUTH_LOGOUT':
      logout()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'AUTH_GET_STATE':
      // [FIXED] 确保认证状态已加载完成再返回（防止竞态条件）
      if (!authStateReady) {
        console.log('[Auth] State not ready, waiting for load...');
        loadAuthState()
          .then(() => {
            console.log('[Auth] State loaded, returning:', authState.isLoggedIn);
            sendResponse({
              success: true,
              isLoggedIn: authState.isLoggedIn,
              user: authState.user
            });
          })
          .catch(error => {
            console.error('[Auth] Load failed:', error);
            sendResponse({
              success: true,
              isLoggedIn: false,
              user: null
            });
          });
        return true;  // 保持异步通道
      }
      
      // 状态已就绪，直接返回
      sendResponse({
        success: true,
        isLoggedIn: authState.isLoggedIn,
        user: authState.user
      });
      break;
    
    case 'AUTH_VERIFY':
      verifyToken()
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ valid: false, error: error.message }));
      return true;

    // ==========================================
    // Rufus 对话消息处理
    // ==========================================
    case 'UPLOAD_RUFUS_CONVERSATION':
      uploadRufusConversation(message.data)
        .then(result => {
          sendResponse({ success: true, data: result });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep message channel open for async response

    // ==========================================
    // [NEW] 搜索结果页批量分析消息处理
    // ==========================================
    case 'BATCH_INSIGHT_ANALYSIS':
      handleBatchInsightAnalysis(message.products, message.marketplace)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'COMPARISON_ANALYSIS':
      handleComparisonAnalysis(message.products, message.marketplace)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'MARKET_INSIGHT_ANALYSIS':
      handleMarketInsightAnalysis(message.products, message.marketplace)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    
    case 'SAVE_TO_COLLECTION':
      handleSaveToCollection(message.keyword, message.marketplace, message.products)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

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

// ==========================================
// [批量任务队列系统] - 支持网页端触发自动化采集
// ==========================================

let taskQueue = [];
let isQueueRunning = false;
let queueStats = {
  completed: 0,
  failed: 0,
  total: 0
};

/**
 * 监听来自外部网页的消息 (onMessageExternal)
 * 允许前端网站通过 chrome.runtime.sendMessage 发送任务
 */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[External] Received message from:', sender.url);
  console.log('[External] Message type:', message.type);

  // 安全检查：校验发送者域名
  // [FIXED] 包含本地开发环境和生产环境
  const allowedOrigins = [
    'http://localhost:',
    'http://127.0.0.1:',
    'http://115.191.30.209',  // 生产环境
    'https://voc-master.com'  // 未来的正式域名
  ];
  
  const isAllowed = allowedOrigins.some(origin => sender.url?.startsWith(origin));
  if (!isAllowed) {
    console.warn('[External] Unauthorized origin:', sender.url);
    sendResponse({ success: false, error: 'Unauthorized domain' });
    return;
  }

  switch (message.type) {
    case 'BATCH_START_EXTERNAL':
      handleBatchStart(message, sendResponse);
      break;
    
    case 'GET_QUEUE_STATUS':
      sendResponse({
        success: true,
        queueLength: taskQueue.length,
        isRunning: isQueueRunning,
        stats: queueStats,
        currentTask: taskQueue[0] || null
      });
      break;
    
    case 'CLEAR_QUEUE':
      taskQueue = [];
      isQueueRunning = false;
      sendResponse({ success: true, message: 'Queue cleared' });
      break;
    
    case 'PING':
      // 用于检测插件是否可用
      sendResponse({ 
        success: true, 
        version: chrome.runtime.getManifest().version,
        extensionId: chrome.runtime.id,
        message: 'VOC-Master Extension is active' 
      });
      break;
    
    // ==========================================
    // 网页认证消息处理
    // ==========================================
    case 'WEB_AUTH_LOGIN':
      // 网页登录成功，同步到插件
      console.log('[External] Web login received for:', message.user?.email);
      authState.isLoggedIn = true;
      authState.token = message.token;
      authState.user = message.user;
      saveAuthState().then(() => {
        sendResponse({ success: true, message: 'Auth synced to extension' });
      });
      return true;  // 保持异步通道
    
    case 'WEB_AUTH_LOGOUT':
      // 网页登出，同步到插件
      console.log('[External] Web logout received');
      clearAuthState().then(() => {
        sendResponse({ success: true, message: 'Logged out from extension' });
      });
      return true;
    
    case 'GET_AUTH_STATE':
      // 网页查询插件的登录状态
      sendResponse({
        success: true,
        isLoggedIn: authState.isLoggedIn,
        user: authState.user,
        extensionId: chrome.runtime.id
      });
      break;
    
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return true; // 保持异步通道
});

/**
 * 处理批量采集请求
 * [FIXED] 添加防重逻辑，避免相同 ASIN 被多次添加到队列
 */
function handleBatchStart(message, sendResponse) {
  const { asins, config } = message;

  if (!asins || !Array.isArray(asins) || asins.length === 0) {
    sendResponse({ success: false, error: 'No valid ASINs provided' });
    return;
  }

  // [FIXED] 记录接收到的配置（包括 workflowMode）
  console.log('[Queue] Received config:', config);
  console.log('[Queue] Workflow mode:', config?.workflowMode || 'one_step_insight (default)');
  
  // 将新任务加入队列
  const defaultConfig = {
    stars: [1, 2, 3, 4, 5],
    pagesPerStar: 5,
    mediaType: 'all_formats',
    speedMode: 'fast',
    workflowMode: 'one_step_insight'  // [FIXED] 添加默认工作流模式
  };
  
  // [FIXED] 获取当前队列中已存在的 ASIN（包括正在运行的任务）
  const existingAsins = new Set(taskQueue.map(t => t.asin));
  
  // [FIXED] 过滤掉已经在队列中的 ASIN
  const uniqueAsins = asins.filter(asin => {
    const trimmedAsin = asin.trim();
    if (existingAsins.has(trimmedAsin)) {
      console.log(`[Queue] ⚠️ ASIN ${trimmedAsin} already in queue, skipping`);
      return false;
    }
    return true;
  });
  
  if (uniqueAsins.length === 0) {
    console.log('[Queue] All ASINs already in queue');
    sendResponse({ 
      success: true, 
      queueLength: taskQueue.length,
      addedCount: 0,
      message: '这些产品已在采集队列中，无需重复添加' 
    });
    return;
  }
  
  const newTasks = uniqueAsins.map(asin => ({
    asin: asin.trim(),
    config: { ...defaultConfig, ...config },
    addedAt: Date.now(),
    status: 'pending'
  }));

  taskQueue = [...taskQueue, ...newTasks];
  queueStats.total += newTasks.length;
  
  console.log(`[Queue] Added ${newTasks.length} tasks. Total pending: ${taskQueue.length}`);

  // 如果队列当前没在跑，启动处理器
  if (!isQueueRunning) {
    processQueue();
  }

  const skippedCount = asins.length - uniqueAsins.length;
  const responseMessage = skippedCount > 0 
    ? `已添加 ${newTasks.length} 个任务到队列（${skippedCount} 个已存在，跳过）`
    : `已添加 ${newTasks.length} 个任务到队列`;

  sendResponse({ 
    success: true, 
    queueLength: taskQueue.length,
    addedCount: newTasks.length,
    skippedCount: skippedCount,
    message: responseMessage
  });
}

/**
 * 队列处理引擎
 */
async function processQueue() {
  if (taskQueue.length === 0) {
    console.log('[Queue] ✅ All tasks completed!');
    console.log(`[Queue] Stats: completed=${queueStats.completed}, failed=${queueStats.failed}`);
    isQueueRunning = false;
    return;
  }

  isQueueRunning = true;
  const currentTask = taskQueue.shift();
  currentTask.status = 'running';
  
  console.log(`[Queue] ========================================`);
  console.log(`[Queue] Processing: ${currentTask.asin}`);
  console.log(`[Queue] Remaining: ${taskQueue.length}`);
  console.log(`[Queue] ========================================`);

  try {
    // [FIXED] 读取工作流模式
    const workflowMode = currentTask.config.workflowMode || 'one_step_insight';
    console.log(`[Queue] Workflow mode: ${workflowMode}`);
    
    // 使用自动抓取产品信息模式采集评论
    const reviews = await collectReviewsWithTabAuto(
      currentTask.asin,
      currentTask.config.stars,
      currentTask.config.pagesPerStar,
      currentTask.config.mediaType,
      currentTask.config.speedMode,
      (progress) => {
        console.log(`[Queue Progress] ${currentTask.asin}: ${progress.message}`);
      },
      workflowMode  // [FIXED] 传递工作流模式
    );

    console.log(`[Queue] Task ${currentTask.asin} Success. Reviews: ${reviews.length}`);
    queueStats.completed++;

  } catch (error) {
    console.error(`[Queue] Task ${currentTask.asin} Failed:`, error.message);
    queueStats.failed++;
    
    // 可选：失败重试逻辑（最多重试1次）
    if (!currentTask.retried) {
      currentTask.retried = true;
      currentTask.status = 'pending';
      taskQueue.push(currentTask); // 放回队列尾部
      console.log(`[Queue] Task ${currentTask.asin} will be retried later`);
    }
  }

  // 任务间隔 (防风控关键)
  // 每个产品采集完后，休息 10-20 秒再跑下一个
  const cooldown = Math.floor(Math.random() * 10000) + 10000;
  console.log(`[Queue] Cooling down for ${Math.round(cooldown / 1000)}s...`);
  await new Promise(r => setTimeout(r, cooldown));

  // 递归处理下一个
  processQueue();
}

/**
 * 自动模式采集 - 从 ASIN 开始，自动抓取产品信息
 * 与 collectReviewsWithTab 类似，但会自动获取产品标题和图片
 */
async function collectReviewsWithTabAuto(asin, stars, pagesPerStar, mediaType, speedMode, sendProgress, workflowMode = 'one_step_insight') {
  const allReviews = [];
  const seenReviewIds = new Set();
  let scrapedProductInfo = null; // 存储自动抓取的产品信息
  let marketplace = 'US'; // 默认 marketplace
  
  // 使用与 collectReviewsWithTab 相同的速度配置
  const SPEED_CONFIG = {
    fast: {
      firstPageWait: 1500,
      scrollWait: 400,
      nextPageWait: 300,
      pageBetweenMin: 400,
      pageBetweenRandom: 400,
      starBetweenMin: 600,
      starBetweenRandom: 600,
      domPollInterval: 150,
      domUpdateExtraWait: 200
    },
    stable: {
      firstPageWait: 4000,
      scrollWait: 1500,
      nextPageWait: 2500,
      pageBetweenMin: 2000,
      pageBetweenRandom: 1500,
      starBetweenMin: 2500,
      starBetweenRandom: 1500,
      domPollInterval: 300,
      domUpdateExtraWait: 500
    }
  };
  
  const timing = SPEED_CONFIG[speedMode] || SPEED_CONFIG.fast;
  let autoCollectorTabId = null;
  
  // [NEW] 记录工作流模式
  console.log(`[AutoCollector] Workflow mode: ${workflowMode}`);
  
  console.log('[AutoCollector] ========================================');
  console.log('[AutoCollector] Starting AUTO collection for ASIN:', asin);
  console.log('[AutoCollector] ========================================');
  
  try {
    // 创建一个新标签页
    const tab = await chrome.tabs.create({ 
      url: 'about:blank',
      active: false // 后台运行，不抢焦点
    });
    autoCollectorTabId = tab.id;
    console.log('[AutoCollector] Created tab:', autoCollectorTabId);

    // ========================================
    // 🔥 Step 1: 先访问产品详情页，抓取完整产品信息
    // ========================================
    sendProgress({
      star: 0,
      page: 0,
      pagesPerStar,
      totalReviews: 0,
      progress: 0,
      message: `正在获取产品信息...`
    });
    
    // 尝试从 ASIN 推断 marketplace（如果可能），否则使用默认值
    // 注意：这里使用默认 US，实际 marketplace 会在抓取产品信息时从页面 URL 检测
    const domain = getAmazonDomain(marketplace);
    const productPageUrl = `https://www.${domain}/dp/${asin}`;
    console.log('[AutoCollector] Step 1 - Loading product page:', productPageUrl);
    
    await chrome.tabs.update(autoCollectorTabId, { url: productPageUrl });
    await waitForTabLoad(autoCollectorTabId, 45000);
    await new Promise(r => setTimeout(r, timing.firstPageWait));
    
    // 从产品详情页抓取完整信息
    try {
      console.log('[AutoCollector] Scraping full product info from product page...');
      const infoResults = await chrome.scripting.executeScript({
        target: { tabId: autoCollectorTabId },
        func: () => {
          // === 抓取产品标题 ===
          const title = document.querySelector('#productTitle')?.textContent?.trim() ||
                        document.querySelector('.product-title-word-break')?.textContent?.trim() ||
                        document.title.split(':')[0].trim();

          // === 抓取产品图片 ===
          const imageElement = document.querySelector('#landingImage') ||
                               document.querySelector('#imgBlkFront') ||
                               document.querySelector('.a-dynamic-image');
          const imageUrl = imageElement?.src || null;

          // === 抓取平均评分 ===
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

          // === 抓取价格 ===
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

          // === 抓取五点描述 (Bullet Points) ===
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

          // [NEW] === 抓取产品类目面包屑 ===
          const categories = [];
          const breadcrumbSelectors = [
            '#wayfinding-breadcrumbs_feature_div ul.a-unordered-list li a',
            '#wayfinding-breadcrumbs_container a',
            '.a-breadcrumb a'
          ];
          for (const selector of breadcrumbSelectors) {
            const categoryLinks = document.querySelectorAll(selector);
            if (categoryLinks.length > 0) {
              categoryLinks.forEach(link => {
                const name = link.textContent?.trim();
                const url = link.getAttribute('href');
                if (name && url && !name.match(/^(\s|›|>)*$/)) {
                  categories.push({
                    name: name,
                    url: url.startsWith('http') ? url : `${window.location.origin}${url}`
                  });
                }
              });
              if (categories.length > 0) break;
            }
          }

          // === 判断市场 ===
          const url = window.location.href;
          let detectedMarketplace = 'US';
          if (url.includes('.co.uk')) detectedMarketplace = 'UK';
          else if (url.includes('.de')) detectedMarketplace = 'DE';
          else if (url.includes('.fr')) detectedMarketplace = 'FR';
          else if (url.includes('.co.jp')) detectedMarketplace = 'JP';
          else if (url.includes('.com.au')) detectedMarketplace = 'AU';
          else if (url.includes('.ca')) detectedMarketplace = 'CA';

          return { title, imageUrl, averageRating, price, bulletPoints, categories, marketplace: detectedMarketplace };
        }
      });
      
      if (infoResults[0]?.result) {
        scrapedProductInfo = infoResults[0].result;
        marketplace = scrapedProductInfo.marketplace || marketplace; // 更新 marketplace
        console.log('[AutoCollector] ✅ Scraped full product info:', {
          title: scrapedProductInfo.title,
          hasImage: !!scrapedProductInfo.imageUrl,
          averageRating: scrapedProductInfo.averageRating,
          price: scrapedProductInfo.price,
          bulletPointsCount: scrapedProductInfo.bulletPoints?.length || 0,
          categoriesCount: scrapedProductInfo.categories?.length || 0,
          marketplace: marketplace
        });
      }
    } catch (e) {
      console.warn('[AutoCollector] Failed to scrape product info from product page:', e.message);
    }

    // 短暂休息后开始采集评论
    await new Promise(r => setTimeout(r, 1000));
    
    sendProgress({
      star: 0,
      page: 0,
      pagesPerStar,
      totalReviews: 0,
      progress: 2,
      message: `产品信息获取完成，开始采集评论...`
    });

    // ========================================
    // 🔥 Step 2: 开始采集评论
    // ========================================
    for (const star of stars) {
      console.log(`[AutoCollector] Starting star ${star} collection`);
      let consecutiveNoNew = 0;
      
      sendProgress({
        star,
        page: 0,
        pagesPerStar,
        totalReviews: allReviews.length,
        progress: Math.round((stars.indexOf(star) / stars.length) * 100),
        message: `开始采集 ${star} 星评论...`
      });
      
      for (let page = 1; page <= pagesPerStar; page++) {
        if (!autoCollectorTabId) {
          throw new Error('Collection cancelled');
        }

        let reviews = [];
        
        try {
          if (page === 1) {
            const url = buildReviewsUrl(asin, star, 1, mediaType, marketplace);
            console.log(`[AutoCollector] Page 1 - Navigating to:`, url);
            
            await chrome.tabs.update(autoCollectorTabId, { url });
            await waitForTabLoad(autoCollectorTabId, 45000);
            await new Promise(r => setTimeout(r, timing.firstPageWait));
            
            // 滚动触发懒加载
            try {
              await chrome.scripting.executeScript({
                target: { tabId: autoCollectorTabId },
                func: () => {
                  window.scrollTo({ top: 800, behavior: 'instant' });
                }
              });
              await new Promise(r => setTimeout(r, timing.scrollWait));
            } catch (e) {}
            
          } else {
            // 点击 Next 按钮
            const clicked = await clickNextPage(autoCollectorTabId, timing);
            if (!clicked) {
              console.log(`[AutoCollector] No next page for star ${star}`);
              break;
            }
            await new Promise(r => setTimeout(r, timing.nextPageWait));
          }
          
          // 提取评论
          const result = await extractReviewsFromTab(autoCollectorTabId);
          reviews = result.reviews;
          console.log(`[AutoCollector] Page ${page}: Found ${reviews.length} reviews`);
          
        } catch (err) {
          console.error(`[AutoCollector] Page ${page} Error:`, err.message);
        }
        
        // 去重并收集新评论
        let newCount = 0;
        const pageNewReviews = [];  // [NEW] 当前页的新评论
        for (const review of reviews) {
          if (!seenReviewIds.has(review.review_id)) {
            seenReviewIds.add(review.review_id);
            review.rating = star;
            allReviews.push(review);
            pageNewReviews.push(review);  // [NEW] 加入当前页新评论列表
            newCount++;
          }
        }
        
        console.log(`[AutoCollector] Page ${page}: ${newCount} new, total: ${allReviews.length}`);
        
        // [NEW] 🔥 流式上传：每页采集后立即上传新评论
        if (pageNewReviews.length > 0) {
          try {
            const streamBatchData = {
              asin: asin,
              title: scrapedProductInfo?.title || `Product ${asin}`,
              image_url: scrapedProductInfo?.imageUrl,
              marketplace: scrapedProductInfo?.marketplace || 'US',
              average_rating: scrapedProductInfo?.averageRating,
              price: scrapedProductInfo?.price,
              bullet_points: scrapedProductInfo?.bulletPoints,
              categories: scrapedProductInfo?.categories,  // [NEW] 产品类目
              reviews: pageNewReviews,  // ⚠️ 仅传输当前页的新评论
              is_stream: true           // 标记为流式传输
            };
            
            await uploadReviews(streamBatchData, 2);  // 重试次数降低，快速失败
            console.log(`[AutoCollector] [Stream] ✅ 已上传第 ${page} 页，${pageNewReviews.length} 条新评论`);
            
          } catch (uploadErr) {
            console.error(`[AutoCollector] [Stream] ❌ 上传失败 (page ${page}):`, uploadErr.message);
            // 失败不阻塞采集，继续下一页
          }
        }
        
        // 进度更新
        const starIndex = stars.indexOf(star);
        const starProgress = page / pagesPerStar;
        const totalProgress = Math.min(Math.round(((starIndex + starProgress) / stars.length) * 100), 99);
        
        sendProgress({
          star,
          page,
          pagesPerStar,
          totalReviews: allReviews.length,
          progress: totalProgress,
          message: `正在采集 ${star} 星评论... 第 ${page}/${pagesPerStar} 页`
        });
        
        // 早停检测
        if (newCount === 0 && reviews.length > 0) {
          consecutiveNoNew++;
          if (consecutiveNoNew >= 3) {
            console.log(`[AutoCollector] Star ${star}: No new reviews for 3 pages, moving on`);
            break;
          }
        } else if (newCount > 0) {
          consecutiveNoNew = 0;
        }
        
        // 页面间延迟
        if (page < pagesPerStar) {
          const delay = timing.pageBetweenMin + Math.random() * timing.pageBetweenRandom;
          await new Promise(r => setTimeout(r, delay));
        }
      }
      
      // 星级间延迟
      if (stars.indexOf(star) < stars.length - 1) {
        const delay = timing.starBetweenMin + Math.random() * timing.starBetweenRandom;
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // 关闭采集标签页
    if (autoCollectorTabId) {
      try {
        await chrome.tabs.remove(autoCollectorTabId);
      } catch (e) {}
      autoCollectorTabId = null;
    }

    console.log(`[AutoCollector] ✅ Collection complete: ${allReviews.length} reviews (已流式上传)`);
    
    // [UPDATED] 数据已在采集过程中流式上传，无需再次上传
    // 直接触发全自动分析
    if (allReviews.length > 0) {
      console.log('[AutoCollector] 📊 流式上传统计:', {
        asin,
        title: scrapedProductInfo?.title,
        totalReviews: allReviews.length,
        message: '数据已在采集过程中逐页上传，翻译任务已并行启动'
      });
      
      // [FIXED] 🚀 采集完成后触发全自动分析（优化响应处理）
      if (allReviews.length >= 10) {
        // 等待队列消费完成后再触发（最多等待30秒，每3秒重试一次，更快响应）
        const triggerAutoAnalysisWithRetry = async (maxRetries = 10, delay = 3000) => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              // [FIXED] 使用传入的 workflowMode 参数
              console.log(`[AutoCollector] 🚀 Triggering auto analysis (attempt ${attempt}/${maxRetries}), mode: ${workflowMode}...`);
              const response = await fetch(`${API_BASE_URL}/products/${asin}/collection-complete?workflow_mode=${workflowMode}`, {
                method: 'POST',
                headers: getAuthHeaders()
              });
              
              if (response.ok) {
                const result = await response.json();
                console.log('[AutoCollector] ✅ Auto analysis response:', result.status);
                return true;
              } else if (response.status === 404) {
                console.log(`[AutoCollector] ⏳ Product not ready yet, waiting ${delay/1000}s before retry...`);
                if (attempt < maxRetries) {
                  await new Promise(r => setTimeout(r, delay));
                }
              } else if (response.status === 400) {
                // 业务错误，采集已完成
                console.log('[AutoCollector] ⚠️ Analysis skipped (business rule)');
                return true;
              } else {
                console.warn('[AutoCollector] ⚠️ Auto analysis trigger failed:', response.status);
                return true;  // 不阻塞，采集已完成
              }
            } catch (err) {
              console.error(`[AutoCollector] ❌ Auto analysis trigger error (attempt ${attempt}):`, err.message);
              if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, delay));
              }
            }
          }
          console.error('[AutoCollector] ❌ Auto analysis trigger failed after all retries');
          return false;
        };
        
        // [FIXED] 等待完成，确保 COLLECTION_COMPLETE 是最后发送的消息
        await triggerAutoAnalysisWithRetry();
      } else {
        console.log(`[AutoCollector] ⚠️ Only ${allReviews.length} reviews, skipping auto analysis (need >= 10)`);
      }
    }
    
    return allReviews;

  } catch (error) {
    console.error('[AutoCollector] ❌ Error:', error);
    if (autoCollectorTabId) {
      try {
        await chrome.tabs.remove(autoCollectorTabId);
      } catch (e) {}
    }
    throw error;
  }
}

// ============================================================================
// [NEW] 搜索结果页批量分析功能 - API 辅助函数和处理器
// ============================================================================

/**
 * [NEW] 获取产品信息（通过 ASIN）
 * @param {string} asin - 产品 ASIN
 * @returns {Object|null} 产品信息或 null
 */
async function getProductByAsin(asin) {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/products/${asin}`,
      {
        method: 'GET',
        headers: getAuthHeaders()
      },
      15000
    );
    
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error(`[API] Error fetching product ${asin}:`, error.message);
    return null;
  }
}

/**
 * [NEW] 获取多个产品的 UUID
 * @param {Array} asins - ASIN 数组
 * @returns {Object} { asin: product_id } 映射
 */
async function getProductIds(asins) {
  const productIds = {};
  
  for (const asin of asins) {
    const product = await getProductByAsin(asin);
    if (product && product.id) {
      productIds[asin] = product.id;
    }
  }
  
  return productIds;
}

/**
 * [NEW] 触发单产品分析
 * @param {string} asin - 产品 ASIN
 * @returns {Object} 分析结果
 */
async function triggerProductAnalysis(asin) {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/products/${asin}/start-analysis`,
      {
        method: 'POST',
        headers: getAuthHeaders()
      },
      30000
    );
    
    if (response.ok) {
      return { success: true, asin, data: await response.json() };
    } else {
      const error = await response.text();
      return { success: false, asin, error };
    }
  } catch (error) {
    return { success: false, asin, error: error.message };
  }
}

/**
 * [NEW] 创建对比/市场洞察分析项目
 * @param {Array} productIds - 产品 UUID 数组
 * @param {string} title - 项目标题
 * @param {string} analysisType - 分析类型: comparison | market_insight
 * @returns {Object} 创建结果
 */
async function createAnalysisProject(productIds, title, analysisType) {
  try {
    const products = productIds.map(id => ({
      product_id: id,
      role_label: null
    }));
    
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/analysis/projects`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title,
          description: `从亚马逊搜索结果创建的${analysisType === 'comparison' ? '对比分析' : '市场洞察'}项目`,
          products,
          analysis_type: analysisType
        })
      },
      30000
    );
    
    if (response.ok) {
      const result = await response.json();
      return { success: true, data: result };
    } else {
      const error = await response.text();
      return { success: false, error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * [NEW] 处理批量洞察分析
 * 对每个选中的产品分别触发分析
 */
async function handleBatchInsightAnalysis(products, marketplace) {
  console.log('[BatchInsight] Starting batch analysis for', products.length, 'products');
  
  if (!products || products.length === 0) {
    return { success: false, error: '未选择任何产品' };
  }
  
  const results = {
    total: products.length,
    success: 0,
    failed: 0,
    needsCollection: 0,
    details: []
  };
  
  for (const product of products) {
    try {
      // 检查产品是否存在
      const existingProduct = await getProductByAsin(product.asin);
      
      if (!existingProduct) {
        // 产品不存在，需要先采集
        results.needsCollection++;
        results.details.push({
          asin: product.asin,
          status: 'needs_collection',
          message: '产品需要先采集评论'
        });
        
        // 将产品添加到采集队列
        taskQueue.push({
          asin: product.asin,
          config: {
            stars: [1, 2, 3, 4, 5],
            pagesPerStar: 3,
            mediaType: 'all_formats',
            speedMode: 'fast',
            workflowMode: 'one_step_insight'  // 采集后自动分析
          },
          status: 'pending',
          retries: 0
        });
        
        continue;
      }
      
      // 产品存在，触发分析
      const analysisResult = await triggerProductAnalysis(product.asin);
      
      if (analysisResult.success) {
        results.success++;
        results.details.push({
          asin: product.asin,
          status: 'success',
          message: '分析已启动'
        });
      } else {
        results.failed++;
        results.details.push({
          asin: product.asin,
          status: 'failed',
          message: analysisResult.error
        });
      }
    } catch (error) {
      results.failed++;
      results.details.push({
        asin: product.asin,
        status: 'error',
        message: error.message
      });
    }
  }
  
  // 如果有需要采集的产品，启动队列
  if (results.needsCollection > 0 && !isQueueRunning) {
    queueStats = { completed: 0, failed: 0, total: results.needsCollection };
    isQueueRunning = true;
    processQueue();
  }
  
  console.log('[BatchInsight] Results:', results);
  
  return {
    success: true,
    message: `已处理 ${results.success} 个产品，${results.needsCollection} 个需要采集`,
    results
  };
}

/**
 * [NEW] 处理对比分析
 * 创建对比分析项目
 */
async function handleComparisonAnalysis(products, marketplace) {
  console.log('[Comparison] Starting comparison analysis for', products.length, 'products');
  
  if (!products || products.length < 2) {
    return { success: false, error: '对比分析需要至少 2 个产品' };
  }
  
  if (products.length > 5) {
    return { success: false, error: '对比分析最多支持 5 个产品' };
  }
  
  // 获取所有产品的 UUID
  const asins = products.map(p => p.asin);
  const productIds = await getProductIds(asins);
  
  // 检查是否所有产品都存在
  const missingAsins = asins.filter(asin => !productIds[asin]);
  if (missingAsins.length > 0) {
    return {
      success: false,
      error: `以下产品未采集: ${missingAsins.join(', ')}。请先采集这些产品的评论。`,
      missingAsins
    };
  }
  
  // 创建对比分析项目
  const productIdList = asins.map(asin => productIds[asin]);
  const title = `搜索结果对比分析 (${asins.length} 个产品)`;
  
  const result = await createAnalysisProject(productIdList, title, 'comparison');
  
  if (result.success) {
    // 获取项目 ID，构建跳转 URL
    const projectId = result.data?.project?.id;
    const redirectUrl = projectId 
      ? `${DASHBOARD_URL}/analysis/${projectId}`
      : `${DASHBOARD_URL}/home/analysis`;
    
    return {
      success: true,
      message: '对比分析项目已创建',
      projectId,
      redirectUrl
    };
  } else {
    return {
      success: false,
      error: result.error || '创建对比分析项目失败'
    };
  }
}

/**
 * [NEW] 处理市场洞察分析
 * 创建市场洞察项目
 */
async function handleMarketInsightAnalysis(products, marketplace) {
  console.log('[MarketInsight] Starting market insight analysis for', products.length, 'products');
  
  if (!products || products.length < 2) {
    return { success: false, error: '市场洞察需要至少 2 个产品' };
  }
  
  if (products.length > 10) {
    return { success: false, error: '市场洞察最多支持 10 个产品' };
  }
  
  // 获取所有产品的 UUID
  const asins = products.map(p => p.asin);
  const productIds = await getProductIds(asins);
  
  // 检查是否所有产品都存在
  const missingAsins = asins.filter(asin => !productIds[asin]);
  if (missingAsins.length > 0) {
    return {
      success: false,
      error: `以下产品未采集: ${missingAsins.join(', ')}。请先采集这些产品的评论。`,
      missingAsins
    };
  }
  
  // 创建市场洞察项目
  const productIdList = asins.map(asin => productIds[asin]);
  const title = `市场洞察分析 (${asins.length} 个产品)`;
  
  const result = await createAnalysisProject(productIdList, title, 'market_insight');
  
  if (result.success) {
    // 获取项目 ID，构建跳转 URL
    const projectId = result.data?.project?.id;
    const redirectUrl = projectId 
      ? `${DASHBOARD_URL}/analysis/${projectId}`
      : `${DASHBOARD_URL}/home/analysis`;
    
    return {
      success: true,
      message: '市场洞察项目已创建',
      projectId,
      redirectUrl
    };
  } else {
    return {
      success: false,
      error: result.error || '创建市场洞察项目失败'
    };
  }
}

/**
 * [NEW] 处理保存到产品库
 * 将搜索结果保存到关键词产品库
 */
async function handleSaveToCollection(keyword, marketplace, products) {
  console.log('[SaveToCollection] Saving', products.length, 'products for keyword:', keyword);
  
  if (!keyword) {
    return { success: false, error: '缺少搜索关键词' };
  }
  
  if (!products || products.length === 0) {
    return { success: false, error: '没有可保存的产品' };
  }
  
  // 验证必要字段
  const validProducts = products.filter(p => p.asin && p.image_url && p.product_url);
  if (validProducts.length === 0) {
    return { success: false, error: '没有包含完整信息的产品' };
  }
  
  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/keyword-collections`,
      {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyword,
          marketplace: marketplace || 'amazon.com',
          products: validProducts
        })
      },
      30000 // 30 seconds timeout
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 处理 FastAPI 验证错误格式
      let errorMsg = `HTTP ${response.status}`;
      if (errorData.detail) {
        if (typeof errorData.detail === 'string') {
          errorMsg = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          // Pydantic 验证错误: [{"loc": [...], "msg": "...", "type": "..."}]
          errorMsg = errorData.detail.map(e => e.msg || JSON.stringify(e)).join('; ');
        } else {
          errorMsg = JSON.stringify(errorData.detail);
        }
      }
      throw new Error(errorMsg);
    }
    
    const data = await response.json();
    console.log('[SaveToCollection] Successfully saved collection:', data);
    
    return {
      success: true,
      message: `已保存 ${validProducts.length} 个产品`,
      collection: data
    };
    
  } catch (error) {
    console.error('[SaveToCollection] Error:', error);
    return {
      success: false,
      error: error.message || '保存失败'
    };
  }
}
