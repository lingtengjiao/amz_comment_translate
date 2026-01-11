# 报告生成模型配置说明

## 概述

报告生成功能现在使用 **qwen3-max** 模型，而不是默认的 qwen-plus 模型。这是因为报告生成需要更强的推理和分析能力。

## 模型配置

在 `backend/app/core/config.py` 中配置：

```python
QWEN_MODEL: str = "qwen-plus"              # 默认模型（翻译、洞察提取等轻量任务）
QWEN_ANALYSIS_MODEL: str = "qwen3-max"     # 报告生成专用模型（更强推理能力）
```

## 使用场景

### qwen-plus（轻量任务）
- 评论翻译
- 情感分析
- 洞察提取
- 5W 主题提取
- 维度学习

### qwen3-max（重量级分析）
- **产品分析报告生成**（4 种类型）
  - CEO/综合战略版
  - CMO/运营市场版
  - CPO/产品研发版
  - 供应链/质检版

## 修改位置

`backend/app/services/summary_service.py` 的 `generate_report` 方法：

```python
# 第 594 行附近
report_model = settings.QWEN_ANALYSIS_MODEL
logger.info(f"Generating {report_type} report for product {product.asin} using model: {report_model}...")

response = translation_service.client.chat.completions.create(
    model=report_model,  # 使用 qwen3-max
    ...
)
```

## 成本考虑

- **qwen-plus**: 适合高频调用的轻量任务
- **qwen3-max**: 适合低频但需要深度推理的任务

通过分离模型配置，可以在保证质量的同时优化成本。

## 环境变量（可选）

如果需要在环境变量中覆盖配置，可以在 `.env` 文件中设置：

```bash
QWEN_MODEL=qwen-plus
QWEN_ANALYSIS_MODEL=qwen3-max
```

## 验证配置

运行以下命令验证配置：

```bash
docker exec voc-backend python -c "from app.core.config import settings; print(f'Default Model: {settings.QWEN_MODEL}'); print(f'Analysis Model: {settings.QWEN_ANALYSIS_MODEL}')"
```

预期输出：
```
Default Model: qwen-plus
Analysis Model: qwen3-max
```
