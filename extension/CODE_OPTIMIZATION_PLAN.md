# 🎯 VOC-Master 插件代码优化计划

## 📋 当前代码结构分析

### 1. 文件结构
```
extension/
├── manifest.json           # 插件配置清单
├── popup/                  # 弹出窗口 (点击图标)
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── src/
│   ├── background/         # 后台服务
│   │   └── service-worker.js  (2013 行 ⚠️ 过长)
│   └── content/            # 页面脚本
│       ├── content.js      (854 行)
│       └── overlay.css
└── icons/                  # 图标资源
```

### 2. 代码问题分析

#### 🔴 严重问题

1. **service-worker.js 过长 (2013 行)**
   - 单文件包含太多功能
   - 难以维护和调试
   - 缺少模块化

2. **硬编码的 API 地址**
   - 切换环境需要手动修改代码
   - 容易出错

3. **缺少错误边界处理**
   - API 失败时缺少友好提示
   - 网络超时处理不完善

#### 🟡 次要问题

1. **代码重复**
   - 多处相同的 API 调用逻辑
   - 重复的错误处理代码

2. **缺少类型定义**
   - JavaScript 无类型检查
   - 容易出现运行时错误

3. **性能优化空间**
   - 可以使用 Web Worker
   - 数据缓存机制不完善

## 🚀 优化计划

### 阶段一: 模块化重构 (高优先级)

#### 1.1 拆分 service-worker.js

**目标**: 将 2013 行的 service-worker.js 拆分成多个模块

```
src/background/
├── service-worker.js       # 入口文件 (100 行)
├── modules/
│   ├── api.js             # API 调用封装
│   ├── auth.js            # 认证管理
│   ├── collector.js       # 评论采集核心
│   ├── queue.js           # 任务队列管理
│   └── utils.js           # 工具函数
└── config.js              # 配置管理
```

**示例 - config.js**:
```javascript
// 环境配置管理
const ENV = 'dev'; // 或 'prod'

const CONFIGS = {
  dev: {
    API_BASE_URL: 'http://localhost:8000/api/v1',
    DASHBOARD_URL: 'http://localhost:3000',
    TIMEOUT: 30000
  },
  prod: {
    API_BASE_URL: 'https://api.voc-master.com/api/v1',
    DASHBOARD_URL: 'https://voc-master.com',
    TIMEOUT: 60000
  }
};

export const config = CONFIGS[ENV];
```

**示例 - api.js**:
```javascript
import { config } from './config.js';

// 统一的 API 调用封装
export class APIClient {
  constructor(baseURL = config.API_BASE_URL) {
    this.baseURL = baseURL;
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const url = `${this.baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(config.TIMEOUT)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new APIError(error.detail || '请求失败', response.status);
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw new APIError('请求超时，请检查网络连接', 408);
      }
      throw error;
    }
  }

  // 认证相关
  async login(email, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  async verifyToken() {
    return this.request('/auth/verify');
  }

  // 评论上传
  async uploadReviews(data) {
    return this.request('/reviews/ingest/queue', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}

// 自定义错误类
export class APIError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
  }
}
```

#### 1.2 重构认证管理

**创建 auth.js**:
```javascript
import { APIClient } from './api.js';

export class AuthManager {
  constructor() {
    this.api = new APIClient();
    this.state = {
      isLoggedIn: false,
      token: null,
      user: null
    };
  }

  // 从 storage 恢复状态
  async restore() {
    const data = await chrome.storage.local.get(['auth_token', 'auth_user']);
    if (data.auth_token) {
      this.state.token = data.auth_token;
      this.state.user = data.auth_user;
      this.state.isLoggedIn = true;
      this.api.setToken(data.auth_token);
    }
  }

