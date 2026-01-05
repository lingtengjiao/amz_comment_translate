/**
 * VOC-Master Content Script
 * 
 * Runs on Amazon product pages to:
 * 1. Detect product ASIN
 * 2. Collect reviews by star rating
 * 3. Handle pagination
 * 4. Display collection overlay UI
 */

// Configuration
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000/api/v1',
  DASHBOARD_URL: 'http://localhost:3000',
  DELAY_BETWEEN_PAGES: { min: 2000, max: 4000 }, // Increased for iframe loading
  DELAY_BETWEEN_STARS: { min: 3000, max: 5000 },
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
 * Random delay to simulate human behavior
 */
function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Detect ASIN from current page URL or page content
 */
function detectASIN() {
  // Try URL patterns
  const urlPatterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/ASIN\/([A-Z0-9]{10})/i
  ];

  for (const pattern of urlPatterns) {
    const match = window.location.href.match(pattern);
    if (match) return match[1];
  }

  // Try data attributes
  const asinElement = document.querySelector('[data-asin]');
  if (asinElement) {
    const asin = asinElement.getAttribute('data-asin');
    if (asin && asin.length === 10) return asin;
  }

  // Try canonical link
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    for (const pattern of urlPatterns) {
      const match = canonical.href.match(pattern);
      if (match) return match[1];
    }
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

  // Extract real average rating from product page
  let averageRating = null;
  const ratingSelectors = [
    '#acrPopover .a-icon-alt',  // Main rating display
    '#acrCustomerReviewText',   // "4.5 out of 5 stars"
    '.a-icon-alt[aria-label*="out of 5"]',  // Rating in aria-label
    '[data-hook="average-star-rating"] .a-icon-alt',
    '#averageCustomerReviews .a-icon-alt'
  ];
  
  for (const selector of ratingSelectors) {
    const ratingEl = document.querySelector(selector);
    if (ratingEl) {
      const ratingText = ratingEl.textContent || ratingEl.getAttribute('aria-label') || '';
      // Match patterns like "4.5 out of 5", "4.5", etc.
      const match = ratingText.match(/(\d+\.?\d*)\s*(?:out of 5|stars?|星)/i) || 
                   ratingText.match(/(\d+\.?\d*)/);
      if (match) {
        averageRating = parseFloat(match[1]);
        if (averageRating >= 0 && averageRating <= 5) {
          break;
        }
      }
    }
  }

  // Alternative: Try to find rating in structured data
  if (!averageRating) {
    const ratingMeta = document.querySelector('meta[itemprop="ratingValue"]') ||
                       document.querySelector('[itemprop="ratingValue"]');
    if (ratingMeta) {
      const value = ratingMeta.getAttribute('content') || ratingMeta.textContent;
      averageRating = parseFloat(value);
      if (isNaN(averageRating) || averageRating < 0 || averageRating > 5) {
        averageRating = null;
      }
    }
  }

  // Extract price
  let price = null;
  const priceSelectors = [
    '#priceblock_ourprice',  // Main price
    '#priceblock_dealprice', // Deal price
    '#priceblock_saleprice', // Sale price
    '.a-price .a-offscreen', // Price with screen reader text
    '.a-price-whole',        // Price whole part
    '[data-a-color="price"] .a-offscreen',
    '#corePrice_feature_div .a-price .a-offscreen',
    '.apexPriceToPay .a-offscreen'
  ];
  
  for (const selector of priceSelectors) {
    const priceEl = document.querySelector(selector);
    if (priceEl) {
      const priceText = priceEl.textContent?.trim() || priceEl.getAttribute('aria-label')?.trim();
      if (priceText) {
        // Extract price with currency symbol
        price = priceText;
        break;
      }
    }
  }
  
  // If no price found, try to get from parent element
  if (!price) {
    const priceContainer = document.querySelector('#corePrice_feature_div, #priceblock_ourprice_row');
    if (priceContainer) {
      const priceText = priceContainer.textContent?.trim();
      if (priceText) {
        // Match price patterns like $19.99, €19.99, £19.99, etc.
        const match = priceText.match(/[$€£¥]\s*\d+[\.,]\d{2}|\d+[\.,]\d{2}\s*[$€£¥]|[$€£¥]\s*\d+|USD\s*\d+[\.,]\d{2}/);
        if (match) {
          price = match[0].trim();
        }
      }
    }
  }

  // Extract bullet points (key product features)
  const bulletPoints = [];
  const bulletSelectors = [
    '#feature-bullets ul.a-unordered-list li span.a-list-item:not(.a-text-bold)',  // Main bullet points
    '#feature-bullets .a-unordered-list .a-list-item',
    '[data-feature-name="feature-bullets"] .a-list-item',
    '#productDescription_feature_div .a-unordered-list .a-list-item'
  ];
  
  for (const selector of bulletSelectors) {
    const bulletEls = document.querySelectorAll(selector);
    if (bulletEls.length > 0) {
      bulletEls.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 5 && !text.match(/^[0-9]+[\.,]?\s*$/) && !bulletPoints.includes(text)) {
          // Skip if it's just a number or too short, or already exists
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
 * Uses the full Amazon reviews URL format with sorting and filtering
 */
function buildReviewsUrl(asin, star, page = 1) {
  const baseUrl = window.location.origin;
  const starFilter = STAR_FILTERS[star];
  
  // Build URL with all necessary parameters to ensure proper pagination
  const params = new URLSearchParams({
    ie: 'UTF8',
    reviewerType: 'all_reviews',
    filterByStar: starFilter,
    pageNumber: page.toString(),
    sortBy: 'recent' // Sort by recent to get consistent pagination
  });
  
  const url = `${baseUrl}/product-reviews/${asin}?${params.toString()}`;
  return url;
}

/**
 * Parse reviews from page DOM
 */
function parseReviewsFromPage(doc = document) {
  const reviews = [];
  const reviewElements = doc.querySelectorAll('[data-hook="review"]');

  reviewElements.forEach(el => {
    try {
      // Review ID - Try multiple methods to get unique ID
      let reviewId = el.id;
      if (!reviewId || !reviewId.startsWith('R')) {
        // Try data-review-id attribute
        reviewId = el.getAttribute('data-review-id');
      }
      if (!reviewId || !reviewId.startsWith('R')) {
        // Try finding review ID in data attributes
        const dataReviewId = el.querySelector('[data-review-id]');
        if (dataReviewId) {
          reviewId = dataReviewId.getAttribute('data-review-id');
        }
      }
      if (!reviewId || !reviewId.startsWith('R')) {
        // Try extracting from review link
        const reviewLink = el.querySelector('a[href*="/gp/customer-reviews/"]');
        if (reviewLink) {
          const hrefMatch = reviewLink.href.match(/\/gp\/customer-reviews\/([A-Z0-9]+)/);
          if (hrefMatch) {
            reviewId = hrefMatch[1];
          }
        }
      }
      // Fallback: generate unique ID based on content hash
      if (!reviewId || !reviewId.startsWith('R')) {
        const bodyText = el.querySelector('[data-hook="review-body"] span')?.textContent?.trim() || '';
        const authorText = el.querySelector('.a-profile-name')?.textContent?.trim() || '';
        if (bodyText || authorText) {
          // Generate a hash-based ID
          const hash = btoa(bodyText.substring(0, 50) + authorText).replace(/[^A-Z0-9]/g, '').substring(0, 10);
          reviewId = `R${hash}${Date.now().toString().slice(-6)}`;
        } else {
          // Last resort: timestamp-based ID
          reviewId = `R${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
      }

      // Rating - Try multiple selectors
      let rating = 0;
      const ratingSelectors = [
        '[data-hook="review-star-rating"] .a-icon-alt',
        '[data-hook="cmps-review-star-rating"] .a-icon-alt',
        '.a-icon-alt[aria-label*="star"]',
        '[data-hook="review-star-rating"]',
        '.a-star'
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

      // Title
      const titleEl = el.querySelector('[data-hook="review-title"] span:not(.a-icon-alt), [data-hook="review-title"]');
      const title = titleEl?.textContent?.trim() || '';

      // Body - Try multiple selectors
      let body = '';
      const bodySelectors = [
        '[data-hook="review-body"] span',
        '[data-hook="review-body"]',
        '.review-text',
        '.a-expander-content'
      ];
      for (const selector of bodySelectors) {
        const bodyEl = el.querySelector(selector);
        if (bodyEl) {
          body = bodyEl.textContent?.trim() || '';
          if (body) break;
        }
      }

      // Author
      const authorEl = el.querySelector('.a-profile-name, [data-hook="review-author"]');
      const author = authorEl?.textContent?.trim() || 'Anonymous';

      // Date
      const dateEl = el.querySelector('[data-hook="review-date"]');
      const dateText = dateEl?.textContent || '';
      // Extract date from text like "Reviewed in the United States on January 1, 2024"
      const dateMatch = dateText.match(/on\s+(.+)$/i);
      const reviewDate = dateMatch ? dateMatch[1].trim() : '';

      // Verified purchase
      const verifiedEl = el.querySelector('[data-hook="avp-badge"], .a-icon-verified-purchase');
      const verifiedPurchase = !!verifiedEl;

      // Helpful votes
      const helpfulEl = el.querySelector('[data-hook="helpful-vote-statement"]');
      const helpfulText = helpfulEl?.textContent || '';
      const helpfulMatch = helpfulText.match(/(\d+)/);
      const helpfulVotes = helpfulMatch ? parseInt(helpfulMatch[1]) : 0;

      // Only skip if both body and rating are missing (at least one should exist)
      // Also ensure we have a valid review_id
      if (reviewId && (body || rating > 0)) {
        reviews.push({
          review_id: reviewId,
          author,
          rating: rating || 0, // Default to 0 if not found, but still include
          title,
          body: body || '', // Allow empty body
          review_date: reviewDate,
          verified_purchase: verifiedPurchase,
          helpful_votes: helpfulVotes
        });
      } else {
        console.warn('Skipped review - missing review_id or both body and rating:', {
          reviewId,
          hasBody: !!body,
          rating
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
  // Try multiple selectors for next page button
  const nextSelectors = [
    '.a-pagination .a-last:not(.a-disabled)',
    '.a-pagination .a-last:not(.a-disabled) a',
    '[data-hook="pagination-bar"] .a-last:not(.a-disabled)',
    '.a-pagination .a-pagination-item:last-child:not(.a-disabled)',
    'a[aria-label="Go to next page"]',
    'a[aria-label="Next"]'
  ];
  
  for (const selector of nextSelectors) {
    const nextButton = doc.querySelector(selector);
    if (nextButton && !nextButton.classList.contains('a-disabled')) {
      return true;
    }
  }
  
  // Also check if current page number is less than total pages
  const currentPageEl = doc.querySelector('.a-pagination .a-selected');
  const totalPagesEl = doc.querySelector('.a-pagination .a-last');
  if (currentPageEl && totalPagesEl) {
    const currentPage = parseInt(currentPageEl.textContent) || 1;
    const totalPages = parseInt(totalPagesEl.textContent) || 1;
    return currentPage < totalPages;
  }
  
  return false;
}

/**
 * Fetch and parse reviews from a URL using hidden iframe
 * This bypasses Amazon's anti-scraping that blocks fetch() pagination
 * Iframe loads the page as a real browser navigation with full cookies
 */
async function fetchReviewsPage(url) {
  return new Promise((resolve, reject) => {
    console.log('[IFrame] Loading:', url);
    
    // Create hidden iframe (no sandbox to ensure cookies are sent)
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:1024px;height:768px;opacity:0;pointer-events:none;visibility:hidden;';
    iframe.name = 'voc-review-loader-' + Date.now();
    
    const timeout = setTimeout(() => {
      console.warn('[IFrame] Timeout after 20s');
      cleanup();
      reject(new Error('Iframe load timeout'));
    }, 20000);
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };
    
    iframe.onload = () => {
      // Wait a bit for any dynamic content to load
      setTimeout(() => {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow.document;
          
          if (!doc || !doc.body) {
            throw new Error('Cannot access iframe document');
          }
          
          // Debug: Check current page number from response
          const currentPageEl = doc.querySelector('.a-pagination .a-selected');
          const responsePageNum = currentPageEl ? currentPageEl.textContent.trim() : 'unknown';
          console.log('[IFrame] Loaded page number (from DOM):', responsePageNum);
          
          // Check for review count on page
          const reviewCountEl = doc.querySelector('[data-hook="cr-filter-info-review-rating-count"]');
          if (reviewCountEl) {
            console.log('[IFrame] Review info:', reviewCountEl.textContent.trim().substring(0, 100));
          }
          
          // Debug: Check for pagination element
          const paginationEl = doc.querySelector('.a-pagination');
          if (paginationEl) {
            const paginationText = paginationEl.textContent.replace(/\s+/g, ' ').trim();
            console.log('[IFrame] Pagination:', paginationText.substring(0, 80));
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
      }, 500); // Small delay to ensure content is rendered
    };
    
    iframe.onerror = (e) => {
      console.error('[IFrame] Load error:', e);
      cleanup();
      reject(new Error('Iframe load error'));
    };
    
    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

/**
 * Collect reviews for a specific star rating
 * Uses de-duplication to avoid counting the same review multiple times
 */
async function collectReviewsByStar(asin, star, maxPages, onProgress) {
  const allReviews = [];
  const seenReviewIds = new Set(); // Track seen review IDs for de-duplication
  let consecutiveDuplicatePages = 0;
  const maxConsecutiveDuplicates = 2; // Stop after 2 pages with all duplicates
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 3;

  console.log(`[Star ${star}] Starting collection: ${maxPages} pages max`);

  // Simple loop: collect pages 1 to maxPages
  for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
    if (shouldStop) {
      console.log(`[Star ${star}] User stopped collection`);
      break;
    }

    const url = buildReviewsUrl(asin, star, currentPage);
    console.log(`[Star ${star}] Fetching page ${currentPage}: ${url}`);
    
    onProgress({
      currentStar: star,
      currentPage,
      maxPages,
      message: `正在采集 ${star} 星评论... 第 ${currentPage}/${maxPages} 页`
    });

    try {
      const { reviews } = await fetchReviewsPage(url);
      
      // Log page collection results with review IDs
      const reviewIds = reviews.map(r => r.review_id);
      console.log(`[Star ${star}] Page ${currentPage}/${maxPages}: Found ${reviews.length} reviews`);
      console.log(`[Star ${star}] Page ${currentPage} review IDs:`, reviewIds.slice(0, 5).join(', ') + (reviewIds.length > 5 ? '...' : ''));
      
      // De-duplicate: only add reviews we haven't seen before
      let newReviewsCount = 0;
      let duplicatesCount = 0;
      
      for (const review of reviews) {
        if (!seenReviewIds.has(review.review_id)) {
          seenReviewIds.add(review.review_id);
          allReviews.push(review);
          newReviewsCount++;
        } else {
          duplicatesCount++;
        }
      }
      
      console.log(`[Star ${star}] Page ${currentPage}: ${newReviewsCount} new, ${duplicatesCount} duplicates, running total: ${allReviews.length}`);
      
      // Check if this page had all duplicates (means we've seen all reviews)
      if (reviews.length > 0 && newReviewsCount === 0) {
        consecutiveDuplicatePages++;
        console.warn(`[Star ${star}] Page ${currentPage}: All ${reviews.length} reviews were duplicates (${consecutiveDuplicatePages} consecutive)`);
        
        if (consecutiveDuplicatePages >= maxConsecutiveDuplicates) {
          console.log(`[Star ${star}] ${maxConsecutiveDuplicates} consecutive pages with all duplicates - likely reached end of reviews`);
          break;
        }
      } else if (reviews.length === 0) {
        // Empty page - might be end of reviews
        consecutiveDuplicatePages++;
        console.warn(`[Star ${star}] Page ${currentPage}: No reviews found`);
        
        if (consecutiveDuplicatePages >= maxConsecutiveDuplicates) {
          console.log(`[Star ${star}] ${maxConsecutiveDuplicates} consecutive empty/duplicate pages, stopping`);
          break;
        }
      } else {
        // Got some new reviews
        consecutiveDuplicatePages = 0;
      }
      
      consecutiveErrors = 0; // Reset error counter on success

      // Random delay between pages (except for last page)
      if (currentPage < maxPages) {
        const delay = Math.floor(Math.random() * (CONFIG.DELAY_BETWEEN_PAGES.max - CONFIG.DELAY_BETWEEN_PAGES.min + 1)) + CONFIG.DELAY_BETWEEN_PAGES.min;
        console.log(`[Star ${star}] Waiting ${delay}ms before next page...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`[Star ${star}] Page ${currentPage} error:`, error);
      consecutiveErrors++;
      
      // If too many consecutive errors, stop for this star rating
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.warn(`[Star ${star}] ${consecutiveErrors} consecutive errors, stopping`);
        break;
      }
      
      // Wait before trying next page
      await randomDelay(2000, 3000);
    }
  }

  console.log(`[Star ${star}] ✅ Collection complete: ${allReviews.length} unique reviews (from ${seenReviewIds.size} unique IDs)`);
  return allReviews;
}

/**
 * Main collection function - Now uses background service worker for tab-based collection
 * This bypasses Amazon's anti-scraping by using real browser navigation
 */
async function startCollection(config) {
  const asin = detectASIN();
  if (!asin) {
    showOverlay({ error: '无法检测到商品 ASIN，请确保在商品详情页' });
    return;
  }

  const { title, imageUrl, averageRating, price, bulletPoints } = getProductInfo();
  const starsToCollect = config.stars || [1, 2, 3, 4, 5];
  const pagesPerStar = config.pagesPerStar || 5;
  const mediaType = config.mediaType || 'all_formats';
  const speedMode = config.speedMode || 'fast'; // 默认极速模式

  isCollecting = true;
  shouldStop = false;

  showOverlay({
    status: 'collecting',
    message: '准备开始采集（使用真实浏览器导航）...',
    progress: 0,
    asin,
    title
  });

  console.log('[Collection] Starting tab-based collection');
  console.log(`  - ASIN: ${asin}`);
  console.log(`  - Stars: ${starsToCollect.join(', ')}`);
  console.log(`  - Pages per star: ${pagesPerStar}`);
  console.log(`  - Media type: ${mediaType}`);
  console.log(`  - Speed mode: ${speedMode}`);

  // Use new tab-based collection via background service worker
  chrome.runtime.sendMessage({
    type: 'START_TAB_COLLECTION',
    asin,
    config: {
      stars: starsToCollect,
      pagesPerStar,
      mediaType,
      speedMode
    },
    productInfo: {
      title,
      imageUrl,
      averageRating,
      price,
      bulletPoints,
      marketplace: detectMarketplace()
    }
  }, (response) => {
    if (response?.success) {
      console.log('[Collection] Tab collection started in background');
      updateOverlay({
        status: 'collecting',
        message: '后台标签页采集中，请勿关闭此页面...',
        progress: 5
      });
    } else {
      console.error('[Collection] Failed to start tab collection:', response?.error);
      showOverlay({
        status: 'error',
        message: `启动采集失败: ${response?.error || '未知错误'}`,
        error: response?.error
      });
      isCollecting = false;
    }
  });
}

/**
 * Detect Amazon marketplace from URL
 */
function detectMarketplace() {
  const hostname = window.location.hostname;
  if (hostname.includes('.co.uk')) return 'UK';
  if (hostname.includes('.de')) return 'DE';
  if (hostname.includes('.fr')) return 'FR';
  if (hostname.includes('.co.jp')) return 'JP';
  return 'US';
}

/**
 * Stop collection - now also stops the background tab collection
 */
function stopCollection() {
  shouldStop = true;
  isCollecting = false;
  
  // Notify background to stop collection and close collector tab
  chrome.runtime.sendMessage({ type: 'STOP_COLLECTION' }, (response) => {
    console.log('[Collection] Stop requested:', response);
  });
  
  updateOverlay({
    status: 'stopped',
    message: '采集已停止'
  });
}

/**
 * Create and show overlay UI
 */
function showOverlay(state) {
  if (!overlay) {
    createOverlay();
  }
  updateOverlay(state);
  overlay.classList.add('voc-visible');
}

/**
 * Hide overlay
 */
function hideOverlay() {
  if (overlay) {
    overlay.classList.remove('voc-visible');
  }
}

/**
 * Create overlay DOM
 */
function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'voc-master-overlay';
  overlay.innerHTML = `
    <div class="voc-panel">
      <div class="voc-header">
        <div class="voc-logo">
          <span class="voc-icon">📊</span>
          <span class="voc-title">VOC-Master</span>
        </div>
        <button class="voc-close" id="voc-close-btn">×</button>
      </div>
      
      <div class="voc-content">
        <div class="voc-product-info" id="voc-product-info">
          <div class="voc-asin" id="voc-asin"></div>
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
              <label><input type="radio" name="voc-media-type" value="all_formats" checked> Text, image, video</label>
              <label><input type="radio" name="voc-media-type" value="media_reviews_only"> Image and video only</label>
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
            前往控制台查看分析 →
          </a>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Event listeners
  document.getElementById('voc-close-btn').addEventListener('click', hideOverlay);
  document.getElementById('voc-start-btn').addEventListener('click', handleStartClick);
  document.getElementById('voc-stop-btn').addEventListener('click', handleStopClick);
}

/**
 * Update overlay content
 */
function updateOverlay(state) {
  if (!overlay) return;

  const messageEl = document.getElementById('voc-message');
  const progressContainer = document.getElementById('voc-progress-container');
  const progressFill = document.getElementById('voc-progress-fill');
  const progressText = document.getElementById('voc-progress-text');
  const reviewCount = document.getElementById('voc-review-count');
  const configEl = document.getElementById('voc-config');
  const startBtn = document.getElementById('voc-start-btn');
  const stopBtn = document.getElementById('voc-stop-btn');
  const dashboardBtn = document.getElementById('voc-dashboard-btn');
  const asinEl = document.getElementById('voc-asin');
  const titleEl = document.getElementById('voc-product-title');

  // Update ASIN and title
  if (state.asin) {
    asinEl.textContent = `ASIN: ${state.asin}`;
  }
  if (state.title) {
    titleEl.textContent = state.title.substring(0, 60) + (state.title.length > 60 ? '...' : '');
  }

  // Update message
  if (state.message) {
    messageEl.textContent = state.message;
  }

  // Update review count
  if (state.reviewCount !== undefined) {
    reviewCount.textContent = `已采集: ${state.reviewCount} 条评论`;
    reviewCount.style.display = 'block';
  }

  // Status-based UI updates
  switch (state.status) {
    case 'collecting':
    case 'uploading':
      progressContainer.style.display = 'block';
      progressFill.style.width = `${state.progress || 0}%`;
      progressText.textContent = `${state.progress || 0}%`;
      configEl.style.display = 'none';
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      dashboardBtn.style.display = 'none';
      overlay.classList.remove('voc-error', 'voc-complete');
      overlay.classList.add('voc-collecting');
      break;

    case 'complete':
      progressContainer.style.display = 'none';
      configEl.style.display = 'none';
      startBtn.style.display = 'none';
      stopBtn.style.display = 'none';
      dashboardBtn.style.display = 'block';
      dashboardBtn.href = state.dashboardUrl;
      overlay.classList.remove('voc-collecting', 'voc-error');
      overlay.classList.add('voc-complete');
      break;

    case 'error':
    case 'stopped':
      progressContainer.style.display = 'none';
      configEl.style.display = 'block';
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      dashboardBtn.style.display = 'none';
      overlay.classList.remove('voc-collecting', 'voc-complete');
      if (state.status === 'error') {
        overlay.classList.add('voc-error');
      }
      break;

    default:
      progressContainer.style.display = 'none';
      configEl.style.display = 'block';
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      dashboardBtn.style.display = 'none';
  }
}

/**
 * Handle start button click
 */
function handleStartClick() {
  const stars = Array.from(document.querySelectorAll('.voc-star-check:checked'))
    .map(el => parseInt(el.value));
  const pagesPerStar = parseInt(document.getElementById('voc-pages-per-star').value);
  // 获取选中的媒体类型 radio
  const mediaTypeRadio = document.querySelector('input[name="voc-media-type"]:checked');
  const mediaType = mediaTypeRadio ? mediaTypeRadio.value : 'all_formats';
  // 获取选中的速度模式 radio
  const speedModeRadio = document.querySelector('input[name="voc-speed-mode"]:checked');
  const speedMode = speedModeRadio ? speedModeRadio.value : 'fast';

  if (stars.length === 0) {
    alert('请至少选择一个星级');
    return;
  }

  const config = { stars, pagesPerStar, mediaType, speedMode };
  
  chrome.runtime.sendMessage({
    type: 'START_COLLECTION',
    asin: detectASIN(),
    config
  });

  startCollection(config);
}

/**
 * Handle stop button click
 */
function handleStopClick() {
  stopCollection();
}

/**
 * Listen for messages from popup and background
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'OPEN_OVERLAY':
      const asin = detectASIN();
      const { title } = getProductInfo();
      showOverlay({
        status: 'ready',
        message: asin ? '检测到商品，准备采集' : '请在商品详情页使用',
        asin,
        title
      });
      sendResponse({ success: true, asin });
      break;

    case 'GET_PAGE_INFO':
      try {
        const asin = detectASIN();
        const productInfo = getProductInfo();
        const marketplace = detectMarketplace();
        
        sendResponse({
          asin: asin,
          title: productInfo.title,
          imageUrl: productInfo.imageUrl,
          averageRating: productInfo.averageRating,
          price: productInfo.price,
          bulletPoints: productInfo.bulletPoints,
          marketplace: marketplace,
          isProductPage: !!asin
        });
      } catch (error) {
        console.error('[Content] Error in GET_PAGE_INFO:', error);
        sendResponse({
          asin: null,
          title: null,
          error: error.message
        });
      }
      break;

    // Handle progress updates from background
    case 'COLLECTION_PROGRESS':
      console.log(`[Progress] Star ${message.star}, Page ${message.page}/${message.pagesPerStar}, Total: ${message.totalReviews}`);
      const totalPages = message.pagesPerStar * 5; // Assume 5 stars max
      const currentProgress = Math.min(
        Math.round((message.page / message.pagesPerStar) * 100 / 5 + (message.star - 1) * 20),
        95
      );
      updateOverlay({
        status: 'collecting',
        message: message.message || `正在采集 ${message.star} 星评论... 第 ${message.page}/${message.pagesPerStar} 页`,
        progress: currentProgress,
        currentStar: message.star,
        reviewCount: message.totalReviews
      });
      sendResponse({ success: true });
      break;

    // Handle collection complete from background
    case 'COLLECTION_COMPLETE':
      console.log('[Collection] Complete!', message);
      isCollecting = false;
      if (message.success) {
        const detectedAsin = detectASIN();
        showOverlay({
          status: 'complete',
          message: `采集完成！共 ${message.reviewCount} 条评论已上传，后台正在翻译...`,
          reviewCount: message.reviewCount,
          dashboardUrl: `${CONFIG.DASHBOARD_URL}/products/${detectedAsin}`,
          response: message.result
        });
      } else {
        showOverlay({
          status: 'error',
          message: `采集失败: ${message.error || '未知错误'}`,
          error: message.error
        });
      }
      sendResponse({ success: true });
      break;

    // Handle collection error from background
    case 'COLLECTION_ERROR':
      console.error('[Collection] Error:', message.error);
      isCollecting = false;
      showOverlay({
        status: 'error',
        message: `采集失败: ${message.error}`,
        error: message.error
      });
      sendResponse({ success: true });
      break;
  }
  return true;
});

// Auto-detect ASIN on page load
const asin = detectASIN();
if (asin) {
  console.log('VOC-Master: Detected ASIN:', asin);
}

