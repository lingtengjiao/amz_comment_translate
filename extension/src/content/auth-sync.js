/**
 * 认证同步 Content Script
 * 
 * 用于在网页端 (98kamz.com) 和插件之间同步登录状态
 * 
 * 功能：
 * 1. 网页登录后 → 同步到插件
 * 2. 插件登录后 → 同步到网页
 */

(function() {
  'use strict';
  
  const TOKEN_KEY = 'voc_auth_token';
  const USER_KEY = 'voc_auth_user';
  const EXTENSION_ID_KEY = 'voc_extension_id';
  
  console.log('[AuthSync] Content script loaded on:', window.location.hostname);
  
  // ==========================================
  // 1. 将插件 ID 注册到网页（让网页知道插件存在）
  // ==========================================
  function registerExtensionId() {
    const extensionId = chrome.runtime.id;
    if (extensionId) {
      localStorage.setItem(EXTENSION_ID_KEY, extensionId);
      console.log('[AuthSync] Extension ID registered:', extensionId);
    }
  }
  
  // ==========================================
  // 2. 检查插件登录状态并同步到网页
  // ==========================================
  async function syncFromExtension() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' });
      
      if (response?.success && response.isLoggedIn && response.user) {
        // 获取 token
        const tokenResponse = await chrome.runtime.sendMessage({ type: 'AUTH_GET_TOKEN' });
        
        if (tokenResponse?.success && tokenResponse.token) {
          const currentToken = localStorage.getItem(TOKEN_KEY);
          
          // 如果网页没有登录，或者 token 不同，则同步
          if (!currentToken || currentToken !== tokenResponse.token) {
            localStorage.setItem(TOKEN_KEY, tokenResponse.token);
            localStorage.setItem(USER_KEY, JSON.stringify(response.user));
            console.log('[AuthSync] ✅ Synced auth from extension to web:', response.user.email);
            
            // 触发自定义事件，通知 React 应用更新状态
            window.dispatchEvent(new CustomEvent('voc-auth-synced', {
              detail: { source: 'extension', user: response.user }
            }));
            
            // 如果当前在登录页，刷新页面
            if (window.location.hash === '#/login' || window.location.pathname === '/login') {
              console.log('[AuthSync] On login page, reloading...');
              window.location.reload();
            }
          }
        }
      }
    } catch (e) {
      // 插件可能未安装或无法通信
      console.log('[AuthSync] Could not sync from extension:', e.message);
    }
  }
  
  // ==========================================
  // 3. 监听网页登录事件，同步到插件
  // ==========================================
  function setupWebLoginListener() {
    // 监听 localStorage 变化
    window.addEventListener('storage', (event) => {
      if (event.key === TOKEN_KEY && event.newValue) {
        console.log('[AuthSync] Detected web login, syncing to extension...');
        syncToExtension();
      } else if (event.key === TOKEN_KEY && !event.newValue) {
        console.log('[AuthSync] Detected web logout, syncing to extension...');
        syncLogoutToExtension();
      }
    });
    
    // 监听自定义登录事件（用于同一窗口内的登录）
    window.addEventListener('voc-web-login', (event) => {
      console.log('[AuthSync] Received voc-web-login event');
      syncToExtension();
    });
    
    window.addEventListener('voc-web-logout', () => {
      console.log('[AuthSync] Received voc-web-logout event');
      syncLogoutToExtension();
    });
  }
  
  // 同步网页登录状态到插件
  async function syncToExtension() {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const userStr = localStorage.getItem(USER_KEY);
      
      if (token && userStr) {
        const user = JSON.parse(userStr);
        
        const response = await chrome.runtime.sendMessage({
          type: 'WEB_AUTH_LOGIN',
          token: token,
          user: user
        });
        
        if (response?.success) {
          console.log('[AuthSync] ✅ Synced auth from web to extension:', user.email);
        }
      }
    } catch (e) {
      console.log('[AuthSync] Could not sync to extension:', e.message);
    }
  }
  
  // 同步登出到插件
  async function syncLogoutToExtension() {
    try {
      await chrome.runtime.sendMessage({ type: 'WEB_AUTH_LOGOUT' });
      console.log('[AuthSync] ✅ Synced logout to extension');
    } catch (e) {
      console.log('[AuthSync] Could not sync logout to extension:', e.message);
    }
  }
  
  // ==========================================
  // 4. 监听来自 service worker 的消息
  // ==========================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXTENSION_AUTH_LOGIN') {
      // 插件登录成功，同步到网页
      console.log('[AuthSync] Received login from extension:', message.user?.email);
      
      if (message.token && message.user) {
        localStorage.setItem(TOKEN_KEY, message.token);
        localStorage.setItem(USER_KEY, JSON.stringify(message.user));
        
        // 触发事件通知 React
        window.dispatchEvent(new CustomEvent('voc-auth-synced', {
          detail: { source: 'extension', user: message.user }
        }));
        
        sendResponse({ success: true });
        
        // 如果在登录页，自动跳转
        if (window.location.hash === '#/login' || window.location.pathname === '/login') {
          window.location.hash = '#/home/my-projects';
        }
      }
    } else if (message.type === 'EXTENSION_AUTH_LOGOUT') {
      // 插件登出，同步到网页
      console.log('[AuthSync] Received logout from extension');
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      
      // 触发事件通知 React
      window.dispatchEvent(new CustomEvent('voc-auth-logout', {
        detail: { source: 'extension' }
      }));
      
      sendResponse({ success: true });
      
      // 跳转到登录页
      window.location.hash = '#/login';
    }
    
    return true; // 保持异步通道
  });
  
  // ==========================================
  // 初始化
  // ==========================================
  registerExtensionId();
  setupWebLoginListener();
  
  // 延迟同步，确保页面加载完成
  setTimeout(() => {
    syncFromExtension();
  }, 500);
  
})();
