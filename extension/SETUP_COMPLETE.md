# 🎉 VOC-Master 插件本地开发环境配置完成

## ✅ 完成的工作

### 1. 配置文件修改

#### 📄 manifest.json
- ✅ 插件名称改为 "VOC-Master: Amazon Review Collector (Local Dev)"
- ✅ 版本号改为 "1.0.2-dev"
- ✅ `host_permissions` 改为只允许 localhost
- ✅ `externally_connectable` 改为只允许 localhost

#### 📄 src/background/service-worker.js
- ✅ `API_BASE_URL` 改为 `http://localhost:8000/api/v1`
- ✅ `allowedOrigins` 只允许 localhost 和 127.0.0.1

#### 📄 src/content/content.js
- ✅ `API_BASE_URL` 改为 `http://localhost:8000/api/v1`
- ✅ `DASHBOARD_URL` 改为 `http://localhost:3000`

### 2. 新增文档和工具

#### 📚 文档
1. **README-DEV.md** - 本地开发详细指南
   - 快速开始步骤
   - 环境配置说明
   - 调试技巧
   - 常见问题解决方案

2. **CHECKLIST.md** - 开发检查清单
   - 3分钟快速开始指南
   - 环境检查清单
   - 调试技巧
   - 常见问题排查
   - 性能监控

3. **CODE_OPTIMIZATION_PLAN.md** - 代码优化计划
   - 当前代码结构分析
   - 模块化重构方案
   - TypeScript 迁移计划
   - 性能优化建议

#### 🛠️ 工具脚本
4. **switch-env.sh** - 环境切换脚本
   - 快速切换本地/生产环境
   - 自动修改配置文件
   - 显示当前配置状态

#### 📝 README.md 更新
- 添加本地开发指南链接
- 添加环境切换说明
- 添加文档索引

---

## 🎯 当前配置状态

### API 地址配置
```
后端 API:     http://localhost:8000/api/v1
前端控制台:   http://localhost:3000
```

### 插件信息
```
名称:   VOC-Master: Amazon Review Collector (Local Dev)
版本:   1.0.2-dev
环境:   本地开发
```

---

## 📖 使用指南

### 第一步: 启动本地服务

```bash
# 终端 1: 启动后端
cd backend
python -m uvicorn app.main:app --reload --port 8000

# 终端 2: 启动前端
cd frontend
npm run dev
```

### 第二步: 加载插件

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启 **"开发者模式"**
4. 点击 **"加载已解压的扩展程序"**
5. 选择 `extension` 文件夹

### 第三步: 测试功能

1. 访问 Amazon 产品页面: https://www.amazon.com/dp/B08N5WRWNW
2. 点击插件图标
3. 登录测试账号
4. 点击 "开始采集" 测试功能

---

## 🔄 环境切换

### 切换到本地开发环境
```bash
cd extension
./switch-env.sh
# 选择: 1) 本地开发环境
```

### 切换到生产环境
```bash
cd extension
./switch-env.sh
# 选择: 2) 生产环境
# 输入生产服务器地址
```

### 查看当前配置
```bash
cd extension
./switch-env.sh
# 选择: 3) 查看当前配置
```

---

## 🐛 调试指南

### 查看插件后台日志
1. 打开 `chrome://extensions/`
2. 找到 VOC-Master 插件
3. 点击 **"检查视图"** > **"Service Worker"**

### 查看页面脚本日志
1. 在 Amazon 页面按 `F12`
2. 切换到 **Console** 标签
3. 查看日志输出

### 检查 API 请求
1. 按 `F12` 打开开发者工具
2. 切换到 **Network** 标签
3. 筛选 `Fetch/XHR`
4. 查看请求到 `localhost:8000` 的情况

---

## ⚠️ 常见问题

### 问题 1: 插件无法连接后端

**症状**: 点击"开始采集"后报错 "请求超时"

**解决**:
```bash
# 检查后端是否运行
curl http://localhost:8000/api/v1/health

# 如果没响应，启动后端
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

### 问题 2: CORS 跨域错误

**症状**: Console 显示 CORS 相关错误

**解决**: 检查后端 CORS 配置，确保包含 `chrome-extension://*`

### 问题 3: 插件修改后未生效

**症状**: 修改代码后功能没变化

**解决**: 
1. 在 `chrome://extensions/` 点击刷新插件 🔄
2. 关闭并重新打开 Amazon 页面
3. 硬刷新页面 (Ctrl+Shift+R)

---

## 📁 文件结构

```
extension/
├── manifest.json                    # 插件配置 (已改为本地环境)
├── README.md                        # 主文档 (已更新)
├── README-DEV.md                    # 🆕 本地开发指南
├── CHECKLIST.md                     # 🆕 开发检查清单
├── CODE_OPTIMIZATION_PLAN.md        # 🆕 代码优化计划
├── switch-env.sh                    # 🆕 环境切换脚本
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── src/
│   ├── background/
│   │   └── service-worker.js       # 后台服务 (已改为本地)
│   └── content/
│       ├── content.js              # 内容脚本 (已改为本地)
│       └── overlay.css
└── icons/
    └── ...
```

---

## 🚀 下一步计划

### 立即可做
- [ ] 测试所有功能是否正常
- [ ] 修复发现的任何 Bug
- [ ] 熟悉代码结构

### 短期 (本周)
- [ ] 阅读 CODE_OPTIMIZATION_PLAN.md
- [ ] 开始模块化重构
- [ ] 添加错误边界处理

### 中期 (本月)
- [ ] 完成代码重构
- [ ] 添加单元测试
- [ ] 优化性能

---

## 📚 参考文档

| 文档 | 用途 |
|------|------|
| [README-DEV.md](./README-DEV.md) | 详细的本地开发指南 |
| [CHECKLIST.md](./CHECKLIST.md) | 快速开始和故障排查 |
| [CODE_OPTIMIZATION_PLAN.md](./CODE_OPTIMIZATION_PLAN.md) | 代码重构和优化方案 |
| [Chrome Extension 文档](https://developer.chrome.com/docs/extensions/) | 官方开发文档 |

---

## 💡 提示

### 代码修改后必做的事
1. ✅ 在 `chrome://extensions/` 刷新插件
2. ✅ 关闭并重新打开测试页面
3. ✅ 查看 Console 确认无错误

### 提交代码前检查
1. ✅ 测试所有功能正常
2. ✅ 查看 Console 无报错
3. ✅ 代码格式化
4. ✅ 添加必要的注释

### Git 提交规范
```bash
git commit -m "feat: 添加新功能"
git commit -m "fix: 修复 Bug"
git commit -m "refactor: 代码重构"
git commit -m "docs: 更新文档"
```

---

## 🎓 学习资源

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Service Worker API](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)

---

## 🤝 团队协作

### 代码审查要点
- 代码是否清晰易懂
- 是否有充足的注释
- 错误处理是否完善
- 是否符合编码规范

### 问题反馈
遇到问题时，请提供:
1. 问题描述
2. 复现步骤
3. 错误日志截图
4. 浏览器版本

---

## ✨ 总结

**已完成**:
- ✅ 插件配置改为本地开发环境
- ✅ 创建完整的开发文档
- ✅ 提供环境切换工具
- ✅ 编写代码优化计划

**下一步**:
1. 测试本地环境功能
2. 熟悉代码结构
3. 开始优化代码

---

**准备好开始本地开发了！** 🎉

如有任何问题，请查阅相关文档或在团队群里提问。

祝开发顺利！🚀
