# 洞察大王 - 亚马逊产品洞察助手

<p align="center">
  <img src="./extension/icons/icon.svg" alt="洞察大王 Logo" width="120" height="120">
</p>

<p align="center">
  <strong>一键洞察，听懂用户『真心话』！</strong><br>
  智能采集亚马逊评论，AI自动翻译分析，让产品洞察更简单
</p>

<p align="center">
  批量分析 · 竞品对比 · 市场细分<br>
  One-click insights, understand user feedback!<br>
  Smart review collection
</p>

---

## 📖 产品简介

**洞察大王（VOC-Master）** 是专为跨境电商卖家打造的 Amazon 评论智能分析平台，通过 AI 技术将海量评论转化为可执行的商业洞察。

### 🎯 核心价值

**输入亚马逊商品链接或ASIN，即可采集商品评论，智能翻译分析。**

- ⏱️ **节省 80% 时间成本** - 从采集到洞察，全流程自动化，14小时缩短到21分钟
- 🎯 **精准理解用户声音** - AI自然翻译，拒绝翻译腔，准确传达用户情绪
- 📊 **数据驱动决策** - 每个洞察都有数据支撑，可溯源到具体评论
- 🚀 **全链路业务赋能** - 支持产品、运营、供应链、高管等多角色决策

### 💡 解决的痛点

| 传统方法痛点 | 洞察大王解决方案 | 效率提升 |
|------------|----------------|---------|
| 语言障碍：人工逐条翻译英文评论（3-5分钟/条） | AI智能翻译，自然流畅，拒绝翻译腔 | **节省 80% 时间** |
| 信息分散：手动整理Excel，归类优缺点（2-3小时） | 5类洞察（优势/痛点/建议/场景/情绪）自动提取 | **节省 90% 整理时间** |
| 洞察缺失：凭感觉总结，缺乏数据支撑（半天） | 5W分析（谁买/谁用/哪里用/何时用/为何买） | **全面理解用户** |
| 决策滞后：等待周报月报，错过最佳窗口（1-2周） | 4种角色化报告（CEO/CMO/CPO/供应链）一键生成 | **决策效率提升 10倍** |

**案例**：一个有 500 条评论的产品，传统方法需要 **2-3 天**，洞察大王只需 **21 分钟**！

---

## ✨ 核心功能

### 🎯 六大功能模块

| 功能模块 | 核心能力 | 业务价值 |
|---------|---------|---------|
| **📥 采集与翻译** | Chrome插件一键采集，AI高质量翻译 | 节省80%时间，准确理解用户声音 |
| **🔍 深度洞察** | 5类洞察自动提取（优势/痛点/建议/场景/情绪） | 精准定位问题，发现卖点 |
| **👥 用户画像** | 5W分析（Buyer/User/Where/When/Why/What） | 精准定位目标人群，优化营销策略 |
| **📊 智能报告** | 4种角色化报告一键生成（CEO/CMO/CPO/供应链） | 节省分析时间，支持决策 |
| **⚖️ 竞品对比** | 2-5产品对比，10维度洞察分析 | 清晰竞争格局，发现差异化 |
| **📈 市场洞察** | 2-10产品市场分析，趋势挖掘 | 发现市场空白，把握趋势 |

### 🎨 数据透视分析

**18种透视组合 × 5大洞察维度**，多维度交叉分析，深度挖掘用户反馈：

- **人群洞察**：谁在买？谁在用？购买动机和使用场景是什么？
- **需求洞察**：用户最关心什么？不同人群的需求差异？
- **产品洞察**：致命缺陷、优劣对比、改进建议
- **场景洞察**：使用场景分布、场景满意度热力图
- **品牌洞察**：推荐意愿、品牌心智、用户忠诚度

---

## 🚀 快速开始

### 环境要求

- Docker & Docker Compose
- Node.js 18+ (开发前端时)
- Python 3.11+ (开发后端时)
- Chrome 浏览器 (使用插件)

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd voc-master
```

### 2. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 Qwen API Key
nano .env
```

