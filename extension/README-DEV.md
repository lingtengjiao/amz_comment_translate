# VOC-Master 插件本地开发指南

## 🚀 快速开始

### 1. 本地环境配置

本插件现已配置为本地开发模式，连接到本地后端服务：

- **后端 API**: `http://localhost:8000/api/v1`
- **前端控制台**: `http://localhost:3000`

### 2. 启动后端服务

在项目根目录运行：

```bash
# 启动后端 API 服务
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 或使用 Docker
cd ..
docker-compose up -d
```

### 3. 启动前端服务

```bash
# 启动前端开发服务器
cd frontend
npm run dev
# 默认会在 http://localhost:3000 启动
```

### 4. 加载插件到浏览器

#### Chrome/Edge 浏览器:

1. 打开浏览器，访问 `chrome://extensions/`
2. 开启右上角的 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择项目中的 `extension` 文件夹
5. 插件加载成功！

#### 验证插件已加载:

- 插件图标应出现在浏览器工具栏
- 插件名称显示为: **"VOC-Master: Amazon Review Collector (Local Dev)"**
- 版本号: **1.0.2-dev**

### 5. 测试插件功能

1. 访问任意 Amazon 产品页面，例如：
   - https://www.amazon.com/dp/B08N5WRWNW
   
2. 点击插件图标，应该能看到:
   - 登录界面（如果未登录）
   - ASIN 和产品标题（如果已登录）
   
3. 点击 "开始采集" 按钮，插件会:
   - 自动采集评论
   - 将数据发送到本地后端 `http://localhost:8000`
   - 实时显示进度

## 📁 本地开发版本修改内容

### 1. `manifest.json` 修改

```json
{
  "name": "VOC-Master: Amazon Review Collector (Local Dev)",
  "version": "1.0.2-dev",
  "host_permissions": [
    "http://localhost:*/*",
    "http://127.0.0.1:*/*"
  ],
  "externally_connectable": {
    "matches": [
      "http://localhost:*/*",
      "http://127.0.0.1:*/*"
    ]
  }
}
```

### 2. `service-worker.js` 修改

```javascript
// 后端 API 地址改为本地
const API_BASE_URL = 'http://localhost:8000/api/v1';

// 允许的外部域名改为本地
const allowedOrigins = [
  'http://localhost:',
  'http://127.0.0.1:'
];
```

### 3. `content.js` 修改

```javascript
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000/api/v1',
  DASHBOARD_URL: 'http://localhost:3000'
};
```

## 🔧 开发调试技巧

### 1. 查看插件日志

- 打开 `chrome://extensions/`
- 找到 VOC-Master 插件
- 点击 **"检查视图"** > **"Service Worker"**
- 在 Console 中查看后台日志

### 2. 查看页面脚本日志

- 在 Amazon 产品页面按 `F12` 打开开发者工具
- 切换到 **Console** 标签
- 查看 Content Script 的日志输出

### 3. 修改代码后重新加载

- 修改代码后，打开 `chrome://extensions/`
- 点击插件卡片上的 **"刷新"** 图标 🔄
- 或按 `Ctrl+R` (Mac: `Cmd+R`) 刷新插件

### 4. 调试 API 请求

使用浏览器 Network 面板查看 API 请求：

- 打开开发者工具 > **Network** 标签
- 筛选 `Fetch/XHR`
- 查看发送到 `localhost:8000` 的请求

## 🐛 常见问题

### 1. 插件无法连接后端

**问题**: 点击"开始采集"后报错 "请求超时，请确保后端服务正在运行"

**解决方案**:
```bash
# 检查后端是否运行
curl http://localhost:8000/api/v1/health

# 如果没响应，启动后端
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

### 2. CORS 跨域错误

**问题**: Console 显示 CORS 错误

**解决方案**: 检查后端 CORS 配置

```python
# backend/app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "chrome-extension://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 3. 插件修改后未生效

**解决方案**:
1. 在 `chrome://extensions/` 点击刷新插件
2. 关闭并重新打开 Amazon 页面
3. 如果还不行，完全卸载插件重新加载

## 📝 开发规范

### 代码修改建议

1. **API 地址配置**: 统一使用 `API_BASE_URL` 常量
2. **日志输出**: 使用 `console.log('[标签] 消息')` 格式
3. **错误处理**: 所有 API 调用都要有 try-catch
4. **用户提示**: 使用 Overlay 面板显示状态，避免 alert

### 提交代码前检查

- [ ] 确保本地开发环境配置正确
- [ ] 测试采集功能是否正常
- [ ] 检查 Console 无报错
- [ ] 确认代码格式化

## 🚀 生产环境部署

当需要部署到生产环境时，修改以下配置：

### 1. 修改 API 地址

```javascript
// service-worker.js
const API_BASE_URL = 'https://api.voc-master.com/api/v1';

// content.js
const CONFIG = {
  API_BASE_URL: 'https://api.voc-master.com/api/v1',
  DASHBOARD_URL: 'https://voc-master.com'
};
```

### 2. 修改 manifest.json

```json
{
  "name": "VOC-Master: Amazon Review Collector",
  "version": "1.0.3",
  "host_permissions": [
    "https://api.voc-master.com/*"
  ]
}
```

### 3. 打包插件

```bash
# 在 extension 目录下打包
cd extension
zip -r ../voc-master-v1.0.3.zip . -x "*.git*" -x "node_modules/*"
```

## 📚 相关文档

- [Chrome Extension 开发文档](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Service Worker 调试指南](https://developer.chrome.com/docs/extensions/mv3/service_workers/)

---

**祝开发顺利！** 🎉
