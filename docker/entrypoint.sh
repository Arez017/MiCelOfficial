#!/bin/sh
set -e

echo "→ Esperando a PostgreSQL..."

# Esperar a que la base esté lista
until pg_isready -h "${DB_HOST:-db}" -p "${DB_PORT:-5432}" -U "${DB_USERNAME:-micel}" > /dev/null 2>&1; do
  echo "  PostgreSQL no está listo todavía..."
  sleep 2
done

echo "→ PostgreSQL listo"

# Solo correr migraciones y cache si existe artisan
if [ -f /var/www/html/artisan ]; then
  echo "→ Corriendo migraciones..."
  php artisan migrate --force || true

  echo "→ Cacheando configuración..."
  php artisan config:cache || true
  php artisan route:cache || true
  php artisan view:cache || true
fi

echo "→ Iniciando PHP-FPM..."
exec "$@"
