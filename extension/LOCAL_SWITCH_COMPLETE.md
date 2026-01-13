# 插件本地环境切换完成

## 📋 切换信息

- **本地环境前端**: http://localhost:3000
- **本地环境后端**: http://localhost:8000/api/v1
- **插件版本**: 1.0.6
- **切换时间**: 2026-01-12

---

## ✅ 修改内容总结

### 1. manifest.json
- ✅ 名称: `VOC-Master: Amazon Review Collector` → `VOC-Master: Amazon Review Collector (Local Dev)`
- ✅ 版本: `1.0.5` → `1.0.6`
- ✅ host_permissions: 
  - 添加 `http://localhost:*/*`
  - 添加 `http://127.0.0.1:*/*`
  - 移除 `http://115.191.30.209/*`
- ✅ externally_connectable:
  - 添加 `http://localhost:*/*`
  - 添加 `http://127.0.0.1:*/*`
  - 移除 `http://115.191.30.209/*`

### 2. src/background/service-worker.js
```javascript
// 修改前
const API_BASE_URL = 'http://115.191.30.209/api/v1';

// 修改后
const API_BASE_URL = 'http://localhost:8000/api/v1';
```

### 3. src/content/content.js
```javascript
// 修改前
const CONFIG = {
  API_BASE_URL: 'http://115.191.30.209/api/v1',
  DASHBOARD_URL: 'http://115.191.30.209',
  ...
};

// 修改后
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000/api/v1',
  DASHBOARD_URL: 'http://localhost:3000',
  ...
};
```

### 4. popup/popup.html
```html
<!-- 修改前 -->
<a href="http://115.191.30.209" target="_blank" class="link-btn">
  打开控制台
</a>
<a href="http://115.191.30.209/api/docs" target="_blank" class="link-btn">
  API 文档
</a>

<!-- 修改后 -->
<a href="http://localhost:3000" target="_blank" class="link-btn">
  打开控制台
</a>
<a href="http://localhost:8000/docs" target="_blank" class="link-btn">
  API 文档
</a>
```

---

## 📦 刷新插件

### Chrome 浏览器

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 找到 **VOC-Master** 插件
3. 点击右下角的 **刷新按钮 🔄**
4. 完成！

### 验证刷新

1. 点击浏览器工具栏的插件图标
2. 查看版本号是否为 `v1.1`
3. 名称应包含 `(Local Dev)`
4. 点击「打开控制台」，应跳转到 `http://localhost:3000`
5. 访问任意 Amazon 产品页面，测试采集功能

---

## 🔄 快速切换命令

### 切换到本地环境
```bash
cd extension
./switch-to-local.sh
```

### 切换到生产环境
```bash
cd extension
./switch-to-prod.sh
```

---

## 🧪 测试清单

- [ ] 插件名称包含 "(Local Dev)"
- [ ] 版本号显示为 `v1.1`
- [ ] 点击「打开控制台」跳转到本地环境
- [ ] 点击「API 文档」跳转到本地环境
- [ ] 登录功能正常（使用本地账号）
- [ ] 采集评论功能正常
- [ ] 数据同步到本地后台

---

## 📝 注意事项

1. **本地服务必须运行**: 确保本地的 Docker 服务都在运行
   ```bash
   docker-compose ps
   ```

2. **端口检查**: 
   - 前端: http://localhost:3000 应可访问
   - 后端: http://localhost:8000/api/v1 应可访问

3. **数据隔离**: 本地环境和生产环境的数据是完全隔离的

4. **开发调试**: 本地环境便于开发调试，可以查看详细日志

---

## 🔧 环境对比

| 项目 | 本地环境 | 生产环境 |
|------|---------|---------|
| **前端** | http://localhost:3000 | http://115.191.30.209 |
| **后端** | http://localhost:8000/api/v1 | http://115.191.30.209/api/v1 |
| **插件名称** | VOC-Master (Local Dev) | VOC-Master |
| **版本号** | 1.0.6 | 1.0.5 |
| **用途** | 开发调试 | 正式使用 |

---

生成时间: 2026-01-12
