#!/bin/bash
# =============================================================================
# 部署验证脚本
# =============================================================================

MASTER_IP="${1:-115.191.30.209}"
WORKER_IP="${2:-115.190.185.29}"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "=============================================="
echo "🔍 VOC 部署验证"
echo "=============================================="
echo ""
echo "服务器 A: $MASTER_IP"
echo "服务器 B: $WORKER_IP"
echo ""

# 检查服务器 A 的服务
echo "📋 服务器 A 服务状态："
echo ""

echo -n "  PostgreSQL (5432): "
if timeout 3 bash -c "echo > /dev/tcp/$MASTER_IP/5432" 2>/dev/null; then
    echo -e "${GREEN}✅ 可连接${NC}"
else
    echo -e "${RED}❌ 无法连接${NC}"
fi

echo -n "  Redis (6379): "
if timeout 3 bash -c "echo > /dev/tcp/$MASTER_IP/6379" 2>/dev/null; then
    echo -e "${GREEN}✅ 可连接${NC}"
else
    echo -e "${RED}❌ 无法连接${NC}"
fi

echo -n "  Backend API (8000): "
HEALTH=$(curl -s --max-time 5 "http://$MASTER_IP:8000/health" 2>/dev/null)
if [ -n "$HEALTH" ]; then
    echo -e "${GREEN}✅ 正常${NC}"
else
    echo -e "${RED}❌ 异常${NC}"
fi

echo -n "  前端 (3000): "
if curl -s --max-time 5 "http://$MASTER_IP:3000" &> /dev/null; then
    echo -e "${GREEN}✅ 正常${NC}"
else
    echo -e "${YELLOW}⏳ 启动中或异常${NC}"
fi

echo -n "  Flower (5555): "
if curl -s --max-time 5 "http://$MASTER_IP:5555" &> /dev/null; then
    echo -e "${GREEN}✅ 正常${NC}"
else
    echo -e "${YELLOW}⏳ 启动中或异常${NC}"
fi

# 检查 Worker
echo ""
echo "📋 Worker 注册状态："
echo ""

WORKERS_JSON=$(curl -s --max-time 10 "http://$MASTER_IP:5555/api/workers" 2>/dev/null)
if [ -n "$WORKERS_JSON" ] && [ "$WORKERS_JSON" != "{}" ]; then
    echo "已注册的 Worker："
    echo "$WORKERS_JSON" | grep -o '"[^"]*@[^"]*"' | while read worker; do
        echo -e "  ${GREEN}✅${NC} $worker"
    done
    
    WORKER_COUNT=$(echo "$WORKERS_JSON" | grep -o '"[^"]*@[^"]*"' | wc -l)
    echo ""
    echo "总计: $WORKER_COUNT 个 Worker"
    
    if [ "$WORKER_COUNT" -ge 7 ]; then
        echo -e "${GREEN}✅ 所有 7 个 Worker 已注册${NC}"
    else
        echo -e "${YELLOW}⚠️ 期望 7 个 Worker，当前 $WORKER_COUNT 个${NC}"
    fi
else
    echo -e "${RED}❌ 无法获取 Worker 信息${NC}"
fi

echo ""
echo "=============================================="
echo "📋 访问地址："
echo "=============================================="
echo ""
echo "  🌐 前端: http://$MASTER_IP:3000"
echo "  🔌 API: http://$MASTER_IP:8000"
echo "  🌸 Flower: http://$MASTER_IP:5555"
echo ""