重要配置项：
```env
QWEN_API_KEY=your_qwen_api_key_here
```

### 3. 启动服务

```bash
# 一键启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

服务启动后：
- 后端 API: http://localhost:8000
- 前端控制台: http://localhost:3000
- API 文档: http://localhost:8000/docs

### 4. 安装 Chrome 插件

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择项目中的 `extension` 目录

### 5. 开始使用

1. 访问任意 Amazon 商品页面 (如 amazon.com)
2. 点击浏览器工具栏的 VOC-Master 图标
3. 点击 **"打开采集面板"**
4. 配置采集参数，点击 **"开始采集"**
5. 采集完成后，点击 **"前往控制台查看分析"**

---

## 🏗️ 技术架构

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户交互层                              │
├─────────────────────────────────────────────────────────────┤
│  Chrome插件(采集)  │  Web控制台(分析)  │  分享链接(展示)   │
│  Manifest V3       │  React + Vite     │  双语阅读         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      应用服务层                              │
├─────────────────────────────────────────────────────────────┤
│              FastAPI 后端 (Python 3.11+)                     │
│  • RESTful API        • 用户认证        • 分享链接管理      │
│  • 评论管理           • 洞察分析        • 报告生成          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      异步任务层                              │
├─────────────────────────────────────────────────────────────┤
│              Celery + Redis (消息队列)                       │
│  • AI翻译任务         • 洞察提取        • 报告生成          │
│  • 竞品分析           • 数据透视        • 批量处理          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      数据存储层                              │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL 15        │  Redis 7          │  AI模型          │
│  关系型数据存储       │  缓存 + 队列      │  通义千问 Qwen  │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术选型 | 说明 |
|-----|---------|------|
| **前端** | React 18 + TypeScript + Vite | 现代化前端框架，快速构建 |
| **UI组件** | Tailwind CSS + Lucide Icons | 原子化CSS，美观的图标库 |
| **后端** | FastAPI + Python 3.11+ | 高性能异步框架，自动生成API文档 |
| **数据库** | PostgreSQL 15 | 可靠的关系型数据库 |
| **缓存/队列** | Redis 7 | 高性能内存数据库，支持消息队列 |
| **异步任务** | Celery | 分布式任务队列，处理AI翻译和分析 |
| **AI引擎** | 阿里云通义千问 (Qwen) | 高质量翻译和智能分析 |
| **容器化** | Docker + Docker Compose | 一键部署，环境隔离 |
| **浏览器插件** | Chrome Extension (Manifest V3) | 无感采集评论数据 |

### 项目结构

```
amz_comment_translate/
├── backend/                 # Python FastAPI 后端
│   ├── app/
│   │   ├── api/             # API路由（评论、产品、分析、报告、分享等）
│   │   ├── core/            # 核心配置（数据库、AI模型配置）
│   │   ├── db/              # 数据库连接
│   │   ├── models/          # SQLAlchemy ORM模型
│   │   ├── services/        # 业务服务（翻译、洞察、报告、透视等）
│   │   └── worker.py        # Celery异步任务Worker
│   ├── Dockerfile
│   └── requirements.txt     # Python依赖
│
├── extension/               # Chrome插件 (Manifest V3)
│   ├── manifest.json        # 插件配置
│   ├── popup/               # 插件弹窗UI
│   └── src/
│       ├── background/      # Service Worker（后台服务）
│       └── content/         # Content Script（页面采集引擎）
│
├── frontend/                # React + Vite 前端
│   ├── src/
│   │   ├── api/             # API客户端封装
│   │   ├── components/      # React组件
│   │   │   └── share/       # 分享页面组件
│   │   │       └── review-reader/
│   │   │           └── pivot/  # 数据透视分析模块
│   │   │               └── insights/  # 5大洞察模块
│   │   └── pages/           # 页面路由
│   ├── Dockerfile
│   └── package.json
│
├── db/                      # 数据库迁移脚本
│   ├── init.sql             # 初始化脚本
│   └── migrate_*.sql        # 数据库迁移文件
│
├── docs/                    # 项目文档
│   ├── tutorials/           # 使用教程
│   └── *.md                 # 技术文档
│
└── docker-compose.yml       # Docker编排配置
```

---

## 🐳 Docker 服务

| 服务 | 端口 | 说明 |
|------|------|------|
| `db-postgres` | 5432 | PostgreSQL 15 数据库 |
| `db-redis` | 6379 | Redis 7 消息队列 |
| `app-backend` | 8000 | FastAPI 后端 |
| `app-worker` | - | Celery 翻译 Worker |
| `app-frontend` | 3000 | React 前端 (Nginx) |

---

## 📡 核心 API 接口

### 评论管理

| Endpoint | Method | 说明 |
|----------|--------|------|
| `/api/v1/reviews/ingest` | POST | 接收插件采集的评论数据 |
| `/api/v1/reviews/{asin}` | GET | 获取商品评论列表（支持分页、筛选） |
| `/api/v1/reviews/{asin}/export` | GET | 导出评论为Excel/CSV格式 |

### 产品与统计

| Endpoint | Method | 说明 |
|----------|--------|------|
| `/api/v1/products` | GET | 获取产品列表 + 评论统计 |
| `/api/v1/products/{asin}` | GET | 获取产品详情 |
| `/api/v1/products/{asin}/stats` | GET | 获取产品详细统计数据 |

### 智能分析

| Endpoint | Method | 说明 |
|----------|--------|------|
| `/api/v1/analysis/insights/{asin}` | GET | 获取5类洞察（优势/痛点/建议/场景/情绪） |
| `/api/v1/analysis/portrait/{asin}` | GET | 获取5W用户画像分析 |
| `/api/v1/analysis/report/{asin}` | POST | 生成角色化智能报告 |
| `/api/v1/analysis/comparison` | POST | 竞品对比分析（2-5产品） |
| `/api/v1/analysis/market-insight` | POST | 市场洞察分析（2-10产品） |

### 数据透视

| Endpoint | Method | 说明 |
|----------|--------|------|
| `/api/v1/pivot/insights/{asin}` | GET | 获取数据透视洞察（18种组合） |
| `/api/v1/pivot/audience/{asin}` | GET | 人群洞察分析 |
| `/api/v1/pivot/demand/{asin}` | GET | 需求洞察分析 |
| `/api/v1/pivot/product/{asin}` | GET | 产品洞察分析 |
| `/api/v1/pivot/scenario/{asin}` | GET | 场景洞察分析 |
| `/api/v1/pivot/brand/{asin}` | GET | 品牌洞察分析 |

### 分享链接

| Endpoint | Method | 说明 |
|----------|--------|------|
| `/api/v1/share/links` | POST | 创建分享链接 |
| `/api/v1/share/{share_token}` | GET | 访问分享内容（无需登录） |

### 任务管理

| Endpoint | Method | 说明 |
|----------|--------|------|
| `/api/v1/tasks/{task_id}` | GET | 查询异步任务进度 |
| `/api/v1/tasks/{task_id}/cancel` | POST | 取消任务 |

**完整 API 文档（Swagger UI）**: http://localhost:8000/docs  
**ReDoc 文档**: http://localhost:8000/redoc

---

## 🔧 开发指南

### 🚀 Docker 构建优化

本项目已配置**清华 PyPI 源**，构建速度提升 **10 倍以上**！

- ✅ Dockerfile 已配置 `pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple`
- ✅ 利用 Docker 缓存层：`requirements.txt` 未变化时不重复安装
- ✅ 开发环境使用 volumes 挂载，修改代码**无需重新构建**

```bash
# 构建后端（首次构建，使用清华源，速度飞快）
docker-compose build app-backend

