FROM python:3.11-slim

WORKDIR /app

# 🚀 关键步骤 1：配置清华 PyPI 源（提速 90% 的关键）
# 这一行会让 pip 默认去清华源下载，速度极快
RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip config set global.trusted-host pypi.tuna.tsinghua.edu.cn

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 🚀 关键步骤 2：利用 Docker 缓存层
# 先只复制 requirements.txt，不复制源代码！
# 这样只要你不修改依赖包，下次构建时 Docker 会直接跳过安装步骤（使用缓存）
COPY requirements.txt .

# 安装依赖
# --no-cache-dir 可以减小镜像体积
RUN pip install --no-cache-dir -r requirements.txt

# 最后才复制源代码
# 这样你修改代码时，不会触发上面的 pip install 重跑
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

