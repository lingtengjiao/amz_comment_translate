/**
 * VOC-Master Popup Script
 * 
 * Handles popup UI, authentication, and communication with content script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 元素引用
  const loginView = document.getElementById('login-view');
  const userBar = document.getElementById('user-bar');
  const notAmazonView = document.getElementById('not-amazon');
  const onAmazonView = document.getElementById('on-amazon');
  const asinDisplay = document.getElementById('asin-display');
  const titleDisplay = document.getElementById('title-display');
  const openPanelBtn = document.getElementById('open-panel-btn');
  const loginForm = document.getElementById('login-form');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userName = document.getElementById('user-name');
  const myInsightsLink = document.getElementById('my-insights-link');

  // ==========================================
  // 检查登录状态
  // ==========================================
  async function checkAuthState() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' }, (response) => {
        resolve(response || { isLoggedIn: false });
      });
    });
  }

  // ==========================================
  // 显示登录界面
  // ==========================================
  function showLoginView() {
    loginView.style.display = 'block';
    userBar.style.display = 'none';
    notAmazonView.style.display = 'none';
    onAmazonView.style.display = 'none';
  }

  // ==========================================
  // 显示主界面
  // ==========================================
  function showMainView(user, isAmazon = false) {
    loginView.style.display = 'none';
    userBar.style.display = 'flex';
    userName.textContent = user?.name || user?.email?.split('@')[0] || '用户';
    
    if (isAmazon) {
      notAmazonView.style.display = 'none';
      onAmazonView.style.display = 'block';
    } else {
      notAmazonView.style.display = 'block';
      onAmazonView.style.display = 'none';
    }
  }

  // ==========================================
  // 登录表单提交
  // ==========================================
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    
    if (!email || !password) {
      showError('请输入邮箱和密码');
      return;
    }
    
    // 禁用按钮，显示加载
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span>⏳</span> 登录中...';
    loginError.style.display = 'none';
    
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'AUTH_LOGIN',
          email,
          password
        }, resolve);
      });
      
      if (response.success) {
        // 登录成功，刷新界面
        await init();
      } else {
        showError(response.error || '登录失败');
      }
    } catch (error) {
      showError('登录请求失败');
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = '<span>🔓</span> 登录';
    }
  });

  function showError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
  }

  // ==========================================
  // 登出
  // ==========================================
  logoutBtn.addEventListener('click', async () => {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'AUTH_LOGOUT' }, resolve);
    });
    showLoginView();
  });

  // ==========================================
  // 配置（与 content.js 保持一致）
  // ==========================================
  const CONFIG = {
    DASHBOARD_URL: 'http://localhost:3000'  // 本地前端地址
  };

  // 设置"进入我的洞察"链接
  if (myInsightsLink) {
    myInsightsLink.href = `${CONFIG.DASHBOARD_URL}/home/my-projects`;
  }

  // ==========================================
  // 初始化
  // ==========================================
  async function init() {
    // 检查登录状态
    const authState = await checkAuthState();
    
    if (!authState.isLoggedIn) {
      showLoginView();
      return;
    }
    
    // 已登录，检查是否在 Amazon 页面
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const isAmazon = tab.url && (
      tab.url.includes('amazon.com') ||
      tab.url.includes('amazon.co.uk') ||
      tab.url.includes('amazon.de') ||
      tab.url.includes('amazon.fr') ||
      tab.url.includes('amazon.co.jp')
    );

    showMainView(authState.user, isAmazon);

    if (!isAmazon) {
      return;
    }

    // 获取页面信息
    let retries = 3;
    let response = null;
    
    while (retries > 0 && !response) {
      try {
        response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });
        
        if (response && response.asin) {
          asinDisplay.textContent = `ASIN: ${response.asin}`;
          titleDisplay.textContent = response.title || '商品标题获取中...';
          break;
        } else if (response) {
          asinDisplay.textContent = 'ASIN: 未检测到';
          titleDisplay.textContent = '请进入商品详情页';
          break;
        }
      } catch (error) {
        console.error(`Error getting page info (retries left: ${retries - 1}):`, error);
        
        if (error.message && error.message.includes('Receiving end')) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['src/content/content.js']
            });
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (injectError) {
            console.error('Error injecting content script:', injectError);
          }
        }
        
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }
    
    if (!response) {
      asinDisplay.textContent = 'ASIN: --';
      titleDisplay.textContent = '无法获取商品信息（请刷新页面）';
    }
  }

  // ==========================================
  // 打开采集面板
  // ==========================================
  openPanelBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_OVERLAY' });
      window.close();
    } catch (error) {
      console.error('Error opening overlay:', error);
      alert('无法打开采集面板，请刷新页面后重试');
    }
  });

  // 启动初始化
  await init();
});
