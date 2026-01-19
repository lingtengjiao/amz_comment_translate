-- 将 board_config 拆分为 board_config 和 view_config
-- board_config: 只保留画板相关配置（boards, productBoards）
-- view_config: 存储视图配置（colorRules, yearRanges, rankingRanges, rankingMetric, priceRanges, salesRanges, brandRanges）

-- 1. 添加 view_config 字段
ALTER TABLE keyword_collections 
ADD COLUMN IF NOT EXISTS view_config JSONB;

-- 2. 迁移现有数据：将视图配置从 board_config 移到 view_config
UPDATE keyword_collections
SET view_config = jsonb_build_object(
    'colorRules', COALESCE(board_config->'colorRules', '[]'::jsonb),
    'yearRanges', COALESCE(board_config->'yearRanges', '[]'::jsonb),
    'rankingRanges', COALESCE(board_config->'rankingRanges', '[]'::jsonb),
    'rankingMetric', COALESCE(board_config->'rankingMetric', '"major"'::jsonb),
    'priceRanges', COALESCE(board_config->'priceRanges', '[]'::jsonb),
    'salesRanges', COALESCE(board_config->'salesRanges', '[]'::jsonb),
    'brandRanges', COALESCE(board_config->'brandRanges', '[]'::jsonb)
)
WHERE board_config IS NOT NULL;

-- 3. 清理 board_config：只保留画板相关配置
UPDATE keyword_collections
SET board_config = jsonb_build_object(
    'boards', COALESCE(board_config->'boards', '[]'::jsonb),
    'productBoards', COALESCE(board_config->'productBoards', '{}'::jsonb)
)
WHERE board_config IS NOT NULL;

-- 4. 添加注释
COMMENT ON COLUMN keyword_collections.view_config IS '视图配置（JSON 格式）：颜色规则、年份区间、排名区间、价格区间、销量区间、品牌区间等';
