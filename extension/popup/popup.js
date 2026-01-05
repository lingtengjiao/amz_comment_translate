/**
 * VOC-Master Popup Script
 * 
 * Handles popup UI and communication with content script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const notAmazonView = document.getElementById('not-amazon');
  const onAmazonView = document.getElementById('on-amazon');
  const asinDisplay = document.getElementById('asin-display');
  const titleDisplay = document.getElementById('title-display');
  const openPanelBtn = document.getElementById('open-panel-btn');

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Check if on Amazon
  const isAmazon = tab.url && (
    tab.url.includes('amazon.com') ||
    tab.url.includes('amazon.co.uk') ||
    tab.url.includes('amazon.de') ||
    tab.url.includes('amazon.fr') ||
    tab.url.includes('amazon.co.jp')
  );

  if (!isAmazon) {
    notAmazonView.style.display = 'block';
    onAmazonView.style.display = 'none';
    return;
  }

  // Show Amazon view
  notAmazonView.style.display = 'none';
  onAmazonView.style.display = 'block';

  // Get page info from content script with retry
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
        // Content script not ready, try to inject it
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/content/content.js']
          });
          // Wait a bit for script to initialize
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (injectError) {
          console.error('Error injecting content script:', injectError);
        }
      }
      
      retries--;
      if (retries > 0) {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
  
  if (!response) {
    asinDisplay.textContent = 'ASIN: --';
    titleDisplay.textContent = '无法获取商品信息（请刷新页面）';
  }

  // Open panel button
  openPanelBtn.addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_OVERLAY' });
      window.close(); // Close popup after opening overlay
    } catch (error) {
      console.error('Error opening overlay:', error);
      alert('无法打开采集面板，请刷新页面后重试');
    }
  });
});

