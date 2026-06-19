#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

BACKUP_DIR="./backups"
DB_FILE="./data.db"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Backup data.db if it exists
if [ -f "$DB_FILE" ]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$BACKUP_DIR/data_backup_$TIMESTAMP.db"
    
    echo "📦 Creating database backup..."
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
    else
        # Fallback to copy if sqlite3 CLI isn't in PATH
        cp "$DB_FILE" "$BACKUP_FILE"
    fi
    echo "✓ Backup saved to: $BACKUP_FILE"
else
    echo "⚠️ No active database (data.db) found to backup."
fi

# Execute the validation suite
echo "🚀 Executing Aporaksha commerce validation suite..."
npm run validate
