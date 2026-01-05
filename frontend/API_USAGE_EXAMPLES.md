# API 使用示例

本文档展示如何在 React 组件中使用 API 服务层。

---

## 📦 导入

```typescript
import apiService from './services/api.service';
import type { Task, Review, FilterRating } from './types/api.types';
```

---

## 🎯 使用示例

### 1. 获取任务详情

```typescript
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiService from './services/api.service';
import type { Task } from './types/api.types';

function ReviewReader() {
  const { taskId } = useParams();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTask() {
      if (!taskId) return;
      
      try {
        setLoading(true);
        const response = await apiService.getTaskDetail(taskId);
        
        if (response.code === 200) {
          setTask(response.data);
        } else {
          setError(response.message);
        }
      } catch (err) {
        setError('加载失败');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchTask();
  }, [taskId]);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  if (!task) return <div>任务不存在</div>;

  return (
    <div>
      <h1>{task.title}</h1>
      {/* 渲染任务详情 */}
    </div>
  );
}
```

---

### 2. 筛选和排序评论

```typescript
import { useState, useEffect } from 'react';
import apiService from './services/api.service';
import type { FilterRating, FilterSentiment, SortOption, Review } from './types/api.types';

function ReviewList({ taskId }: { taskId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ratingFilter, setRatingFilter] = useState<FilterRating>('all');
  const [sentimentFilter, setSentimentFilter] = useState<FilterSentiment>('all');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    async function fetchReviews() {
      try {
        const response = await apiService.filterReviews({
          taskId,
          rating: ratingFilter,
          sentiment: sentimentFilter,
          sort: sortOption,
          search: searchQuery,
          page,
          pageSize: 20
        });

        if (response.code === 200) {
          setReviews(response.data.reviews);
          setHasMore(response.data.hasMore);
        }
      } catch (err) {
        console.error('加载评论失败:', err);
      }
    }

    fetchReviews();
  }, [taskId, ratingFilter, sentimentFilter, sortOption, searchQuery, page]);

  return (
    <div>
      {/* 筛选栏 */}
      <div className="filters">
        <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value as FilterRating)}>
          <option value="all">全部评分</option>
          <option value="5">5星</option>
          <option value="4">4星</option>
          {/* ... */}
        </select>

        <select value={sentimentFilter} onChange={(e) => setSentimentFilter(e.target.value as FilterSentiment)}>
          <option value="all">全部情感</option>
          <option value="positive">正面</option>
          <option value="negative">负面</option>
          <option value="neutral">中性</option>
        </select>

        <input
          type="text"
          placeholder="搜索评论..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* 评论列表 */}
      <div className="reviews">
        {reviews.map(review => (
          <div key={review.id}>
            {/* 渲染评论 */}
          </div>
        ))}
      </div>

      {/* 加载更多 */}
      {hasMore && (
        <button onClick={() => setPage(prev => prev + 1)}>
          加载更多
        </button>
      )}
    </div>
  );
}
```

---

### 3. 开始翻译并监听进度

```typescript
import { useState } from 'react';
import apiService from './services/api.service';

function TranslationControl({ taskId }: { taskId: string }) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleStartTranslation = async () => {
    try {
      // 开始翻译
      const response = await apiService.startTranslation({ taskId });
      
      if (response.code === 200) {
        setIsTranslating(true);
        
        // 轮询翻译进度
        const timer = setInterval(async () => {
          try {
            const progressRes = await apiService.getTranslationProgress(taskId);
            
            if (progressRes.code === 200) {
              const { progress: currentProgress, status } = progressRes.data;
              setProgress(currentProgress);
              
              // 翻译完成，停止轮询
              if (status === 'completed') {
                clearInterval(timer);
                setIsTranslating(false);
                alert('翻译完成！');
              }
            }
          } catch (err) {
            console.error('获取进度失败:', err);
          }
        }, 1000); // 每秒轮询一次
      }
    } catch (err) {
      console.error('开始翻译失败:', err);
      alert('翻译失败，请重试');
    }
  };

  return (
    <div>
      {isTranslating ? (
        <div>
          <p>翻译中... {progress}%</p>
          <progress value={progress} max={100} />
        </div>
      ) : (
        <button onClick={handleStartTranslation}>
          开始翻译
        </button>
      )}
    </div>
  );
}
```

---

### 4. 使用 WebSocket 实时监听翻译进度（推荐）

