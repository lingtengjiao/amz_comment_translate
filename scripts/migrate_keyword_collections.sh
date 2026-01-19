#!/bin/bash
# Migration script to create keyword_collections and collection_products tables

set -e

echo "🔄 Running migration: Create keyword collections tables..."
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATION_FILE="$PROJECT_ROOT/db/migrate_keyword_collections.sql"

# Check if migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ Migration file not found: $MIGRATION_FILE"
    exit 1
fi

# Check if using Docker Compose
if command -v docker-compose &> /dev/null || command -v docker &> /dev/null; then
    # Try docker compose first (newer syntax), fallback to docker-compose
    if docker compose version &> /dev/null 2>&1; then
        DOCKER_COMPOSE="docker compose"
    else
        DOCKER_COMPOSE="docker-compose"
    fi
    
    echo "📦 Using Docker Compose to execute migration..."
    echo ""
    
    # Check if container is running
    if ! $DOCKER_COMPOSE ps db-postgres 2>/dev/null | grep -q "Up"; then
        echo "⚠️  PostgreSQL container is not running. Starting it..."
        $DOCKER_COMPOSE up -d db-postgres
        echo "⏳ Waiting for database to be ready..."
        sleep 5
    fi
    
    # Execute migration SQL file
    echo "📝 Executing migration SQL..."
    cat "$MIGRATION_FILE" | $DOCKER_COMPOSE exec -T db-postgres psql -U vocmaster -d vocmaster
    
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📊 Verifying tables were created..."
    $DOCKER_COMPOSE exec -T db-postgres psql -U vocmaster -d vocmaster -c "\dt keyword_collections collection_products" || true
    
else
    # Direct psql connection (for production or local without docker)
    echo "📦 Using direct psql connection..."
    echo ""
    echo "Please enter database connection details:"
    read -p "Host [localhost]: " DB_HOST
    DB_HOST=${DB_HOST:-localhost}
    read -p "Port [5432]: " DB_PORT
    DB_PORT=${DB_PORT:-5432}
    read -p "Database [vocmaster]: " DB_NAME
    DB_NAME=${DB_NAME:-vocmaster}
    read -p "Username [vocmaster]: " DB_USER
    DB_USER=${DB_USER:-vocmaster}
    
    echo ""
    echo "📝 Executing migration SQL..."
    PGPASSWORD="${DB_PASSWORD:-vocmaster123}" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"
    
    echo ""
    echo "✅ Migration completed successfully!"
fi

echo ""
echo "📝 Next steps:"
echo "   1. Restart the backend service if needed"
echo "   2. Test the new API endpoints"
echo ""
