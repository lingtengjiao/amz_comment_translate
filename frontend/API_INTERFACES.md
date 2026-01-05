# 评论详情页 API 接口文档

> **版本：** v1.0  
> **最后更新：** 2026-01-05  
> **用途：** 前后端对接规范文档

---

## 📋 目录

1. [数据类型定义](#数据类型定义)
2. [核心接口](#核心接口)
3. [筛选与排序](#筛选与排序)
4. [评论操作](#评论操作)
5. [数据导出](#数据导出)
6. [翻译相关](#翻译相关)
7. [主题标签](#主题标签)

---

## 数据类型定义

### 基础类型

```typescript
// 任务状态
type TaskStatus = 'translating' | 'completed' | 'failed';

// 情感类型
type Sentiment = 'positive' | 'negative' | 'neutral';

// 筛选评分
type FilterRating = 'all' | '5' | '4' | '3' | '2' | '1';

// 筛选情感
type FilterSentiment = 'all' | 'positive' | 'negative' | 'neutral';

// 排序选项
type SortOption = 'date-desc' | 'date-asc' | 'rating-desc' | 'rating-asc' | 'helpful-desc';
```

### 评论深度解读

```typescript
interface ReviewInsight {
  type: 'strength' | 'weakness' | 'suggestion' | 'scenario' | 'emotion';
  quote: string;           // 原文引用的片段
  analysis: string;        // 深度解读
  dimension?: string;      // 产品维度：如"音质"、"价格"、"易用性"等
}
```

### 评论对象

```typescript
interface Review {
  id: string;                          // 评论唯一ID
  author: string;                      // 作者名称
  rating: number;                      // 评分 1-5
  date: string;                        // 日期 YYYY-MM-DD
  originalText: string;                // 原文内容
  translatedText: string;              // 译文内容
  originalTitle?: string;              // 原文标题（可选）
  translatedTitle?: string;            // 译文标题（可选）
  helpfulCount?: number;               // 有用数量
  sentiment: Sentiment;                // 情感分析结果
  verified: boolean;                   // 是否已验证购买
  images?: string[];                   // 评论图片URL列表
  videos?: string[];                   // 评论视频URL列表
  insights?: ReviewInsight[];          // AI深度解读
  isPinned?: boolean;                  // 是否置顶
  isHidden?: boolean;                  // 是否隐藏
  tags?: string[];                     // 用户自定义标签
}
```

### 任务/产品对象

```typescript
interface Task {
  id: string;                          // 任务唯一ID
  asin: string;                        // 亚马逊商品ASIN
  title: string;                       // 产品标题
  imageUrl: string;                    // 产品主图URL
  price?: string;                      // 价格（可选）
  bulletPoints?: string[];             // 五点描述（原文）
  bulletPointsTranslated?: string[];   // 五点描述（译文）
  status: TaskStatus;                  // 翻译任务状态
  reviewCount: number;                 // 评论总数
  translatedCount: number;             // 已翻译数量
  createdAt: string;                   // 任务创建时间 YYYY-MM-DD
  reviews: Review[];                   // 评论列表
}
```

---

## 核心接口

### 1. 获取任务详情及评论列表

**接口路径：** `GET /api/tasks/{taskId}`

**请求参数：**
```typescript
{
  taskId: string;  // 路径参数
}
```

**响应数据：**
```typescript
{
  code: number;        // 状态码 200 成功
  message: string;     // 提示信息
  data: Task;          // 任务完整数据（包含 reviews 数组）
}
```

**示例：**
```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "id": "1",
    "asin": "B08N5WRWNW",
    "title": "Echo Dot (4th Gen) | Smart speaker with Alexa",
    "imageUrl": "https://...",
    "price": "$49.99",
    "bulletPoints": ["...", "..."],
    "bulletPointsTranslated": ["...", "..."],
    "status": "completed",
    "reviewCount": 150,
    "translatedCount": 150,
    "createdAt": "2025-01-02",
    "reviews": [
      {
        "id": "r1",
        "author": "John Smith",
        "rating": 5,
        "date": "2024-12-15",
        "originalTitle": "Amazing sound quality!",
        "translatedTitle": "音质令人惊叹！",
        "originalText": "Amazing product! The sound quality...",
        "translatedText": "令人惊叹的产品！音质非常出色...",
        "helpfulCount": 127,
        "sentiment": "positive",
        "verified": true,
        "images": ["https://...", "https://..."],
        "videos": [],
        "insights": [
          {
            "type": "strength",
            "quote": "音质非常出色",
            "analysis": "产品的核心功能表现优异...",
            "dimension": "音质"
          }
        ],
        "isPinned": false,
        "isHidden": false,
        "tags": ["高性价比", "音质好"]
      }
      // ... 更多评论
    ]
  }
}
```

---

### 2. 获取评论统计数据

**接口路径：** `GET /api/tasks/{taskId}/stats`

**请求参数：**
```typescript
{
  taskId: string;  // 路径参数
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    // 评分统计
    averageRating: string;                    // 平均评分（保留1位小数）
    totalReviews: number;                     // 总评论数
    translatedReviews: number;                // 已翻译评论数
    
    // 评分分布
    ratingDistribution: {
      5: number;
      4: number;
      3: number;
      2: number;
      1: number;
    };
    
    // 情感分布
    sentimentDistribution: {
      positive: number;
      neutral: number;
      negative: number;
    };
    
    // 媒体统计
    mediaStats: {
      totalImages: number;        // 总图片数
      totalVideos: number;        // 总视频数
      reviewsWithMedia: number;   // 包含媒体的评论数
    };
  };
}
```

**示例：**
```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "averageRating": "4.3",
    "totalReviews": 150,
    "translatedReviews": 150,
    "ratingDistribution": {
      "5": 85,
      "4": 40,
      "3": 15,
      "2": 7,
      "1": 3
    },
    "sentimentDistribution": {
      "positive": 112,
      "neutral": 26,
      "negative": 12
    },
    "mediaStats": {
      "totalImages": 245,
      "totalVideos": 18,
      "reviewsWithMedia": 67
    }
  }
}
```

---

## 筛选与排序

### 3. 筛选和排序评论

**接口路径：** `GET /api/tasks/{taskId}/reviews`

**请求参数：**
```typescript
{
  taskId: string;                    // 路径参数
  
  // 查询参数
  rating?: FilterRating;             // 筛选评分 all/5/4/3/2/1
  sentiment?: FilterSentiment;       // 筛选情感 all/positive/negative/neutral
  search?: string;                   // 搜索关键词
  sort?: SortOption;                 // 排序方式
  page?: number;                     // 页码（从1开始）
  pageSize?: number;                 // 每页数量（默认10）
  includeHidden?: boolean;           // 是否包含隐藏评论（默认false）
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    reviews: Review[];               // 评论列表
    total: number;                   // 总数量
    page: number;                    // 当前页码
    pageSize: number;                // 每页数量
    hasMore: boolean;                // 是否有更多
  };
}
```

**示例：**
```
GET /api/tasks/1/reviews?rating=5&sentiment=positive&sort=helpful-desc&page=1&pageSize=10
```

```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "reviews": [ /* Review[] */ ],
    "total": 85,
    "page": 1,
    "pageSize": 10,
    "hasMore": true
  }
}
```

---

## 评论操作

### 4. 置顶评论

**接口路径：** `PUT /api/reviews/{reviewId}/pin`

**请求参数：**
```typescript
{
  reviewId: string;      // 路径参数
  isPinned: boolean;     // Body参数：是否置顶
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    reviewId: string;
    isPinned: boolean;
  };
}
```

---

### 5. 隐藏/显示评论

**接口路径：** `PUT /api/reviews/{reviewId}/visibility`

**请求参数：**
```typescript
{
  reviewId: string;      // 路径参数
  isHidden: boolean;     // Body参数：是否隐藏
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    reviewId: string;
    isHidden: boolean;
  };
}
```

---

### 6. 添加/编辑评论标签

**接口路径：** `PUT /api/reviews/{reviewId}/tags`

**请求参数：**
```typescript
{
  reviewId: string;      // 路径参数
  tags: string[];        // Body参数：标签数组
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    reviewId: string;
    tags: string[];
  };
}
```

---

### 7. 编辑评论内容

**接口路径：** `PUT /api/reviews/{reviewId}`

**请求参数：**
```typescript
{
  reviewId: string;                // 路径参数
  
  // Body参数（部分更新，只传需要修改的字段）
  originalTitle?: string;
  translatedTitle?: string;
  originalText?: string;
  translatedText?: string;
  sentiment?: Sentiment;
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: Review;  // 更新后的完整评论对象
}
```

---

### 8. 删除评论

**接口路径：** `DELETE /api/reviews/{reviewId}`

**请求参数：**
```typescript
{
  reviewId: string;  // 路径参数
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    reviewId: string;
    deleted: boolean;
  };
}
```

---

### 9. 获取隐藏的评论列表

**接口路径：** `GET /api/tasks/{taskId}/reviews/hidden`

**请求参数：**
```typescript
{
  taskId: string;  // 路径参数
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: Review[];  // 所有隐藏的评论
}
```

---

## 数据导出

### 10. 导出CSV

**接口路径：** `GET /api/tasks/{taskId}/export/csv`

**请求参数：**
```typescript
{
  taskId: string;                    // 路径参数
  
  // 查询参数（用于筛选要导出的数据）
  rating?: FilterRating;
  sentiment?: FilterSentiment;
  search?: string;
  includeHidden?: boolean;
}
```

**响应：**
- Content-Type: `text/csv; charset=utf-8`
- Content-Disposition: `attachment; filename="{asin}_reviews_{date}.csv"`

**CSV 格式：**
```csv
作者,评分,日期,原文,译文,情感,已验证
John Smith,5,2024-12-15,"Amazing product...","令人惊叹的产品...",正面,是
Sarah Johnson,4,2024-12-10,"Good value...","性价比很高...",正面,是
```

---

### 11. 导出Excel (XLSX)

**接口路径：** `GET /api/tasks/{taskId}/export/xlsx`

**请求参数：**
```typescript
{
  taskId: string;                    // 路径参数
  
  // 查询参数（用于筛选要导出的数据）
  rating?: FilterRating;
  sentiment?: FilterSentiment;
  search?: string;
  includeHidden?: boolean;
}
```

**响应：**
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="{asin}_reviews_{date}.xlsx"`

**Excel 结构：**
- Sheet名称：评论
- 列：作者 | 评分 | 日期 | 原文 | 译文 | 情感 | 已验证

---

## 翻译相关

### 12. 开始翻译任务

**接口路径：** `POST /api/tasks/{taskId}/translate`

**请求参数：**
```typescript
{
  taskId: string;          // 路径参数
  reviewIds?: string[];    // 可选：指定要翻译的评论ID列表（不传则翻译全部未翻译的）
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    taskId: string;
    totalReviews: number;     // 需要翻译的总数
    estimatedTime: number;    // 预计耗时（秒）
  };
}
```

---

### 13. 获取翻译进度

**接口路径：** `GET /api/tasks/{taskId}/translate/progress`

**请求参数：**
```typescript
{
  taskId: string;  // 路径参数
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    taskId: string;
    status: TaskStatus;               // 任务状态
    progress: number;                 // 进度百分比 0-100
    translatedCount: number;          // 已翻译数量
    totalCount: number;               // 总数量
    currentReviewId?: string;         // 当前正在翻译的评论ID
  };
}
```

**示例（轮询使用）：**
```javascript
// 前端每秒轮询一次
setInterval(async () => {
  const res = await fetch('/api/tasks/1/translate/progress');
  const { progress, status } = res.data;
  
  if (status === 'completed') {
    // 翻译完成，停止轮询
    clearInterval(timer);
  }
}, 1000);
```

---

## 主题标签

### 14. 获取主题标签高亮数据

**接口路径：** `GET /api/tasks/{taskId}/theme-tags`

**说明：** 
- 后端可以预处理好主题标签的匹配位置，方便前端高亮显示
- 如果后端不处理，前端会使用客户端匹配（当前实现）

**请求参数：**
```typescript
{
  taskId: string;  // 路径参数
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    // 预设主题标签
    presetTags: ThemeTag[];
    
    // 每个评论的匹配结果（可选，前端也可以自己匹配）
    reviewMatches?: {
      [reviewId: string]: {
        [tagId: string]: {
          text: string;        // 匹配到的文本
          positions: number[]; // 匹配位置（字符索引）
        }[];
      };
    };
  };
}
```

**主题标签类型：**
```typescript
interface ThemeTag {
  id: string;                    // 标签ID
  label: string;                 // 标签显示名称
  keywords: string[];            // 关键词列表
  color: string;                 // 文字颜色类名
  bgColor: string;               // 背景颜色类名
  borderColor: string;           // 边框颜色类名
  underlineColor: string;        // 下划线颜色（用于英文）
  isCustom?: boolean;            // 是否为用户自定义
  isProcessing?: boolean;        // 是否正在AI分析中
}
```

**预设标签示例：**
```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "presetTags": [
      {
        "id": "who",
        "label": "WHO(谁在用)",
        "keywords": ["孩子", "父母", "老人", "学生", "上班族"],
        "color": "text-blue-700",
        "bgColor": "bg-blue-100",
        "borderColor": "border-blue-300",
        "underlineColor": "#3b82f6"
      },
      {
        "id": "where",
        "label": "WHERE(使用场景)",
        "keywords": ["卧室", "客厅", "办公室", "厨房", "车上"],
        "color": "text-purple-700",
        "bgColor": "bg-purple-100",
        "borderColor": "border-purple-300",
        "underlineColor": "#9333ea"
      },
      {
        "id": "pain-point",
        "label": "痛点/未满足需求",
        "keywords": ["太贵", "不够", "没有", "希望", "建议", "应该"],
        "color": "text-red-700",
        "bgColor": "bg-red-100",
        "borderColor": "border-red-300",
        "underlineColor": "#dc2626"
      },
      {
        "id": "comparison",
        "label": "对比竞品",
        "keywords": ["比", "更好", "不如", "胜过", "相比"],
        "color": "text-orange-700",
        "bgColor": "bg-orange-100",
        "borderColor": "border-orange-300",
        "underlineColor": "#ea580c"
      },
      {
        "id": "emotion",
        "label": "情感表达",
        "keywords": ["喜欢", "满意", "失望", "后悔", "推荐"],
        "color": "text-pink-700",
        "bgColor": "bg-pink-100",
        "borderColor": "border-pink-300",
        "underlineColor": "#db2777"
      }
    ]
  }
}
```

---

### 15. 添加自定义主题标签

**接口路径：** `POST /api/tasks/{taskId}/theme-tags`

**请求参数：**
```typescript
{
  taskId: string;          // 路径参数
  
  // Body参数
  label: string;           // 标签名称
  keywords: string[];      // 关键词列表
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    tag: ThemeTag;         // 新创建的标签（包含自动分配的颜色和ID）
    isProcessing: boolean; // 是否正在AI分析中
  };
}
```

**说明：**
- 自定义标签创建后，可选择是否启用 AI 自动分析功能
- AI 会在评论中智能识别与标签相关的内容
- 前端显示"AI 分析中"状态，完成后自动更新

---

### 16. 删除自定义主题标签

**接口路径：** `DELETE /api/tasks/{taskId}/theme-tags/{tagId}`

**请求参数：**
```typescript
{
  taskId: string;   // 路径参数
  tagId: string;    // 路径参数
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    tagId: string;
    deleted: boolean;
  };
}
```

---

## 媒体内容

### 17. 获取买家秀（图片和视频）

**接口路径：** `GET /api/tasks/{taskId}/media`

**请求参数：**
```typescript
{
  taskId: string;              // 路径参数
  type?: 'image' | 'video';    // 筛选类型（可选）
  page?: number;               // 页码
  pageSize?: number;           // 每页数量
}
```

**响应数据：**
```typescript
{
  code: number;
  message: string;
  data: {
    items: MediaItem[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  };
}

interface MediaItem {
  type: 'image' | 'video';
  url: string;                  // 媒体URL
  reviewId: string;             // 所属评论ID
  author: string;               // 评论作者
  rating: number;               // 评论评分
  date: string;                 // 评论日期
  reviewText: string;           // 评论文本（可用于悬停显示）
}
```

---

## 产品信息

### 18. 打开亚马逊产品页面

**说明：** 这是前端直接跳转，不需要后端接口

```typescript
// 前端实现
const handleOpenProductLink = () => {
  window.open(`https://www.amazon.com/dp/${task.asin}`, '_blank');
};
```

---

## 错误码规范

```typescript
{
  200: '请求成功',
  400: '请求参数错误',
  401: '未授权',
  403: '无权限访问',
  404: '资源不存在',
  409: '资源冲突（如重复操作）',
  500: '服务器内部错误',
  503: '服务暂不可用（如翻译服务不可用）'
}
```

**错误响应格式：**
```json
{
  "code": 404,
  "message": "任务不存在",
  "error": "Task with ID '123' not found"
}
```

---

## 性能优化建议

### 1. 分页加载
- 评论列表使用分页，避免一次返回所有数据
- 建议每页 10-20 条评论

### 2. 缓存策略
- 产品信息和统计数据可缓存 5-10 分钟
- 评论列表可缓存 1-2 分钟
- 使用 ETag 或 Last-Modified 实现条件请求

### 3. 压缩传输
- 启用 Gzip 压缩
- 图片/视频 URL 使用 CDN

### 4. 增量更新
- 翻译进度使用轮询（每 1-2 秒）或 WebSocket
- 考虑使用 Server-Sent Events (SSE) 推送进度

---

## WebSocket 实时通信（可选）

如果需要实时翻译进度推送，可使用 WebSocket：

**连接地址：** `ws://your-domain/ws/tasks/{taskId}`

**消息格式：**
```json
{
  "type": "translation_progress",
  "data": {
    "progress": 45,
    "translatedCount": 68,
    "totalCount": 150,
    "currentReviewId": "r68"
  }
}
```

---

## 总结

### 核心接口优先级

**P0（必须实现）：**
1. 获取任务详情及评论列表
2. 获取评论统计数据
3. 筛选和排序评论
4. 开始翻译任务
5. 获取翻译进度

**P1（重要）：**
6. 置顶/隐藏评论
7. 编辑评论标签
8. 导出CSV/XLSX
9. 获取主题标签数据

**P2（优化）：**
10. 添加自定义主题标签
11. 获取买家秀数据
12. WebSocket 实时推送

---

**联系方式：** 如有疑问请联系前端团队  
**文档维护：** 请及时更新接口变更
