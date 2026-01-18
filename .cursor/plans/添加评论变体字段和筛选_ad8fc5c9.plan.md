---
name: 添加评论变体字段和筛选
overview: 为评论采集功能添加变体(variant)支持：记录每条评论的变体信息，并在采集时确保使用 "All variants" 筛选条件。
todos:
  - id: frontend-extract
    content: 前端添加变体提取和 URL 参数
    status: completed
  - id: backend-schema
    content: 后端 Schema 添加 variant 字段
    status: completed
  - id: backend-model
    content: 后端 Model 添加 variant 字段
    status: completed
  - id: db-migration
    content: 数据库迁移添加 variant 列
    status: completed
  - id: backend-service
    content: 更新评论保存逻辑
    status: completed
---

# 添加评论变体字段和筛选功能

## 需求分析

根据 Amazon 评论页面结构：

- 有变体的产品会显示 "All variants" 下拉筛选器
- 每条评论会显示该评论对应的变体信息（如颜色、尺寸等）
- 没有变体的产品则没有这个筛选器

## 实现方案

### 1. 前端 - 提取评论变体信息

在 [extension/src/content/content.js](extension/src/content/content.js) 的 `parseReviewsFromPage` 函数中添加变体提取逻辑：

```javascript
// 在评论解析中添加变体提取
// Amazon 评论中的变体信息通常在这个选择器中
const variantEl = el.querySelector('[data-hook="format-strip"]');
const variant = variantEl?.textContent?.trim() || null;
```

更新返回的评论对象：

```javascript
reviews.push({
  review_id: reviewId,
  author,
  rating,
  title,
  body,
  review_date: reviewDate,
  verified_purchase: verifiedPurchase,
  helpful_votes: helpfulVotes,
  variant: variant  // 新增字段
});
```

### 2. 前端 - 确保采集时使用 All variants

在 `buildReviewsUrl` 函数中添加变体参数，确保采集所有变体的评论：

```javascript
function buildReviewsUrl(asin, star, page = 1) {
  const params = new URLSearchParams({
    ie: 'UTF8',
    reviewerType: 'all_reviews',
    filterByStar: starFilter,
    pageNumber: page.toString(),
    sortBy: 'recent',
    formatType: 'all_formats'  // 确保采集所有变体
  });
  // ...
}
```

### 3. 后端 Schema - 添加 variant 字段

在 [backend/app/api/schemas.py](backend/app/api/schemas.py) 的 `ReviewRawData` 中添加：

```python
class ReviewRawData(BaseModel):
    # ... 现有字段 ...
    variant: Optional[str] = Field(None, description="Product variant info (color, size, etc.)")
```

### 4. 后端 Model - 添加 variant 字段

在 [backend/app/models/review.py](backend/app/models/review.py) 的 `Review` class 中添加：

```python
# Product variant info
variant: Mapped[str | None] = mapped_column(
    String(500),
    nullable=True,
    comment="产品变体信息（颜色、尺寸等）"
)
```

### 5. 数据库迁移

创建迁移文件 [db/migrate_variant.sql](db/migrate_variant.sql)：

```sql
-- Add variant column to reviews table
ALTER TABLE reviews 
ADD COLUMN IF NOT EXISTS variant VARCHAR(500) NULL;

COMMENT ON COLUMN reviews.variant IS '产品变体信息（颜色、尺寸等）';
```

### 6. 后端 Service - 更新评论处理逻辑

在 [backend/app/services/review_service.py](backend/app/services/review_service.py) 中确保 `variant` 字段被正确保存。

## 文件修改清单

- [extension/src/content/content.js](extension/src/content/content.js) - 添加变体提取和 URL 参数
- [backend/app/api/schemas.py](backend/app/api/schemas.py) - 添加 variant 字段到 ReviewRawData
- [backend/app/models/review.py](backend/app/models/review.py) - 添加 variant 字段到 Review model
- [db/migrate_variant.sql](db/migrate_variant.sql) - 新建数据库迁移文件
- [backend/app/services/review_service.py](backend/app/services/review_service.py) - 更新保存逻辑（如需）