# VOC-Master: Amazon 评论智能分析系统

<p align="center">
  <img src="./extension/icons/icon.svg" alt="VOC-Master Logo" width="120" height="120">
</p>

<p align="center">
  <strong>采集 · 翻译 · 分析</strong><br>
  一站式 Amazon 商品评论深度洞察平台
</p>

---

## 📖 项目简介

**VOC-Master** 是一个针对亚马逊（Amazon）商品评论（VOC - Voice of Customer）的深度分析系统。

### 核心痛点
- 亚马逊评论阅读体验差
- 语言障碍（英文评论看不懂）
- 无法宏观分析评论情感

### 解决方案
1. **Chrome 插件**：利用用户已登录的亚马逊 Session，无感采集 1-5 星的全部评论
2. **后端服务**：异步处理数据，集成 Qwen 大模型进行高精度翻译
3. **Web 控制台**：沉浸式双语阅读体验、数据分析和导出

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

## 🏗️ 项目架构

```
voc-master/
├── docker-compose.yml       # Docker 编排配置
├── .env.example             # 环境变量模板
│
├── backend/                 # Python FastAPI 后端
│   ├── app/
│   │   ├── api/             # API 路由
│   │   ├── core/            # 配置
│   │   ├── db/              # 数据库
│   │   ├── models/          # SQLAlchemy 模型
│   │   ├── services/        # 业务逻辑 (翻译服务)
│   │   └── worker.py        # Celery 异步任务
│   ├── Dockerfile
│   └── requirements.txt
│
├── extension/               # Chrome 插件 (Manifest V3)
│   ├── manifest.json
│   ├── popup/               # 弹出窗口
│   └── src/
│       ├── background/      # Service Worker
│       └── content/         # 内容脚本 (采集引擎)
│
├── frontend/                # React + Vite 前端
│   ├── src/
│   │   ├── api/             # API 客户端
│   │   ├── components/      # 组件
│   │   └── pages/           # 页面
│   ├── Dockerfile
│   └── package.json
│
└── db/                      # 数据库初始化脚本
    └── init.sql
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

## 📡 API 接口

| Endpoint | Method | 说明 |
|----------|--------|------|
| `/api/v1/reviews/ingest` | POST | 接收插件采集的评论 |
| `/api/v1/reviews/{asin}` | GET | 获取商品评论列表 |
| `/api/v1/reviews/{asin}/export` | GET | 导出 Excel/CSV |
| `/api/v1/products` | GET | 商品列表 + 统计 |
| `/api/v1/products/{asin}/stats` | GET | 商品详细统计 |
| `/api/v1/tasks/{task_id}` | GET | 任务进度查询 |

完整 API 文档请访问: http://localhost:8000/docs

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

## 🔐 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `POSTGRES_USER` | 数据库用户 | vocmaster |
| `POSTGRES_PASSWORD` | 数据库密码 | vocmaster123 |
| `POSTGRES_DB` | 数据库名 | vocmaster |
| `QWEN_API_KEY` | 通义千问 API Key | (必填) |
| `QWEN_API_BASE` | Qwen API 地址 | https://dashscope.aliyuncs.com/compatible-mode/v1 |

---

## 🤖 Qwen API 配置

本项目使用阿里云通义千问 (Qwen) 进行翻译。

1. 访问 [阿里云 DashScope](https://dashscope.console.aliyun.com/)
2. 开通服务并创建 API Key
3. 将 API Key 填入 `.env` 文件

---

## 📝 许可证

MIT License

---

## 🙏 致谢

- [FastAPI](https://fastapi.tiangolo.com/) - 高性能 Python Web 框架
- [Qwen](https://qwen.alibaba.com/) - 阿里云通义千问大模型
- [React](https://react.dev/) - 用户界面库
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架


Last deployment test: 2026-01-11 22:43:10
