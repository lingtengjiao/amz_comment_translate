# VOC-Master Chrome Extension

Amazon 评论智能采集翻译分析系统 - 浏览器插件端

> 📌 **当前版本**: Local Dev 1.0.2-dev (本地开发环境)  
> 📌 **配置**: 连接到 `localhost:8000` 后端服务

## 功能特点

- 🔍 **智能检测**: 自动识别 Amazon 商品 ASIN
- ⭐ **分星级采集**: 遍历 1-5 星评论，突破 10 页限制
- 🤖 **模拟人类行为**: 随机延迟，抗反爬
- 📊 **实时进度**: 可视化进度条显示采集状态
- 🔗 **一键跳转**: 采集完成后直接进入 Web 控制台

## 安装方法

### 开发者模式安装

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的 **"开发者模式"**
4. 点击 **"加载已解压的扩展程序"**
5. 选择 `extension` 目录

### 生成图标

在安装前，需要从 SVG 生成 PNG 图标：

```bash
# 使用 ImageMagick 转换 (可选)
cd extension/icons
convert -background transparent icon.svg -resize 16x16 icon16.png
convert -background transparent icon.svg -resize 32x32 icon32.png
convert -background transparent icon.svg -resize 48x48 icon48.png
convert -background transparent icon.svg -resize 128x128 icon128.png
```

或者手动创建简单的 PNG 图标文件。

## 使用方法

1. 访问任意 Amazon 商品页面
2. 点击浏览器工具栏的 VOC-Master 图标
3. 点击 **"打开采集面板"**
4. 配置采集参数（星级、页数）
5. 点击 **"开始采集"**
6. 等待采集完成
7. 点击 **"前往控制台查看分析"**

## 支持的 Amazon 站点

- amazon.com (美国)
- amazon.co.uk (英国)
- amazon.de (德国)
- amazon.fr (法国)
- amazon.co.jp (日本)

## 技术架构

```
extension/
├── manifest.json          # Chrome Extension 配置 (Manifest V3)
├── icons/                  # 插件图标
├── popup/                  # 点击图标弹出的界面
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── src/
    ├── background/         # Service Worker (后台脚本)
    │   └── service-worker.js
    └── content/            # Content Script (注入页面)
        ├── content.js      # 采集逻辑
        └── overlay.css     # 采集面板样式
```

## API 通信

插件通过以下接口与后端通信：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/reviews/ingest` | POST | 上传采集的评论数据 |

## 开发调试

1. 修改代码后，在 `chrome://extensions/` 点击刷新按钮
2. 右键点击插件图标 -> 检查弹出内容 (调试 Popup)
3. 在 Amazon 页面按 F12 -> Console 查看 Content Script 日志
4. 在 `chrome://extensions/` 点击 Service Worker 链接调试后台脚本

## 本地开发指南

### 🚀 快速开始

**详细文档**: 请查看 [README-DEV.md](./README-DEV.md)

1. **启动后端服务**:
   ```bash
   cd backend
   python -m uvicorn app.main:app --reload --port 8000
   ```

2. **启动前端服务**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **加载插件**: 
   - 访问 `chrome://extensions/`
   - 开启开发者模式
   - 加载 `extension` 目录

4. **测试**: 访问 Amazon 产品页面，点击插件图标

### 🔄 环境切换

使用脚本快速切换本地/生产环境:

```bash
cd extension
./switch-env.sh
```

### 📚 更多文档

- [本地开发指南](./README-DEV.md) - 详细配置和使用说明
- [开发检查清单](./CHECKLIST.md) - 快速开始和故障排查
- [代码优化计划](./CODE_OPTIMIZATION_PLAN.md) - 重构和优化方案

## 注意事项

- 确保后端服务 (localhost:8000) 已启动
- 需要登录 Amazon 账号才能采集完整数据
- 建议每个星级采集不超过 10 页，避免触发限流
- 采集间隔已内置随机延迟，请耐心等待

