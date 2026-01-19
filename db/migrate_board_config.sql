-- 产品分类画板功能：添加 board_config 字段
-- 用于存储自定义画板和产品分配配置

-- 添加 board_config 字段（JSONB 类型）
ALTER TABLE keyword_collections
ADD COLUMN IF NOT EXISTS board_config JSONB;

COMMENT ON COLUMN keyword_collections.board_config IS '画板配置（JSON 格式）';

-- 完成提示
DO $$
BEGIN
    RAISE NOTICE '迁移完成：keyword_collections 表已添加 board_config 字段';
END $$;
