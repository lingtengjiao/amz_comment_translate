-- Create product_time_series table for Keepa API data
CREATE TABLE IF NOT EXISTS product_time_series (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    keepa_data JSONB NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_product_time_series_product_id ON product_time_series(product_id);
CREATE INDEX IF NOT EXISTS idx_product_time_series_last_updated ON product_time_series(last_updated);

-- Create trigger to update last_updated
CREATE OR REPLACE FUNCTION update_product_time_series_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_time_series_updated_at
    BEFORE UPDATE ON product_time_series
    FOR EACH ROW
    EXECUTE FUNCTION update_product_time_series_updated_at();
