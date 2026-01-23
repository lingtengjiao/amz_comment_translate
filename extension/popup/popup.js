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
  const onSearchPageView = document.getElementById('on-search-page');  // [NEW]
  const asinDisplay = document.getElementById('asin-display');
  const titleDisplay = document.getElementById('title-display');
  const openPanelBtn = document.getElementById('open-panel-btn');
  const openSelectorBtn = document.getElementById('open-selector-btn');  // [NEW]
  const openRufusBtn = document.getElementById('open-rufus-btn');  // [NEW] 搜索页
  const openRufusHomepageBtn = document.getElementById('open-rufus-homepage-btn');  // [NEW] 首页
  const openRufusProductBtn = document.getElementById('open-rufus-product-btn');  // [NEW] 产品页
  const searchProductCount = document.getElementById('search-product-count');  // [NEW]
  const notAmazonMessage = document.getElementById('not-amazon-message');  // [NEW]
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
  function showMainView(user, pageType = 'not-amazon', productCount = 0) {
    loginView.style.display = 'none';
    userBar.style.display = 'flex';
    userName.textContent = user?.name || user?.email?.split('@')[0] || '用户';
    
    // 隐藏所有视图
    notAmazonView.style.display = 'none';
    onAmazonView.style.display = 'none';
    if (onSearchPageView) onSearchPageView.style.display = 'none';
    
    // 根据页面类型显示对应视图
    if (pageType === 'search') {
      if (onSearchPageView) {
        onSearchPageView.style.display = 'block';
        if (searchProductCount) {
          searchProductCount.textContent = `找到 ${productCount} 个产品`;
        }
      }
    } else if (pageType === 'product') {
      onAmazonView.style.display = 'block';
    } else {
      notAmazonView.style.display = 'block';
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
    DASHBOARD_URL: 'https://98kamz.com'  // 生产环境前端地址
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
      tab.url.includes('amazon.co.jp') ||
      tab.url.includes('amazon.com.au')
    );

    if (!isAmazon) {
      showMainView(authState.user, 'not-amazon');
      return;
    }

    // [NEW] 获取页面类型信息
    let retries = 3;
    let pageTypeResponse = null;
    
    while (retries > 0 && !pageTypeResponse) {
      try {
        pageTypeResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TYPE' });
        break;
      } catch (error) {
        console.error(`Error getting page type (retries left: ${retries - 1}):`, error);
        
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
    
    // [NEW] 根据页面类型显示不同界面
    if (pageTypeResponse?.isSearchResultsPage) {
      // 搜索结果页
      showMainView(authState.user, 'search', pageTypeResponse.productCount || 0);
    } else if (pageTypeResponse?.isProductPage) {
      // 产品详情页
      showMainView(authState.user, 'product');
      
      // 获取产品信息
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_INFO' });
        if (response && response.asin) {
          asinDisplay.textContent = `ASIN: ${response.asin}`;
          titleDisplay.textContent = response.title || '商品标题获取中...';
        } else {
          asinDisplay.textContent = 'ASIN: 未检测到';
          titleDisplay.textContent = '请进入商品详情页';
        }
      } catch (error) {
        asinDisplay.textContent = 'ASIN: --';
        titleDisplay.textContent = '无法获取商品信息（请刷新页面）';
      }
    } else {
      // 其他 Amazon 页面（可能是首页）
      showMainView(authState.user, 'not-amazon');
      // 如果是Amazon首页，显示Rufus按钮
      if (notAmazonMessage && tab.url && (
        tab.url.match(/amazon\.[a-z.]+\/?$/i) || 
        tab.url.match(/amazon\.[a-z.]+\/\?/i) ||
        tab.url.match(/amazon\.[a-z.]+\/ref=/i)
      )) {
        notAmazonMessage.textContent = 'Amazon 首页：可以使用 Rufus 对话功能。';
        if (openRufusHomepageBtn) {
          openRufusHomepageBtn.style.display = 'block';
        }
      }
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

  // ==========================================
  // [NEW] 打开产品选择器（搜索结果页）
  // ==========================================
  if (openSelectorBtn) {
    openSelectorBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PRODUCT_SELECTOR' });
        window.close();
      } catch (error) {
        console.error('Error opening product selector:', error);
        alert('无法打开产品选择器，请刷新页面后重试');
      }
    });
  }

  // ==========================================
  // [NEW] 打开 Rufus 面板（搜索页）
  // ==========================================
  if (openRufusBtn) {
    openRufusBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_OVERLAY' });
        window.close();
      } catch (error) {
        console.error('Error opening Rufus panel:', error);
        alert('无法打开 Rufus 面板，请刷新页面后重试');
      }
    });
  }

  // ==========================================
  // [NEW] 打开 Rufus 面板（首页）
  // ==========================================
  if (openRufusHomepageBtn) {
    openRufusHomepageBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_OVERLAY' });
        window.close();
      } catch (error) {
        console.error('Error opening Rufus panel:', error);
        alert('无法打开 Rufus 面板，请刷新页面后重试');
      }
    });
  }

  // ==========================================
  // [NEW] 打开 Rufus 面板（产品页）
  // ==========================================
  if (openRufusProductBtn) {
    openRufusProductBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_OVERLAY' });
        window.close();
      } catch (error) {
        console.error('Error opening Rufus panel:', error);
        alert('无法打开 Rufus 面板，请刷新页面后重试');
      }
    });
  }

  // 启动初始化
  await init();
});