```typescript
import { useState, useEffect, useRef } from 'react';
import apiService from './services/api.service';

function TranslationControlWithWebSocket({ taskId }: { taskId: string }) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const handleStartTranslation = async () => {
    try {
      // 开始翻译
      const response = await apiService.startTranslation({ taskId });
      
      if (response.code === 200) {
        setIsTranslating(true);
        
        // 建立 WebSocket 连接
        wsRef.current = apiService.createWebSocketConnection(
          taskId,
          (message) => {
            if (message.type === 'translation_progress') {
              setProgress(message.data.progress);
              
              // 翻译完成
              if (message.data.progress === 100) {
                setIsTranslating(false);
                wsRef.current?.close();
                alert('翻译完成！');
              }
            }
          },
          (error) => {
            console.error('WebSocket 错误:', error);
            setIsTranslating(false);
          }
        );
      }
    } catch (err) {
      console.error('开始翻译失败:', err);
      alert('翻译失败，请重试');
    }
  };

  // 组件卸载时关闭 WebSocket
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return (
    <div>
      {isTranslating ? (
        <div>
          <p>翻译中... {progress}%</p>
          <progress value={progress} max={100} />
        </div>
      ) : (
        <button onClick={handleStartTranslation}>
          开始翻译
        </button>
      )}
    </div>
  );
}
```

---

### 5. 置顶/隐藏评论

```typescript
import apiService from './services/api.service';

function ReviewActions({ reviewId, isPinned, isHidden }: {
  reviewId: string;
  isPinned?: boolean;
  isHidden?: boolean;
}) {
  const handleTogglePin = async () => {
    try {
      const response = await apiService.pinReview(reviewId, !isPinned);
      
      if (response.code === 200) {
        alert(isPinned ? '已取消置顶' : '已置顶');
        // 刷新列表或更新状态
      }
    } catch (err) {
      console.error('操作失败:', err);
    }
  };

  const handleToggleHidden = async () => {
    try {
      const response = await apiService.toggleReviewVisibility(reviewId, !isHidden);
      
      if (response.code === 200) {
        alert(isHidden ? '已显示评论' : '已隐藏评论');
        // 刷新列表或更新状态
      }
    } catch (err) {
      console.error('操作失败:', err);
    }
  };

  return (
    <div>
      <button onClick={handleTogglePin}>
        {isPinned ? '取消置顶' : '置顶'}
      </button>
      <button onClick={handleToggleHidden}>
        {isHidden ? '显示' : '隐藏'}
      </button>
    </div>
  );
}
```

---

### 6. 编辑评论标签

```typescript
import { useState } from 'react';
import apiService from './services/api.service';

function TagEditor({ reviewId, initialTags }: {
  reviewId: string;
  initialTags?: string[];
}) {
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [inputValue, setInputValue] = useState('');

  const handleAddTag = () => {
    if (inputValue.trim()) {
      setTags([...tags, inputValue.trim()]);
      setInputValue('');
    }
  };

  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      const response = await apiService.updateReviewTags(reviewId, tags);
      
      if (response.code === 200) {
        alert('标签已保存');
      }
    } catch (err) {
      console.error('保存失败:', err);
    }
  };

  return (
    <div>
      {/* 已有标签 */}
      <div className="tags">
        {tags.map((tag, index) => (
          <span key={index} className="tag">
            {tag}
            <button onClick={() => handleRemoveTag(index)}>×</button>
          </span>
        ))}
      </div>

      {/* 添加标签 */}
      <input
        type="text"
        placeholder="添加标签..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
      />
      <button onClick={handleAddTag}>添加</button>

      {/* 保存 */}
      <button onClick={handleSave}>保存标签</button>
    </div>
  );
}
```

---

### 7. 导出数据

```typescript
import apiService from './services/api.service';

function ExportButtons({ taskId, asin }: { taskId: string; asin: string }) {
  const handleExportCSV = async () => {
    try {
      const blob = await apiService.exportCSV({ taskId });
      const filename = `${asin}_reviews_${new Date().toISOString().split('T')[0]}.csv`;
      apiService.downloadFile(blob, filename);
    } catch (err) {
      console.error('导出CSV失败:', err);
      alert('导出失败');
    }
  };

  const handleExportXLSX = async () => {
    try {
      const blob = await apiService.exportXLSX({ taskId });
      const filename = `${asin}_reviews_${new Date().toISOString().split('T')[0]}.xlsx`;
      apiService.downloadFile(blob, filename);
    } catch (err) {
      console.error('导出Excel失败:', err);
      alert('导出失败');
    }
  };

  return (
    <div>
      <button onClick={handleExportCSV}>导出 CSV</button>
      <button onClick={handleExportXLSX}>导出 Excel</button>
    </div>
  );
}
```

---

### 8. 获取和显示统计数据

