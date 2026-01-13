#!/usr/bin/env python3
"""
生成插件图标 PNG 文件
纯 PIL 实现，无需额外依赖
"""
import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw
    
    def create_icon(size):
        """创建眼睛图标"""
        # 创建图像
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # 圆角矩形背景 - 红粉渐变（简化为纯色）
        padding = size // 16
        bg_size = size - padding * 2
        
        # 绘制圆角矩形（使用椭圆近似圆角）
        corner_radius = size // 5
        draw.rounded_rectangle(
            [(padding, padding), (size - padding, size - padding)],
            radius=corner_radius,
            fill=(244, 63, 94)  # #F43F5E 红色
        )
        
        # 眼睛图标 - 居中
        center_x, center_y = size // 2, size // 2
        
        # 外圈 - 淡黄色
        outer_radius = size // 4
        draw.ellipse(
            [(center_x - outer_radius, center_y - outer_radius),
             (center_x + outer_radius, center_y + outer_radius)],
            fill=(254, 243, 199)  # #FEF3C7
        )
        
        # 中圈 - 淡蓝色
        middle_radius = size // 6
        draw.ellipse(
            [(center_x - middle_radius, center_y - middle_radius),
             (center_x + middle_radius, center_y + middle_radius)],
            fill=(147, 197, 253)  # #93C5FD
        )
        
        # 瞳孔 - 深蓝色
        pupil_radius = size // 10
        draw.ellipse(
            [(center_x - pupil_radius, center_y - pupil_radius),
             (center_x + pupil_radius, center_y + pupil_radius)],
            fill=(30, 64, 175)  # #1E40AF
        )
        
        # 高光
        highlight_radius = size // 25
        highlight_x = center_x - size // 20
        highlight_y = center_y - size // 16
        draw.ellipse(
            [(highlight_x - highlight_radius, highlight_y - highlight_radius),
             (highlight_x + highlight_radius, highlight_y + highlight_radius)],
            fill=(255, 255, 255, 230)  # 白色半透明
        )
        
        return img
    
    # 获取当前目录
    icon_dir = Path(__file__).parent
    
    # 生成不同尺寸的图标
    sizes = [16, 48, 128]
    
    for size in sizes:
        img = create_icon(size)
        png_path = icon_dir / f"icon{size}.png"
        img.save(png_path, 'PNG')
        print(f"✓ Generated {png_path.name}")
    
    print("\n✅ All icons generated successfully!")
    
except ImportError:
    print("❌ 缺少 Pillow 库，请安装：")
    print("  pip3 install pillow")
    exit(1)
except Exception as e:
    print(f"❌ 生成图标时出错: {e}")
    import traceback
    traceback.print_exc()
    exit(1)
