# 数据透视AI Prompt标准化实施总结

## 一、已完成工作

### 1.1 Prompt模板库创建 ✅
**文件**: `backend/app/services/pivot_insight_prompts.py`

**核心功能**:
- 创建了20个AI解读子模块的配置字典（`MODULE_CONFIGS`）
  - 注意：5个概览模块（1.0, 2.0, 3.0, 4.0, 5.0）使用前端内联生成，不需要后端AI解读
- 实现了3种prompt模板：
  - `_get_2d_template()`: 2D交叉分析模板（13个子模块）
  - `_get_3d_template()`: 3D交叉分析模板（5个子模块）
  - `_get_stat_template()`: 统计分析模板（2个子模块）
- 实现了 `generate_pivot_insight_prompt()` 函数，根据子模块类型自动选择模板

**配置内容**:
每个子模块配置包含：
- `analysis_name`: 分析任务名称
- `analysis_description`: 分析任务描述
- `business_value`: 业务价值说明
- `focus_dimension`: 聚焦的交叉维度
- `data_description`: 数据描述
- `module_type`: 模块类型（2d/3d/stat）
- `dimensions`: 涉及的维度列表
- `severity_hints`: 严重程度提示

### 1.2 服务层更新 ✅
**文件**: `backend/app/services/pivot_insight_service.py`

**更新内容**:
- 导入新的prompt模板库
- 更新 `_generate_ai_interpretation()` 方法：
  - 使用标准化的prompt生成函数
  - 增强JSON解析能力（支持markdown代码块）
  - 添加字段验证和默认值处理
  - 改进错误处理
- 更新所有子模块的调用，传入正确的 `sub_type` 和 `total_reviews`

### 1.3 文档创建 ✅
**文件**: `docs/数据透视AI-Prompt标准化设计.md`

**文档内容**:
- 设计原则说明
- Prompt模板结构
- 20个AI解读子模块的详细prompt定制说明
- 每个子模块的示例输出格式
- 前端模块与后端AI解读完整映射表
- 实施状态更新

---

## 二、Prompt设计特点

### 2.1 标准化输出格式
所有AI解读统一输出以下结构：
```json
{
  "keyFindings": ["发现1（含数据）", "发现2（含数据）"],
  "dataSupport": "基于X条评论分析" 或 [{"metric": "...", "value": "..."}],
  "recommendations": ["建议1", "建议2"],
  "severity": "info|success|warning|error|critical"
}
```

### 2.2 强调交叉分析
- **2D模板**: 强调两个维度间的交叉关系，而非单维度统计
- **3D模板**: 强调三个维度的完整关系链条
- **统计模板**: 强调统计洞察和趋势

### 2.3 数据驱动
- 要求所有发现包含具体数据（次数、占比、频次等）
- 提供数据支撑提示，帮助AI提取关键指标
- 强调基于输入数据，不编造

### 2.4 业务导向
- 每个子模块明确业务价值
- 行动建议要求具体可执行
- 严重程度根据业务影响判断

---

## 三、已完成工作（2026-01-25更新）

### 3.1 所有分析方法已实现 ✅

**需求洞察模块**:
- ✅ `_analyze_motivation_location()` - 动机×地点分析（2D）
- ✅ `_analyze_motivation_emotion()` - 动机×情感分析（2D，情感从insights表）
- ✅ `_analyze_motivation_weakness_suggestion()` - 动机×劣势×建议3D分析

**产品洞察模块**:
- ✅ `_analyze_strength_emotion()` - 优势×情感分析（2D，情感从insights表）
- ✅ `_analyze_motivation_suggestion()` - 动机×建议分析（2D）
- ✅ `_analyze_negative_optimization()` - 维度冲突分析（优势×建议）

**场景洞察模块**:
- ✅ `_analyze_life_moment()` - 地点×时机×场景3D分析（场景从insights表）
- ✅ `_analyze_environment_conflict()` - 情感×维度×地点3D分析（情感从insights表）
- ✅ `_analyze_scenario_sentiment()` - 场景×情感分析（已更新，场景和情感都从insights表）

**品牌洞察模块**:
- ✅ `_analyze_brand_memory()` - 优势×场景×情感3D分析（都从insights表）
- ✅ `_analyze_brand_mind()` - 优势统计（单维度）