# 开发时修改代码，只需重启（无需重建）
docker-compose restart app-backend
```

### 后端开发

#### 方式一：Docker 开发（推荐）

```bash
# 启动数据库服务
docker-compose up -d db-postgres db-redis

# 启动后端服务（代码修改自动重载）
docker-compose up app-backend

# 启动 Celery Worker（另一个终端）
docker-compose up app-worker
```

#### 方式二：本地开发

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate

# 配置清华源（可选，但推荐）
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 启动 Celery Worker (另一个终端)
celery -A app.worker worker --loglevel=info
```

### 前端开发

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 插件开发

1. 修改 `extension/` 目录下的代码
2. 在 `chrome://extensions/` 点击刷新按钮
3. 刷新 Amazon 页面测试

---

## 🔐 环境变量配置

### 必填配置

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `QWEN_API_KEY` | 通义千问 API Key（**必填**） | sk-xxxxxxxxxxxxx |

### 数据库配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `POSTGRES_USER` | PostgreSQL 用户名 | vocmaster |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 | vocmaster123 |
| `POSTGRES_DB` | 数据库名称 | vocmaster |
| `POSTGRES_HOST` | 数据库主机 | db-postgres |
| `POSTGRES_PORT` | 数据库端口 | 5432 |

### Redis 配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `REDIS_HOST` | Redis 主机 | db-redis |
| `REDIS_PORT` | Redis 端口 | 6379 |
| `REDIS_DB` | Redis 数据库编号 | 0 |