  // 登录
  async login(email, password) {
    try {
      const result = await this.api.login(email, password);
      
      this.state.isLoggedIn = true;
      this.state.token = result.access_token;
      this.state.user = result.user;
      this.api.setToken(result.access_token);

      await this.save();
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 登出
  async logout() {
    this.state = { isLoggedIn: false, token: null, user: null };
    await chrome.storage.local.remove(['auth_token', 'auth_user']);
  }

  // 保存状态
  async save() {
    await chrome.storage.local.set({
      auth_token: this.state.token,
      auth_user: this.state.user
    });
  }

  // 验证 token
  async verify() {
    try {
      const result = await this.api.verifyToken();
      if (!result.valid) {
        await this.logout();
      }
      return result;
    } catch {
      return { valid: false };
    }
  }
}
```

#### 1.3 改进采集核心逻辑

**创建 collector.js**:
```javascript
import { APIClient } from './api.js';

export class ReviewCollector {
  constructor() {
    this.api = new APIClient();
    this.tabId = null;
    this.isCollecting = false;
    this.config = null;
  }

  // 开始采集 (入口函数)
  async start(asin, config, onProgress) {
    if (this.isCollecting) {
      throw new Error('采集任务已在进行中');
    }

    this.isCollecting = true;
    this.config = config;

    try {
      // 创建采集标签页
      this.tabId = await this.createCollectorTab();
      
      // 获取产品信息
      const productInfo = await this.fetchProductInfo(asin);
      
      // 采集评论
      const reviews = await this.collectReviews(asin, config, onProgress);
      
      // 关闭标签页
      await this.closeCollectorTab();
      
      return { success: true, reviews, productInfo };
    } catch (error) {
      await this.cleanup();
      throw error;
    } finally {
      this.isCollecting = false;
    }
  }

  // 停止采集
  async stop() {
    this.isCollecting = false;
    await this.cleanup();
  }

  // 创建后台采集标签页
  async createCollectorTab() {
    const tab = await chrome.tabs.create({
      url: 'about:blank',
      active: false // 后台运行
    });
    return tab.id;
  }

  // 获取产品信息
  async fetchProductInfo(asin) {
    const url = `https://www.amazon.com/dp/${asin}`;
    await chrome.tabs.update(this.tabId, { url });
    await this.waitForLoad(this.tabId);

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      func: this.extractProductInfoScript
    });

    return result.result;
  }

  // 页面脚本: 提取产品信息
  extractProductInfoScript() {
    return {
      title: document.querySelector('#productTitle')?.textContent?.trim() || '',
      imageUrl: document.querySelector('#landingImage')?.src || null,
      averageRating: parseFloat(
        document.querySelector('#acrPopover .a-icon-alt')?.textContent?.match(/(\d+\.?\d*)/)?.[1] || 0
      ),
      price: document.querySelector('.a-price .a-offscreen')?.textContent?.trim() || null
    };
  }

  // 采集评论主逻辑
  async collectReviews(asin, config, onProgress) {
    const { stars, pagesPerStar, mediaType } = config;
    const allReviews = [];
    const seenIds = new Set();

    for (const star of stars) {
      for (let page = 1; page <= pagesPerStar; page++) {
        if (!this.isCollecting) break;

        // 导航到评论页
        const url = this.buildReviewUrl(asin, star, page, mediaType);
        await chrome.tabs.update(this.tabId, { url });
        await this.waitForLoad(this.tabId);

        // 提取评论
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: this.tabId },
          func: this.extractReviewsScript
        });

        const reviews = result.result || [];

        // 去重并上传
        const newReviews = reviews.filter(r => {
          if (!seenIds.has(r.review_id)) {
            seenIds.add(r.review_id);
            return true;
          }
          return false;
        });

        if (newReviews.length > 0) {
          // 流式上传
          await this.api.uploadReviews({
            asin,
            reviews: newReviews,
            is_stream: true
          });

          allReviews.push(...newReviews);
        }

        // 回调进度
        onProgress({
          star,
          page,
          totalReviews: allReviews.length,
          progress: ((stars.indexOf(star) * pagesPerStar + page) / (stars.length * pagesPerStar)) * 100
        });