**人群洞察模块**:
- ✅ `_analyze_decision_logic_chain()` - 购买者×使用者×动机3D分析

### 3.2 Prompt配置与前端一一对应 ✅

所有20个AI解读子模块的prompt配置已完整，与前端模块一一对应：

| 前端模块 | AI解读类型 | Prompt配置 | 状态 |
|---------|-----------|-----------|------|
| 1.1 决策链路分析 | `decision_flow` | ✅ | 已实现 |
| 1.2 人群-卖点匹配分析 | `audience_strength` | ✅ | 已实现 |
| 1.3 决策逻辑链 | `decision_logic_chain` | ✅ | 已实现 |
| 2.1 刚需场景分析 | `motivation_location` | ✅ | 已实现 |
| 2.2 需求满足度矩阵 | `demand_satisfaction` | ✅ | 已实现 |
| 2.3 心智匹配分析 | `motivation_emotion` | ✅ | 已实现 |
| 2.4 研发优先级 | `rnd_priority` | ✅ | 已实现 |
| 3.1 致命缺陷识别 | `critical_weakness` | ✅ | 已实现 |
| 3.2 优劣势对比 | `strength_weakness` | ✅ | 已实现 |
| 3.3 优势情感分析 | `strength_emotion` | ✅ | 已实现 |
| 3.4 场景化改进建议 | `improvement_priority` | ✅ | 已实现 |
| 3.5 动机分层优化 | `motivation_suggestion` | ✅ | 已实现 |
| 3.6 维度冲突分析 | `negative_optimization` | ✅ | 已实现 |
| 4.1 地点×时间热力图 | `scenario_distribution` | ✅ | 已实现 |
| 4.2 场景×情感热力图 | `scenario_sentiment` | ✅ | 已实现 |
| 4.3 真实生活瞬间 | `life_moment` | ✅ | 已实现 |
| 4.4 环境冲突分析 | `environment_conflict` | ✅ | 已实现 |
| 5.1 品牌记忆点 | `brand_memory` | ✅ | 已实现 |
| 5.2 用户推荐意愿 | `recommendation_willingness` | ✅ | 已实现 |
| 5.3 品牌核心心智 | `brand_mind` | ✅ | 已实现 |

**注意**: 概览模块（1.0, 2.0, 3.0, 4.0, 5.0）使用内联生成，不需要后端AI解读。

### 3.3 数据格式对齐 ✅

所有分析方法的数据格式已与前端 `dataCalculator.ts` 保持一致：
- ✅ 2D矩阵格式：`Record<string, Record<string, number>>`
- ✅ 3D矩阵格式：`Record<string, Record<string, Record<string, number>>>`
- ✅ 3D切片格式：`slices` 数组，每个slice包含 `layerLabel`, `rows`, `columns`, `data`, `count`
- ✅ 统计数据格式：与前端期望的字段名一致

### 3.4 关键数据源区分 ✅

所有方法已正确区分数据来源：
- ✅ `review_theme_highlights` 表：用于 buyer, user, where, when, why, what
- ✅ `review_insights` 表：用于 strength, weakness, suggestion, scenario, emotion
- ✅ `reviews` 表：用于 sentiment, rating, helpful_votes

### 3.5 待优化工作

**Prompt优化**:
- [ ] 根据实际输出效果调整prompt
- [ ] 优化数据描述和业务价值说明
- [ ] 完善示例输出格式
- [ ] 添加更多数据支撑提示

**测试和验证**:
- [ ] 测试所有20个AI解读子模块的prompt
- [ ] 验证输出格式的一致性
- [ ] 优化AI解读质量
- [ ] 收集用户反馈并迭代

---

## 四、使用指南

### 4.1 添加新的子模块

1. **在 `MODULE_CONFIGS` 中添加配置**:
```python
"new_sub_type": {
    "analysis_name": "分析名称",
    "analysis_description": "分析描述",
    "business_value": "业务价值",
    "focus_dimension": "聚焦维度",
    "data_description": "数据描述",
    "module_type": "2d|3d|stat",
    "dimensions": ["dim1", "dim2"],
    "severity_hints": {...}
}
```

