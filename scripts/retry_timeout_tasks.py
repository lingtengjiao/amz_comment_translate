#!/usr/bin/env python3
"""
批量重新触发 timeout 状态的任务

使用方法:
    python scripts/retry_timeout_tasks.py
"""
import requests
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

BASE_URL = "http://localhost:8000/api/v1"

def retry_timeout_tasks():
    """重新触发所有 timeout 任务"""
    
    # 获取所有 timeout 任务的产品 ASIN 和任务类型
    import subprocess
    result = subprocess.run(
        [
            "docker", "exec", "voc-postgres", 
            "psql", "-U", "vocmaster", "-d", "vocmaster", "-t", "-A",
            "-c", """
            SELECT DISTINCT p.asin, t.task_type 
            FROM tasks t 
            JOIN products p ON t.product_id = p.id 
            WHERE t.status = 'timeout' 
            ORDER BY t.task_type, p.asin;
            """
        ],
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ 查询数据库失败: {result.stderr}")
        return
    
    lines = [line.strip() for line in result.stdout.strip().split('\n') if line.strip()]
    
    if not lines:
        print("✅ 没有找到 timeout 的任务")
        return
    
    print(f"📋 找到 {len(lines)} 个需要重新触发的任务\n")
    
    success_count = 0
    error_count = 0
    
    for line in lines:
        parts = line.split('|')
        if len(parts) != 2:
            continue
            
        asin = parts[0].strip()
        task_type = parts[1].strip()
        
        print(f"🔄 处理: {asin} - {task_type}")
        
        try:
            if task_type == "translation":
                # 触发翻译任务
                response = requests.post(
                    f"{BASE_URL}/products/{asin}/translate",
                    timeout=10
                )
                if response.status_code == 200:
                    print(f"  ✅ 翻译任务已触发")
                    success_count += 1
                else:
                    print(f"  ❌ 失败: {response.status_code} - {response.text[:100]}")
                    error_count += 1
                    
            elif task_type == "themes":
                # 触发主题提取任务
                response = requests.post(
                    f"{BASE_URL}/products/{asin}/extract-themes",
                    timeout=10
                )
                if response.status_code == 200:
                    print(f"  ✅ 主题提取任务已触发")
                    success_count += 1
                else:
                    print(f"  ❌ 失败: {response.status_code} - {response.text[:100]}")
                    error_count += 1
                    
            elif task_type == "insights":
                # 触发洞察提取任务
                response = requests.post(
                    f"{BASE_URL}/products/{asin}/extract-insights",
                    timeout=10
                )
                if response.status_code == 200:
                    print(f"  ✅ 洞察提取任务已触发")
                    success_count += 1
                else:
                    print(f"  ❌ 失败: {response.status_code} - {response.text[:100]}")
                    error_count += 1
            else:
                print(f"  ⚠️  未知任务类型: {task_type}")
                error_count += 1
                
        except Exception as e:
            print(f"  ❌ 异常: {str(e)}")
            error_count += 1
        
        print()
    
    print(f"\n📊 总结:")
    print(f"  ✅ 成功: {success_count}")
    print(f"  ❌ 失败: {error_count}")
    print(f"  📝 总计: {len(lines)}")

if __name__ == "__main__":
    retry_timeout_tasks()

