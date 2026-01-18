#!/bin/bash
# 实时监控市场洞察分析流程
# Usage: ./scripts/monitor_market_insight.sh [project_id]

PROJECT_ID="${1}"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m'

# API 基础地址
API_BASE="http://localhost:8000/api/v1"

# 如果没有提供项目ID，查找最新的市场洞察项目
if [ -z "$PROJECT_ID" ]; then
    echo -e "${BLUE}🔍 查找最新的市场洞察项目...${NC}"
    PROJECT_ID=$(curl -s "$API_BASE/analysis/projects?limit=1&status=processing" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    projects = data.get('projects', [])
    for p in projects:
        if p.get('analysis_type') == 'market_insight':
            print(p.get('id', ''))
            break
except:
    pass
" 2>/dev/null)
    
    if [ -z "$PROJECT_ID" ]; then
        # 尝试查找 pending 状态的项目
        PROJECT_ID=$(curl -s "$API_BASE/analysis/projects?limit=5" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    projects = data.get('projects', [])
    for p in projects:
        if p.get('analysis_type') == 'market_insight':
            print(p.get('id', ''))
            break
except:
    pass
" 2>/dev/null)
    fi
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ 未找到市场洞察项目${NC}"
    echo ""
    echo "请提供项目ID:"
    echo "  ./scripts/monitor_market_insight.sh <project_id>"
    echo ""
    echo "或查看所有项目:"
    echo "  curl -s $API_BASE/analysis/projects | python3 -m json.tool"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🚀 监控市场洞察项目: ${WHITE}$PROJECT_ID${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 清理函数
cleanup() {
    echo ""
    echo -e "${YELLOW}停止监控...${NC}"
    kill $(jobs -p) 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# 获取项目信息
get_project_info() {
    curl -s "$API_BASE/analysis/projects/$PROJECT_ID" 2>/dev/null
}

# 显示项目状态
show_status() {
    INFO=$(get_project_info)
    if [ $? -ne 0 ] || [ -z "$INFO" ]; then
        echo -e "${RED}❌ 无法获取项目信息${NC}"
        return
    fi
    
    STATUS=$(echo "$INFO" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('status', 'unknown'))" 2>/dev/null)
    TITLE=$(echo "$INFO" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('title', 'Unknown'))" 2>/dev/null)
    ERROR=$(echo "$INFO" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('error_message', ''))" 2>/dev/null)
    
    # 状态颜色
    case "$STATUS" in
        "pending")
            COLOR="${YELLOW}"
            STATUS_ICON="⏳"
            ;;
        "processing")
            COLOR="${BLUE}"
            STATUS_ICON="🔄"
            ;;
        "completed")
            COLOR="${GREEN}"
            STATUS_ICON="✅"
            ;;
        "failed")
            COLOR="${RED}"
            STATUS_ICON="❌"
            ;;
        *)
            COLOR="${WHITE}"
            STATUS_ICON="❓"
            ;;
    esac
    
    echo -e "${COLOR}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${COLOR}📊 项目状态 ($(date +%H:%M:%S))${NC}"
    echo -e "${COLOR}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  项目: ${WHITE}$TITLE${NC}"
    echo -e "  状态: ${COLOR}$STATUS_ICON $STATUS${NC}"
    if [ ! -z "$ERROR" ]; then
        echo -e "  错误: ${RED}$ERROR${NC}"
    fi
    echo ""
}

# 监控后端日志（市场洞察相关）
(
    docker logs -f --tail=0 voc-backend 2>&1 | grep --line-buffered -iE "$PROJECT_ID|market_insight|_run_market_insight|项目级学习|聚合市场数据|市场洞察分析" | while read -r line; do
        TIMESTAMP=$(date +"%H:%M:%S")
        echo -e "${BLUE}[$TIMESTAMP] [BACKEND]${NC} $line"
    done
) &

# 监控 Insight Worker（市场洞察分析任务）
(
    docker logs -f --tail=0 voc-worker-insight 2>&1 | grep --line-buffered -iE "$PROJECT_ID|market_insight|run_analysis" | while read -r line; do
        TIMESTAMP=$(date +"%H:%M:%S")
        echo -e "${YELLOW}[$TIMESTAMP] [INSIGHT-WORKER]${NC} $line"
    done
) &