```typescript
import { useEffect, useState } from 'react';
import apiService from './services/api.service';
import type { StatsData } from './types/api.types';

function Statistics({ taskId }: { taskId: string }) {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await apiService.getTaskStats(taskId);
        
        if (response.code === 200) {
          setStats(response.data);
        }
      } catch (err) {
        console.error('获取统计数据失败:', err);
      }
    }

    fetchStats();
  }, [taskId]);

  if (!stats) return <div>加载中...</div>;

  return (
    <div>
      <h2>评论统计</h2>
      
      <div>
        <h3>平均评分: {stats.averageRating}</h3>
        <p>总评论数: {stats.totalReviews}</p>
        <p>已翻译: {stats.translatedReviews}</p>
      </div>

      <div>
        <h3>评分分布</h3>
        <ul>
          {Object.entries(stats.ratingDistribution).map(([rating, count]) => (
            <li key={rating}>
              {rating}星: {count} ({((count / stats.totalReviews) * 100).toFixed(1)}%)
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3>情感分布</h3>
        <ul>
          <li>正面: {stats.sentimentDistribution.positive}</li>
          <li>中性: {stats.sentimentDistribution.neutral}</li>
          <li>负面: {stats.sentimentDistribution.negative}</li>
        </ul>
      </div>

      <div>
        <h3>媒体统计</h3>
        <p>图片: {stats.mediaStats.totalImages}</p>
        <p>视频: {stats.mediaStats.totalVideos}</p>
        <p>包含媒体的评论: {stats.mediaStats.reviewsWithMedia}</p>
      </div>
    </div>
  );
}
```

---

### 9. 添加自定义主题标签

```typescript
import { useState } from 'react';
import apiService from './services/api.service';

function AddCustomTagModal({ taskId, onSuccess }: {
  taskId: string;
  onSuccess: () => void;
}) {
  const [label, setLabel] = useState('');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!label.trim() || !keywords.trim()) {
      alert('请填写标签名称和关键词');
      return;
    }

    try {
      setLoading(true);
      
      const keywordList = keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const response = await apiService.addCustomThemeTag({
        taskId,
        label: label.trim(),
        keywords: keywordList
      });

      if (response.code === 200) {
        alert('标签创建成功！');
        onSuccess();
      }
    } catch (err) {
      console.error('创建标签失败:', err);
      alert('创建失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>标签名称：</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例如：产品亮点"
        />
      </div>

      <div>
        <label>关键词（用逗号分隔）：</label>
        <input
          type="text"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="例如：高级感,质感好,做工精细"
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? '创建中...' : '创建标签'}
      </button>
    </form>
  );
}
```

---

### 10. 获取买家秀媒体

```typescript
import { useEffect, useState } from 'react';
import apiService from './services/api.service';
import type { MediaItem } from './types/api.types';

function BuyerGallery({ taskId }: { taskId: string }) {
  const [images, setImages] = useState<MediaItem[]>([]);
  const [videos, setVideos] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMedia() {
      try {
        setLoading(true);
        
        // 获取图片
        const imagesRes = await apiService.getMedia({
          taskId,
          type: 'image',
          pageSize: 50
        });
        
        // 获取视频
        const videosRes = await apiService.getMedia({
          taskId,
          type: 'video',
          pageSize: 50
        });

        if (imagesRes.code === 200) {
          setImages(imagesRes.data.items);
        }
        
        if (videosRes.code === 200) {
          setVideos(videosRes.data.items);
        }
      } catch (err) {
        console.error('加载媒体失败:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMedia();
  }, [taskId]);

  if (loading) return <div>加载中...</div>;

  return (
    <div>
      <h2>买家秀</h2>
      
      <div>
        <h3>图片 ({images.length})</h3>
        <div className="gallery">
          {images.map((item, index) => (
            <div key={index} className="media-item">
              <img src={item.url} alt={`Review by ${item.author}`} />
              <p>{item.author} - {item.rating}星</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3>视频 ({videos.length})</h3>
        <div className="gallery">
          {videos.map((item, index) => (
            <div key={index} className="media-item">
              <video src={item.url} controls />
              <p>{item.author} - {item.rating}星</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 🔄 错误处理最佳实践

```typescript
import { useState } from 'react';
import apiService from './services/api.service';

function ComponentWithErrorHandling() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.getTaskDetail('taskId');
      
      // 检查响应码
      if (response.code !== 200) {
        throw new Error(response.message || '请求失败');
      }
      
      // 处理成功响应
      console.log(response.data);
      
    } catch (err) {
      // 错误处理
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('未知错误');
      }
      
      console.error('操作失败:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {loading && <div>处理中...</div>}
      <button onClick={handleAction}>执行操作</button>
    </div>
  );
}
```

---

## 📝 环境变量配置

在项目根目录创建 `.env` 文件：

```bash
# 后端 API 地址
REACT_APP_API_BASE_URL=http://localhost:3000/api

# WebSocket 地址
REACT_APP_WS_URL=ws://localhost:3000/ws
```

生产环境 `.env.production`：

```bash
REACT_APP_API_BASE_URL=https://api.yourdomain.com/api
REACT_APP_WS_URL=wss://api.yourdomain.com/ws
```

---

## ✅ 总结

以上示例覆盖了所有主要 API 的使用场景。主要注意事项：

1. **错误处理**：始终使用 try-catch 包裹 API 调用
2. **加载状态**：提供加载提示改善用户体验
3. **类型安全**：使用 TypeScript 类型获得更好的开发体验
4. **性能优化**：合理使用 useEffect 依赖项避免不必要的请求
5. **清理资源**：组件卸载时关闭 WebSocket 连接

