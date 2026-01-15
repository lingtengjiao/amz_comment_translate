"""
PDF 生成服务 - 使用 Playwright 将报告页面导出为 PDF

功能：
1. 使用 Playwright 访问报告页面（打印模式）
2. 等待页面完全加载
3. 生成高质量 PDF（带页眉页脚）
4. 返回 PDF 文件内容
"""
import asyncio
import logging
import os
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

# Playwright 浏览器实例（延迟初始化）
_browser = None
_playwright = None


async def get_browser():
    """获取或创建浏览器实例"""
    global _browser, _playwright
    
    if _browser is None or not _browser.is_connected():
        from playwright.async_api import async_playwright
        
        _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--font-render-hinting=none',
            ]
        )
        logger.info("[PDF Service] Playwright 浏览器已启动")
    
    return _browser


async def close_browser():
    """关闭浏览器实例"""
    global _browser, _playwright
    
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright:
        await _playwright.stop()
        _playwright = None
    
    logger.info("[PDF Service] Playwright 浏览器已关闭")


async def generate_report_pdf(
    asin: str,
    report_id: str,
    frontend_url: Optional[str] = None
) -> bytes:
    """
    生成报告 PDF
    
    Args:
        asin: 产品 ASIN
        report_id: 报告 ID
        frontend_url: 前端服务 URL（默认使用内部 Docker 网络地址）
    
    Returns:
        PDF 文件的字节内容
    """
    # 确定前端 URL
    if frontend_url is None:
        # Docker 内部网络地址
        frontend_url = os.getenv('FRONTEND_URL', 'http://app-frontend:80')
    
    # 构建报告页面 URL（添加 print=true 参数）
    report_url = f"{frontend_url}/report/{asin}/{report_id}?print=true"
    
    logger.info(f"[PDF Service] 开始生成 PDF: {report_url}")
    
    try:
        browser = await get_browser()
        page = await browser.new_page(
            viewport={'width': 1280, 'height': 1024}
        )
        
        # 访问报告页面
        await page.goto(report_url, wait_until='networkidle', timeout=60000)
        
        # 等待主要内容加载
        await page.wait_for_selector('.bg-white', timeout=30000)
        
        # 额外等待一下确保所有内容渲染完成
        await asyncio.sleep(2)
        
        # 生成 PDF
        pdf_bytes = await page.pdf(
            format='A4',
            print_background=True,
            margin={
                'top': '20mm',
                'bottom': '25mm',
                'left': '15mm',
                'right': '15mm'
            },
            display_header_footer=True,
            header_template='''
                <div style="font-size: 10px; color: #666; width: 100%; text-align: center; padding: 5px 0;">
                    <span style="font-weight: bold; color: #e11d48;">🎯 洞察大王</span>
                    <span style="margin-left: 10px;">产品分析报告</span>
                </div>
            ''',
            footer_template='''
                <div style="font-size: 9px; color: #999; width: 100%; display: flex; justify-content: space-between; padding: 5px 20px;">
                    <span>洞察大王 - AI驱动的产品评论深度分析平台</span>
                    <span>第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span>
                </div>
            '''
        )
        
        await page.close()
        
        logger.info(f"[PDF Service] PDF 生成成功，大小: {len(pdf_bytes)} bytes")
        return pdf_bytes
        
    except Exception as e:
        logger.error(f"[PDF Service] PDF 生成失败: {e}")
        raise


async def generate_report_pdf_with_retry(
    asin: str,
    report_id: str,
    max_retries: int = 3
) -> bytes:
    """带重试的 PDF 生成"""
    last_error = None
    
    for attempt in range(max_retries):
        try:
            return await generate_report_pdf(asin, report_id)
        except Exception as e:
            last_error = e
            logger.warning(f"[PDF Service] PDF 生成失败 (尝试 {attempt + 1}/{max_retries}): {e}")
            
            # 重置浏览器
            await close_browser()
            
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
    
    raise last_error