# 监控数据库中的项目级学习数据
(
    while true; do
        sleep 20
        echo ""
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${CYAN}📈 数据检查 ($(date +%H:%M:%S))${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        
        # 检查项目级维度
        DIM_COUNT=$(docker exec voc-postgres psql -U vocmaster -d vocmaster -t -c "
            SELECT COUNT(*) FROM project_dimensions WHERE project_id = '$PROJECT_ID'::uuid;
        " 2>/dev/null | tr -d ' ')
        
        # 检查项目级标签
        LABEL_COUNT=$(docker exec voc-postgres psql -U vocmaster -d vocmaster -t -c "
            SELECT COUNT(*) FROM project_context_labels WHERE project_id = '$PROJECT_ID'::uuid;
        " 2>/dev/null | tr -d ' ')
        
        # 检查维度映射
        DIM_MAP_COUNT=$(docker exec voc-postgres psql -U vocmaster -d vocmaster -t -c "
            SELECT COUNT(*) FROM project_dimension_mappings 
            WHERE project_dimension_id IN (
                SELECT id FROM project_dimensions WHERE project_id = '$PROJECT_ID'::uuid
            );
        " 2>/dev/null | tr -d ' ')
        
        # 检查标签映射
        LABEL_MAP_COUNT=$(docker exec voc-postgres psql -U vocmaster -d vocmaster -t -c "
            SELECT COUNT(*) FROM project_label_mappings 
            WHERE project_label_id IN (
                SELECT id FROM project_context_labels WHERE project_id = '$PROJECT_ID'::uuid
            );
        " 2>/dev/null | tr -d ' ')
        
        echo -e "  项目级维度: ${WHITE}$DIM_COUNT${NC}"
        echo -e "  项目级标签: ${WHITE}$LABEL_COUNT${NC}"
        echo -e "  维度映射数: ${WHITE}$DIM_MAP_COUNT${NC}"
        echo -e "  标签映射数: ${WHITE}$LABEL_MAP_COUNT${NC}"
        echo ""
    done
) &

# 定期显示项目状态
(
    while true; do
        sleep 10
        show_status
        
        # 检查是否完成或失败
        INFO=$(get_project_info)
        STATUS=$(echo "$INFO" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('status', 'unknown'))" 2>/dev/null)
        
        if [ "$STATUS" = "completed" ]; then
            echo ""
            echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
            echo -e "${GREEN}║  🎉 市场洞察分析完成！                ║${NC}"
            echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
            echo ""
            echo -e "${WHITE}📄 查看报告:${NC}"
            echo -e "   http://localhost:3000/analysis/$PROJECT_ID"
            echo ""
            
            # 显示结果摘要
            RESULT=$(echo "$INFO" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    result = data.get('result_content', {})
    if result:
        print(f\"市场名称: {result.get('market_name', 'N/A')}\")
        print(f\"产品数量: {result.get('product_count', 0)}\")
        print(f\"总评论数: {result.get('total_reviews', 0)}\")
        if result.get('data_statistics'):
            stats = result['data_statistics']
            five_w = stats.get('five_w', {})
            insights = stats.get('insights', {})
            print(f\"5W标签数: {sum(len(v) for v in five_w.values())}\")
            print(f\"洞察维度数: {sum(len(v) for v in insights.values())}\")
except:
    pass
" 2>/dev/null)
            
            if [ ! -z "$RESULT" ]; then
                echo -e "${CYAN}结果摘要:${NC}"
                echo "$RESULT" | sed 's/^/  /'
            fi
            
            cleanup
        elif [ "$STATUS" = "failed" ]; then
            echo ""
            echo -e "${RED}╔════════════════════════════════════════╗${NC}"
            echo -e "${RED}║  ❌ 市场洞察分析失败                   ║${NC}"
            echo -e "${RED}╚════════════════════════════════════════╝${NC}"
            echo ""
            ERROR=$(echo "$INFO" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('error_message', '未知错误'))" 2>/dev/null)
            echo -e "${RED}错误信息: $ERROR${NC}"
            echo ""
            cleanup
        fi
    done
) &

# 初始状态显示
show_status

# 等待所有后台任务
wait
