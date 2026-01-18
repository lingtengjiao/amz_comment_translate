/**
 * 用户行为分析 SDK
 * 
 * 提供自动和手动事件追踪功能
 */

const API_BASE = '/api/v1';

// 事件队列
let eventQueue: Array<{
  user_id?: string;
  event_type: string;
  event_name: string;
  event_data?: Record<string, any>;
  page_path?: string;
  session_id?: string;
}> = [];

// 批量上报间隔（毫秒）
const BATCH_INTERVAL = 5000; // 5秒
let batchTimer: NodeJS.Timeout | null = null;

// 会话ID
let currentSessionId: string | null = null;

// 获取当前用户ID
function getCurrentUserId(): string | null {
  try {
    const userStr = localStorage.getItem('voc_auth_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.id || null;
    }
  } catch (e) {
    console.error('[Analytics] Failed to get user ID:', e);
  }
  return null;
}

// 获取当前页面路径
function getCurrentPath(): string {
  return window.location.pathname + window.location.search;
}

// 生成会话ID
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 获取或创建会话ID
function getSessionId(): string {
  if (!currentSessionId) {
    currentSessionId = generateSessionId();
    
    // 开始会话
    startSession();
  }
  return currentSessionId;
}

// 开始会话（由后端API处理，这里只记录事件）
async function startSession() {
  const userId = getCurrentUserId();
  if (!userId) return;
  
  // 会话开始事件会通过事件队列上报
  track('session_start', { session_id: currentSessionId }, 'feature_use');
}

// 结束会话
async function endSession() {
  if (!currentSessionId) return;
  
  // 记录会话结束事件
  track('session_end', { session_id: currentSessionId }, 'feature_use');
  
  // 立即上报所有事件
  await flushEvents();
  
  currentSessionId = null;
}

// 批量上报事件
async function flushEvents() {
  if (eventQueue.length === 0) return;
  
  const eventsToSend = [...eventQueue];
  eventQueue = [];
  
  try {
    const token = localStorage.getItem('voc_auth_token');
    if (!token) {
      // 如果没有token，将事件重新加入队列
      eventQueue.unshift(...eventsToSend);
      return;
    }
    
    await fetch(`${API_BASE}/analytics/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        events: eventsToSend
      })
    });
  } catch (e) {
    console.error('[Analytics] Failed to send events:', e);
    // 失败后重新加入队列（限制队列大小）
    if (eventQueue.length < 100) {
      eventQueue.unshift(...eventsToSend);
    }
  }
}

// 启动批量上报定时器
function startBatchTimer() {
  if (batchTimer) return;
  
  batchTimer = setInterval(() => {
    flushEvents();
  }, BATCH_INTERVAL);
}

// 停止批量上报定时器
function stopBatchTimer() {
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }
}

// 发送会话心跳
async function sendHeartbeat() {
  if (!currentSessionId) return;
  
  try {
    const token = localStorage.getItem('voc_auth_token');
    if (!token) return;
    
    // 统计页面浏览数（从事件队列中统计 page_view 事件）
    const pageViews = eventQueue.filter(e => e.event_type === 'page_view').length;
    
    await fetch(`${API_BASE}/analytics/session/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        session_id: currentSessionId,
        page_views: pageViews
      })
    });
  } catch (e) {
    console.error('[Analytics] Failed to send heartbeat:', e);
  }
}

/**
 * 追踪事件
 * 
 * @param eventName 事件名称
 * @param eventData 事件数据
 * @param eventType 事件类型 (page_view/click/feature_use)
 */
export function track(
  eventName: string,
  eventData?: Record<string, any>,
  eventType: string = 'feature_use'
) {
  const userId = getCurrentUserId();
  const sessionId = getSessionId();
  const pagePath = getCurrentPath();
  
  eventQueue.push({
    user_id: userId || undefined,
    event_type: eventType,
    event_name: eventName,
    event_data: eventData,
    page_path: pagePath,
    session_id: sessionId
  });
  
  // 如果队列达到一定大小，立即上报
  if (eventQueue.length >= 10) {
    flushEvents();
  } else {
    startBatchTimer();
  }
}

/**
 * 追踪页面访问
 */
export function trackPageView(pagePath?: string) {
  track(
    'page_view',
    { path: pagePath || getCurrentPath() },
    'page_view'
  );
}

/**
 * 追踪功能使用
 */
export function trackFeature(featureName: string, data?: Record<string, any>) {
  track(featureName, data, 'feature_use');
}

/**
 * 追踪点击事件
 */
export function trackClick(elementName: string, data?: Record<string, any>) {
  track(elementName, data, 'click');
}

/**
 * 初始化分析SDK
 */
export function initAnalytics() {
  // 监听路由变化（如果使用 React Router）
  if (typeof window !== 'undefined') {
    // 页面加载时追踪
    trackPageView();
    
    // 监听页面卸载
    window.addEventListener('beforeunload', () => {
      // 立即上报所有事件
      flushEvents();
      // 结束会话
      endSession();
    });
    
    // 定期发送心跳（每30秒）
    setInterval(() => {
      sendHeartbeat();
    }, 30000);
    
    // 页面可见性变化时发送心跳
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    });
  }
}

/**
 * 清理分析SDK
 */
export function cleanupAnalytics() {
  stopBatchTimer();
  flushEvents();
  endSession();
}

// 导出默认对象
export default {
  track,
  trackPageView,
  trackFeature,
  trackClick,
  initAnalytics,
  cleanupAnalytics
};