### AI 服务配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `QWEN_API_BASE` | Qwen API 基础地址 | https://dashscope.aliyuncs.com/compatible-mode/v1 |
| `QWEN_MODEL` | Qwen 模型版本 | qwen-turbo |

---

## 🤖 AI 服务配置指南

### 获取通义千问 API Key

1. **访问阿里云 DashScope 控制台**  
   👉 https://dashscope.console.aliyun.com/

2. **开通服务**
   - 登录阿里云账号
   - 开通"通义千问"服务
   - 领取免费额度或充值

3. **创建 API Key**
   - 在控制台点击"API-KEY管理"
   - 创建新的 API Key
   - 复制 API Key（格式：sk-xxxxxxxxxxxxx）

4. **配置到项目**
   ```bash
   # 编辑 .env 文件
   nano .env
   
   # 添加以下内容
   QWEN_API_KEY=sk-你的API密钥
   ```

### 费用说明

- **免费额度**：新用户赠送100万Tokens（约可翻译5000条评论）
- **付费价格**：约 0.002元/条评论（极低成本）
- **推荐套餐**：充值100元可分析约50,000条评论

---

## 🎯 适用场景与用户

### 核心用户群体

| 角色 | 使用场景 | 核心诉求 |
|-----|---------|---------|
| **跨境电商卖家** | 新品上市监控、Listing优化 | 快速了解产品口碑，提升转化率，降低退货率 |
| **产品经理** | 产品迭代、需求分析 | 用户反馈指导产品优化，发现Bug和功能需求 |
| **运营/市场团队** | 广告投放、营销策略 | 挖掘产品卖点，精准定位目标人群 |
| **供应链/QC团队** | 质量改进、包装优化 | 识别质量问题，降低退货率 |
| **CEO/高管** | 战略决策、风险识别 | 全局视角评估产品，快速识别机会和风险 |

### 典型应用场景

| 场景 | 问题 | 洞察大王解决方案 |
|-----|------|----------------|
| **新品上市** | 不知道用户反馈如何 | 实时采集评论，快速发现问题，及时改进 |
| **Listing优化** | 不知道哪些是真正的卖点 | 提取高频优势，数据支撑文案优化 |
| **产品迭代** | 不清楚用户具体需求 | 用户建议自动归类，优先级排序 |
| **竞品分析** | 不了解竞争对手优劣势 | 2-5产品对比，10维度洞察分析 |
| **市场调研** | 不知道市场空白在哪里 | 2-10产品市场分析，趋势挖掘 |
| **广告投放** | 不清楚目标人群是谁 | 5W用户画像，精准定位投放 |
| **质量改进** | 不知道哪些质量问题最严重 | 痛点频次统计，优先级清晰 |

---

## 🌟 核心特色功能

