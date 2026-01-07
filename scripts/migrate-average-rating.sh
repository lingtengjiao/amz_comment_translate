#!/bin/bash
# Migration script to add average_rating column to products table

set -e

echo "🔄 Running migration: Add average_rating column to products table..."

# Check if using Docker Compose
if command -v docker-compose &> /dev/null || command -v docker &> /dev/null; then
    # Try docker compose first (newer syntax), fallback to docker-compose
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    else
        DOCKER_COMPOSE="docker-compose"
    fi
    
    # Execute migration SQL
    $DOCKER_COMPOSE exec -T db-postgres psql -U vocmaster -d vocmaster <<EOF
-- Add average_rating column if it doesn't exist
DO \$\$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='products' 
        AND column_name='average_rating'
    ) THEN
        ALTER TABLE products ADD COLUMN average_rating VARCHAR(10) NULL;
        COMMENT ON COLUMN products.average_rating IS 'Real average rating from Amazon product page';
        RAISE NOTICE 'Added average_rating column to products table';
    ELSE
        RAISE NOTICE 'average_rating column already exists';
    END IF;
END \$\$;
EOF
    
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Restart the backend service: docker compose restart app-backend"
    echo "   2. Refresh the frontend page"
else
    echo "❌ Docker Compose not found. Please run the migration manually:"
    echo "   psql -U vocmaster -d vocmaster -f db/migrate_average_rating.sql"
    exit 1
fi