        // 人性化延迟
        await this.randomDelay(1000, 2000);
      }
    }

    return allReviews;
  }

  // 页面脚本: 提取评论
  extractReviewsScript() {
    const reviews = [];
    const reviewElements = document.querySelectorAll('[data-hook="review"]');

    reviewElements.forEach(el => {
      const reviewId = el.id || el.getAttribute('data-review-id');
      const rating = parseInt(
        el.querySelector('[data-hook="review-star-rating"] .a-icon-alt')?.textContent?.match(/(\d+)/)?.[1] || 0
      );
      const title = el.querySelector('[data-hook="review-title"]')?.textContent?.trim() || '';
      const body = el.querySelector('[data-hook="review-body"]')?.textContent?.trim() || '';
      const author = el.querySelector('.a-profile-name')?.textContent?.trim() || 'Anonymous';

      if (reviewId && body) {
        reviews.push({ review_id: reviewId, rating, title, body, author });
      }
    });

    return reviews;
  }

  // 构建评论页 URL
  buildReviewUrl(asin, star, page, mediaType) {
    const starFilter = ['', 'one_star', 'two_star', 'three_star', 'four_star', 'five_star'][star];
    const params = new URLSearchParams({
      filterByStar: starFilter,
      pageNumber: page,
      mediaType: mediaType || 'all_contents'
    });
    return `https://www.amazon.com/product-reviews/${asin}?${params}`;
  }

  // 等待页面加载
  async waitForLoad(tabId, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('页面加载超时')), timeout);
      
      const listener = (id, changeInfo) => {
        if (id === tabId && changeInfo.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  // 随机延迟 (模拟人类行为)
  async randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // 清理资源
  async cleanup() {
    if (this.tabId) {
      try {
        await chrome.tabs.remove(this.tabId);
      } catch {}
      this.tabId = null;
    }
  }

  // 关闭采集标签页
  async closeCollectorTab() {
    await this.cleanup();
  }
}
```

#### 1.4 重构后的 service-worker.js

**新的入口文件** (精简到 100 行):
```javascript
/**
 * VOC-Master Background Service Worker
 * Manifest V3 - 模块化重构版本
 */

import { AuthManager } from './modules/auth.js';
import { ReviewCollector } from './modules/collector.js';
import { TaskQueue } from './modules/queue.js';

// 初始化管理器
const authManager = new AuthManager();
const collector = new ReviewCollector();
const taskQueue = new TaskQueue();

// 启动时恢复认证状态
authManager.restore();

// 消息处理路由
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    // 认证相关
    'AUTH_LOGIN': () => authManager.login(message.email, message.password),
    'AUTH_LOGOUT': () => authManager.logout(),
    'AUTH_GET_STATE': () => ({ success: true, ...authManager.state }),
    'AUTH_VERIFY': () => authManager.verify(),

    // 采集相关
    'START_TAB_COLLECTION': () => handleStartCollection(message, sender),
    'STOP_COLLECTION': () => collector.stop(),

    // 队列相关
    'BATCH_START_EXTERNAL': () => taskQueue.addBatch(message.asins, message.config),
    'GET_QUEUE_STATUS': () => taskQueue.getStatus()
  };

  const handler = handlers[message.type];
  if (handler) {
    handler()
      .then(result => sendResponse(result || { success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持异步通道
  }

  sendResponse({ error: 'Unknown message type' });
});

// 采集处理
async function handleStartCollection(message, sender) {
  const { asin, config } = message;
  const originTabId = sender.tab?.id;

  try {
    await collector.start(asin, config, (progress) => {
      // 发送进度到原始标签页
      if (originTabId) {
        chrome.tabs.sendMessage(originTabId, {
          type: 'COLLECTION_PROGRESS',
          ...progress
        }).catch(() => {});
      }
    });

    // 发送完成通知
    if (originTabId) {
      chrome.tabs.sendMessage(originTabId, {
        type: 'COLLECTION_COMPLETE',
        success: true
      });
    }
  } catch (error) {
    if (originTabId) {
      chrome.tabs.sendMessage(originTabId, {
        type: 'COLLECTION_ERROR',
        error: error.message
      });
    }
  }
}

console.log('VOC-Master service worker started (Refactored)');
```

### 阶段二: TypeScript 迁移 (中优先级)

**为什么要用 TypeScript?**
- ✅ 类型安全，减少运行时错误
- ✅ 更好的 IDE 支持和自动完成
- ✅ 代码更易维护

**迁移计划**:
```
1. 安装 TypeScript 和构建工具
2. 创建 tsconfig.json
3. 逐步将 .js 改为 .ts
4. 添加类型定义
5. 使用 webpack/rollup 打包
```

### 阶段三: 性能优化 (低优先级)

1. **使用 IndexedDB 缓存数据**
   - 缓存已采集的评论
   - 避免重复采集

2. **并发采集优化**
   - 使用 Promise.allSettled
   - 限制并发数量

3. **错误恢复机制**
   - 采集中断后自动恢复
   - 保存采集进度

## 📝 执行步骤

### 第一步: 备份当前代码
```bash
cd extension
git add .
git commit -m "backup: 优化前的代码备份"
```

### 第二步: 创建模块目录
```bash
mkdir -p src/background/modules
```

### 第三步: 逐步迁移
1. 先拆分 config.js 和 api.js (不影响现有功能)
2. 测试 API 调用是否正常
3. 继续拆分 auth.js
4. 最后拆分 collector.js

### 第四步: 测试
- 测试登录/登出
- 测试评论采集
- 测试错误处理

## 🎯 预期效果

优化后:
- ✅ 代码行数减少 40%
- ✅ 可维护性提升 200%
- ✅ 错误处理更完善
- ✅ 环境切换更方便
- ✅ 易于添加新功能

---

**准备好开始优化了吗?** 🚀
