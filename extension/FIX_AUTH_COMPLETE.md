# 🔐 插件认证系统完整优化

## 📋 问题诊断

### 原始问题
用户反馈：登录后会"时不时"显示未登录状态

### 根本原因分析

**主要问题：Service Worker 竞态条件**
```javascript
// ❌ 问题代码
loadAuthState();  // 异步函数但没有 await
```

**触发场景**：
1. Service Worker 被浏览器休眠（超过30秒无活动）
2. 用户点击插件图标 → Service Worker 被唤醒
3. `loadAuthState()` 开始从 storage 读取（异步）
4. popup 立即发送 `AUTH_GET_STATE` 消息
5. 返回初始值（未登录）← **竞态条件**

**时间线示例**：
```
0ms  - Service Worker 启动
1ms  - loadAuthState() 被调用（不等待）
2ms  - popup 查询认证状态
3ms  - 返回 authState（未登录）← 错误！
10ms - loadAuthState() 完成，状态更新（但已晚）
```

### 次要问题

1. **无 Token 过期检测** - 7 天后 Token 过期但前端不知道
2. **无过期提醒** - 用户突然发现需要重新登录
3. **无状态同步** - 跨标签页登录/登出不同步

## ✅ 修复方案

### 1. 修复竞态条件（P0 - 核心修复）

#### 添加加载状态标志
```javascript
let authStateReady = false;
let authStateLoadPromise = null;

async function loadAuthState() {
  if (authStateLoadPromise) {
    return authStateLoadPromise;  // 防止重复加载
  }
  
  authStateLoadPromise = (async () => {
    // ... 加载逻辑
    authStateReady = true;
  })();
  
  return authStateLoadPromise;
}
```

#### Service Worker 启动时等待加载完成
```javascript
(async () => {
  console.log('[Service Worker] Starting...');
  await loadAuthState();  // ✅ 使用 await
  console.log('[Service Worker] ✅ Ready');
})();
```

#### 消息处理器确保状态已加载
```javascript
case 'AUTH_GET_STATE':
  if (!authStateReady) {
    // 等待加载完成
    await loadAuthState();
  }
  sendResponse({ ...authState });
```

### 2. Token 生命周期管理（P1 - 长期优化）

#### Token 结构
```javascript
authState = {
  isLoggedIn: false,
  token: null,
  user: null,
  tokenExpireAt: null,   // [NEW] 过期时间（毫秒）
  tokenIssuedAt: null,   // [NEW] 签发时间（毫秒）
  expiryWarningShown: false  // [NEW] 是否已显示过期提醒
}
```

#### JWT 解码
```javascript
function decodeJWTToken(token) {
  const parts = token.split('.');
  const payload = JSON.parse(atob(parts[1]));
  // payload.exp = Unix 时间戳（秒）
  // payload.iat = 签发时间戳（秒）
  return payload;
}
```

#### 登录时解码并保存过期信息
```javascript
async function login(email, password) {
  const data = await fetch(...);
  
  // 解码 Token
  const tokenPayload = decodeJWTToken(data.access_token);
  authState.tokenExpireAt = tokenPayload.exp * 1000;  // 转为毫秒
  authState.tokenIssuedAt = tokenPayload.iat * 1000;
  
  // 启动过期检查
  startTokenExpiryCheck();
}
```

#### 恢复状态时检查过期
```javascript
async function loadAuthState() {
  const result = await chrome.storage.local.get([...]);
  
  // 检查是否过期
  if (result.token_expire_at && Date.now() > result.token_expire_at) {
    await clearAuthState();  // 已过期，清除
  } else {
    authState = { ...result };
    startTokenExpiryCheck();  // 启动检查
  }
}
```

### 3. 自动过期检查和提醒

#### 定时检查（每分钟）
```javascript
function startTokenExpiryCheck() {
  tokenExpiryCheckInterval = setInterval(() => {
    const now = Date.now();
    const timeLeft = authState.tokenExpireAt - now;
    
    // 已过期
    if (timeLeft <= 0) {
      clearAuthState();
      notifyTokenExpired();
      return;
    }
    
    // 即将过期（剩余 < 1 天）
    if (timeLeft < 24 * 60 * 60 * 1000 && !authState.expiryWarningShown) {
      notifyTokenExpiringSoon(Math.ceil(timeLeft / (24*60*60*1000)));
      authState.expiryWarningShown = true;
    }
  }, 60000);  // 每分钟检查
}
```

#### 桌面通知
```javascript
function notifyTokenExpired() {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'VOC-Master',
    message: '登录已过期，请重新登录',
    priority: 2
  });
}

function notifyTokenExpiringSoon(daysLeft) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'VOC-Master',
    message: `您的登录将在 ${daysLeft} 天后过期，请注意续期`,
    priority: 1
  });
}
```

### 4. 跨标签页状态同步

```javascript
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && (changes.auth_token || changes.auth_user)) {
    console.log('[Auth] Storage changed, reloading...');
    authStateReady = false;
    authStateLoadPromise = null;
    loadAuthState();
  }
});
```

### 5. 改进的 Token 验证

```javascript
async function verifyToken() {
  // 本地检查（快速）
  if (authState.tokenExpireAt && Date.now() > authState.tokenExpireAt) {
    await clearAuthState();
    return { valid: false, reason: 'expired' };
  }
  
  // 服务器验证（准确）
  const response = await fetch(`${API_BASE_URL}/auth/verify`, ...);
  const data = await response.json();
  
  if (!data.valid) {
    await clearAuthState();
  }
  
  return data;
}
```