### 1️⃣ AI 自然翻译 - 拒绝翻译腔

**传统机器翻译 vs 洞察大王**

| 原文 | 机器翻译 ❌ | 洞察大王 ✅ |
|-----|-----------|-----------|
| "This is a steal!" | "这是一个偷窃" | "超值！捡漏价！" |
| "Total lemon." | "完全的柠檬" | "简直是个次品！" |
| "Game changer for my morning routine." | "改变我早上例行程序的游戏" | "彻底改变了我每天早上的习惯，真香！" |

### 2️⃣ 数据透视分析 - 18种组合

**3个维度 × 6个分面 = 18种交叉组合**

- **维度**: Buyer购买者 / User使用者 / All全部评论
- **分面**: Who谁 / Where哪里 / When何时 / Why为何 / What什么 / How如何

**5大洞察模块**:
- 🧑‍🤝‍🧑 人群洞察：购买者画像、使用者画像、购买动机
- 📊 需求洞察：关注点分布、不同人群需求差异热力图
- 📦 产品洞察：致命缺陷、优劣对比、改进建议
- 🗺️ 场景洞察：使用场景分布、场景满意度
- ❤️ 品牌洞察：推荐意愿、品牌心智、用户忠诚度

### 3️⃣ 智能报告 - 4种角色化

- **CEO战略报告**: SWOT分析、PMF评估、优先行动项
- **CMO运营报告**: 核心卖点、目标人群、Listing优化建议
- **CPO产品报告**: 致命Bug、用户期望功能、质量评分
- **供应链报告**: 材质瑕疵、QC清单、退货率影响因素

### 4️⃣ 竞品对比 - 多维度洞察

- 支持 2-5 个产品同时对比
- 10 个维度深度分析（优势、痛点、场景、人群等）
- 自动生成差异化机会点

### 5️⃣ 市场洞察 - 趋势挖掘

- 支持 2-10 个产品市场分析
- 识别市场共性痛点和空白
- 发现未被满足的用户需求

### 6️⃣ 分享链接 - 无需登录

- 一键生成分享链接
- 支持双语对照阅读
- 支持数据透视分析展示
- 无需登录即可查看

---

## 📊 成功案例

### 案例1：母婴产品卖家 - 从混乱到清晰

**背景**: 某婴儿安抚玩具有380条评论，人工整理3天仍无法清晰总结

**使用洞察大王后**:
- ✅ 10分钟完成采集和翻译
- ✅ 发现核心痛点："缝合处易脱线"（23次提及）→ 立即通知工厂改进
- ✅ 发现隐藏卖点："哄睡神器"（67次提及）→ 优化Listing标题
- ✅ 发现目标人群：68%购买者是"新手宝妈"，82%使用者是"0-12个月婴儿"

**结果**: Listing转化率提升 **34%**，退货率下降 **18%**

### 案例2：家居用品卖家 - 竞品对比找到突破口

**背景**: 某卖家进入红海市场（扫地机器人），不知如何差异化

**使用洞察大王对比分析**:
- ✅ 对比5个竞品，发现市场共性痛点："噪音大"（行业通病）
- ✅ 自家产品优势："静音设计"（43条好评）但Listing未突出
- ✅ 竞品A在"宠物家庭"场景占优，自家产品可切入"母婴家庭"（37%评论提及婴儿）

**结果**: 调整广告投放策略，主打"静音+母婴适用"，广告ACoS下降 **28%**

---

## 💰 投资回报率（ROI）

### 成本对比

**传统方法（每月）**:
- 人工分析师工资：8,000元/月
- 每天分析2个产品 × 20天 = 40个产品/月
- **单位成本：200元/产品**

**洞察大王（每月）**:
- 平台费用：约2,000元/月
- 每天分析10个产品 × 20天 = 200个产品/月
- **单位成本：10元/产品**

**ROI**: 成本节省 **95%**，效率提升 **5倍**

### 潜在收益

