# 插件生产环境切换完成

## 📋 切换信息

- **生产环境前端**: http://115.191.30.209
- **生产环境后端**: http://115.191.30.209/api/v1
- **插件版本**: 1.0.4
- **切换时间**: 2026-01-12

---

## ✅ 修改内容总结

### 1. manifest.json
- ✅ 名称: `VOC-Master: Amazon Review Collector (Local Dev)` → `VOC-Master: Amazon Review Collector`
- ✅ 版本: `1.0.3` → `1.0.4`
- ✅ host_permissions: 
  - 移除 `http://localhost:*/*`
  - 移除 `http://127.0.0.1:*/*`
  - 添加 `http://115.191.30.209/*`
- ✅ externally_connectable:
  - 移除 `http://localhost:*/*`
  - 移除 `http://127.0.0.1:*/*`
  - 添加 `http://115.191.30.209/*`

### 2. src/background/service-worker.js
```javascript
// 修改前
const API_BASE_URL = 'http://localhost:8000/api/v1';

// 修改后
const API_BASE_URL = 'http://115.191.30.209/api/v1';
```

### 3. src/content/content.js
```javascript
// 修改前
const CONFIG = {
  API_BASE_URL: 'http://localhost:8000/api/v1',
  DASHBOARD_URL: 'http://localhost:3000',
  ...
};

// 修改后
const CONFIG = {
  API_BASE_URL: 'http://115.191.30.209/api/v1',
  DASHBOARD_URL: 'http://115.191.30.209',
  ...
};
```

### 4. popup/popup.html
```html
<!-- 修改前 -->
<a href="http://localhost:3000" target="_blank" class="link-btn">
  打开控制台
</a>
<a href="http://localhost:8000/docs" target="_blank" class="link-btn">
  API 文档
</a>

<!-- 修改后 -->
<a href="http://115.191.30.209" target="_blank" class="link-btn">
  打开控制台
</a>
<a href="http://115.191.30.209/api/docs" target="_blank" class="link-btn">
  API 文档
</a>
```

---

## 📦 安装步骤

### Chrome 浏览器

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension` 文件夹
5. 插件安装成功！

### 验证安装

1. 点击浏览器工具栏的插件图标
2. 查看版本号是否为 `v1.1`
3. 点击「打开控制台」，应跳转到 `http://115.191.30.209`
4. 访问任意 Amazon 产品页面，测试采集功能

---

## 🔄 切换回本地环境

如需切换回本地开发环境，运行：

```bash
cd extension
./switch-env.sh
```

---

## 🧪 测试清单

- [ ] 插件可以正常安装（无报错）
- [ ] 版本号显示为 `v1.1`
- [ ] 名称为 `VOC-Master: Amazon Review Collector`（不含 "Local Dev"）
- [ ] 点击「打开控制台」跳转到生产环境
- [ ] 点击「API 文档」跳转到生产环境
- [ ] 登录功能正常
- [ ] 采集评论功能正常
- [ ] 数据同步到生产环境后台

---

## 📝 注意事项

1. **CORS 配置**: 确保生产环境后端的 CORS 配置允许 `chrome-extension://` 来源
2. **API 可访问性**: 确保 `http://115.191.30.209/api/v1` 可以从公网访问
3. **Token 过期**: 生产环境的 JWT Token 有效期为 7 天，需定期重新登录
4. **数据隔离**: 生产环境和本地环境的数据是完全隔离的

---

## 🔧 快速切换脚本

### 切换到生产环境
```bash
cd extension
./switch-to-prod.sh
```

### 切换回本地环境
```bash
cd extension
./switch-env.sh
```

---

生成时间: 2026-01-12