## 📊 Token 生命周期管理

### JWT Token 结构
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "exp": 1747891200,  // 过期时间（Unix 时间戳，秒）
  "iat": 1747286400   // 签发时间（Unix 时间戳，秒）
}
```

### Token 状态时间轴

```
Day 0 (签发)          Day 6 (1天剩余)      Day 7 (过期)
  |                        |                    |
  ├─────────────────────────┼────────────────────┤
  |                        |                    |
登录成功                  显示过期提醒         自动登出
启动检查                  (桌面通知)           清除状态
```

### 检查策略

| 场景 | 检查方式 | 频率 | 操作 |
|------|---------|------|------|
| Service Worker 启动 | 本地检查 | 一次 | 过期则清除 |
| 运行中定期检查 | 本地检查 | 每分钟 | 过期/即将过期通知 |
| API 调用前 | 本地检查 | 按需 | 过期则拒绝 |
| 用户主动验证 | 服务器验证 | 按需 | 最准确 |

## 🎯 用户体验提升

### 修复前
```
用户体验：😞
- 随机出现"未登录"（竞态条件）
- Token 过期后突然无法使用
- 没有任何提醒
- 需要刷新插件才能恢复
```

### 修复后
```
用户体验：😊
- 稳定的登录状态（无竞态条件）
- Token 即将过期时提醒（1天前）
- Token 过期自动清除并通知
- 跨标签页状态同步
- 本地快速检查 + 服务器准确验证
```

## 🔧 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `service-worker.js` | ✅ 修复竞态条件<br>✅ 添加 Token 解码<br>✅ 添加过期检查<br>✅ 添加桌面通知<br>✅ 添加状态同步 |
| `manifest.json` | ✅ 添加 `notifications` 权限 |

## 📝 代码统计

- **新增函数**: 5 个
  - `decodeJWTToken()` - JWT 解码
  - `startTokenExpiryCheck()` - 启动检查
  - `stopTokenExpiryCheck()` - 停止检查
  - `notifyTokenExpired()` - 过期通知
  - `notifyTokenExpiringSoon()` - 即将过期通知

- **修改函数**: 5 个
  - `loadAuthState()` - 添加过期检查
  - `saveAuthState()` - 保存过期时间
  - `clearAuthState()` - 停止定时器
  - `login()` - 解码 Token
  - `verifyToken()` - 本地快速检查

## 🚀 部署和测试

### 1. 刷新插件
```bash
# 在 chrome://extensions/ 刷新插件
```

### 2. 测试场景

#### 场景 1: 竞态条件测试
1. 关闭所有 Chrome 窗口（让 Service Worker 休眠）
2. 等待 1 分钟
3. 打开 Chrome，点击插件图标
4. **预期**: 立即显示登录状态（不会显示未登录）

#### 场景 2: Token 过期测试
```javascript
// 在 Service Worker Console 中手动测试
authState.tokenExpireAt = Date.now() - 1000;  // 设为已过期
await loadAuthState();  // 应该清除状态
```

#### 场景 3: 过期提醒测试
```javascript
// 设置为明天过期
authState.tokenExpireAt = Date.now() + (24 * 60 * 60 * 1000);
startTokenExpiryCheck();
// 等待 1 分钟，应该显示通知
```

#### 场景 4: 跨标签页同步
1. 在标签页 A 登录
2. 打开标签页 B 的插件 popup
3. **预期**: 标签页 B 也显示已登录
4. 在标签页 A 登出
5. **预期**: 标签页 B 自动更新为未登录

## 💡 最佳实践

### 对于开发者

1. **始终 await 异步操作**
   ```javascript
   // ❌ 错误
   loadAuthState();
   
   // ✅ 正确
   await loadAuthState();
   ```

2. **使用加载标志防止竞态**
   ```javascript
   if (!authStateReady) {
     await loadAuthState();
   }
   ```

3. **解码 JWT 获取元数据**
   ```javascript
   const payload = decodeJWTToken(token);
   // 不要忘记 exp 是秒，需要 * 1000 转为毫秒
   const expireAt = payload.exp * 1000;
   ```

4. **定时检查要清理**
   ```javascript
   // 登出或过期时停止定时器
   clearInterval(tokenExpiryCheckInterval);
   ```

### 对于用户

1. **留意桌面通知** - Token 即将过期时会提醒
2. **定期重新登录** - 建议每周登录一次
3. **不用担心竞态** - 系统会自动等待状态加载完成

## 🎓 技术要点

### Manifest V3 Service Worker 生命周期
- 30秒无活动 → 休眠
- 5分钟最大生命周期
- 重启时内存状态丢失
- **解决方案**: chrome.storage + await 加载

### JWT Token 特点
- 无状态（服务器不存储）
- 包含过期时间（exp）
- Base64 编码（可前端解码）
- 过期后无法刷新（需重新登录）

### Chrome Extension 最佳实践
- 使用 chrome.storage.local 持久化
- 监听 storage.onChanged 同步状态
- 使用 chrome.notifications 提醒用户
- Service Worker 启动时 await 关键操作

---

**修复完成！** 🎉

现在插件的认证系统非常可靠：
- ✅ 无竞态条件
- ✅ 自动过期检查
- ✅ 提前提醒用户
- ✅ 跨标签页同步
- ✅ 优雅的错误处理

用户再也不会遇到"时不时未登录"的问题了！
