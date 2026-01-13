# ✅ VOC-Master 插件本地开发检查清单

## 🎯 快速开始 (3分钟)

### 1️⃣ 确认本地服务已启动

```bash
# 终端 1: 启动后端
cd backend
python -m uvicorn app.main:app --reload --port 8000

# 终端 2: 启动前端
cd frontend  
npm run dev
```

**验证**:
- [ ] 访问 http://localhost:8000/docs 能看到 API 文档
- [ ] 访问 http://localhost:3000 能看到前端界面

### 2️⃣ 加载插件到浏览器

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择 `extension` 文件夹

**验证**:
- [ ] 插件图标出现在工具栏
- [ ] 插件名称: "VOC-Master: Amazon Review Collector (Local Dev)"
- [ ] 版本: 1.0.2-dev

### 3️⃣ 测试功能

1. 访问 https://www.amazon.com/dp/B08N5WRWNW
2. 点击插件图标
3. 登录 (使用测试账号)
4. 点击 "开始采集"

**验证**:
- [ ] 能正常登录
- [ ] 显示 ASIN 和产品标题
- [ ] 采集进度正常更新
- [ ] 数据能上传到本地后端

---

## 🔧 环境配置检查

### ✅ 当前配置 (本地开发)

运行以下命令查看当前配置:

```bash
cd extension
grep "API_BASE_URL" src/background/service-worker.js
grep "API_BASE_URL" src/content/content.js
```

**应该显示**:
```javascript
const API_BASE_URL = 'http://localhost:8000/api/v1';
API_BASE_URL: 'http://localhost:8000/api/v1',
DASHBOARD_URL: 'http://localhost:3000',
```

### 🔄 切换环境

**切换到本地环境**:
```bash
cd extension
./switch-env.sh
# 选择: 1
```

**切换到生产环境**:
```bash
cd extension
./switch-env.sh
# 选择: 2
# 输入生产服务器地址
```

---

## 🐛 调试技巧

### 1. 查看插件后台日志

1. 打开 `chrome://extensions/`
2. 找到 VOC-Master 插件
3. 点击 **"检查视图"** > **"Service Worker"**
4. 在 Console 中查看日志

**常见日志**:
```
[Auth] Restored auth state for: user@example.com
[Collector] Starting collection for ASIN: B08N5WRWNW
[Upload] Success on attempt 1 (queued: batch_xxx)
```

### 2. 查看页面脚本日志

1. 在 Amazon 页面按 `F12`
2. 切换到 **Console** 标签
3. 筛选包含 `[VOC-Master]` 的日志

### 3. 检查 API 请求

1. 按 `F12` 打开开发者工具
2. 切换到 **Network** 标签
3. 筛选 `Fetch/XHR`
4. 查看发送到 `localhost:8000` 的请求

**正常请求示例**:
```
POST http://localhost:8000/api/v1/auth/login
Status: 200 OK

POST http://localhost:8000/api/v1/reviews/ingest/queue
Status: 200 OK
```

### 4. 修改代码后重新加载

**方法 1: 快速刷新**
```bash
# 在 chrome://extensions/ 页面按 Ctrl+R (Mac: Cmd+R)
```

**方法 2: 手动刷新**
1. 打开 `chrome://extensions/`
2. 找到插件，点击刷新图标 🔄

**注意**: 修改后必须刷新插件，否则代码不会生效！

---

## 🚨 常见问题排查

### ❌ 问题 1: "请求超时，请确保后端服务正在运行"

**原因**: 后端未启动或端口不对

**解决**:
```bash
# 检查后端是否运行
curl http://localhost:8000/api/v1/health

# 如果没响应，启动后端
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

### ❌ 问题 2: "CORS 跨域错误"

**原因**: 后端 CORS 配置不正确

**解决**: 检查 `backend/app/main.py`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "chrome-extension://*"  # ✅ 必须有这行
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### ❌ 问题 3: 插件修改后未生效

**原因**: 未刷新插件或浏览器缓存

**解决**:
1. 刷新插件 (chrome://extensions/ > 刷新)
2. 关闭并重新打开 Amazon 页面
3. 清除浏览器缓存 (Ctrl+Shift+Del)

### ❌ 问题 4: 无法检测到 ASIN

**原因**: Content Script 未注入

**解决**:
```bash
# 1. 刷新插件
# 2. 硬刷新页面 (Ctrl+Shift+R)
# 3. 查看 Console 是否有错误
```

### ❌ 问题 5: 登录失败

**原因**: 
- 后端数据库未初始化
- 用户不存在

**解决**:
```bash
# 检查数据库
cd backend
python -c "from app.db.session import SessionLocal; print(SessionLocal().execute('SELECT COUNT(*) FROM users').scalar())"

# 如果是 0，运行数据库初始化
cd ..
docker-compose exec db psql -U postgres -d amazon_review_db -f /docker-entrypoint-initdb.d/init.sql
```

---

## 📊 性能监控

### 检查采集速度

在 Console 中查看采集日志:

```
[Collector] Page 1 - Extracted 10 reviews  ✅ 正常
[Collector] Page 2 - Extracted 10 reviews  ✅ 正常
[Stream] ✅ 已上传第 1 页，10 条新评论  ✅ 上传成功
```

**正常速度**:
- 每页采集: 2-5 秒
- 每页上传: <1 秒
- 5 星级 × 5 页 = 约 2-3 分钟

### 检查内存使用

```javascript
// 在 Service Worker Console 中运行
console.log('Memory:', performance.memory);
```

---

## 📝 代码修改记录

### 已修改的文件

1. ✅ `manifest.json`
   - 改名为 "Local Dev"
   - host_permissions 改为 localhost
   - externally_connectable 改为 localhost

2. ✅ `src/background/service-worker.js`
   - API_BASE_URL: localhost:8000
   - allowedOrigins: localhost only

3. ✅ `src/content/content.js`
   - API_BASE_URL: localhost:8000
   - DASHBOARD_URL: localhost:3000

### 新增的文件

1. ✅ `README-DEV.md` - 本地开发指南
2. ✅ `CODE_OPTIMIZATION_PLAN.md` - 优化计划
3. ✅ `CHECKLIST.md` - 本文件
4. ✅ `switch-env.sh` - 环境切换脚本

---

## 🎯 下一步计划

### 短期 (本周)

- [ ] 测试所有功能是否正常
- [ ] 修复发现的 Bug
- [ ] 优化错误提示

### 中期 (本月)

- [ ] 开始模块化重构 (参考 CODE_OPTIMIZATION_PLAN.md)
- [ ] 添加单元测试
- [ ] 改进文档

### 长期 (下个月)

- [ ] TypeScript 迁移
- [ ] 性能优化
- [ ] 发布新版本

---

## 💡 开发建议

### 编码规范

1. **使用 async/await** 代替 Promise.then()
2. **统一错误处理** 使用 try-catch
3. **日志格式** `console.log('[模块名] 消息')`
4. **代码注释** 关键逻辑必须加注释

### Git 提交规范

```bash
git commit -m "feat: 添加新功能"
git commit -m "fix: 修复 Bug"
git commit -m "refactor: 代码重构"
git commit -m "docs: 更新文档"
git commit -m "style: 代码格式化"
```

### 测试清单

每次修改代码后测试:

- [ ] 登录/登出功能
- [ ] ASIN 检测
- [ ] 评论采集
- [ ] 数据上传
- [ ] 错误处理
- [ ] 进度显示

---

**祝开发顺利！有问题随时查看文档或在团队群里提问。** 🚀