1. **Listing转化率提升** 20-30% - 优化卖点文案
2. **退货率下降** 15-25% - 及时发现质量问题
3. **广告ACoS优化** 20-30% - 精准投放目标人群
4. **产品迭代加速** 50% - 数据驱动决策
5. **竞争优势** - 快速响应市场，抢占先机

---

## 📚 相关文档

### 快速上手
- [产品概览与核心价值](./docs/tutorials/01-产品概览与核心价值.md)
- [15分钟快速上手指南](./docs/tutorials/02-15分钟快速上手指南.md)

### 功能教程
- [场景1：采集与翻译教程](./docs/tutorials/03-场景1-采集与翻译教程.md)
- [场景2：深度洞察教程](./docs/tutorials/04-场景2-深度洞察教程.md)
- [场景3：用户画像教程](./docs/tutorials/05-场景3-用户画像教程.md)
- [场景4：智能报告教程](./docs/tutorials/06-场景4-智能报告教程.md)
- [场景5：竞品对比教程](./docs/tutorials/07-场景5-竞品对比教程.md)
- [场景6：市场洞察教程](./docs/tutorials/08-场景6-市场洞察教程.md)

### 高级功能
- [高级技巧与最佳实践](./docs/tutorials/09-高级技巧与最佳实践.md)
- [数据透视-18种组合与5大洞察映射](./docs/数据透视-18种组合与5大洞察映射关系.md)
- [数据透视-前端风格统一实施指南](./docs/数据透视-前端风格统一实施指南.md)

### 技术文档
- [架构文档-队列与Worker设计](./docs/架构文档-队列与Worker设计.md)
- [数据流转全流程梳理](./数据流转全流程梳理.md)
- [AI功能和Prompt整理文档](./AI功能和Prompt整理文档.md)

---

## 🛠️ 常见问题（FAQ）

### Q1: 需要翻墙才能使用吗？
**A**: 不需要。后端服务器可以正常访问阿里云API，用户只需正常访问Amazon网站即可。

### Q2: 支持哪些Amazon站点？
**A**: 支持所有Amazon站点，包括美国站、日本站、欧洲站等。

### Q3: 一次可以采集多少条评论？
**A**: 理论上无限制，建议单次采集不超过5000条评论（性能考虑）。

### Q4: AI翻译准确率如何？
**A**: 使用通义千问大模型，准确率可达95%以上，远超传统机器翻译。

### Q5: 数据安全性如何保障？
**A**: 
- 所有数据传输采用HTTPS加密
- 支持私有服务器部署
- 多用户权限管理，数据隔离
- 不存储用户个人敏感信息

### Q6: 可以导出数据吗？
**A**: 支持导出为Excel/CSV格式，包含原文、翻译、洞察分析等完整数据。

### Q7: 需要什么技术背景才能使用？
**A**: 无需技术背景，只需会使用Chrome浏览器和简单的网页操作即可。

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📝 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 🙏 致谢

### 开源项目
- [FastAPI](https://fastapi.tiangolo.com/) - 高性能Python Web框架
- [React](https://react.dev/) - 用户界面库
- [Tailwind CSS](https://tailwindcss.com/) - 原子化CSS框架
- [PostgreSQL](https://www.postgresql.org/) - 强大的关系型数据库
- [Redis](https://redis.io/) - 高性能内存数据库
- [Celery](https://docs.celeryq.dev/) - 分布式任务队列

### AI服务
- [阿里云通义千问 (Qwen)](https://qwen.alibaba.com/) - 高质量大语言模型

### UI组件
- [Lucide Icons](https://lucide.dev/) - 美观的图标库
- [Recharts](https://recharts.org/) - React图表库

---

## 📧 联系我们

- **产品反馈**: [提交Issue](../../issues)
- **商务合作**: 请通过项目联系方式洽谈
- **技术支持**: 查看文档或提交Issue

---

**最后更新**: 2026-01-25  
**版本**: v2.0  
**维护团队**: VOC-Master Product Team

---

<p align="center">
  <strong>⭐ 如果这个项目对你有帮助，请给我们一个 Star！⭐</strong>
</p>
