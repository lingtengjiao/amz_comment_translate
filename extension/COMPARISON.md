# 🎯 插件本地化配置对比

## 📊 配置变更总览

### 修改的文件 (4个)
| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `manifest.json` | 插件名称、版本、权限配置 | ✅ 已修改 |
| `service-worker.js` | API地址、允许域名 | ✅ 已修改 |
| `content.js` | API地址、控制台地址 | ✅ 已修改 |
| `README.md` | 添加本地开发说明 | ✅ 已修改 |

### 新增的文件 (5个)
| 文件 | 用途 | 状态 |
|------|------|------|
| `README-DEV.md` | 本地开发详细指南 | 🆕 新建 |
| `CHECKLIST.md` | 开发检查清单 | 🆕 新建 |
| `CODE_OPTIMIZATION_PLAN.md` | 代码优化计划 | 🆕 新建 |
| `switch-env.sh` | 环境切换脚本 | 🆕 新建 |
| `SETUP_COMPLETE.md` | 配置完成总结 | 🆕 新建 |

---

## 🔄 详细对比

### 1️⃣ manifest.json

#### 插件信息
```diff
- "name": "VOC-Master: Amazon Review Collector",
+ "name": "VOC-Master: Amazon Review Collector (Local Dev)",

- "version": "1.0.2",
+ "version": "1.0.2-dev",
```

#### 权限配置
```diff
  "host_permissions": [
    "https://*.amazon.com/*",
    "https://*.amazon.co.uk/*",
    "https://*.amazon.de/*",
    "https://*.amazon.fr/*",
    "https://*.amazon.co.jp/*",
-   "http://localhost:8000/*",
-   "http://115.191.30.209:8000/*",
-   "http://115.191.30.209:3000/*",
-   "http://115.191.30.209/*"
+   "http://localhost:*/*",
+   "http://127.0.0.1:*/*"
  ],
```

#### 外部通信
```diff
  "externally_connectable": {
    "matches": [
      "http://localhost:*/*",
-     "http://127.0.0.1:*/*",
-     "http://115.191.30.209:*/*",
-     "http://115.191.30.209/*",
-     "https://*.voc-master.com/*"
+     "http://127.0.0.1:*/*"
    ]
  },
```

### 2️⃣ service-worker.js

#### API 地址
```diff
  // Backend API configuration
- const API_BASE_URL = 'http://115.191.30.209:8000/api/v1';
+ // 本地开发环境配置
+ const API_BASE_URL = 'http://localhost:8000/api/v1';
```

#### 允许的域名
```diff
- // 安全检查:校验发送者域名
+ // 安全检查:校验发送者域名 (本地开发环境)
  const allowedOrigins = [
    'http://localhost:',
-   'http://127.0.0.1:',
-   'http://115.191.30.209:',
-   'http://115.191.30.209',
-   'https://voc-master.com'
+   'http://127.0.0.1:'
  ];
```

### 3️⃣ content.js

#### 配置对象
```diff
  // Configuration
+ // 本地开发环境配置
  const CONFIG = {
-   API_BASE_URL: 'http://115.191.30.209:8000/api/v1',
-   DASHBOARD_URL: 'http://115.191.30.209',
+   API_BASE_URL: 'http://localhost:8000/api/v1',
+   DASHBOARD_URL: 'http://localhost:3000',  // 本地前端地址
    DELAY_BETWEEN_PAGES: { min: 2000, max: 5000 },
    DELAY_BETWEEN_STARS: { min: 3000, max: 6000 },
    BATCH_SIZE: 20
  };
```

---

## 📈 影响分析

### ✅ 改动影响
1. **API 请求**: 所有请求现在发送到 `localhost:8000`
2. **控制台跳转**: 采集完成后跳转到 `localhost:3000`
3. **外部通信**: 只允许本地地址通信
4. **插件名称**: 在浏览器中显示为 "Local Dev" 版本

### 🔒 安全性
- ✅ 限制了外部域名访问，提高安全性
- ✅ 仅允许本地环境通信
- ✅ 开发版本有明确标识，避免混淆

### 🚀 开发体验
- ✅ 快速切换环境（使用 switch-env.sh）
- ✅ 完整的开发文档
- ✅ 清晰的调试指南
- ✅ 代码优化路线图

---

## 🎯 使用场景对比

### 本地开发环境 (当前配置)
```
后端:    localhost:8000
前端:    localhost:3000
用途:    本地开发、测试
优点:    快速迭代、方便调试
```

### 生产环境 (需切换)
```
后端:    115.191.30.209:8000 或自定义
前端:    115.191.30.209 或自定义
用途:    生产使用
优点:    稳定可靠、用户可用
```

---

## 📝 Git 状态

### 修改的文件
```
modified:   extension/README.md
modified:   extension/manifest.json
modified:   extension/src/background/service-worker.js
modified:   extension/src/content/content.js
```

### 新增的文件
```
Untracked:  extension/CHECKLIST.md
Untracked:  extension/CODE_OPTIMIZATION_PLAN.md
Untracked:  extension/README-DEV.md
Untracked:  extension/SETUP_COMPLETE.md
Untracked:  extension/switch-env.sh
```

### 建议的提交信息
```bash
git add extension/
git commit -m "config: 配置插件为本地开发环境

- 修改 API 地址为 localhost:8000
- 修改控制台地址为 localhost:3000
- 限制权限仅允许本地访问
- 添加完整的开发文档和工具
- 创建环境切换脚本

新增文档:
- README-DEV.md: 本地开发指南
- CHECKLIST.md: 开发检查清单
- CODE_OPTIMIZATION_PLAN.md: 代码优化计划
- switch-env.sh: 环境切换脚本
- SETUP_COMPLETE.md: 配置总结"
```

---

## 🔄 回滚方案

如果需要恢复到线上环境配置:

### 方法 1: 使用切换脚本
```bash
cd extension
./switch-env.sh
# 选择: 2) 生产环境
# 输入生产服务器地址
```

### 方法 2: 使用 Git
```bash
# 如果已提交到 Git，可以回滚
git checkout HEAD -- extension/manifest.json
git checkout HEAD -- extension/src/background/service-worker.js
git checkout HEAD -- extension/src/content/content.js
```

### 方法 3: 手动修改
根据 COMPARISON.md 的对比，手动修改回去

---

## ✨ 总结

### 完成度
- ✅ 配置修改: 100%
- ✅ 文档编写: 100%
- ✅ 工具脚本: 100%
- ✅ 测试准备: 100%

### 下一步
1. **立即测试**: 加载插件，验证功能
2. **熟悉代码**: 阅读代码，理解逻辑
3. **开始优化**: 按照 CODE_OPTIMIZATION_PLAN.md 执行

### 需要的前置条件
- ✅ 后端服务运行在 localhost:8000
- ✅ 前端服务运行在 localhost:3000
- ✅ 数据库已初始化
- ✅ 测试账号已创建

---

**配置完成！可以开始本地开发了！** 🎉