2. **实现分析方法**:
```python
def _analyze_new_sub_type(self, reviews: List[Review]) -> Optional[Dict]:
    # 实现数据分析逻辑
    return {...}
```

3. **在生成函数中调用**:
```python
data = self._analyze_new_sub_type(reviews)
if data:
    insight = self._save_insight(
        product_id=product.id,
        insight_type="...",
        sub_type="new_sub_type",
        insight_data=self._generate_ai_interpretation(
            "new_sub_type",
            data,
            len(reviews)
        ),
        raw_data=data
    )
```

### 4.2 自定义Prompt

如果需要为特定子模块自定义prompt，可以在 `generate_pivot_insight_prompt()` 函数中添加特殊处理：

```python
def generate_pivot_insight_prompt(...):
    # 特殊处理
    if sub_type == "special_case":
        return custom_prompt_template
    
    # 标准处理
    ...
```

---

## 五、最佳实践

### 5.1 Prompt编写
1. **明确业务价值**: 每个子模块都要明确说明业务价值
2. **强调交叉关系**: 避免单维度统计，强调维度间的交叉关系
3. **数据驱动**: 要求所有发现包含具体数据
4. **可执行建议**: 行动建议要具体可操作

### 5.2 数据分析
1. **数据完整性**: 确保输入数据包含所有必要字段
2. **数据格式**: 保持数据格式一致，便于AI理解
3. **数据量**: 确保有足够的数据量（至少5条评论）

### 5.3 错误处理
1. **JSON解析**: 支持markdown代码块格式
2. **字段验证**: 验证必需字段是否存在
3. **默认值**: 为缺失字段提供合理的默认值
4. **日志记录**: 记录错误信息便于调试

---

## 六、后续优化方向

### 6.1 Prompt优化
- 根据实际输出效果持续优化prompt
- 添加更多示例和上下文信息
- 优化数据描述，使AI更容易理解

### 6.2 功能增强
- 支持多语言输出
- 支持自定义严重程度规则
- 支持prompt版本管理

### 6.3 性能优化
- 批量生成洞察，减少API调用
- 缓存常用prompt模板
- 优化token使用，降低成本

---

## 七、完成总结（2026-01-25）

### 7.1 核心成果

1. **✅ Prompt标准化完成**
   - 20个AI解读子模块的prompt配置全部完成
   - 3种prompt模板（2D、3D、统计）全部实现
   - 所有prompt配置与前端模块一一对应

2. **✅ 分析方法实现完成**
   - 所有20个分析方法全部实现
   - 数据格式与前端 `dataCalculator.ts` 完全对齐
   - 正确区分了 `review_theme_highlights` 和 `review_insights` 两个表

3. **✅ 数据格式对齐完成**
   - 2D矩阵格式：`Record<string, Record<string, number>>`
   - 3D矩阵格式：`Record<string, Record<string, Record<string, number>>>`
   - 3D切片格式：`slices` 数组，包含 `layerLabel`, `rows`, `columns`, `data`, `count`
   - 统计数据格式：与前端期望的字段名一致

4. **✅ 文档更新完成**
   - `docs/数据透视AI-Prompt标准化设计.md` - 完整的设计文档和映射表
   - `docs/数据透视AI-Prompt实施总结.md` - 实施状态和完成总结

### 7.2 关键数据源区分

所有方法已正确区分数据来源：

| 数据维度 | 数据表 | 字段路径 |
|---------|--------|---------|
| buyer, user, where, when, why, what | `review_theme_highlights` | `theme_type` + `label_name` |
| strength, weakness, suggestion | `review_insights` | `insight_type` + `dimension` |
| scenario, emotion | `review_insights` | `insight_type` + `dimension` |
| sentiment, rating | `reviews` | `sentiment`, `rating` |

### 7.3 下一步工作

1. **测试和优化**：
   - 测试所有20个AI解读子模块的prompt
   - 验证输出格式的一致性
   - 根据实际输出效果优化prompt

2. **数据总览部分**：
   - 完成数据总览的AI prompt标准化设计
   - 确保数据总览与数据透视的prompt风格一致

---

**文档版本**：v1.1  
**创建时间**：2026-01-25  
**最后更新**：2026-01-25
